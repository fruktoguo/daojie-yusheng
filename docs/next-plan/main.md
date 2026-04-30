# 生产主线维护任务计划

更新时间：2026-04-28

这份文档是当前生产主线总索引。已经完成的迁移、切换和 legacy 工作树清理不再作为执行任务保留；未退役的内容只保留在仍有执行价值的验证门禁、运维说明与后续专题文档里。

使用规则：

- `[ ]` 代表未完成
- `[x]` 代表已完成
- 如果某项不做了，直接删掉，不保留僵尸任务

## 0. 当前主线基线

- [x] `packages/client`、`packages/shared`、`packages/server`、`packages/config-editor` 是唯一工作主线
- [x] 默认行为对齐目标是当前 `main` 分支同名 `packages/*`
- [x] `参考/` 只作为外部参考和一次性输入，不是默认开发主线

## 1. 服务端主线

- [x] 服务端主链按职责拆清
- [x] 玩家核心路径没有“又从 A 走，又从 B 兜底”的双路径
- [x] world/runtime、gateway、sync、projector 的主边界已固定
- [x] `packages/server/src` 手写 `.js` 真源已清零

## 2. 客户端主线

- [x] 客户端主链不再依赖旧协议或旧 UI 兼容逻辑
- [x] 客户端能和当前服务端协议正常对接
- [x] UI 视觉、交互细修、手机样式回归明确后置

## 3. shared 与内容地图

- [x] shared 不再成为隐形不稳定源
- [x] 内容、地图、引用关系完成一次系统性清理
- [x] 客户端 generated 数据与服务端内容真源的边界已固定

## 4. 验证门禁

对应任务文档：

- [09 验证门禁与验收](./09-verification-and-acceptance.md)

- [x] 把 `local / with-db / acceptance / full / shadow-destructive` 固定为唯一门禁口径
- [x] 确认门禁不再依赖任何迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:release:local`
- [x] 跑通 `pnpm verify:release:with-db`
- [x] 跑通 `pnpm verify:release:acceptance`
- [x] 跑通 `pnpm verify:release:full`
- [x] 确认这些门禁都以当前生产主线为口径，不再默认证明 legacy 对齐
- [x] 固定 `doctor / acceptance / full` 的脚本与文档合同 proof

说明：

- `shadow-destructive` 仍应以维护窗口与当前轮次实跑记录为准，不能沿用历史 `[x]` 口径。

## 5. server 全面 TS 化

- 当前基线：
  - `packages/server/src` 剩余手写 `.js` 真源：`0` 个文件，`0` 行
  - `packages/server` 包内非 `dist` 手写 `.js`：`0` 个文件，`0` 行
- [x] 继续迁移 `packages/server/src` 剩余 `.js` 真源
- [x] 最终移除 `env-alias.js` 兼容壳并清零 `packages/server/src` 手写 `.js`
- [ ] 下一阶段逐步去掉迁移期 `// @ts-nocheck` 并补强 server TS 类型约束

## 6. 后续专项通用化规划

对应专题文档：

- [12 气机资源统一化规划](./12-qi-resource-unification.md)
- [13 敌我判定规则统一化规划](./13-combat-relation-rules-unification.md)
- [14 技艺活动框架统一化规划](./14-technique-activity-framework.md)
- [15 地图地块特征统一化规划](./15-map-tile-feature-unification.md)

- [ ] 先把 `qi / craft-skill / craft-duration / craft-success` 这类 shared 纯函数合同固定下来
- [ ] 再收口手动技能 / 普攻 / 自动战斗的统一敌我关系判定
- [ ] 再把地块单值 `aura` 升成通用 tile resource runtime
- [ ] 最后把炼丹 / 强化 / 采集收口为统一技艺活动框架
