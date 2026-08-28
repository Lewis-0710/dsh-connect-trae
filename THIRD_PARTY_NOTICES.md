# 第三方开源声明（Third-Party Notices）

> 本文件记录 `dsh-connect-trae` 使用到的其他开源项目及其许可证，确保符合各上游项目的开源许可要求（署名保留、许可文本随分发携带等）。若你对本文件的完整性有疑问或发现遗漏，请提交 issue 或 PR。

## 1. 直接依赖（npm 运行时与构建依赖）

`dsh-connect-trae` 本身以 **MIT** 许可证发布（见 [LICENSE](LICENSE)）。以下直接依赖的许可证均为宽松许可，与 MIT 兼容，允许本项目以 MIT 再分发；依赖的版权声明属于各上游作者。

| 包 | 用途 | 许可证 |
| --- | --- | --- |
| [`@deepseek-ai/cordis`](https://github.com/deepseek-ai/cordis) | 宿主插件框架 | MIT |
| `@deepseek-ai/dsh-atomic-write` | DSH 原子写入 | MIT |
| `@deepseek-ai/dsh-attachment` | DSH 附件服务 | MIT |
| `@deepseek-ai/dsh-home-paths` | DSH 路径解析 | MIT |
| `@deepseek-ai/dsh-host-webserver` | DSH 宿主 Web 服务 | MIT |
| `@deepseek-ai/dsh-llm` | DSH 模型路由 / adapter 注册 | MIT |
| `@deepseek-ai/dsh-llm-pi-ai` | DSH pi-ai 适配 | MIT |
| `@deepseek-ai/dsh-settings` | 插件设置面板 | MIT |
| `@deepseek-ai/dsh-client-ui-primitives` | 客户端 UI 原语 | MIT |
| `@deepseek-ai/schemastery` | 配置 Schema 校验 | MIT |
| `@earendil-works/pi-ai` | 模型 Provider 适配层 | MIT |
| [`react`](https://github.com/facebook/react) | 客户端 UI 运行时 | MIT |
| `@types/react` | React 类型 | MIT |
| `@types/node` | Node 类型 | MIT |
| `tsdown` | 构建工具 | MIT |
| `vitest` | 测试框架 | MIT |
| `typescript` | 编译/类型检查 | Apache-2.0 |

> 注：以上许可证信息来自各包安装时 `package.json` 的 `license` 字段（及包内 `LICENSE` 文件），版本以本项目 `package.json` 中锁定的版本为准。若上游后续变更许可，以各上游仓库为准。

## 2. 架构 / 协议参考的开源项目

本项目在设计与实现过程中参考了以下开源项目，主要用于**架构模式与上游协议研究**。参考方式为"借鉴设计思路 + 独立实现"，未整体复制其源码（关键模块均为本项目独立编写，并在源码注释中标注了所参考的既有模式）。这些项目的版权属于其各自的作者，本项目代码不构成对它们的再分发。

| 参考项目 | 仓库 | 参考内容 | 许可证 |
| --- | --- | --- | --- |
| `dsh-workbuddy-connect` | <https://github.com/corrinehu/dsh-workbuddy-connect> | loopback shim 安全骨架、web-status 只读路由模式、浏览器插件入口模式（见 `src/shim.ts`、`src/web-status.ts`、`src/status-paths.ts`、`src/client/index.tsx` 注释） | MIT |
| `dsh-trae-api` | <https://github.com/Wang-JQ77/dsh-trae-api> | Trae 上游协议（认证、会话、模型目录）的参考与失败样本分析（见 `docs/ANALYSIS.md`、`docs/ANALYSIS_CONCLUSION.md`、`docs/SOLO_ROUTE_DECISION.md`） | MIT |
| `dsh-subagent-default-model` | <https://github.com/dingminhua/dsh-subagent-default-model> | 对外展示 / npm 发布工程的组织基准（README、CHANGELOG、发布流程，见 `DEVELOPMENT.md`、`RELEASING.md`） | MIT |

> 注：`docs/SOLO_ROUTE_DECISION.md` 另提及 `laojichao/trae-local-api`（`dsh-trae-api` 的直接上游），仅作为协议调研线索记录，本项目未直接使用其代码。

## 3. 合规说明

- 本项目的直接依赖与参考项目均使用 **MIT** 或 **Apache-2.0** 宽松许可，与项目自身的 MIT 许可证兼容。
- MIT / Apache-2.0 许可要求保留上游版权声明。各依赖的完整许可证文本随其 npm 包分发（各包内 `LICENSE` 文件），本项目已在依赖清单中标注来源。
- 本项目**不重新打包或再分发**参考项目的源码，仅参考其架构思路；`docs/` 中的分析文档亦为独立撰写。
- 若后续引入新的外部依赖或复用其他项目的代码，必须在引入时同步更新本文件，并遵守对应许可证的署名与声明要求。
