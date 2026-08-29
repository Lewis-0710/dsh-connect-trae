# dsh-connect-trae 开发交接

## 当前状态

核心技术链路已经走通，并已完成本地实现：

```text
DSH PiAiAdapter
  -> 安全loopback shim
  -> TraeSoloRemoteBridge
  -> TraeSoloRemoteClient
  -> https://solo.trae.cn/api/remote/v1/chat_sessions
  -> 轮询 /chat_sessions/:id/messages
  -> 提取最终回答
  -> 转换为OpenAI SSE
  -> DSH
```

真实DeepSeek Flash验证已经成功：

```text
模型：DeepSeek-V4-Flash
请求：Reply with exactly: OK
响应：OK
```

测试使用当前本机 `TRAE SOLO CN 0.1.56` 的有效JWT，未使用旧版 `mchost.guru/llm_utils_chat` 通道。

## 关键路线变化

### 已放弃作为第一路线

- Raw Chat v2：`/api/ide/v2/llm_raw_chat`，实测HTTP 400空响应。
- 旧版SOLO：`mchost.guru/api/agent/v3/llm_utils_chat + solo_work_lite`，当前0.1.56实测HTTP 404。
- 旧版模型发现：`/api/ide/v1/get_detail_param`，当前版本实测HTTP 404。

### 当前可用路线

来自 `Oh-My-Trae/trae-solo-unlock` 的当前SOLO Web远程API：

```text
https://solo.trae.cn/api/remote/v1
```

调用流程：

1. `POST /chat_sessions` 创建会话并发送首条消息。
2. `GET /chat_sessions/:id/messages?page_size=50` 轮询结果。
3. 从assistant message中提取：
   - 任务树：`plan_item.tool_call_info.name === "finish"` → `params.summary`
   - 简单数组：`type === "text"` → `text_content`或`data.content`
4. 转换为OpenAI SSE，输出文本chunk、finish chunk和`[DONE]`。

## 已实现模块

### DSH与安全层

- `src/index.ts`：注册`trae` Provider，当前已接入`TraeSoloRemoteBridge`。
- `src/adapter.ts`：PiAiAdapter。
- `src/shim.ts`：随机loopback端口、进程内secret、Host/Origin/Content-Type校验、请求取消。
- `src/catalog.ts`：模型目录。

### 认证与身份

- `src/paths.ts`：macOS/Windows/Linux的四edition路径。
- `src/decrypt.ts`：tc/明文检测、AES-CBC、SHA-512完整性校验。
- `src/auth.ts`：只读桌面凭据、DSH 0600副本、单飞刷新。
- `src/refresh.ts`：CN/solo刷新。
- `src/identity.ts`：machine/device/version/OS身份。

### 协议

- `src/solo-remote.ts`：当前成功的新版SOLO远程会话客户端。
- `src/solo-remote-bridge.ts`：轮询结果转OpenAI SSE，接入shim。
- `src/solo.ts`：旧版`llm_utils_chat + solo_work_lite`实现，保留作兼容研究，不作为当前主路径。
- `src/raw-chat.ts` / `src/raw-upstream.ts`：Raw Chat研究实现，当前不启用。
- `src/sse.ts`：通用SSE解析。
- `src/reasoning.ts`：思考强度能力模型。
- `src/model-config.ts`：历史模型日志解析。

## 本地模型目录

当前Provider注册以下经过参考项目和本机日志交叉确认的模型：

- `DeepSeek-V4-Flash`
- `DeepSeek-V4-Pro`
- `Doubao_1_6`
- `kimi-k2.6`
- `qwen-3.6-plus`
- `glm-5.1`
- `minimax-m2.7`

当前低成本默认验证模型为：

```text
DeepSeek-V4-Flash
```

本机SOLO UI内部的新版配置名是：

```text
DeepSeek-V4-Flash-Official
```

远程Web API成功使用的是：

```text
DeepSeek-V4-Flash
```

两个ID应保持本地映射，不要混为同一个上游接口ID。

## 思考强度

Trae框架确认支持：

```text
minimal
low
medium
high
xhigh
```

相关字段：

```text
reasoning_effort_options
default_reasoning_effort
reasoning_effort
```

当前UI日志确认DeepSeek Flash存在`reasoning_effort_selector`，说明功能入口存在；但尚未取得各档位实际列表。实现策略：

- 只有模型元数据明确公布某档位时才向DSH暴露；
- 未取得档位时只记录`reasoningSupported: true`，不虚构选项；
- 当前新版远程API请求体还没有接入reasoning effort字段。

## 验证状态

最近一次完整验证：

```text
pnpm run check
```

结果：

- TypeScript通过
- 18个测试文件
- 54个测试全部通过
- tsdown构建通过

真实验证：

- `solo.trae.cn/api/remote/v1/chat_sessions`：HTTP 200，`code=0`
- 消息轮询：assistant message completed
- DeepSeek-V4-Flash最终回答：`OK`

## Git状态

已有提交：

```text
cb3788d feat: 建立 Trae 接入安全骨架与协议研究基线
f389acc feat: 完善 Trae Raw Chat 探测与能力模型
```

当前新版SOLO远程实现、桥接、测试和文档尚未再次提交。提交前必须重新运行`pnpm run check`与秘密扫描。

## DSH Desktop接入状态

尚未完成真实DSH Desktop端到端安装验证。

已确认：

