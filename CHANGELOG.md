# Changelog

## 1.0.0 (2026-08-28)

### Features

- 首个稳定版本：将本机当前登录的 Trae 模型接入 DSH，并通过安全 loopback shim 提供模型调用。
- 提供 DSH Connect Trae 插件卡片，展示当前登录账号的可用额度、已消耗额度和总额度；卡片底部提供「鼓励一下 ★」GitHub 链接。
- 支持 Trae SOLO 远程会话、模型目录、只读用量接口及中英文界面。

### Fixes

- 凭据选择始终优先使用 Trae 客户端当前登录账号；插件自有缓存仅在桌面凭据不可用时回退，避免显示历史账号的积分。

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
