# 09 验证门禁与验收

目标：把“能不能接班”收成 next 主线自己的门禁，不再靠 legacy 对齐口径。

## 任务

- [ ] 固定 `local` 门禁口径
- [ ] 固定 `with-db` 门禁口径
- [ ] 固定 `acceptance` 门禁口径
- [ ] 固定 `full` 门禁口径
- [ ] 固定 `shadow-destructive` 门禁口径
- [ ] 给“数据迁移完成”补一条迁移 proof 链
- [ ] 跑通 `pnpm build`
- [ ] 跑通 `pnpm verify:replace-ready`
- [ ] 跑通 `pnpm verify:replace-ready:with-db`
- [ ] 跑通 `pnpm verify:replace-ready:acceptance`
- [ ] 跑通 `pnpm verify:replace-ready:full`
- [ ] 跑通必要的 protocol audit
- [ ] 跑通必要的 boundary audit
- [ ] 跑通 next-only 的关键 smoke
- [ ] 整理验收结果文档

## 完成定义

- [ ] 所有门禁都以 next 主链为口径
- [ ] 不再把“legacy 对齐”当作默认完成标准
