// 网安备案（公安部）「点选文字」验证码识别
// 移植自AntiCAP项目的detection.py（Detection_Text）与 ocr.py（Dddd OCR）：
// 1) 检测：YOLO26n ONNX（src/assets/captcha_detection.onnx，输入 1x3x320x320，
//    输出 1x300x6 = x1,y1,x2,y2,score,cls，端到端免 NMS）
// 2) 识别：Dddd OCR ONNX（AntiCAP/AntiCAP/AntiCAP-Models/[Dddd]-OCR.onnx + [Dddd]-CharSets.txt，CRNN+CTC）
// 3) 匹配：检测框逐个裁切识别文字，与 wordList 匹配后转中心坐标
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ort from "onnxruntime-node";
import sharp from "sharp";
import type { ClickPosition } from "@/types/police.js";

export type TextBox = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    score: number;
};

// ---------- 模型路径 ----------
// 检测模型：src/assets 内置，单文件构建后由 build.mjs 复制到 dist/assets
const DETECTION_MODEL_FILE = "captcha_detection.onnx";

// OCR 模型与字符集：引用本项目 AntiCAP 目录下的 2 个单模型文件
//   源码位置：AntiCAP/AntiCAP/AntiCAP-Models/[Dddd]-OCR.onnx、[Dddd]-CharSets.txt
//   构建后：build.mjs 将这 2 个文件复制到 dist/assets，与检测模型并列
const ANTI_CAP_MODELS_DIR = path.join("AntiCAP", "AntiCAP", "AntiCAP-Models");
const OCR_MODEL_FILE = "[Dddd]-OCR.onnx";
const OCR_CHARSET_FILE = "[Dddd]-CharSets.txt";

function resolveAsset(name: string): string {
    // 构建产物（CJS 单文件）：__dirname 为 dist，assets 与 index.cjs 同目录
    if (typeof __dirname !== "undefined") {
        const p = path.join(__dirname, "assets", name);
        if (existsSync(p)) return p;
    }
    // 开发模式（tsx / vitest，ESM 下无 __dirname）：按项目根目录回退
    const cwd = process.cwd();
    for (const p of [path.join(cwd, "src", "assets", name), path.join(cwd, "assets", name)]) {
        if (existsSync(p)) return p;
    }
    throw new Error(`模型文件不存在: ${name}`);
}

// OCR 模型与字符集：优先取 dist/assets（构建产物），否则直接引用 AntiCAP 目录（开发模式）
function resolveAntiCapModel(filename: string): string {
    // 构建产物（CJS 单文件）：所有模型统一在 dist/assets
    if (typeof __dirname !== "undefined") {
        const dist = path.join(__dirname, "assets", filename);
        if (existsSync(dist)) return dist;
        // dist/assets 缺失时回退到项目 AntiCAP 目录
        const p = path.join(__dirname, "..", ANTI_CAP_MODELS_DIR, filename);
        if (existsSync(p)) return p;
    }
    // 开发模式（tsx / vitest，ESM 下无 __dirname）：直接引用项目 AntiCAP 目录
    const p = path.join(process.cwd(), ANTI_CAP_MODELS_DIR, filename);
    if (existsSync(p)) return p;
    throw new Error(
        `AntiCAP 模型文件不存在: ${filename}（预期位置 ${ANTI_CAP_MODELS_DIR}，或构建后位于 dist/assets）`
    );
}

// ---------- 会话与字符集缓存（全局复用，避免每次调用重复加载模型） ----------
let detectionSession: ort.InferenceSession | null = null;
let ocrSession: ort.InferenceSession | null = null;
let charsetCache: string[] | null = null;

async function getDetectionSession(): Promise<ort.InferenceSession> {
    if (!detectionSession) {
        detectionSession = await ort.InferenceSession.create(resolveAsset(DETECTION_MODEL_FILE));
    }
    return detectionSession;
}

async function getOcrSession(): Promise<ort.InferenceSession> {
    if (!ocrSession) {
        ocrSession = await ort.InferenceSession.create(resolveAntiCapModel(OCR_MODEL_FILE));
    }
    return ocrSession;
}

async function getCharset(): Promise<string[]> {
    if (!charsetCache) {
        // 字符集文件为 Python list literal（首个元素 "" 为空白符）
        const text = readFileSync(resolveAntiCapModel(OCR_CHARSET_FILE), "utf-8").trim();
        try {
            charsetCache = JSON.parse(text) as string[];
        } catch {
            // 容忍 Python list literal 的尾逗号等差异
            charsetCache = JSON.parse(text.replace(/,\s*([\]}])/g, "$1")) as string[];
        }
    }
    return charsetCache;
}

function cleanBase64(base64Str: string): Buffer {
    return Buffer.from(base64Str.replace(/^data:image\/\w+;base64,/i, ""), "base64");
}

const LETTERBOX = 320; // YOLO26n ONNX 输入尺寸 1x3x320x320
const CONF_THRESHOLD = 0.25; // ultralytics predict 默认置信度

/**
 * 检测验证码图中所有文字框，坐标为原图像素，置信度降序
 * 预处理与 ultralytics letterbox 一致：保持比例缩放到 320 内，114 灰填充
 */
