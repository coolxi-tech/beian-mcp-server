import crypto from "node:crypto";
import { request } from "@/api/icp.js";
import { generateUuid } from "@/utils/crypto.js";
import { localSlider } from "@/utils/captcha.js";
import type { IcpQueryParam, IcpResponse, IcpItem } from "@/types/icp.js";

export async function handleIcpQuery(param: IcpQueryParam): Promise<IcpItem[]> {
    const { search, type = "web", pageNum = "", pageSize = "" } = param;
    const serviceTypeMap: Record<string, number> = {
        app: 6,
        microapp: 7,
        fastapp: 8,
    };
    const serviceType = serviceTypeMap[type] ?? 1;
    const client = request;

    let count = 0;
    const maxRetries = 3;

    while (count <= maxRetries) {
        try {
            const time = Date.now();
            const clientUUID = generateUuid("point");

            // 1. 获取 token
            let accessToken = "";
            for (let i = 0; i < 3; i++) {
                try {
                    const authKey = crypto.createHash("md5").update(`testtest${time}`).digest("hex");
                    const res = await client.post(
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

            // 2. 获取验证码
            let captchaData: any = null;
            for (let i = 0; i < 3; i++) {
                try {
                    const res = await client.post(
                        "image/getCheckImagePoint",
                        { clientUid: clientUUID },
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

            const uuid = captchaData.uuid;
            const textPosition = await localSlider(captchaData.smallImage, captchaData.bigImage);
            if (textPosition === -1) throw new Error("验证码坐标识别失败");

            // 3. 校验验证码
            let sign = "";
            for (let i = 0; i < 3; i++) {
                try {
                    const res = await client.post(
                        "image/checkImage",
                        { key: uuid, value: String(textPosition) },
                        { headers: { token: accessToken } }
                    );
                    if (res.data?.params) {
                        sign = res.data.params;
                        break;
                    }
                } catch (e: any) {
                    if (i === 2) throw new Error(`验证码校验失败: ${e.message}`);
                }
            }

            // 4. 查询备案结果
            const icpRes = await client.post(
                "icpAbbreviateInfo/queryByCondition",
                { serviceType, unitName: search, pageNum, pageSize },
                { headers: { token: accessToken, uuid, sign } }
            );

            const data: IcpResponse = icpRes.data;
            if (!data.success) throw new Error("查询备案信息失败");
            return data.params?.list ?? [];
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