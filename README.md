# beian-mcp-server

**给你的 AI 助手一副查备案的手。**

两个工具：工信部 **ICP 备案**、公安部**联网备案**。接进 Claude Desktop / Cursor / Cline / 任何支持 MCP 的客户端之后，你可以直接问"这个域名背后是哪家公司""它的备案号是什么、审核到什么时候"，AI 会自己去查，不用你打开官网过滑块。

不需要 API Key，不需要注册账号，不需要打码平台——验证码识别全部在本地完成。

> *An MCP server exposing two tools that let AI clients look up mainland-China ICP filings (MIIT) and public-security network filings (MPS). Captcha solving runs locally via ONNX; no API key, no third-party captcha service.*

> ⚠️ **本项目仅供学习与技术研究用途**，非官方产品，不面向生产环境。完整条款见文末 [免责声明](#免责声明)。

---

## 30 秒接入

把下面这段合并进你的 MCP 客户端配置，重启客户端：

```json
{
  "mcpServers": {
    "beian": {
      "command": "npx",
      "args": ["-y", "@coolxitech/beian-mcp-server"],
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

然后直接问它：

```
查一下 baidu.com 的 ICP 备案主体是谁？
查 湘ICP备2021018214号 这个主体名下还有哪些网站
```

> **首次安装会拉约 66 MB**，其中 54 MB 是本地 OCR 模型。装完即可离线使用，只有查询请求本身需要联网。
> 只想先试试 ICP 查询、不需要公安备案？删掉 `dist/assets/[Dddd]-OCR.onnx` 能省 54 MB（此时 `query-police` 会失败，`query-icp` 不受影响）。

---

## 它提供什么

| 工具 | 用途 | 输入 |
| --- | --- | --- |
| `query-icp` | 工信部 ICP 备案（主体、许可证号、名下服务） | `search`（必填）、`type`（可选，默认 `web`） |
| `query-police` | 公安联网备案（网安备案号、主办单位、审核时间） | `search`（必填） |

`search` 可以填域名、公司全称，也可以填 APP 名称——和官方查询页一致。
`type` 取值：`web` 网站 / `app` 移动应用 / `microapp` 小程序 / `fastapp` 快应用。

### 返回长这样

`query-police` 的返回（示例：baidu.com）：

```json
{
  "success": true,
  "code": 200,
  "msg": "成功",
  "data": {
    "webnm": "百度",
    "maindm": "baidu.com",
    "webSiteStr": ["zhidao.baidu.com", "baike.baidu.com"],
    "audittime": "2025-04-14",
    "unittype": "企业单位",
    "unitnm": "北京百度网讯科技有限公司",
    "webtype": "交互式",
    "polnm": "京公网安备11010802050023号",
    "department": "北京市公安局海淀分局网安支队"
  }
}
```

`query-icp` 返回 JSON 文本，包含备案主体、许可证号、网站信息。字段随上游接口结构变化，所以保留原始结构、不做美化——方便你自己的程序解析。

---

## 什么时候会用到它

- **上线前自检**：新站页脚要挂 ICP 号和公安备案号，一次查询拿到准确写法和归属单位，不用翻邮件。
- **核验合作方**：对方给你一个官网，你想知道域名背后的公司主体、是不是真的存在、名下还有什么。
- **写报告 / 写合同**：让 AI 在起草时直接引用查询结果，而不是凭记忆编一个备案号。
- **批量核验**：HTTP 模式下用脚本把一份域名列表跑一遍（注意别把它当爬虫使，见下方"使用边界"）。

---

## 换一种方式跑

`npx` 那条路适合个人本机使用。下面是另外两种。

### stdio · 用本仓库构建产物

适合你不希望每次启动都走 npx 的情况：

```json
{
  "mcpServers": {
    "beian": {
      "command": "node",
      "args": ["D:\\path\\to\\beian_mcp\\dist\\index.cjs"],
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

### HTTP · 团队共用一个服务

```bash
node dist/index.cjs                 # 默认端口 3000
PORT=8080 node dist/index.cjs       # 自定义端口
```

端点：`POST http://127.0.0.1:3000/mcp`

```json
{
  "mcpServers": {
    "beian": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {}
    }
  }
}
```

> ⚠️ **HTTP 模式默认只监听 `127.0.0.1`**（框架自带 DNS rebinding 保护），本服务自身**没有任何鉴权**。要给同事或外网用，请自己放一层反向代理 + 鉴权，或者干脆别公网暴露。

### 客户端接不上？

先确认两件事：

1. stdio 接入时 `env` 里必须有 `MCP_TRANSPORT=stdio`，否则它会以默认的 HTTP 模式启动去监听端口，客户端连不上；
2. 接好后在客户端里看 `tools/list` 是否列出 `query-icp` / `query-police`。列出来了就说明链路是通的，剩下的问题都在上游。

---

## 常见问题

**Q：公安备案查询失败了怎么办？**
正常现象之一。它依赖"点选文字"验证码，本地识别不可能 100% 准。工具已内置 4 次整流程重试（每次自动换新验证码）；仍失败会返回 `[网安备案查询失败]`，**再调一次通常就过**。ICP 查询用的是滑块验证码纯算法识别，成功率高得多。

**Q：要连外部的模型服务或打码平台吗？**
不用。检测模型（`captcha_detection.onnx`）和 OCR 模型（`[Dddd]-OCR.onnx`）都在包内，`onnxruntime-node` 本地推理。

**Q：上游会不会变？**
会。本服务走的是官方查询页所用的接口（`hlwicpfwc.miit.gov.cn`、`beian.mps.gov.cn/cyber_portal`），不是公开稳定 API。接口改版或触发 WAF 风控时会返回 `[ICP 查询失败]` / `[网安备案查询失败]`。遇到这种情况请先[提 issue](https://github.com/coolxi-tech/beian-mcp-server/issues)。

**Q：查询需要登录吗？会不会留下我的痕迹？**
不需要登录。请求以普通浏览器身份直接发往官方查询接口，与你自己在电脑上打开官网查询没有本质区别。

**Q：Node 版本要求？**
`>= 18.17`，推荐 20+ 或 24 LTS。`sharp` 与 `onnxruntime-node` 是原生模块，安装时会取对应平台的预编译包；装不上通常是这两个。

---

## 使用边界（请读完这一段）

- 查询到的都是**依法公开**的备案信息，但请不要拿它做批量采集、用户画像、营销数据库。
- 不要用它给灰产做域名真实性背书。
- 请控制调用频率——上游是政府公共服务，把人家打出流量问题对谁都没好处。本工具的合理形态是"按需单条查询"，不是"爬站引擎"。

## 许可与商用提醒

- 本仓库以 **CC BY-NC-SA 4.0** 发布：**允许署名、非商业性、相同方式共享**。也就是说，把它放进你的**商业产品或对外收费服务**需要另行获得授权。
- **模型与工具链的许可。** 验证码 OCR 模型来自 [AntiCAP](https://github.com/81NewArk/AntiCAP)（MIT）。文字检测模型（`captcha_detection.onnx`）的**标注数据与训练均在本仓库作者自行完成**，但训练与导出使用了 [Ultralytics](https://github.com/ultralytics/ultralytics)（AGPL-3.0）的 `yolo26n` **官方预训练权重**及其工具链，模型文件的内嵌元数据据此标注为 AGPL-3.0。对授权范围敏感的使用者（尤其是准备商用/托管的人）请在集成前自行确认这一项；作者不对其"AGPL 是否及于模型权重"的主张是否可执行作法律评价。
- 一句话：**个人用、学习用、写进自己的开源项目里，随便；要拿它挣钱，先来谈。**

## 免责声明

**本项目仅供学习与技术研究用途。** 它是为了演示"如何用 MCP 协议把一类公开信息的查询接进 AI 客户端"而写的开源练手作品，不是一个数据服务，也不是任何意义上的产品交付，**不应被用于生产环境或作为任何商业、法律判断的唯一依据**。

具体而言：

- **与官方无关。** 本项目与工业和信息化部、公安部及任何备案管理机构均无关联，未获得其授权、认可或背书。
- **不保证准确。** 查询结果是对上游接口返回内容的原样转录，本工具不做校验、不做补全、不做解释；上游数据本身可能滞后、缺失或变更。**任何需要对外引用的备案号、主体名称、审核时间，请以官方查询页面实时结果为准。**
- **不保证可用。** 软件按"现状（AS IS）"提供，作者不提供任何明示或默示的保证，包括但不限于适销性、特定用途适用性、无错误、以及查询成功率。公安备案查询受验证码识别精度限制，天然不是 100% 成功。
- **风险自担。** 使用者应自行确认其使用行为符合所在地法律法规以及上游服务的相关规定（见上方"使用边界"一节）。因使用、无法使用或误用本工具所产生的任何直接或间接后果，由使用者本人承担，作者不承担任何责任。
- **不提供专业意见。** 本项目输出的是查询结果，不构成法律、合规、审计或尽调意见。

> *This project is provided for learning and research purposes only. It is not an official product and is not affiliated with, authorized, or endorsed by any government authority. Data are relayed verbatim from upstream endpoints and may be inaccurate, incomplete, or outdated — always verify against the official filing system. The software is provided "AS IS" without warranty of any kind; the author accepts no liability for any use or misuse.*

## 开发与构建

想跑源码、改逻辑、自己出包，看 **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**（环境要求、目录结构、构建链路、测试、混淆发布）。

```bash
pnpm install
pnpm dev      # tsx 热运行，HTTP 模式
pnpm build    # 单文件 + 混淆 → dist/index.cjs
pnpm test     # vitest
```

## 致谢

验证码识别环节直接受益于 [AntiCAP](https://github.com/81NewArk/AntiCAP)：本服务的 OCR 模型（`[Dddd]-OCR.onnx` / `[Dddd]-CharSets.txt`）取自该项目，点选检测与 OCR 流程也按其 `detection.py` / `ocr.py` 移植为 Node.js 实现。
