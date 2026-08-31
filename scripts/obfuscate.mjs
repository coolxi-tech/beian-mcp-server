import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

// 混淆配置（与构建混淆目标匹配，可在 obfuscator.config.json 中覆盖）
const DEFAULT_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  numbersToExpressions: true,
  splitStrings: false,
  unicodeEscapeSequence: false,
  target: "node",
};

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectJsFiles(full, out);
    } else if (entry.endsWith(".js") || entry.endsWith(".cjs") || entry.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const files = collectJsFiles(distDir);

if (files.length === 0) {
  console.error("[obfuscate] dist 目录下没有 JS 文件，先执行 esbuild 构建");
  process.exit(1);
}

for (const file of files) {
  const code = readFileSync(file, "utf-8");
  const result = JavaScriptObfuscator.obfuscate(code, DEFAULT_CONFIG);
  writeFileSync(file, result.getObfuscatedCode(), "utf-8");
  console.log(`[obfuscate] 已混淆 ${relative(root, file)}`);
}

console.log(`[obfuscate] 完成，共混淆 ${files.length} 个文件`);
