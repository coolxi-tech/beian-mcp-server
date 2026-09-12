import { describe, it, expect } from "vitest";
// 注意：从 tests/module 目录引入 src/module 目录下的文件
import { handlePoliceQuery } from "@/module/police.js";

describe("网安备案查询模块单元测试", () => {
    it("应成功查询网安备案信息并输出 JSON 结果", async () => {
        const keyword = "baidu.com";

        try {
            const result = await handlePoliceQuery({ search: keyword });

            const jsonOutput = JSON.stringify(
                {
                    code: 0,
                    message: "查询成功",
                    query: { keyword },
                    data: result,
                },
                null,
                2
            );

            console.log("\n================ [网安备案查询结果 JSON] ================");
            console.log(jsonOutput);
            console.log("========================================================\n");

            expect(result).toBeDefined();
        } catch (error: any) {
            console.error("\n================ [网安备案查询失败] ================");
            console.error(error?.message);
            console.error("====================================================\n");
            throw error;
        }
    }, 60000);
});
