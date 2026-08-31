import axios from "axios";
import { getUA } from "@/utils/internet.js";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

// 1. 初始化 UA 与 CookieJar 实例
const userAgent = getUA();
const jar = new CookieJar();

// 2. 创建并使用 wrapper 包裹 axios 实例
export const request = wrapper(
    axios.create({
        baseURL: "https://hlwicpfwc.miit.gov.cn/icpproject_query/api/",
        jar, // 绑定 Cookie 容器，后续响应中的 Set-Cookie 会自动存入 jar
        withCredentials: true, // 开启凭据自动传递
        headers: {
            "User-Agent": userAgent,
            "Origin": "https://hlwicpfwc.miit.gov.cn",
            "Referer": "https://beian.miit.gov.cn/",
            "Content-Type": "application/json",
        },
        timeout: 10000, // 建议加上超时限制
    })
);