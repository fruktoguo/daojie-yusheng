# next 待修复问题清单

更新时间：2026-04-16

这份清单用于统一回答两件事：

1. 当前 `next` 体系还存在哪些待修复问题
2. 哪些问题会阻塞“正式替换旧服”

说明：

- 本清单合并自现有迁移文档、当前代码扫描结果，以及最近一轮实际验证
- 不是所有条目都同样紧急；优先按 `P0 -> P1 -> P2` 处理
- 这里说的 `next`，当前实际对应目录是 `packages/client`、`packages/server`、`packages/shared`

## 当前总判断

- 当前仍不能把 `next` 视为“已可正式替换旧服”
- 当前主要短板不在 tick / AOI / 服务端权威思路本身，而在：
  - 安全默认值
  - auth/bootstrap/player-source/session 真源替换
  - legacy/compat 边界尚未退役
  - 服务端弱类型与超大模块
  - 持久化模型仍偏迁移过渡态
  - 前端主链过重、patch-first 未完全收口
  - proof / acceptance / shadow / GM-admin 运营闭环未完全做实

内联 TODO 检索约定：

- 任务账本：`TODO(next:Txx)`
- 安全与门禁：`TODO(next:SECxx)`、`TODO(next:VERIFYxx)`
- 架构 / 持久化 / 热路径 / 大模块：`TODO(next:ARCHxx)`、`TODO(next:PERSISTxx)`、`TODO(next:PERFxx)`、`TODO(next:REFACTORxx)`
- 迁移链路残项：`TODO(next:MIGRATE01)`
- 前端尾项：`TODO(next:UIxx)`
- 建议检索：`rg -n "TODO\\(next:" packages docs scripts .github`

- 说明：JSON 文件本身无法写注释，像 `package.json` 里的 `*-next` 包名残留这类问题，统一落在相邻迁移文档 TODO 中追踪。

## 仍未就近落到代码注释、当前保留在文档追踪的项

- TODO(next:ARCH04): `packages/client/package.json`、`packages/server/package.json`、`packages/shared/package.json` 与根 `package.json` 仍残留 `*-next` 包名/脚本标识，需在 legacy 包名冲突彻底解除后统一回归正式命名。

---

## P0：正式替换前必须先修

### 1. 玩家 token secret 仍会回退到内置开发密钥

- 状态：未修
- 风险：公网环境下属于事故级安全风险
- 现状：
  - `packages/server/src/network/world-player-token-codec.service.js`
  - `this.signingSecret = this.secrets[0] ?? 'daojie-yusheng-dev-secret'`
- 待修：
  - 生产/非开发环境禁止回退默认 secret
  - 启动时若缺少合法 secret 直接 fail-fast

### 2. GM 默认密码仍会回退到 `admin123`

- 状态：未修
- 风险：公网环境下属于事故级安全风险
- 现状：
  - `packages/server/src/runtime/gm/runtime-gm-auth.service.js`
  - `const DEFAULT_GM_PASSWORD = 'admin123'`
- 待修：
  - 禁止生产环境默认密码启动
  - 首启强制设置或强制从环境变量/安全存储读取

### 3. 服务端 CORS 仍是全开

- 状态：未修
- 风险：跨域暴露面过大
- 现状：
  - `packages/server/src/main.js`
  - `app.enableCors()`
- 待修：
  - 按环境限制 allowed origins / methods / headers
  - 区分本地开发与正式部署配置

### 4. 认证接口未见正式限流/节流

- 状态：未修
- 风险：登录、注册、刷新接口容易遭暴力尝试
- 现状：
  - `packages/server/src/http/next/next-auth.controller.js`
  - 当前未见 throttler / rate limiter 接入
- 待修：
  - 给登录、注册、刷新、GM 登录补限流
  - 区分 IP、账号维度和失败重试窗口

### 5. 玩家 access/refresh token 直接存 `localStorage`

- 状态：未修
- 风险：一旦出现 XSS，会话可直接被窃取
- 现状：
  - `packages/client/src/ui/auth-api.ts`
- 待修：
  - 评估改为 HttpOnly Cookie 或更窄的会话承载策略
  - 至少先补 CSP、最小化 token 暴露面、缩短有效期

### 6. `auth/token/bootstrap/player-source/session` 真源替换仍未完成

- 状态：文档口径仍为未完成
- 风险：这是“正式替换旧服”的主阻塞
- 现状：
  - 见 `docs/next-remaining-task-breakdown.md` 的 `T01-T07`
  - 见 `docs/next-gap-analysis.md`