export async function detectTextBoxes(imageBuf: Buffer): Promise<TextBox[]> {
    const meta = await sharp(imageBuf).metadata();
    const iw = meta.width ?? 310;
    const ih = meta.height ?? 155;

    const scale = Math.min(LETTERBOX / iw, LETTERBOX / ih);
    const newW = Math.max(1, Math.round(iw * scale));
    const newH = Math.max(1, Math.round(ih * scale));
    const padX = Math.floor((LETTERBOX - newW) / 2);
    const padY = Math.floor((LETTERBOX - newH) / 2);

    const { data } = await sharp(imageBuf)
        .resize(newW, newH, { fit: "fill" })
        .extend({
            top: padY,
            bottom: LETTERBOX - newH - padY,
            left: padX,
            right: LETTERBOX - newW - padX,
            background: { r: 114, g: 114, b: 114 },
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // HWC RGB -> CHW float32，归一化 0~1
    const plane = LETTERBOX * LETTERBOX;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
        input[i] = data[i * 3] / 255;
        input[plane + i] = data[i * 3 + 1] / 255;
        input[plane * 2 + i] = data[i * 3 + 2] / 255;
    }

    const session = await getDetectionSession();
    const results = await session.run({
        images: new ort.Tensor("float32", input, [1, 3, LETTERBOX, LETTERBOX]),
    });
    const output = results[session.outputNames[0]];
    const out = output.data as Float32Array;
    const stride = output.dims[output.dims.length - 1]; // 6 = x1,y1,x2,y2,score,cls
    const rows = out.length / stride;

    // 少数导出会把坐标归一化到 0~1，按最大坐标自适应还原
    let maxCoord = 0;
    for (let r = 0; r < rows; r++) {
        maxCoord = Math.max(
            maxCoord,
            out[r * stride],
            out[r * stride + 1],
            out[r * stride + 2],
            out[r * stride + 3]
        );
    }
    const coordScale = maxCoord <= 2 ? LETTERBOX : 1;

    const boxes: TextBox[] = [];
    for (let r = 0; r < rows; r++) {
        const score = out[r * stride + 4];
        if (score < CONF_THRESHOLD) continue;
        // letterbox 坐标还原到原图
        boxes.push({
            x1: Math.max(0, Math.min(iw, (out[r * stride] * coordScale - padX) / scale)),
            y1: Math.max(0, Math.min(ih, (out[r * stride + 1] * coordScale - padY) / scale)),
            x2: Math.max(0, Math.min(iw, (out[r * stride + 2] * coordScale - padX) / scale)),
            y2: Math.max(0, Math.min(ih, (out[r * stride + 3] * coordScale - padY) / scale)),
            score,
        });
    }
    // 置信度降序（与 ultralytics predict 结果顺序一致）
    boxes.sort((a, b) => b.score - a.score);
    return boxes;
}

/**
 * Dddd OCR 识别单个文字裁切（CRNN+CTC 贪心解码）
 * 预处理与 AntiCAP ocr.py 一致：高度 64 等比缩放、灰度、/255 后 (x-0.5)/0.5
 */
export async function ocrChar(cropBuf: Buffer): Promise<string> {
    const meta = await sharp(cropBuf).metadata();
    const cw = meta.width ?? 1;
    const ch = meta.height ?? 1;
    const ow = Math.max(1, Math.round((cw * 64) / ch));

    const { data } = await sharp(cropBuf)
        .resize(ow, 64, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const input = new Float32Array(64 * ow);
    for (let i = 0; i < input.length; i++) {
        input[i] = (data[i] / 255 - 0.5) / 0.5;
    }

    const session = await getOcrSession();
    const results = await session.run({ input1: new ort.Tensor("float32", input, [1, 1, 64, ow]) });
    const output = results[session.outputNames[0]];
    const out = output.data as Float32Array;
    const numClasses = output.dims[output.dims.length - 1];
    const steps = out.length / numClasses; // batch=1：[T,1,C] / [1,T,C] / [T,C] 均按 t*C 步进

    const charset = await getCharset();
    // CTC 贪心解码：跳过连续重复与空白符 index 0（与 ocr.py 解码一致）
    let result = "";
    let lastItem = 0;
    for (let t = 0; t < steps; t++) {
        let best = 0;
        let bestScore = -Infinity;
        for (let c = 0; c < numClasses; c++) {
            const score = out[t * numClasses + c];
            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        }
        if (best === lastItem) continue;
        lastItem = best;
        if (best !== 0) result += charset[best] ?? "";
    }
    return result;
}

/**
 * 识别点选验证码中 wordList 指定文字的中心坐标
 * @returns 按 wordList 顺序排列的坐标；任一文字未识别到返回 null（由上层换新验证码重试）
 */
export async function recognizeClickWord(
    imageBase64: string,
    wordList: string[]
): Promise<ClickPosition[] | null> {
    const imageBuf = cleanBase64(imageBase64);
    const meta = await sharp(imageBuf).metadata();
    const iw = meta.width ?? 310;
    const ih = meta.height ?? 155;

    const boxes = await detectTextBoxes(imageBuf);
    // 文字 -> 中心坐标（同一文字取首个命中框）
    const found = new Map<string, ClickPosition>();
    for (const b of boxes) {
        const left = Math.max(0, Math.round(b.x1));
        const top = Math.max(0, Math.round(b.y1));
        const right = Math.min(iw, Math.round(b.x2));
        const bottom = Math.min(ih, Math.round(b.y2));
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) continue;

        // 裁切单字交给 OCR
        const crop = await sharp(imageBuf).extract({ left, top, width, height }).png().toBuffer();
        const word = await ocrChar(crop);
        if (!word || found.has(word)) continue;
        // 矩形 -> 中心坐标
        found.set(word, {
            x: String(Math.round((b.x1 + b.x2) / 2)),
            y: String(Math.round((b.y1 + b.y2) / 2)),
        });
    }

    const positions: ClickPosition[] = [];
    for (const w of wordList) {
        const p = found.get(w);
        if (!p) return null;
        positions.push(p);
    }
    return positions;
}
