# 09 验证门禁与验收

目标：把“能不能接班”收成 next 主线自己的门禁，不再靠 legacy 对齐口径。

## 任务

- [x] 固定 `local` 门禁口径
- [ ] 固定 `with-db` 门禁口径
- [ ] 固定 `acceptance` 门禁口径
- [ ] 固定 `full` 门禁口径
- [ ] 固定 `shadow-destructive` 门禁口径
- [ ] 给“数据迁移完成”补一条迁移 proof 链
- [x] 跑通 `pnpm build`
- [x] 跑通 `pnpm verify:replace-ready`
- [ ] 跑通 `pnpm verify:replace-ready:with-db`
- [ ] 跑通 `pnpm verify:replace-ready:acceptance`
- [ ] 跑通 `pnpm verify:replace-ready:full`
- [x] 跑通必要的 protocol audit
- [ ] 跑通必要的 boundary audit
- [ ] 跑通 next-only 的关键 smoke
- [ ] 整理验收结果文档

## 完成定义

- [ ] 所有门禁都以 next 主链为口径
- [ ] 不再把“legacy 对齐”当作默认完成标准

## 当前验证结论

- [x] `pnpm build` 本地通过
- [x] `pnpm verify:replace-ready` 本地通过，已拿到 `[replace-ready] completed mode=local`
- [ ] `pnpm verify:replace-ready:with-db`
  - 阻塞：缺 `DATABASE_URL/SERVER_NEXT_DATABASE_URL`
- [ ] `pnpm verify:replace-ready:acceptance`
  - 阻塞：缺 `SERVER_NEXT_SHADOW_URL/SERVER_NEXT_URL + SERVER_NEXT_GM_PASSWORD/GM_PASSWORD`
- [ ] `pnpm verify:replace-ready:full`
  - 阻塞：同时缺 DB 与 shadow/GM 环境
