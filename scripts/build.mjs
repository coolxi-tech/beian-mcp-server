import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const raw = process.argv.includes("--raw");

// 1. 清空旧产物（旧 tsc 多文件残留一并清理）
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

// 2. esbuild 打包单文件：CJS 格式（express 的 debug 依赖有动态 require，
//    ESM 单文件不支持），sharp 为原生模块必须 external
const result = await build({
  entryPoints: [join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: join(distDir, "index.cjs"),
  alias: { "@": join(root, "src") },
  external: ["sharp"],
  logLevel: "warning",
  metafile: false,
});
console.log(`[build] 已生成 dist/index.cjs (${(result.metafile ? 0 : 0) || "见上方"})`);

// 3. 混淆（--raw 时跳过）
if (!raw) {
  const obf = spawnSync(
    process.execPath,
    [join(root, "scripts/obfuscate.mjs")],
    { cwd: root, stdio: "inherit" }
  );
  if (obf.status !== 0) {
    console.error("[build] 混淆失败");
    process.exit(obf.status ?? 1);
  }
} else {
  console.log("[build] --raw 模式：跳过混淆");
}

// 4. 为 bin 入口补 shebang（混淆/打包后行首若无则补上）
const entry = join(distDir, "index.cjs");
const entryCode = readFileSync(entry, "utf-8");
if (!entryCode.startsWith("#!")) {
  writeFileSync(entry, "#!/usr/bin/env node\n" + entryCode, "utf-8");
  console.log("[build] 已为 dist/index.cjs 补 shebang");
}
