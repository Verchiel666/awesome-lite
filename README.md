# awesome-lite-mcp

离线检索整个 **awesome 清单生态**的 MCP 服务 + CLI。零依赖，一个 index.json 装下 9,000+ 条精选资源。

在线检索页（手机可开、可分享链接）：**https://verchiel666.github.io/awesome-lite/**

> 起因：awesome（[sindresorhus/awesome](https://github.com/sindresorhus/awesome)，53 万 star）是「清单的清单」，
> 但它的用法是「开浏览器 → 点 awesome.re → 上一页页翻」。这个项目把它变成**可检索、可离线、能被 AI 调用的索引**。

## 装

```bash
npx -y awesome-lite-mcp          # 直接起 MCP 服务（stdio）
npm i -g awesome-lite-mcp        # 或者全局装 CLI：awesome-lite search "mcp server"
```

MCP 客户端（Cursor / Claude Desktop / DSH / 自研 Agent）配置：

```json
{
  "mcpServers": {
    "awesomelite": { "command": "npx", "args": ["-y", "awesome-lite-mcp"] }
  }
}
```

## 5 个工具

| 工具 | 干什么 |
|---|---|
| `awesome_search` | 跨清单按相关度检索（name > desc > category 加权） |
| `awesome_lists` | 列出已索引的 12 张清单、条目数、为什么收录 |
| `awesome_cat` | 按清单 / 分类摊开一份清单 |
| `awesome_sync` | 从 GitHub 重新抓 README 重建索引（支持深抓分册） |
| `awesome_stats` | 索引统计 |

## CLI

```bash
awesome-lite lists
awesome-lite search "android reverse engineering" --limit=8
awesome-lite search "python" --list=vinta/awesome-python --all
awesome-lite cat EbookFoundation/free-programming-books "Books / Chinese" --limit=20
awesome-lite sync [repo...] [--force]
awesome-lite stats
```

## 索引里有什么（随包附带，开箱即用）

`index.json`：**9,317 条 / 12 张清单**，含

- 总目录 `sindresorhus/awesome`（28 类）
- `codecrafters-io/build-your-own-x`（亲手造 Redis/Git/Docker，GitHub star 第一）
- `EbookFoundation/free-programming-books`（含 119 个语言分册；本项目默认深抓 30 个、中文优先 → 中文 379 条）
- `vinta/awesome-python` / `sindresorhus/awesome-nodejs` / `awesome-selfhosted` / `public-apis`
- `punkpeye/awesome-mcp-servers`（97k star）/ `wtsxDev/reverse-engineering` / `JStumpp/awesome-android`
- `e2b-dev/awesome-ai-agents` / `Hannibal046/Awesome-LLM`

## 刷新索引

```bash
AWESOME_GH_TOKEN=ghp_xxx awesome-lite sync          # 有 token：5000 次/时；无 token：60 次/时
AWESOME_LITE_HOME=/some/writable/dir awesome-lite sync   # 数据目录（默认包目录）
```

抓取走 `api.github.com/repos/{owner}/{repo}/readme`（`Accept: application/vnd.github.raw`）——
`raw.githubusercontent.com` 在很多网络环境（含蜂窝网络/企业网）是被墙的，这条不会。

## 已知边界

- 只解析 `- [名](url) - 说明` 与 markdown 表格两种条目写法；内联 HTML 卡片式的清单会漏。
- 分册（如 free-programming-books 的 119 个语言文件）默认只抓 30 个，`--deep` 可调。
- 清单里的项目不保证在你的平台上能用。实测：`any-cli-mcp-server` 在 Android 上把 toybox 命令的
  合体 `--help` 解析成 0 个参数——「清单收了」≠「你机器上能跑」。

## License

MIT。索引内容版权归各清单原作者（awesome 主清单为 CC0-1.0）。
