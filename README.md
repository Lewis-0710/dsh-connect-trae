<p align="center">
  <b>dsh-connect-trae</b>
</p>

<h1 align="center">dsh-connect-trae</h1>

<p align="center"><b>把本机登录的 Trae 模型接入 DeepSeek Harness，并提供只读的用量/积分概览。</b></p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="#安装">安装</a> ·
  <a href="#工作原理">工作原理</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="https://github.com/dingminhua/dsh-connect-trae/issues">问题反馈</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-connect-trae"><img src="https://img.shields.io/npm/v/dsh-connect-trae?style=flat-square&label=npm&color=cb3837" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/dingminhua/dsh-connect-trae?style=flat-square" alt="MIT license"></a>
</p>

一个独立的 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) bundle 插件。它把本机已登录的 Trae 中国区账号接到 DSH 的模型选择器：模型负责生成结构化工具调用，`bash` / `read` / `write` / `edit` 等工具由 DSH 本地执行；同时提供**只读**的 Work/通用积分与模型管理界面。

## 效果预览

<p align="center">
  <img src="docs/assets/dsh-connect-trae-usage-card.png" alt="DSH Connect Trae 插件卡片：Trae 账号、Work 与通用积分以及模型管理" width="900">
</p>

<p align="center"><sub>设置 → 插件配置 → DSH Connect Trae：切换本机 Trae 账号、查看 Work/通用积分，并管理 DSH 中启用的 Trae 模型。</sub></p>

## 功能特性

- **Trae 模型接入** —— 把本机登录的 Trae 模型注册为 DSH 的 `trae` provider，模型选择器出现 `DeepSeek-V4-Flash`、`DeepSeek-V4-Pro` 等。
- **DSH 本地工具循环** —— 通过 Trae `llm_utils_chat` 获取待执行的结构化 `tool_calls`，交由 DSH 自带的本地工具执行，再将工具结果回传模型。
- **中国区多账号切换** —— 自动发现 Trae CN 与 TRAE SOLO CN 本地登录账号，支持重新读取 Token 列表并选择账号；Token 不写入 DSH 设置。
- **只读积分与模型管理** —— 插件设置面板可分别查看 Work 积分与 DSH 可使用的通用积分，并刷新/启用 Trae 模型；只读查询不消耗积分。
- **安全 loopback shim** —— 随机端口 + 进程内随机 secret，真实 Trae token 不交给 pi-ai。

## 工作原理

```text
DSH PiAiAdapter
  -> 安全 loopback shim
  -> TraeSoloBridge
  -> https://trae-api-cn.mchost.guru/api/agent/v3/llm_utils_chat
  -> Trae SSE / pending function_call
  -> OpenAI SSE tool_calls
  -> DSH 本地执行工具并回传结果
```

用量概览走 `https://api.trae.cn/trae/api/v2/pay/*` 与 `/trae/api/v2/ug/*` 只读接口。

> 详见 `docs/IMPLEMENTATION_PLAN.md`、`docs/SOLO_ROUTE_DECISION.md`、`docs/USAGE_API_RESEARCH.md`。

## 安装

推荐使用 DSH 插件命令安装 npm 已发布版本：

```sh
dsh plugin --profile desktop add dsh-connect-trae
```

或直接通过 npm 安装：

```sh
npm install dsh-connect-trae
```

安装、更新或卸载 bundle 后，需要重启对应的 DSH 进程。

## 开发

```sh
pnpm install
pnpm run check   # typecheck + test + build
```

本地开发用 `link:` 安装到 desktop profile（改码后重启 DSH Desktop 生效）：

```sh
dsh plugin --profile desktop add /Users/dmh2002/DshProject/dsh-connect-trae
```

## 致谢

- [Wang-JQ77/dsh-trae-api](https://github.com/Wang-JQ77/dsh-trae-api)（MIT）— Trae 认证、会话和模型协议研究的参照实现。

## 第三方开源依赖

本项目参考的与 Trae 接入直接相关的开源项目，以及它们的许可证与合规说明，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。引入新的 Trae 相关外部依赖或复用其他项目代码时，请同步更新该文件并遵守对应许可证要求。

## 许可证

本项目采用 [MIT](LICENSE) 许可证，版权归属：**Copyright (c) 2026 LaoDing**。