- 待修：
  - 彻底移除 authenticated 主链里的 compat identity fallback
  - 继续收掉 snapshot/player-source 的 legacy 回退
  - 把 token/gmToken 入场收成单线 bootstrap
  - 明确 session 真源设计，不再停留在过渡态

### 7. legacy/compat 对外入口还没正式退役

- 状态：未修
- 风险：外部边界不清，回滚/运维/兼容逻辑会继续拖住主链
- 现状：
  - `docs/next-legacy-removal-checklist.md`
  - `T13 / T24` 仍未定稿
- 待修：
  - 明确 legacy HTTP / GM / socket 的最终保留范围
  - 证明真实环境无人再依赖旧入口
  - 再从 `AppModule` 侧彻底下线 compat registry

### 8. `next` 当前仍依赖 `legacy/server/data` 作为内容真源

- 状态：已做路径回退，但未完成真源替换
- 风险：当前能跑，不代表已经 next-native
- 现状：
  - `packages/server/src/common/project-path.js`
  - 当前通过 fallback 从 `legacy/server/data` 读取地图和内容
- 待修：
  - 把内容/地图真源正式迁到当前主线目录
  - 清除对 `legacy/server/data` 的运行时依赖

---

## P1：不一定立刻阻塞上线，但会持续积累风险

### 9. `server` 仍未启用 strict TS 约束

- 状态：未修
- 风险：大文件回归风险高，编译通过不等于行为安全
- 现状：
  - `packages/server/tsconfig.json`
  - `allowJs: true`
  - `checkJs: false`
  - `strict: false`
- 待修：
  - 至少先对核心模块分批提升约束
  - 逐步减少 `allowJs` 覆盖面

### 10. 持久化模型仍偏迁移过渡态

- 状态：未修
- 风险：索引、审计、热点隔离、局部恢复与长期演进能力不足
- 现状：
  - `packages/server/src/persistence/persistent-document-table.js`
  - 核心表：`persistent_documents(scope, key, payload, updatedAt)`
- 待修：
  - 明确哪些状态继续保留文档表，哪些应拆为专表
  - 重新设计长期 MMO 真源模型

### 11. 玩家/地图持久化仍是 5 秒一次串行刷盘

- 状态：未修
- 风险：数据规模增长后吞吐、延迟和失败恢复会变差
- 现状：
  - `packages/server/src/persistence/player-persistence-flush.service.js`
  - `packages/server/src/persistence/map-persistence-flush.service.js`
- 待修：
  - 补更细粒度 dirty 分发
  - 评估批量写、并行度、失败重试与优先级策略

### 12. next 侧在线态/实时态层仍不完整

- 状态：未修
- 风险：与 legacy 相比，在线态架构还没重新搭稳
- 现状：
  - `packages/server/package.json` 没有 Redis 依赖
  - `legacy/server/package.json` 仍有 `ioredis`
- 待修：
  - 明确 next 是否需要 Redis，或者替代方案是什么
  - 把在线态、实时态、持久化态分层重新定清

### 13. 高频链路仍有 `JSON.stringify` 比较

- 状态：未修
- 风险：并发、频繁状态抖动时容易先变成热点
- 现状：
  - `packages/server/src/network/world-projector.service.js`
  - `packages/server/src/network/world-sync.service.js`
  - `packages/server/src/runtime/player/player-runtime.service.js`
- 待修：
  - 用 revision / slice / 结构化比较替代字符串化比较
  - 避免在热路径做临时序列化

### 14. 首包与低频面板仍偏重

- 状态：未修
- 风险：首包体积、面板拼装和后续协议扩展成本偏高
- 现状：
  - `docs/next-gap-analysis.md`
  - `docs/next-remaining-task-breakdown.md` 中 `T15 / T19`
- 待修：
  - 继续拆 `Bootstrap / MapStatic / PanelDelta / Detail`
  - 清掉重复字段和跨面板上下文拼接

### 15. `world-projector` / `world-sync` / `world-runtime` 仍是超大核心模块

- 状态：未修
- 风险：维护成本高，任何改动都容易牵一发而动全身
- 现状：
  - `packages/server/src/network/world-projector.service.js`
  - `packages/server/src/network/world-sync.service.js`
  - `packages/server/src/runtime/world/world-runtime.service.js`
- 待修：
  - 拆编排层、slice 层、读模型层、热点逻辑层
  - 把新系统扩展路径从巨型主服务中切出去

### 16. shared 协议稳定性护栏还没完全硬化

