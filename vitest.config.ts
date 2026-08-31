import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()], // 👈 自动解析 tsconfig 中的 paths
    test: {
        include: ["src/tests/**/*.{test,spec}.ts"],
        globals: true,
    },
});