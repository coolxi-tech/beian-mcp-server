import { describe, it, expect } from "vitest";
// 注意：从 tests/module 目录引入 src/module 目录下的文件
import { handleIcpQuery } from "@/module/icp.js";

describe("ICP 查询模块单元测试", () => {
    it("应成功查询 ICP 备案信息并输出 JSON 结果", async () => {
        const keyword = "baidu.com";
        const serviceType = "web";

        try {
            const result = await handleIcpQuery({ search: keyword, type: serviceType });

            const jsonOutput = JSON.stringify(
                {
                    code: 0,
                    message: "查询成功",
                    query: { keyword, serviceType },
                    data: result,
                },
                null,
                2
            );

            console.log("\n================ [ICP 查询结果 JSON] ================");
            console.log(jsonOutput);
            console.log("====================================================\n");

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
        } catch (error: any) {
            console.error("\n================ [ICP 查询失败] ================");
            console.error(error?.message);
            console.error("====================================================\n");
            throw error;
        }
    }, 30000);
});