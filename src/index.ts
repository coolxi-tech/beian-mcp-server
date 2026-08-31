import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
    createMcpHandler,
    McpServer,
    type McpServerFactory,
} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

// 导入 module 层导出的核心业务函数（NodeNext 模式下必须保留 .js 后缀）
import { handleIcpQuery } from "@/module/icp.js";
// import { handlePoliceQuery } from "./module/police.js";
// 复用服务类型常量，保证 schema 与 ServiceType 枚举值同源
import { ICP_SERVICE_TYPES } from "@/types/icp.js";

/**
 * 注册所有工具到指定的 McpServer 实例。
 * HTTP 模式下每次请求都会通过 serverFactory 创建一个全新的 server 实例，
 * 因此工具注册必须抽成函数，供工厂复用。
 */
function registerTools(server: McpServer) {
    // ==========================================
    // Tool 1: 工信部 ICP 备案查询
    // ==========================================
    server.registerTool(
        "query-icp",
        {
            description: "查询中国大陆工信部 ICP 备案信息（支持域名、单位名称、APP名称等）",
            inputSchema: z.object({
                search: z
                    .string()
                    .min(1, "查询关键词不能为空")
                    .describe("查询内容（如：baidu.com 或 北京百度网讯科技有限公司）"),
                type: z
                    .enum(ICP_SERVICE_TYPES)
                    .default("web")
                    .describe("服务类型：web(网站), app(移动应用), microapp(小程序), fastapp(快应用)"),
            }),
        },
        async ({ search, type }) => {
            try {
                const result = await handleIcpQuery({ search, type });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `[ICP 查询失败] ${error?.message || "未知错误"}`,
                        },
                    ],
                };
            }
        }
    );

    // ==========================================
    // Tool 2: 全国公安机关联网备案查询
    // 说明：公安备案查询需要验证码识别，当前无法本地化，暂不可用，故注释掉。
    // 待验证码识别方案落地后再启用。
    // ==========================================
    // server.registerTool(
    //     "query-police",
    //     {
    //         description: "查询全国公安机关联网备案信息",
    //         inputSchema: z.object({
    //             domain: z
    //                 .string()
    //                 .min(1, "查询域名或名称不能为空")
    //                 .describe("需要查询的域名或主体名称（如：baidu.com）"),
    //         }),
    //     },
    //     async ({ domain }) => {
    //         try {
    //             const result = await handlePoliceQuery(domain);
    //             return {
    //                 content: [
    //                     {
    //                         type: "text",
    //                         text: JSON.stringify(result, null, 2),
    //                     },
    //                 ],
    //             };
    //         } catch (error: any) {
    //             return {
    //                 isError: true,
    //                 content: [
    //                     {
    //                         type: "text",
    //                         text: `[公安备案查询失败] ${error?.message || "未知错误"}`,
    //                     },
    //                 ],
    //             };
    //         }
    //     }
    // );
}

/**
 * HTTP 模式下（2026-07-28 协议）createMcpHandler 要求按请求提供 server 实例，
 * 这里用工厂为每个请求创建独立实例并注册工具。
 */
const serverFactory: McpServerFactory = () => {
    const server = new McpServer({
        name: "beian-mcp-server",
        version: "1.0.0",
    });
    registerTools(server);
    return server;
};

// ==========================================
// 启动模式：MCP_TRANSPORT 环境变量控制
//   stdio -> serveStdio(serverFactory)，与 MCP 客户端通过 stdin/stdout 通信
//   http  -> 启动 HTTP 服务（默认）
// ==========================================
const TRANSPORT = process.env.MCP_TRANSPORT ?? "http";

if (TRANSPORT === "stdio") {
    // stdio 模式：serveStdio 从同一工厂按需创建 server 实例
    serveStdio(serverFactory);
    console.error("Beian MCP Server 成功启动 (stdio 模式)");
} else {
    // createMcpHandler: 面向 web-standard fetch 的 MCP HTTP handler
    // 默认 legacy: "stateless"（对 2025 时代客户端提供无状态回退）
    const handler = createMcpHandler(serverFactory);

    // createMcpExpressApp: 预配置的 Express 应用（默认 127.0.0.1，自带 DNS rebinding 保护与 JSON body 解析）
    const app = createMcpExpressApp();

    // toNodeHandler: 把 fetch 形态的 handler 适配为 Express 的 (req, res, body) 处理器。
    // 注意：createMcpExpressApp 已内置 express.json()，请求流在到达这里前已被消费，
    // 因此必须显式传入 req.body 作为 parsedBody，否则 handler 内部读取 body 会得到空流。
    app.post("/mcp", (req, res) => toNodeHandler(handler)(req, res, req.body));

    // 启动 HTTP 服务
    const PORT = Number(process.env.PORT ?? 3000);

    app.listen(PORT, () => {
        console.error(`Beian MCP Server 成功启动 (HTTP 模式): http://127.0.0.1:${PORT}/mcp`);
    });
}
