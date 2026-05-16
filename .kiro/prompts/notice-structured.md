# 通知消息结构化迁移检查

本次涉及面向玩家的通知 / 系统消息 / 战斗文案。按 `AGENTS.md` 第 22 节执行。

## 核心原则

**后端只传数据，前端负责文本拼接和渲染。**

## 服务端必须

- 通知消息只发结构化载荷：
  ```ts
  interface StructuredNoticePayload {
    key: string;                              // 语言包模板 key
    vars?: Record<string, string | number>;   // 内插变量
    pills?: string[];                         // 需要胶囊渲染的 vars key
    badges?: string[];                        // 标签 badge 文本
  }
  ```
- **禁止**在服务端硬编码面向玩家的中文句子。
- **禁止**新增纯文本拼接的 `queuePlayerNotice` 调用。
- 战斗、邮件、市场、GM、系统提示等全部走结构化 key。

## 客户端必须

- 模板收入中文语言包（`i18n.generated.ts`），用 `{变量名}` 字符串内插。
- 渲染时按消息类型用胶囊样式：物品名、目标名、等级、数值等关键字段用胶囊（`chat-target-pill` / `chat-skill-pill` / `chat-damage-pill` / `chat-combat-badge`）。
- 非胶囊部分为语言包模板里的普通文本。
- **禁止**用正则解析纯文本来反推结构化信息（旧 fallback 待删除）。

## 检查清单

- 新增 / 修改的通知是否走 `StructuredNoticePayload`，没有再走纯文本字段（如 `text`）？
- 模板 key 是否在 `i18n.generated.ts` 里有对应中文模板？
- `pills` 标记的字段是否在客户端胶囊渲染分支里命中？
- 旧文本链路是否按 `docs/plans/旧文本通知链路删除计划.md` 同步推进，而不是制造新欠账？
- 战斗系统旧 `text` 字段、客户端正则 fallback 是否已经/可以删除？

## 必跑门禁

- `pnpm build:shared`
- `pnpm audit:protocol`
- `pnpm verify:quick`（服务端发包路径）
- `pnpm verify:client`（客户端渲染路径）

## 输出要求

逐条给结论。列出：新增 / 修改的 key、`pills` 列表、对应模板文本、相关协议字段。最后报告门禁结果。