- 状态：未修
- 风险：新增字段容易出现 client/server/shared 漂移
- 现状：
  - `docs/next-gap-analysis.md`
  - `docs/next-remaining-task-breakdown.md` 中 `T22 / T23`
- 待修：
  - 把字段补全检查、reset/projection/protobuf 一致性检查继续做硬
  - 把 shared 一致性从单点脚本提升到正式门禁

### 17. proof / acceptance / full / shadow / destructive 仍未完全闭环

- 状态：未修
- 风险：代码看起来能替换，不等于真实环境可安全替换
- 现状：
  - `docs/next-gap-analysis.md`
  - `docs/next-remaining-task-breakdown.md` 中 `T09 / T10 / T11 / T12 / T14 / T25`
- 待修：
  - 继续补 with-db / shadow / destructive 的真实环境执行记录
  - 把 workflow/job 级闭环补齐

### 18. GM / admin / backup / restore 自动化证明仍不足

- 状态：未修
- 风险：运营面还没到“可放心接班”的程度
- 现状：
  - 当前已有最小 proof，但不是完整日常门禁
- 待修：
  - 补齐 GM-admin 关键写路径与备份/恢复的正式回归链
  - 把人工 runbook 与自动 proof 对齐

---

## P2：不一定阻塞替换，但会持续拉低维护性

### 19. 前端主链仍过重

- 状态：未修
- 现状：
  - `packages/client/src/main.ts` 目前约 `4914` 行
- 待修：
  - 继续拆 UI 编排、场景、协议消费、面板协调层

### 20. `SocketManager` 仍有大量 `any` 回调

- 状态：未修
- 现状：
  - `packages/client/src/network/socket.ts`
- 待修：
  - 补齐事件负载类型
  - 减少裸 `any` 回调数组

### 21. 多个面板/弹层仍大量依赖 `innerHTML`

- 状态：未修
- 现状：
  - `packages/client/src/ui/panels/action-panel.ts`
  - `packages/client/src/ui/panels/world-panel.ts`
  - `packages/client/src/ui/panels/market-panel.ts`
  - `packages/client/src/main.ts`
- 待修：
  - 继续推进 patch-first
  - 减少整块重建，保留焦点/滚动/展开态

### 22. patch-first 还没有完全覆盖主要 UI 面

- 状态：未修
- 现状：
  - 见 `docs/frontend-refactor/*`
- 待修：
  - 把主要面板从“可用”继续推进到“稳定增量更新”

### 23. 包名与内部标识仍残留 `*-next`

- 状态：未修，但不急
- 现状：
  - 目录已回归 `packages/client|server|shared`
  - 包名仍是 `@mud/client-next`、`@mud/server-next`、`@mud/shared-next`
- 待修：
  - 等 legacy 包名冲突问题彻底解决后，再统一回归正式命名

### 24. 运行时日志虽已部分中文化，但工具链/异常文案仍未全收口

- 状态：部分完成
- 现状：
  - 主服务运行时日志已开始中文化
  - tools/scripts/部分异常文案仍不统一
- 待修：
  - 继续统一 smoke、脚本、自检、异常输出的中文口径

---

## 建议修复顺序

### 第一批：先收 `P0` 安全与真源阻塞

1. 禁止默认玩家 token secret
2. 禁止默认 GM 密码
3. 收紧 CORS 与认证限流
4. 继续推进 `T01-T07`
5. 明确 legacy 外部入口退役策略

### 第二批：把“迁移过渡态”继续压薄

1. 处理内容/地图真源仍依赖 `legacy/server/data`
2. 重构持久化模型与在线态设计
3. 清理 `JSON.stringify` 热路径比较
4. 拆 `world-projector / world-sync / world-runtime`

### 第三批：收维护性和证明链

1. 补齐 shared 协议一致性门禁
2. 做实 with-db / shadow / destructive / acceptance
3. 继续推进前端 patch-first 与 UI 拆分
4. 最后再处理 `*-next` 命名回归与彻底删 legacy

---

## 删除 legacy 前的明确条件

当前还不能删光 `legacy`。至少要先满足：

1. `auth/token/bootstrap/player-source/session` 真源替换完成
2. 外部旧入口退役策略定稿并执行
3. `with-db / shadow / acceptance / destructive` 自动 proof 全绿
4. 真实环境确认无人再使用旧入口
5. 留出稳定观察窗口，再做最终清理

见：

- `docs/next-legacy-removal-checklist.md`
- `docs/next-gap-analysis.md`
- `docs/next-remaining-task-breakdown.md`
