# Changelog

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
