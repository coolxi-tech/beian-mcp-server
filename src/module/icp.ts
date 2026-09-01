import crypto from "node:crypto";
import { request } from "@/api/icp.js";
import { generateUuid } from "@/utils/crypto.js";
import { colorBlockSlider } from "@/utils/captcha.js";
import type { IcpQueryParam, IcpResponse, IcpItem } from "@/types/icp.js";

export type CaptchaData = {
    uuid: string;
    smallImage: string;
    bigImage: string;
    [key: string]: any;
};

export type SliderRecognizer = (
    targetImage: string,
    backgroundImage: string
) => Promise<number>;

/**
 * 步骤 1：获取 accessToken
 * POST auth -> params.bussiness
 */
export async function fetchAccessToken(): Promise<string> {
    let accessToken = "";
    for (let i = 0; i < 3; i++) {
        try {
            const time = Date.now();
            const authKey = crypto.createHash("md5").update(`testtest${time}`).digest("hex");
            const res = await request.post(
                "auth",
                new URLSearchParams({ authKey, timeStamp: time.toString() }),
                { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
            );
            if (res.data?.params?.bussiness) {
                accessToken = res.data.params.bussiness;
                break;
            }
        } catch (e: any) {
            if (i === 2) throw new Error(`获取 token 失败: ${e.message}`);
        }
    }
    if (!accessToken) throw new Error("获取 token 失败: 响应中无 bussiness");
    return accessToken;
}

/**
 * 步骤 2：获取滑块验证码
 * POST image/getCheckImagePoint -> params { uuid, smallImage, bigImage }
 */
export async function fetchCaptcha(accessToken: string): Promise<CaptchaData> {
    let captchaData: CaptchaData | null = null;
    for (let i = 0; i < 3; i++) {
        try {
            const res = await request.post(
                "image/getCheckImagePoint",
                { clientUid: generateUuid("point") },
                { headers: { token: accessToken } }
            );
            if (res.data?.params) {
                captchaData = res.data.params;
                break;
            }
        } catch (e: any) {
            if (i === 2) throw new Error(`获取验证码失败: ${e.message}`);
        }
    }
    if (!captchaData) throw new Error("获取验证码失败: 响应中无 params");
    return captchaData;
}

/**
 * 步骤 3：校验滑块坐标（验证码只能提交一次，失败即作废）
 * POST image/checkImage -> params 为 sign
 * @returns sign
 */
export async function checkCaptcha(
    accessToken: string,
    uuid: string,
    textPosition: number
): Promise<string> {
    let sign = "";
    // 注意：同一 uuid 只能提交一次。这里重试无意义（同图重复提交只会得到空 params），
    // 因此只尝试一次；若失败由上层重新获取新验证码。
    try {
        const res = await request.post(
            "image/checkImage",
            { key: uuid, value: String(textPosition) },
            { headers: { token: accessToken } }
        );
        if (res.data?.params) sign = res.data.params;
    } catch (e: any) {
        throw new Error(`验证码校验失败: ${e.message}`);
    }
    return sign;
}

/**
 * 步骤 4：查询备案信息
 * POST icpAbbreviateInfo/queryByCondition
 */
export async function queryByCondition(
    accessToken: string,
    uuid: string,
    sign: string,
    param: { serviceType: number; unitName: string; pageNum?: number | string; pageSize?: number | string }
): Promise<IcpItem[]> {
    const icpRes = await request.post("icpAbbreviateInfo/queryByCondition", param, {
        headers: { token: accessToken, uuid, sign },
    });
    const data: IcpResponse = icpRes.data;
    if (!data.success) throw new Error("查询备案信息失败");
    return data.params?.list ?? [];
}

/**
 * 完整查询流程（单次，不重试）
 * 供 handleIcpQuery 与闭环识别率测试复用；识别器可注入以便 A/B 对比。
 * @returns { sign, list, textPosition } sign 为空表示验证码校验失败
 */
export async function runIcpFlow(
    param: { search: string; type?: string; pageNum?: number | string; pageSize?: number | string },
    recognizer: SliderRecognizer
): Promise<{ sign: string; textPosition: number; list: IcpItem[] }> {
    const serviceTypeMap: Record<string, number> = {
        app: 6,
        microapp: 7,
        fastapp: 8,
    };
    const serviceType = serviceTypeMap[param.type ?? "web"] ?? 1;

    // 1. token
    const accessToken = await fetchAccessToken();

    // 2. 验证码
    const captcha = await fetchCaptcha(accessToken);

    // 3. 识别
    const textPosition = await recognizer(captcha.smallImage, captcha.bigImage);
    if (textPosition === -1) throw new Error("验证码坐标识别失败");

    // 4. 校验（一次性）
    const sign = await checkCaptcha(accessToken, captcha.uuid, textPosition);

    // 5. 查询（sign 为空则校验失败，不查询）
    const list = sign
        ? await queryByCondition(accessToken, captcha.uuid, sign, {
              serviceType,
              unitName: param.search,
              pageNum: param.pageNum,
              pageSize: param.pageSize,
          })
        : [];

    return { sign, textPosition, list };
}

/**
 * ICP 备案查询入口（带整流程重试）
 * 拆分为独立请求函数后组装，识别器固定使用 colorBlockSlider。
 */
export async function handleIcpQuery(param: IcpQueryParam): Promise<IcpItem[]> {
    const { search, type = "web", pageNum = "", pageSize = "" } = param;

    let count = 0;
    const maxRetries = 3;

    while (count <= maxRetries) {
        try {
            const { sign, list } = await runIcpFlow(
                { search, type, pageNum, pageSize },
                colorBlockSlider
            );
            if (!sign) throw new Error("验证码校验失败");
            return list;
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