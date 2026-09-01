// 识别器：高频色近正方形连通块（移植自 ICP_Query rust 版 captcha.rs）
// 思路：
// 1) 大图下采样 2x + 颜色量化（RGB 高 6 位）
// 2) 颜色直方图取 Top-3 高频色（缺口填充色通常是图内高频色）
// 3) 对每个高频色做列方向连续运行长度统计，找"宽高比 0.7~1.4 的最大矩形块"
// 4) 缺口 = 面积最大的近正方形纯色块，返回其 x（下采样坐标 *2 还原）
import sharp from "sharp";

function cleanBase64(base64Str: string): Buffer {
    return Buffer.from(base64Str.replace(/^data:image\/\w+;base64,/i, ""), "base64");
}

/**
 * 找大图中"高频色近正方形纯色块"，返回缺口 x（原图坐标）
 */
export async function colorBlockSlider(targetImage: string, backgroundImage: string): Promise<number> {
    const smallBuf = cleanBase64(targetImage);
    const bigBuf = cleanBase64(backgroundImage);

    // 小图尺寸（原图坐标），用于估算缺口边长
    let sw = 68, sh = 68;
    try {
        const { info: si } = await sharp(smallBuf).trim().toBuffer({ resolveWithObject: true });
        if (si.width > 0) sw = si.width;
        if (si.height > 0) sh = si.height;
    } catch { /* keep default */ }

    const { data, info } = await sharp(bigBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const bw = info.width, bh = info.height;

    // 下采样 2x
    const w = Math.floor(bw / 2), h = Math.floor(bh / 2);
    const colorId = new Uint32Array(w * h);
    const stride = bw * 3;
    for (let y = 0; y < h; y++) {
        const srcRow = (y * 2) * stride;
        const dstRow = y * w;
        for (let x = 0; x < w; x++) {
            const i = srcRow + (x * 2) * 3;
            const q0 = (data[i] >> 2) << 2;
            const q1 = (data[i + 1] >> 2) << 2;
            const q2 = (data[i + 2] >> 2) << 2;
            colorId[dstRow + x] = q0 | (q1 << 8) | (q2 << 16);
        }
    }

    // 颜色直方图
    const counts = new Map<number, number>();
    for (let i = 0; i < w * h; i++) {
        const c = colorId[i];
        counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const topN = Math.min(6, ranked.length);
    if (topN === 0) return -1;
    const topColors = ranked.slice(0, topN).map(([c]) => c);

    const minSide = Math.max(1, Math.round((Math.min(sw, sh) * 0.25)));
    // 缺口左边缘不会太靠左（左下角是滑块本体，本身是纯色块，极易误判）。
    // 滑块本体宽度约68px(下采样34)，只跳过该区域；过大(如w/4≈62)会漏掉左侧真实缺口。
    const skipLeft = Math.max(34, Math.floor(68 / 2)); // 下采样坐标，原图≈68px
    // 预期缺口面积（下采样后）：≈ (小图边长/2)^2
    const targetArea = Math.round(((sw / 2) * (sh / 2)));
    const areaTol = Math.round(targetArea * 0.6); // 允许 ±60% 面积偏差
    const goodEnough = Math.floor((minSide * minSide * 3) / 2);

    let bestX = 0;
    let bestScore = Infinity; // 越小越好：面积接近 target 优先
    let bestArea = 0;
    const mask = new Uint8Array(w * h);
    const colRun = new Int32Array(w * h);

    for (const c of topColors) {
        for (let i = 0; i < w * h; i++) mask[i] = colorId[i] === c ? 1 : 0;

        // 列方向连续运行长度（colRun[y*w+x] = 从 (y,x) 向上连续匹配 c 的像素数）
        for (let x = 0; x < w; x++) colRun[x] = mask[x];
        for (let y = 1; y < h; y++) {
            const row = y * w, prev = (y - 1) * w;
            for (let x = 0; x < w; x++) {
                colRun[row + x] = mask[row + x] !== 0 ? colRun[prev + x] + 1 : 0;
            }
        }

        // 扫描每行，找宽度与高度比值接近 1 的连续纯色块
        for (let y = minSide; y < h; y++) {
            const rowBase = y * w;
            let x = skipLeft;
            while (x < w) {
                if (colRun[rowBase + x] < minSide) { x++; continue; }
                const s = x;
                while (x < w && colRun[rowBase + x] >= minSide) x++;
                const runW = x - s;
                const runH = colRun[rowBase + s];
                if (runH > 0) {
                    const ratio = runW / runH;
                    const area = runW * runH;
                    // 面积接近预期缺口面积，且宽高比接近正方形
                    const dist = Math.abs(area - targetArea);
                    if (ratio >= 0.7 && ratio <= 1.4 && dist < areaTol && dist < bestScore) {
                        bestScore = dist;
                        bestX = s;
                        bestArea = area;
                    }
                }
            }
        }
    }

    if (bestScore === Infinity) return -1;
    return bestX * 2;
}
