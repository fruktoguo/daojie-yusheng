# 08 shared 与内容地图收口

目标：把 shared、内容、地图的真源和一致性都压稳。

## 任务

- [ ] 继续整理 `packages/shared/src/protocol.ts`
- [ ] 继续整理 `packages/shared/src/types.ts`
- [ ] 继续整理 `packages/shared/src/network-protobuf.ts`
- [ ] 给新增协议字段补一致性检查
- [ ] 给新增数值字段补完整性检查
- [ ] 确保 shared 变更默认受 audit / check 保护
- [ ] 重新标注哪些 `packages/server/data/content/*` 是玩法真源
- [ ] 重新标注哪些数据是编辑器辅助产物
- [ ] 检查地图文档、怪物包、任务、物品、功法之间的引用一致性
- [ ] 检查 compose 地图结构规范
- [ ] 检查室内地图规范
- [ ] 检查传送点规范
- [ ] 检查 NPC 锚点规范
- [ ] 决定哪些客户端 generated 数据继续保留
- [ ] 决定哪些客户端 generated 数据可以删掉或重做

## 完成定义

- [ ] shared 不再成为隐形不稳定源
- [ ] 内容、地图、引用关系完成一次系统性清理
