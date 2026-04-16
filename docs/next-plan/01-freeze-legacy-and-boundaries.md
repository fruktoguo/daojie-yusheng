# 01 冻结 legacy 与边界收口

目标：先把“什么是主线、什么只是参考”钉死，避免后续任务继续回到兼容迁移。

## 任务

- [ ] 在顶层和主要文档里统一写明 `packages/*` 是唯一活跃主线
- [ ] 在文档里统一写明 `legacy/*` 只作为参考、迁移来源、归档
- [ ] 停止新增任何以 parity 为目标的任务
- [ ] 停止向 `legacy/client` 落新功能
- [ ] 停止向 `legacy/server` 落新功能
- [ ] 停止向 `legacy/shared` 落新功能
- [ ] 盘点 `packages/client` 中仍直接读取 `legacy/*` 的位置
- [ ] 盘点 `packages/server` 中仍直接读取 `legacy/*` 的位置
- [ ] 盘点 `packages/shared` 中仍依赖旧协议或旧共享结构的入口
- [ ] 标出“必须暂时保留”的 legacy 读取点
- [ ] 标出“可以直接删除”的 legacy / compat / parity 入口
- [ ] 把盘点结果补回 `main.md` 的第 1 节对应项

## 完成定义

- [ ] 新任务默认不再把 legacy 当落点
- [ ] 文档口径不再写“先和 legacy 对齐再说”
- [ ] 已有 legacy 依赖点完成一次全量盘点
