# 玩家落点 `instanceId` 真源收口说明

## 本轮收口范围

- 仅收口玩家正式落点在 当前主链上的真源入口。
- 只修改了玩家快照持久化、快照恢复、会话接入和 bootstrap 玩家态对齐。
- 不改 portal 语义、不新增私有实例体系、不改地图实例生命周期。

## 当前口径

- 玩家快照仍保留 `placement.templateId`，因为地图模板仍是跨系统兼容键。
- 但正式落点入口已开始收口到 `placement.instanceId` / `server_next_player_snapshot.instance_id`。
- 新快照写入时：
  - 若运行时已有 `instanceId`，直接落库。
  - 若旧链路只给了 `templateId`，兼容回填 `public:${templateId}`。
- 旧快照恢复时：
  - 若 payload / 表列里已有 `instanceId`，优先使用它。
  - 若缺失，则按 `public:${templateId}` 回填，保证旧数据仍能恢复。

## 会话接入口径

- `world-session-bootstrap` 现在会把玩家快照里的 `instanceId` 显式传给 runtime attach。
- `world-runtime-player-session` 的接入顺序现在是：
  1. 先按 `instanceId` 命中现有实例。
  2. 若未命中，但 `instanceId` 可映射到公共实例，则按该公共实例恢复。
  3. 仍无法恢复时，再退回 `mapId/templateId`。

这意味着当前主线已经不再把 `templateId` 当成唯一正式落点；`templateId` 现在更多承担模板归属和兼容回退角色。

## 这一步回答什么

- 回答：玩家落点是否已经有可落库、可恢复、可接入的 `instanceId` 真源入口。
- 也回答：旧快照是否还能继续兼容恢复。

## 这一步不回答什么

- 不回答私有副本 / 动态实例在重启后的完整恢复策略。
- 不回答实例目录、实例生命周期和实例分配系统是否已经全面落库。
- 不回答跨多节点 MMO 的实例路由与迁移。

## 后续建议

- 如果后面要继续收口，下一步应把“实例目录真源”和“玩家落点真源”拆清：
  - 玩家快照只保存 `instanceId + 坐标`。
  - 实例目录负责把 `instanceId -> templateId/kind/persistent` 解析成正式真源。
- 在那之前，`placement.templateId` 仍然需要保留，作为兼容字段和公共实例回退锚点。
