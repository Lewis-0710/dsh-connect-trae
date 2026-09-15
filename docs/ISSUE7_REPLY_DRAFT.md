# issue #7 回复草稿

> 用途：回复 https://github.com/dingminhua/dsh-connect-trae/issues/7（zyk-mjzs：「traecode 有 glm 5.3 但这边只有 5.2」）。
> 取证细节见 `docs/CN_MODEL_DIRECTORY_EVIDENCE.md`。可直接复制横线以内的内容。

---

你的观察是对的，Trae 的模型目录里确实有 **GLM-5.3**——但这里的问题不在插件漏读，而是**上游「模型目录」与「调用通道」不一致**，我做了完整取证：

## 结论先说

- **目录里有**：`glm-5.3` 在 Trae 的模型目录（remote `/models`）里是**完整的预设模型**，`is_preset`、定价（0.78，会员折扣 50% → 0.39）、reasoning 支持、上下文窗口（200K / Max 1M）等标志**与 `glm-5.2` 完全同级**，还带 `is_new`（新上线）标记。
- **但调不动**：插件使用的 SOLO 通道（`/api/agent/v3/llm_utils_chat`）**无法调用它**。我用插件自身的请求构造做了受控验证：
  - 对照：`glm-5.2` → HTTP 200 + 正常出字（`OK`）
  - `glm-5.3` → HTTP 200，但 SSE 内容为 `error {code:4001, message:"the param is invalid"}`
  - 换 `solo_agent` / `solo_agent_lite` / `inline_chat` 三种 function 再试 → **全部 4001**
- **`get_detail_param` 的 config 集合里也没有它**（`solo_work_lite` 41 条 / `solo_agent` 52 条 / `solo_agent_lite` 35 条，glm 系列只有 5.2 / 5.1 / 5 / 4.7）；定向查询对照：查 `glm-5.2` 能返回、查 `glm-5.3` 返回 0 条。

## 为什么 Trae 里能用、插件里不能

Trae IDE 的对话走的是 **`create_agent_task`（agent task 协议）**，而插件为了保住 DSH 的结构化工具调用，走的是 **SOLO 轻量通道**（`llm_utils_chat`）。这是两套不同的调用面，`glm-5.3` 只在前者的 config 集合里。

所以插件目前把「目录里有、但当前通道调不动」的模型**从可勾选列表里剔除**，是为了避免更糟的体验：能选中、但每次对话都失败。这个判定在之前的版本里就有记录（见 CHANGELOG 1.1.0，当时 `glm-5.3` 与 `Doubao-Seed-Code` 属同类），本次取证确认**至今仍然成立**。

## 可以怎么改进

如果你希望「至少能看到它、并知道为什么不能用」，我可以做一个**低风险的改进**：把这类模型在卡片里列出来但标记为不可勾选（附一句说明：Trae 目录已提供，当前通道暂不支持）。这样就不会再让人以为是插件漏了模型。

要彻底支持它则需要另做 **agent-task 通道**——那是完整另一套协议（body 结构、SSE 事件集、工具调用格式都不同），属于大工程，需要单独立项评估。

请告诉我你更希望哪种：**（A）** 先做「可见但标注不可用」，还是 **（B）** 维持现状？
