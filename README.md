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

一个独立的 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) bundle 插件。它把本机已登录的 Trae 账号通过新版 SOLO 远程会话通道接到 DSH 的模型选择器，并提供**只读**的用量/积分概览（`web_user_ent_usage`、每日签到、奖励活动）。

## 功能特性

- **Trae 模型接入** —— 把本机登录的 Trae 模型注册为 DSH 的 `trae` provider，模型选择器出现 `DeepSeek-V4-Flash`、`DeepSeek-V4-Pro` 等。
- **新版 SOLO 远程会话** —— 走 `solo.trae.cn/api/remote/v1` 通道创建会话并轮询最终回答。
- **只读用量概览** —— 插件设置面板（设置 → 插件配置 → DSH Trae Connect）里展开卡片即可查看总可用额度、各项积分来源（老用户/签到/登录赠送）、每日签到状态与奖励活动规则；只读、不消耗 Trae 积分。
- **安全 loopback shim** —— 随机端口 + 进程内随机 secret，真实 Trae token 不交给 pi-ai。

## 工作原理

```text
DSH PiAiAdapter
  -> 安全 loopback shim
  -> TraeSoloRemoteBridge
  -> TraeSoloRemoteClient
  -> https://solo.trae.cn/api/remote/v1/chat_sessions
  -> 轮询 /chat_sessions/:id/messages
  -> 提取最终回答 -> OpenAI SSE -> DSH
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

## 第三方开源依赖

本项目使用到的直接依赖（npm 包）与架构/协议参考的开源项目，以及它们的许可证与合规说明，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。引入新的外部依赖或复用其他项目代码时，请同步更新该文件并遵守对应许可证要求。

## 许可证

[MIT](LICENSE)
