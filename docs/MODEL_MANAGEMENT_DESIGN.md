# Trae 模型管理与专属能力设计

## 目标

在 DSH 的「设置 → 模型 → Trae → 编辑」中提供符合 DSH 原生体验的模型管理能力：

1. 刷新 Trae 当前可用模型；
2. 从候选模型中选择并保存；
3. 手动增加、编辑和删除模型；
4. 展示模型上下文窗口和最大输出；
5. 逐模型展示可选推理强度；
6. 在取得真实上游数据后展示积分消耗倍率和 1M 上下文能力。

## 插件边界（强约束）

- 本项目只是独立插件，**不得修改 DSH 本体**。
- 不替换、不接管 DSH 全局「模型」设置页或全局模型选择器。
- 不修改其他 provider 的注册、配置或界面体验。
- DSH 自动生成的「模型 → Trae」条目和兜底提示保持原样。
- 所有可编辑的 Trae 专属能力只放在 `dsh-connect-trae` 自己的「插件配置」卡片中。
- 插件只通过公开的 settings、LLM adapter、model discovery 和 provider catalog 接口影响自己的 `trae` provider。

## 设计原则

- 优先复用 DSH 公开的 settings 和 `llm.discoverModels` 能力，不接管或替换任何全局 UI。
- 模型列表属于 Trae provider 配置；保存后同步刷新 provider catalog。
- 思考强度只在 Trae 模型元数据明确公布时开放，不虚构档位。
- 积分倍率与 1M 上下文只展示已验证的上游数据；未取得真实字段时显示“待上游确认”或暂不展示。
- 不把 access token、refresh token、邮箱、手机号或稳定用户 ID 传到浏览器。

## 首版效果

```text
Trae
├─ 当前登录账号 / token 过期时间
├─ 模型列表                         [恢复默认] [刷新模型]
│  ├─ DeepSeek-V4-Flash
│  │  └─ ID / 名称 / 168K / 32K / 输入模态
│  ├─ DeepSeek-V4-Pro
│  └─ ...
├─ [+ 手动添加模型]
└─ [取消] [保存]
```

刷新模型时，调用 Trae 模型目录接口，将结果作为候选项交给用户勾选；刷新本身不直接覆盖已保存列表。

## 已验证的 Trae 模型元数据来源

当前真实接口：

```text
GET https://solo.trae.cn/api/remote/v1/models?functions=solo_agent_remote,solo_work_remote
```

只使用 `solo_agent_remote` 组，并按模型 wire name 去重。已验证字段映射：

| Trae 字段 | 用途 |
| --- | --- |
| `context_window_tokens.dev` | 普通模型上下文 |
| `context_window_tokens.max` + `max_mode:true` | 是否可生成 1M 变体 |
| `features` 二次 JSON 解析后的 `consumption_rate.data.rate` | 积分消耗倍率 |
| `reasoning_effort_config.options` | 推理强度档位 |
| `reasoning_effort_config.default_level` | 默认推理强度 |
| `multimodal` | 文本/图片输入能力 |

PiAiAdapter 的内部档位映射仅用于适配层，发往 Trae 时还原其原始值：

```text
Trae light      <-> PiAi low
Trae high       <-> PiAi high
Trae extra_high <-> PiAi xhigh
```

UI 显示为“轻 / 高 / 极高”。未返回 `reasoning_effort_config` 的模型只记录“支持推理”，不虚构档位。

## 后续模型详情

```text
Qwen3.8-Max
├─ 积分消耗速度：1.50 倍（只读）
├─ 支持的思考强度：轻 / 高 / 极高
├─ 默认思考强度：高
└─ 更大上下文（Max）：支持 / 不支持
   └─ 开启后上下文窗口 1M；更多积分消耗
```

## 实施阶段

### 阶段 1：原生模型管理

- Trae 设置 Schema 暴露 `models` 数组；
- 注册 `llm` 模型发现回调；
- 使用当前登录 Trae 账号读取模型候选；
- 保存配置后更新运行时 catalog；
- 保留保守的内置模型作为默认列表。

### 阶段 2：能力元数据

- 从 Trae 模型详情恢复：`reasoning_effort_options`、`default_reasoning_effort`；
- 映射为 DSH 原生 reasoning metadata；
- 在 DSH 模型选择器中自动显示推理强度。

### 阶段 3：Trae 专属能力

- 恢复并验证积分消耗倍率字段；
- 恢复并验证 1M 上下文支持字段及请求参数；
- 仅对支持的模型展示 1M 开关；
- 验证推理强度和 1M 设置真实进入上游请求。

## 验收标准

- Trae 的模型编辑卡片可刷新、增加、编辑、删除并保存模型；
- 刷新失败不破坏现有模型列表；
- 模型列表变化后 DSH provider catalog 同步更新；
- 不影响其他 provider 的模型设置体验；
- 未验证的倍率、推理强度和 1M 能力不得伪造。
