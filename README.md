<p align="center">
  <img src="docs/assets/dsh-connect-trae-usage-card.png" width="860" alt="dsh-connect-trae settings panel" />
</p>

<h1 align="center">dsh-connect-trae</h1>

<p align="center"><b>把本机登录的 Trae 模型接入 DeepSeek Harness，并提供只读的用量/积分概览。</b></p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="#安装">安装</a> ·
  <a href="#工作原理">工作原理</a> ·
  <a href="#模型覆盖范围哪些-trae-模型能用">模型覆盖范围</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="https://github.com/dingminhua/dsh-connect-trae/issues">问题反馈</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-connect-trae"><img src="https://img.shields.io/npm/v/dsh-connect-trae?style=flat-square&label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-connect-trae"><img src="https://img.shields.io/npm/d18m/dsh-connect-trae?style=flat-square&label=downloads&color=cb3837" alt="npm downloads"></a>
  <a href="https://github.com/dingminhua/dsh-connect-trae/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/dingminhua/dsh-connect-trae/ci.yml?branch=main&style=flat-square&label=tests" alt="test status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/dingminhua/dsh-connect-trae?style=flat-square" alt="MIT license"></a>
  <a href="https://github.com/dingminhua/dsh-connect-trae/stargazers"><img src="https://img.shields.io/github/stars/dingminhua/dsh-connect-trae?style=flat-square" alt="GitHub stars"></a>
  <a href="https://dshfind.com/plugins/dingminhua/dsh-connect-trae"><img src="https://dshfind.com/api/badge/dingminhua/dsh-connect-trae" alt="dshfind plugin"></a>
</p>

一个独立的 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) bundle 插件。它把本机已登录的 Trae 账号（**国内版与国际版均支持**）接到 DSH 的模型选择器：模型负责生成结构化工具调用，`bash` / `read` / `write` / `edit` 等工具由 DSH 本地执行；同时提供**只读**的用量概览（国内版 Work/通用积分、国际版订阅状态）与模型管理界面。**国内版与国际版是两个并行的供应商（`trae` / `trae-global`），可同时使用**；插件设置卡片以 tab 区分两者，方便统一管理。

## 功能特性

- **双供应商并行接入** —— 国内版注册为 DSH 的 `trae` provider（`DeepSeek-V4-Flash`、`DeepSeek-V4-Pro` 等），国际版注册为 `trae-global`（Gemini / GPT / MiniMax 阵容），**两边模型同时出现在 DSH 模型选择器里**：不同会话可以各选一边，互不干扰。
- **插件卡片 tab 切换** —— 设置卡片顶部为「国内版 / 国际版」两个 tab，各含独立的账号选择、用量概览与模型管理；每个 tab 的账号、目录、勾选与未保存草稿完全隔离——在一个 tab 里切账号或刷新模型，不会触碰另一边的运行时目录与会话。
- **倍率内嵌模型名** —— 模型名称按 Trae 自身菜单的格式显示积分倍率（如 `GLM-5.2 · x0.79`），倍率随目录刷新更新。
- **DSH 本地工具循环** —— 通过 Trae `llm_utils_chat` 获取待执行的结构化 `tool_calls`，交由 DSH 自带的本地工具执行，再将工具结果回传模型。
- **国内国际双区域自动识别** —— 自动发现 Trae CN / TRAE SOLO CN / Trae / TRAE SOLO 四个本地安装的登录账号；区域由凭证自带的 `userRegion` 声明自动判定（host 后缀与 edition 标签兜底），无需手动指定。
- **目录与勾选按区域隔离** —— 国内版与国际版各一套模型目录、勾选、图片开关与上下文预算，两个供应商各自读各自的槽位。
- **多账号切换** —— 支持重新读取 Token 列表并选择账号；Token 不写入 DSH 设置。
- **只读用量与模型管理** —— 国内版查看 Work 积分与通用积分，国际版查看订阅/试用状态；刷新/启用 Trae 模型；只读查询不消耗额度。
- **安全 loopback shim** —— 每区域一个随机端口 + 进程内随机 secret，真实 Trae token 不交给 pi-ai。

## 工作原理

```text
DSH PiAiAdapter（每个 provider 一套）
  -> 安全 loopback shim（每区域一个随机端口 + 进程内随机 secret）
  -> TraeSoloBridge
  -> 国内版 https://trae-api-cn.mchost.guru/api/agent/v3/llm_utils_chat
  -> 国际版 https://coresg-normal.trae.ai/api/agent/v3/llm_utils_chat
  -> Trae SSE / pending function_call
  -> OpenAI SSE tool_calls
  -> DSH 本地执行工具并回传结果
```

国内版与国际版各持一套完整的运行时栈——凭据 store、模型 catalog、wire 映射、上游客户端、回环 shim、adapter——按凭证自带的区域声明隔离可见账号，所以**两个区域的账号可以同时在线、同时被不同会话使用**。

