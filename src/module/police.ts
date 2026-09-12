import { policeRequest } from "@/api/police.js";
import { aesEcbEncryptBase64, generateUuid } from "@/utils/crypto.js";
import { recognizeClickWord } from "@/utils/police_captcha.js";
import type {
    ClickPosition,
    PoliceCaptchaData,
    PoliceQueryParam,
    PoliceQueryResponse,
    PoliceResponse,
} from "@/types/police.js";

export type PoliceRecognizer = (
    imageBase64: string,
    wordList: string[]
) => Promise<ClickPosition[] | null>;

/**
 * 步骤 1：获取点选文字验证码
 * POST captcha/get -> repData { originalImageBase64, wordList, secretKey, token }
 */
export async function fetchPoliceCaptcha(captchaType = "clickWord"): Promise<PoliceCaptchaData> {
    let captcha: PoliceCaptchaData | null = null;
    for (let i = 0; i < 3; i++) {
        try {
            const res = await policeRequest.post<PoliceResponse<PoliceCaptchaData>>("captcha/get", {
                captchaType,
                clientUid: generateUuid("point"),
                ts: Math.floor(Date.now() / 1000),
            });
            if (res.data?.repCode === "0000" && res.data.repData) {
                captcha = res.data.repData;
                break;
            }
        } catch (e: any) {
            if (i === 2) throw new Error(`获取验证码失败: ${e.message}`);
        }
    }
    if (!captcha) throw new Error("获取验证码失败: 响应无 repData");
    return captcha;
}

/**
 * 步骤 2：校验点选坐标（验证码只能提交一次，失败即作废）
 * POST captcha/check，pointJson = AES-128-ECB(secretKey, positions JSON)
 */
export async function checkPoliceCaptcha(
    captcha: PoliceCaptchaData,
    positions: ClickPosition[],
    captchaType = "clickWord"
): Promise<boolean> {
    try {
        const pointJson = aesEcbEncryptBase64(JSON.stringify(positions), captcha.secretKey);
        const res = await policeRequest.post<PoliceResponse>("captcha/check", {
            captchaType,
            pointJson,
            token: captcha.token,
        });
        const body: PoliceResponse = res.data ?? {};
        if (body.repCode != null && body.repCode !== "0000") return false;
        if (body.success === false) return false;
        return true;
    } catch (e: any) {
        throw new Error(`验证码校验失败: ${e.message}`);
    }
}

/**
 * 步骤 3：凭 captchaVerification 查询备案信息
 * POST query/websearch，captchaVerification = AES-128-ECB(secretKey, "token---positions")
 */
export async function queryPoliceByCondition(
    content: string,
    captcha: PoliceCaptchaData,
    positions: ClickPosition[]
): Promise<PoliceQueryResponse> {
    const positionsJson = JSON.stringify(positions);
    const captchaVerification = aesEcbEncryptBase64(
        `${captcha.token}---${positionsJson}`,
        captcha.secretKey
    );
    const res = await policeRequest.post<PoliceQueryResponse>("query/websearch", {
        captchaVerification,
        maindm: content,
    });
    return res.data;
}

/**
 * 完整查询流程（单次，不重试）
 * 拆分为独立请求函数后组装，识别器可注入以便测试与 A/B 对比。
 * @returns { verified, result } verified 为 false 表示验证码校验失败（未查询）
 */
export async function runPoliceFlow(
    param: { search: string },
    recognizer: PoliceRecognizer
): Promise<{ verified: boolean; result: PoliceQueryResponse | null }> {
    // 1. 验证码
    const captcha = await fetchPoliceCaptcha();

    // 2. 识别点选坐标（未命中全部目标文字即失败，由上层换新验证码重试）
    const positions = await recognizer(captcha.originalImageBase64, captcha.wordList);
    if (!positions) throw new Error("验证码识别失败");

    // 3. 校验（一次性）
    const verified = await checkPoliceCaptcha(captcha, positions);

    // 4. 查询（校验失败则不查询）
    const result = verified
        ? await queryPoliceByCondition(param.search, captcha, positions)
        : null;

    return { verified, result };
}

/**
 * 网安备案查询入口（带整流程重试）
 * 拆分为独立请求函数后组装，识别器固定使用 recognizeClickWord。
 */
export async function handlePoliceQuery(param: PoliceQueryParam): Promise<PoliceQueryResponse> {
    const { search } = param;

    let count = 0;
    const maxRetries = 3;

    while (count <= maxRetries) {
        try {
            const { verified, result } = await runPoliceFlow({ search }, recognizeClickWord);
            if (!verified || !result) throw new Error("验证码校验失败");
            return result;
        } catch (error: any) {
            if (count === maxRetries) {
                let message = error.message;
                if (message.includes("403")) message = "被 CDN 拦截";
                throw new Error(`查询失败: ${message}`);
            }
            count++;
        }
    }

    throw new Error("查询超过最大重试次数");
}
