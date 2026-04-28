# next 主线收口任务计划

更新时间：2026-04-28

这份文档是当前主线总索引。迁移期、legacy 冻结、compat 删除、已完成主链收口和 server TS 化细化文档已经退役；未退役的细节只保留在仍有执行价值的 gate、cutover 与后续专题文档里。

使用规则：

- `[ ]` 代表未完成
- `[x]` 代表已完成
- 如果某项不做了，直接删掉，不保留僵尸任务

## 0. 当前主线

- [x] `packages/client`、`packages/shared`、`packages/server`、`packages/config-editor` 是唯一工作主线
- [x] 默认行为对齐目标改为 `main` 分支同名 `packages/*`
- [x] 迁移期 legacy 归档目录、legacy compose、archive legacy 脚本和 next-workspace 暂存目录已删除
- [x] `参考/` 只作为外部参考和一次性输入，不是默认开发主线

## 6. 服务端主链收口

- [x] 服务端主链按职责拆清
- [x] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径
- [x] world/runtime、gateway、sync、projector 的主边界已固定
- [x] `packages/server/src` 手写 `.js` 真源已清零

## 7. 客户端主链收口

- [x] 客户端主链不再依赖旧协议或旧 UI 兼容逻辑
- [x] 客户端达到“能和 next 新协议正常对接”的可切换状态
- [x] UI 视觉、交互细修、手机样式回归明确后置

## 8. shared 与内容地图收口

- [x] shared 不再成为隐形不稳定源
- [x] 内容、地图、引用关系完成一次系统性清理
- [x] 客户端 generated 数据与服务端内容真源的边界已固定

## 11. 验证门禁收口

对应任务文档：

- [09 验证门禁与验收](./09-verification-and-acceptance.md)

- [x] 把 `local / with-db / acceptance / full / shadow-destructive` 固定为唯一门禁口径
- [x] 确认门禁不再依赖任何迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:replace-ready`
- [x] 跑通 `pnpm verify:replace-ready:with-db`
- [x] 跑通 `pnpm verify:replace-ready:acceptance`
- [x] 跑通 `pnpm verify:replace-ready:full`
- [x] 确认这些门禁都以 next 主链为口径，不再默认证明 legacy 对齐
- [x] 固定 `doctor / acceptance / full` 的脚本与文档合同 proof

说明：

- `shadow-destructive` 仍应以维护窗口与当前轮次实跑记录为准，不能沿用历史 `[x]` 口径。

## 12. legacy 工作树清理与 cutover 收尾

对应执行文档：

- [10 切换执行清单](./10-cutover-execution-checklist.md)
- [10 切换逐步执行手册](./10-cutover-step-by-step-runbook.md)
- [10 切换执行记录模板](./10-cutover-execution-log-template.md)

- [x] 删除仓库内 `legacy/` 归档目录
- [x] 删除 `docker-compose.legacy.yml`
- [x] 删除 `archive:legacy:*` 根脚本
- [x] 删除迁移期 `next-workspace/` 暂存目录
- [x] 删除过期的 frontend refactor、legacy archive、gap analysis、mainline style sync、已完成主链收口和 server TS 化细化文档
- [x] 固定 next cutover / readiness 的仓库内 proof
- [x] 固定 next cutover / preflight 的仓库内 proof
- [x] 固定 next cutover / operations 的仓库内 proof

## 13. 硬切完成定义

- [x] `packages/*` 成为唯一活跃主线
- [x] 默认切换按空库 / 新服入口执行，不再保留 legacy 数据迁移路径
- [x] 玩家主链不再默认走 compat fallback
- [x] GM 关键面与必要管理面能闭环
- [x] 协议、运行时、UI 不再为了 legacy 对齐背额外复杂度
- [x] next 主线可以作为后续唯一开发入口
- [x] 验证门禁全部按 next 主链口径通过

## 14. 当前建议顺序

- [x] 先完成 next 真源与协议主线收口
- [x] 再补协议空洞和最外层 compat 删除
- [x] 再做 server/client/shared 主链收口
- [x] 再删除迁移期脚本、proof 与文档入口
- [x] 再删除不需要的 legacy 工作树和过期文档
- [ ] 最后完成真实切换前/切换后人工检查
  - 当前已补逐步执行手册，剩余是实际环境里的人工执行与记录回写

## 15. server 全面 TS 化

- 当前基线：
  - `packages/server/src` 剩余手写 `.js` 真源：`0` 个文件，`0` 行
  - `packages/server` 包内非 `dist` 手写 `.js`：`0` 个文件，`0` 行
- [x] 继续迁移 `packages/server/src` 剩余 `.js` 真源
- [x] 最终移除 `env-alias.js` 兼容壳并清零 `packages/server/src` 手写 `.js`
- [ ] 下一阶段逐步去掉迁移期 `// @ts-nocheck` 并补强 server TS 类型约束

## 16. 后续专项通用化规划

对应专题文档：

- [12 气机资源统一化规划](./12-qi-resource-unification.md)
- [13 敌我判定规则统一化规划](./13-combat-relation-rules-unification.md)
- [14 技艺活动框架统一化规划](./14-technique-activity-framework.md)
- [15 地图地块特征统一化规划](./15-map-tile-feature-unification.md)

- [ ] 先把 `qi / craft-skill / craft-duration / craft-success` 这类 shared 纯函数合同固定下来
- [ ] 再收口手动技能 / 普攻 / 自动战斗的统一敌我关系判定
- [ ] 再把地块单值 `aura` 升成通用 tile resource runtime
- [ ] 最后把炼丹 / 强化 / 采集收口为统一技艺活动框架