- DSH Desktop位于`/Applications/DSH Desktop.app`（当前 v2.0.3 运行中）。
- desktop profile位于`~/.dsh/profiles/desktop`。
- profile使用本地`link:`插件的既有模式（如`dsh-sub-cli`、`dsh-subagent-default-model`）。
- `dsh`命令当前不在会话PATH。
- 已定位内部CLI入口：DSH Desktop打包的`@deepseek-ai/dsh`包，bin为`lib/bin.js`。
  可通过应用自带Node直接运行：
  `node "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js" plugin --profile desktop add <path>`
  `plugin`子命令转发到profile目录的pnpm（应用自带 pnpm 11.8.0）。帮助示例确认：
  `dsh plugin --profile tui add <package>`。
- 已确认本项目根级`package.json`布局（`lib/`+`cordis.patch.yml`）与已安装的
  `dsh-workbuddy-connect`（npm 0.2.3）一致，可被DSH安装加载。
- 当前插件已加入desktop profile（`dsh plugin --profile desktop add <repo>`，2026-08-28）。
  - `~/.dsh/profiles/desktop/package.json`：`dependencies["dsh-connect-trae"] = "link:/Users/dmh2002/DshProject/dsh-connect-trae"`。
  - `dsh.profile.bundles` 已自动包含 `dsh-connect-trae`（bundle reconcile 已纳入 `cordis.patch.yml` 的 `dsh-connect-trae` 行）。
  - `node_modules/dsh-connect-trae` 为软链接指向项目根。
  - 安装采用正式 CLI，未直接手改 package.json。
  - 尚未重启 DSH Desktop，未做真实 E2E 对话。

不要直接手改`~/.dsh/profiles/desktop/package.json`，应先定位DSH Desktop实际CLI入口，使用正式：

```text
dsh plugin --profile desktop add /Users/dmh2002/DshProject/dsh-connect-trae
```

或等价受控命令，让DSH自动完成bundle reconcile。安装后需要重启DSH Desktop，再验证Provider模型目录和真实对话。

## 下一步

已完成的步骤：

- ① 定位DSH Desktop内部CLI入口（见上文"DSH Desktop接入状态"）。
- ⑦ 运行完整检查与秘密扫描：`pnpm run check`通过（18测试文件、54测试、构建成功）；仓库无真实JWT/token/env泄漏。
- ⑧ 提交新版SOLO远程实现（commit `4ca5b4d`）。

待用户确认的步骤（涉及运行中DSH Desktop、desktop profile修改与Trae额度消耗）：

- ② 以`link:`方式安装当前项目到desktop profile —— **已完成**（正式CLI安装，未重启、未对话）。
- ③ 重启DSH Desktop（会中断当前运行中的应用）。
- ④ 确认模型选择器出现Trae模型。
- ⑤ 通过DSH选择`trae / DeepSeek-V4-Flash`完成短对话（消耗Trae额度）。
- ⑥ 验证请求取消、认证过期和错误显示。

## 已知限制

- 新版SOLO是云端Agent会话，不等价于纯模型Raw Chat；当前桥接只提取最终回答。
- 远程会话在字节云端沙箱运行，不能直接访问用户本地文件系统；DSH本地工具仍由DSH执行。
- 当前桥接是轮询后一次性输出OpenAI SSE文本chunk，不是真正逐token流。
- 结构化工具调用在新版remote会话中尚未映射回DSH工具系统。
- 思考强度具体档位尚未从新版远程模型元数据中恢复。
- 不得宣传完整工具调用或完整流式能力，直到真实DSH E2E验证完成。

## 用量管理调查（2026-08-28）

详见 `docs/USAGE_API_RESEARCH.md`。要点：

- 用 `Cloud-IDE-JWT` 凭据可直接调 `api.trae.cn` 的 `pay/ug` 接口，只读、不消耗积分。
- **已拿到**：总可用额度（`total 7500 - consumed 5879.63 = 可用 1620.37`，与 Solo「用量管理」截图精确一致）、各项积分来源（老用户/签到/登录赠送/免费）、计费状态、活动规则、签到状态。
- **未拿到**：每笔消费明细表（`query_user_usage_group_by_session` 返回 200 但 `total:0`，且带 `usage_type` 返回 400）。判断明细属另一产品端/需网页登录态，不继续无依据试错。
- 已把拿得到的额度/积分/签到/活动封装为 `src/usage.ts` 的 `TraeUsageClient`（只读），`pnpm run check` 通过并真实验证（总可用 1620.37）。
- 已新增插件设置卡片展示 Trae 用量（**样式对齐 `dsh-subagent-default-model`**：带 LD 品牌图标、`dsm-plugin-card` 卡片外壳、同款按钮与 `--dsw-alias-*` 调色板）：
  - Host：`src/web-status.ts` 的 webServer 只读路由 `/plugins/dsh-connect-trae/usage`
  - Client：`src/client/` 折叠卡片（settings.plugin.item，key=trae），构建产出 `lib/client.js`
  - 插件的两个对外展示面 = ①插件设置卡片（用量）+ ②模型选择器（trae provider）
- 对外形象已对齐：README 双语、CHANGELOG、RELEASING、LICENSE、CI、package.json 元数据。

> ⚠️ 卡片是新增的 client 端，已安装到 desktop profile 的 link 版本需要**重启 DSH Desktop** 才能在「插件配置」里看到「DSH Connect Trae」卡片并展示用量。

## 文档索引

- `DEVELOPMENT.md`
- `docs/ANALYSIS.md`
- `docs/ANALYSIS_CONCLUSION.md`
- `docs/PROTOCOL_EVIDENCE.md`
- `docs/ARCHITECTURE_DECISION.md`
- `docs/SOLO_ROUTE_DECISION.md`
- `docs/RAW_CHAT_PROGRESS.md`
- `docs/USAGE_API_RESEARCH.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PUBLIC_RELEASE_GUIDE.md`
