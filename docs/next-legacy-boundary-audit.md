# server-next 剩余 legacy 边界自动审计

更新时间：2026-04-20

## 一句话结论

- 这份报告只统计仓库里仍可见的 direct legacy 边界与性能热点，不等于 replace-ready 失败，也不代表完整替换已完成。
- 当前自动审计命中 0 / 18 个检查项，共 0 处代码证据。
- 保守口径不变：`next` 离“完整替换游戏整体”仍约差 `40% - 45%`。

## 汇总

| 类别 | 命中检查项 | 代码证据 |
| --- | ---: | ---: |
| P0 auth/bootstrap 真源 | 0 / 2 | 0 |
| P0 legacy HTTP/GM/admin | 0 / 3 | 0 |
| P1 world sync compat | 0 / 4 | 0 |
| P1 runtime/persistence compat | 0 / 4 | 0 |
| 目标差距: 性能/扩展 | 0 / 5 | 0 |

## 备注

- 运行命令：`pnpm audit:server-next-boundaries` 或 `pnpm --filter @mud/server-next audit:legacy-boundaries`。
- 报告由 `packages/server/src/tools/audit/next-legacy-boundary-audit.js` 自动生成。
- 这份审计的定位是 inventory，不是 replace-ready 验收，也不会替代 `pnpm verify:replace-ready`、`with-db`、`shadow` 或协议审计。
- 清单里若仍残留已迁移路径，脚本现在会 fail-soft 跳过并把原因写进报告，而不是直接中断。