用量概览走 `https://api.trae.cn/trae/api/v2/pay/*` 与 `/trae/api/v2/ug/*` 只读接口（国际账号走其自有网关的订阅状态端点）。刷新得到的 token 按区域存放在 `$DSH_HOME/.trae-auth.cn.json` 与 `$DSH_HOME/.trae-auth.ai.json`（两个账号同时在线互不覆盖；旧的单文件 `.trae-auth.json` 作为迁移来源保留读取）。

> 详见 `docs/IMPLEMENTATION_PLAN.md`、`docs/SOLO_ROUTE_DECISION.md`、`docs/USAGE_API_RESEARCH.md`。

## 模型覆盖范围（哪些 Trae 模型能用）

Trae IDE 的模型菜单里会出现一些插件**无法提供**的模型。这不是还没做，而是上游没有对第三方开放可复用的模型出口——已经逐条实测并记录在 [`docs/TRAECLI_FEASIBILITY.md`](docs/TRAECLI_FEASIBILITY.md)、[`docs/DS41_CALLABILITY.md`](docs/DS41_CALLABILITY.md) 与 [`docs/CODEC_CHANNEL_FEASIBILITY.md`](docs/CODEC_CHANNEL_FEASIBILITY.md)。

**可用**：SOLO 通道的全部模型（`DeepSeek-V4-Flash-Official`、`DeepSeek-V4-Pro-Official`、`GLM-5.3`、`GLM-5.2`、`Kimi-K3`、`MiniMax-M3`、`Qwen3.8-Max`、`Doubao-Seed-*` 等），国内版与国际版均走这条通道，且**已实测支持结构化工具调用**（DSH 本地执行工具的前提）。

**不可用**：以下 4 个模型只存在于 **Trae IDE 客户端内部**，插件与任何第三方 API 消费者都拿不到，已从模型目录中排除：

| 模型 | 说明 |
| --- | --- |
| `deepseek-v4.1-flash` | 仅出现在 Trae IDE 的模型菜单 |
| `glm-5.3-flash` | 同上 |
| `kimi-k2.8-preview` | 同上 |
| `qwen3.8-flash` | 同上 |

> 注意区分：**`GLM-5.3` 可用**（SOLO 通道 `solo_work_remote`，已实测工具调用），但 **`glm-5.3-flash` 不可用**——两者是不同的模型。

### 为什么拿不到

四条路径都已逐一实测，**各自因不同原因失败**（协议 / 配额 / 同机 / 登录态）：

| 路径 | 实测结果 |
| --- | --- |
| `create_agent_task` | 绑定层已解开（HTTP 200 + SSE），业务层返回 `4001 config item is empty`——需要 IDE 客户端注册的 config |
| `/api/ide/v1/agents/runs` | 端点存在、鉴权通过，返回账号级 `5003 agent running quota limit is exceeded` |
| 本地 Hub Bridge / Aha IPC | 存在，但为私有协议，且要求 IDE 同机常驻 |
| TraeCLI（`trae-cli`） | 公网版需要交互式 SSO 登录；且它**本身就是 agent**，模型出口是私有后端（`/trae-cli/api/v1/llm/proxy` + 私有头），不是可复用的 LLM 代理 |

前三条属于「没有对第三方开放」；第四条尤其要注意——**用 TraeCLI 就等于让 TraeCLI 干活、DSH 退化成壳**，与「DSH 是 agent、模型只负责生成工具调用」的插件定位相冲突，因此插件不会走这条路，也不建议用户为此安装 TraeCLI。

### 想用这 4 个模型怎么办

**直接用 Trae IDE 本体**。插件不提供、也无法提供它们；这属于上游授权边界，不是本插件可以绕过的技术问题。

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

## Windows 说明

- **账号数据目录**：插件读取 `%APPDATA%\Trae CN` / `%APPDATA%\TRAE SOLO CN` 下的 `User\globalStorage\storage.json`（与安装目录无关）。目录名与 macOS 一致，无需额外配置；若目录名对不上，可用插件配置项 `authFile` + `edition` 直接指定完整路径。
- **应用版本头**：插件从安装目录 `<LOCALAPPDATA>\Programs\<AppName>\resources\app\product.json` 读取 `appVersion`，随请求发送 `x-app-version` / `x-ide-version`；读不到时这些头不发送（与旧版行为一致）。
- **Raw Chat 探测（已知限制）**：`model-cache` 依赖 `sqlite3` 命令行，Windows 默认未安装，Raw Chat 能力探测会失败并安全回退。Raw Chat 默认关闭，不影响主流程。
- 排查指引见 `docs/WINDOWS_TOKEN_PROBE.md`。

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
