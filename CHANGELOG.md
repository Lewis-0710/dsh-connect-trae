# Changelog

## 1.0.0 (2026-08-30)

### Features

- 首个稳定版本：将本机当前登录的 Trae 中国区模型接入 DSH，并通过安全 loopback shim 提供模型调用。
- 接入 `llm_utils_chat` 原生函数调用通道，将 Trae `function_call` 转换为 DSH 可执行的 OpenAI `tool_calls`，支持工具结果回传与连续 Agent 循环。
- 自动发现 Trae CN / TRAE SOLO CN 本地登录账号，支持刷新 Token 列表、选择账号，并优先使用具有通用积分的账号。
- 提供 DSH Connect Trae 插件卡片，分别展示 Work 积分与 DSH 可使用的通用积分，并支持模型目录刷新和启用选择。
- 支持 DeepSeek-V4-Flash 等 Trae 模型、只读用量接口及中英文界面。

### Fixes

- 凭据选择优先使用可供 `llm_utils_chat` 计费的通用积分账号；单个损坏、过期或已退出的本地凭据不会阻断其他账号。
- 规范化 DSH 的 `developer` 消息角色为 Trae 接受的 `system`，避免模型请求持续 400 重试。
- 正确处理 Trae 流式错误事件，配额错误不再被误报为 `EMPTY_RESPONSE`。

### Docs

- 发布元数据、双语 README、发布流程、第三方 Trae 相关项目声明与 npm 打包白名单均已补齐。
- 项目以 MIT 许可证发布，版权归属明确为 `Copyright (c) 2026 LaoDing`。

## 0.1.0-dev.1 (2026-08-28)

### Features

- **新版 SOLO 远程会话通道**：`TraeSoloRemoteClient` + `TraeSoloRemoteBridge`，把 `solo.trae.cn/api/remote/v1/chat_sessions` 的轮询结果转换为 OpenAI SSE，接入安全 loopback shim，成为第一可用上游路线。
- **本地模型目录**：`DeepSeek-V4-Flash` / `DeepSeek-V4-Pro` / `Doubao_1_6` / `kimi-k2.6` / `qwen-3.6-plus` / `glm-5.1` / `minimax-m2.7`。
- **只读用量概览**：`TraeUsageClient` 查询总可用额度、积分来源、每日签到与奖励活动（`web_user_ent_usage` / `checkin_credits/status` / `activity/info`），只读、不消耗积分。
- **插件设置卡片**（对齐 `dsh-subagent-default-model` 外部形象）：在 `settings.plugin.item` 注册折叠卡片（key `trae`），带 LD 品牌图标与 `dsm-plugin-card` 卡片外壳，展开后展示总可用/已消耗、各项积分进度条、每日签到与奖励活动；Host 侧通过 `webServer` 只读路由 `/plugins/dsh-connect-trae/usage` 提供脱敏数据。
- **SSE 扩展**：解析 `token_usage` 与 `tool_calls` 事件。
- **安全骨架**：随机 loopback 端口、进程内随机 secret、Host/Origin/Content-Type 校验、请求取消、body 上限。

### Docs

- 新增 `docs/SOLO_ROUTE_DECISION.md`、`docs/USAGE_API_RESEARCH.md`、`docs/HANDOFF.md`。
- README 中英双语双文件，对齐插件外部形象标准。
- 新增 `THIRD_PARTY_NOTICES.md` 第三方开源声明：只记录与 Trae 接入直接相关的架构/协议参考项目及其许可证与合规说明；README 增加对应章节，发布包 `files` 白名单纳入该文件。
