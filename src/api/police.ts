import axios from "axios";
import { getUA } from "@/utils/internet.js";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

// 1. 初始化 UA 与 CookieJar 实例（与 ICP 一致，保持会话 Cookie）
const userAgent = getUA();
const jar = new CookieJar();

// 2. 创建并使用 wrapper 包裹 axios 实例
export const policeRequest = wrapper(
    axios.create({
        baseURL: "https://beian.mps.gov.cn/cyber_portal/",
        jar, // 绑定 Cookie 容器，后续响应中的 Set-Cookie 会自动存入 jar
        withCredentials: true,
        headers: {
            "User-Agent": userAgent,
            "Origin": "https://beian.mps.gov.cn",
            "Referer": "https://beian.mps.gov.cn/",
            "Content-Type": "application/json",
        },
        timeout: 15000,
    })
);

// 3. 每次请求注入毫秒时间戳请求头（等价 PHP Time::getCurrentTimestamp(true)）
policeRequest.interceptors.request.use((config) => {
    config.headers.set("timestamp", Date.now().toString());
    return config;
});
