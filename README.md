---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: b8f4477dc8ee22a528114e118343f32c_74ea2447a54d11f1b8ae525400287e28
    ReservedCode1: T8hTU2RXW6L3jL9HYsn4UlJ+xEyszIsU2wn7Uv8YGutW2uQngUdC7rSjPc8oKBDiSp8FMdIfR5VgvKebVq8agi6zqZ+mh9S2XCg0e+9PwaXpjkaGaIz5D4oJrBZB5rlYGJQguduXHv3Mh8/XFT9p+zhd1m0pYvcz67V28rWkUasaQc/MiWJ27664peg=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: b8f4477dc8ee22a528114e118343f32c_74ea2447a54d11f1b8ae525400287e28
    ReservedCode2: T8hTU2RXW6L3jL9HYsn4UlJ+xEyszIsU2wn7Uv8YGutW2uQngUdC7rSjPc8oKBDiSp8FMdIfR5VgvKebVq8agi6zqZ+mh9S2XCg0e+9PwaXpjkaGaIz5D4oJrBZB5rlYGJQguduXHv3Mh8/XFT9p+zhd1m0pYvcz67V28rWkUasaQc/MiWJ27664peg=
---

# beian-mcp-server

中国备案信息查询 MCP 服务端。通过 [MCP](https://modelcontextprotocol.io) 协议提供工具接口，支持工信部 ICP 备案查询，可同时运行于 **HTTP（Streamable HTTP）** 与 **stdio** 两种传输模式。

## 功能特性

- **ICP 备案查询**：通过 MCP 工具 `query-icp` 查询中国大陆工信部 ICP 备案信息，支持按域名、单位名称、APP 名称等关键词检索，覆盖网站 / 移动应用 / 小程序 / 快应用等服务类型。
- **双传输模式**：通过环境变量 `MCP_TRANSPORT` 一键切换 HTTP 与 stdio 模式，适配不同的 MCP 客户端接入方式。
- **单文件构建 + 混淆**：`esbuild` 打包为单一 `dist/index.cjs`（CJS 格式），支持 `javascript-obfuscator` 混淆，便于分发部署。
- **无状态请求处理**：HTTP 模式下每次请求通过 `McpServerFactory` 创建独立 server 实例，规避单例 `connect` 冲突，并兼容 2025 时代客户端的无状态回退。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 语言/运行时 | TypeScript（NodeNext）、Node.js |
| MCP | `@modelcontextprotocol/server` / `express` / `node` |
| Web 框架 | Express 5 |
| 网络请求 | axios + axios-cookiejar-support + tough-cookie |
| 图像处理 | sharp（用于滑块验证码识别，ICP 查询流程） |
| 校验 | zod v4 |
| 构建 | esbuild（单文件打包）+ tsc-alias（路径别名）+ javascript-obfuscator（混淆） |
| 测试 | vitest |

## 目录结构

```
beian_mcp/
├── src/
│   ├── index.ts            # 入口：注册工具、启动 HTTP / stdio 服务
│   ├── module/
│   │   ├── icp.ts          # 工信部 ICP 备案查询核心业务
│   │   └── police.ts       # 公安备案查询（未启用，占位）
│   ├── api/
│   │   └── police.ts       # 公安备案 API（未启用，占位）
│   ├── utils/
│   │   └── captcha.ts      # 滑块验证码识别（基于 sharp）
│   └── types/
│       └── icp.ts          # 备案查询类型定义与 ServiceType 枚举
├── scripts/
│   ├── build.mjs           # 构建脚本：清空 dist → esbuild 打包 → 混淆
│   └── obfuscate.mjs       # 混淆脚本（支持 .cjs）
├── dist/                   # 构建产物（index.cjs）
├── test/                   # 测试用例
├── package.json
└── tsconfig.json
```

## 环境要求

- Node.js ≥ 18（推荐 20+）
- [pnpm](https://pnpm.io) ≥ 11（项目通过 `devEngines` 锁定，`npx` 可能存在兼容问题，请使用 `pnpm`）
- sharp 为原生模块，运行时需保留在 `node_modules` 中（构建时已通过 `--external:sharp` 排除）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 开发模式（tsx 热运行，HTTP 模式）
pnpm dev
```

## 运行

服务启动模式由环境变量 `MCP_TRANSPORT` 控制：

| `MCP_TRANSPORT` | 模式 | 说明 |
| --- | --- | --- |
| `http`（默认） | HTTP | 监听 `PORT`（默认 3000），端点 `POST /mcp` |
| `stdio` | stdio | 通过 stdin/stdout 与 MCP 客户端通信 |

### HTTP 模式（默认）

```bash
# 使用默认端口 3000
node dist/index.cjs

# 自定义端口
$env:PORT = 8080; node dist/index.cjs
```

启动后端点地址：`http://127.0.0.1:3000/mcp`，将其配置到 MCP 客户端（如 Claude Desktop、Cline 等）的远程服务器即可。

### stdio 模式

```bash
$env:MCP_TRANSPORT = "stdio"; node dist/index.cjs
```

或将以下配置写入 MCP 客户端：

```json
{
  "mcpServers": {
    "beian-mcp-server": {
      "command": "node",
      "args": ["E:\\Project\\Web\\beian_mcp\\dist\\index.cjs"],
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

## 构建

```bash
# 完整构建：单文件打包 + 混淆（产出 dist/index.cjs，混淆后约 5MB）
pnpm build

# 仅单文件打包、不做混淆（便于排查产物问题）
pnpm build:raw
```

构建链路说明：

1. `scripts/build.mjs` 清空 `dist` 目录；
2. esbuild 打包为 CJS 单文件 `dist/index.cjs`（`--format=cjs`、`--external:sharp` 保留原生模块、`--alias:@=./src` 解析路径别名）；
3. `scripts/obfuscate.mjs` 对产物执行混淆（`--raw` 时跳过此步）。

> 说明：产物使用 `.cjs` 扩展名输出，以规避 `package.json` 中 `"type": "module"` 导致的 ESM 解析问题（ESM 单文件下 express 依赖的动态 `require("tty")` 不被支持）。

## 测试

```bash
# 运行一次测试
pnpm test

# 监听模式
pnpm test:watch
```

## MCP 工具

### query-icp

查询中国大陆工信部 ICP 备案信息。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `search` | string | 是 | - | 查询关键词，如 `baidu.com`、`北京百度网讯科技有限公司` |
| `type` | enum | 否 | `web` | 服务类型：`web`（网站）、`app`（移动应用）、`microapp`（小程序）、`fastapp`（快应用） |

返回结果为 JSON 文本，包含备案主体、许可证号、网站信息等。

## 已知限制

- **公安备案查询未启用**：`query-police` 工具因公安备案查询需验证码识别、暂无法本地化，当前已注释禁用（`src/module/police.ts`、`src/api/police.ts` 为占位空文件），待验证码识别方案落地后再启用。
- ICP 查询依赖第三方网页接口，若上游接口变更或触发风控，查询可能失败并返回 `[ICP 查询失败]` 错误信息。

## 许可

ISC
*（内容由AI生成，仅供参考）*
