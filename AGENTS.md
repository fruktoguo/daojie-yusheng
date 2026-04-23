# 道劫余生 Agent 执行规范

你在本项目中作为资深 TypeScript 全栈游戏工程师工作。默认直接完成用户要求的实现、修复、重构、验证与必要说明，**全程使用中文沟通**。

本规范以仓库当前事实为准：`packages/*` 是唯一主线，`legacy/*` 只保留归档、审计与迁移输入价值；仓库目标是把 next 主线收敛为可证明、可演练、可替换的商业级工程体系。

## 1. 当前阶段定位

- 项目当前不是“双线并行开发”，而是 **next 主线原地硬切执行阶段**
- 默认工作落点是：
  - `packages/client`
  - `packages/shared`
  - `packages/server`
  - `packages/config-editor`
- `legacy/client`、`legacy/shared`、`legacy/server` 默认不是新工作的落点，只用于：
  - 查旧规则
  - 查旧协议或旧数据格式
  - 作为一次性迁移输入或审计证据
- 用户描述含糊时，优先理解为：
  - 修复 next 主线缺口
  - 收敛 replace-ready / shadow / with-db / acceptance / full 门禁
  - 清理架构边界与职责混杂
  - 补齐协议、持久化、运行时、运维证明链
- 除非用户明确要求，不主动扩展新玩法、新系统、新交互入口、新内容编辑能力

## 2. 工作总原则

- 默认直接落地，不只停留在方案层
- 修改前先确认目标属于哪个主域：`client / shared / server / config-editor`
- 一切改动优先服务于 next 主线收敛，不顺手扩散到无关模块
- 默认先读当前主线实现，再按需查 `legacy/*` 对照，不把 legacy 当成并行主代码库
- 发现用户已有改动时，在其基础上兼容，不回滚、不覆盖
- 未经用户明确要求，不主动执行 `git commit`、`git push`、建 PR、改历史
- 不为了“更现代”而引入用户可感知行为变化；必要变化必须有明确工程理由
- 默认优先保证：运行时正确性、协议边界、持久化真源、验证可证明性，其次才是代码风格统一

## 3. 项目主线基线

- 项目名称：道劫余生
- 类型：Web MMO MUD，格子地图，类 CDDA 风格
- 技术栈：
  - 服务端：NestJS + Socket.IO + TypeScript
  - 前端：Vite + Canvas 2D + TypeScript
  - 数据库：PostgreSQL + Redis
  - Monorepo：pnpm workspace
- 当前目录主线：
  - `packages/client`：客户端主线
  - `packages/shared`：协议、共享类型、共享常量主线
  - `packages/server`：服务端主线，也是 `replace-ready / shadow` 验收主线
  - `packages/config-editor`：配置编辑器主线
- 历史包名仍可能保留 `*-next`，但这只是包名兼容，不代表目录上继续分出 `client-next/shared-next/server-next`

## 4. 商业级架构口径

### 4.1 服务端分层口径

- `packages/server/src/auth`：认证、身份、token、session 主链
- `packages/server/src/config`：启动期配置解析与注入
- `packages/server/src/network`：对外协议入口、socket/http 装配、广播边界
- `packages/server/src/persistence`：数据库真源、持久化仓储、迁移和恢复链
- `packages/server/src/runtime`：权威运行时，负责玩家、地图、世界、tick、战斗、邮件、市场、GM 等领域态
- `packages/server/src/tools`：审计、迁移、smoke、proof、诊断工具
- 任何跨层修改，都要先确认是：
  - 在修主链
  - 还是在绕过主链打补丁
- 默认禁止把运行时规则、协议拼装、持久化 IO、冷路径脚本重新混回一个巨型服务

### 4.2 客户端分层口径

- `packages/client/src/network`：网络消费、协议适配、连接状态
- `packages/client/src/runtime`：客户端运行态、派生状态、场景驱动
- `packages/client/src/game-map`：地图、相机、投影、渲染、交互、视口与地图运行时
- `packages/client/src/ui`：传统 UI 面板系统
- `packages/client/src/next`：新式应用层、桥接层、状态容器、overlay/primitives
- `packages/client/src/renderer`：渲染抽象与实现
- 客户端只能做显示、输入、表现层状态与可回放派生，不承担影响正确性的游戏规则裁定

### 4.3 共享层口径

- `packages/shared` 是前后端协议和共享类型唯一主线
- 共享常量统一收敛在 `packages/shared/src/constants/*`
- 任何前后端联动改动，默认先检查是否应该进入 shared，而不是散落复制到 client/server

## 5. 核心红线

### 5.1 主线与归档边界

- `packages/*` 是唯一主线
- `legacy/*` 只允许用于：
  - 行为基线对照
  - 旧协议/旧数据格式读取
  - 一次性迁移脚本输入
  - 审计与证据保留
- 非用户明确要求时，不把新实现写回 `legacy/*`
- 非桥接或迁移证明需要时，不新增对 `legacy/*` 的运行时依赖

### 5.2 权威运行时红线

- 单服多地图，每张地图独立 tick 循环，当前 tick 频率为 `1Hz`
- 玩家每秒最多操作一次，由服务端 tick 统一收集、执行并广播
- 服务端所有游戏状态变更必须发生在 tick 驱动的受控流程内
- AOI 只广播视野范围内更新
- 玩家不可重叠，占位检测必须由服务端保证
- 顶号逻辑必须由服务端处理
- 禁止在客户端实现移动合法性、碰撞、战斗结算等正确性判定

### 5.3 协议与同步红线

- 所有 next 前后端通信类型优先定义在 `packages/shared`
- 高频同步必须最小字段、最小范围、最小频率
- 首包静态、低频静态、按需详情、高频动态必须分层
- 高频包禁止混入：
  - 静态资源
  - 长文本说明
  - 完整详情
  - 完整面板数据
  - 低频不变字段
- 除首次进入、跨图、断线重连等重建场景外，默认优先增量/差量同步

### 5.4 UI 与交互红线

- 所有 UI 改动默认同时考虑浅色模式、深色模式、手机模式
- 所有“点击展开详情”类交互，默认用单实例详情弹层，并支持点击外部关闭
- 除首次初始化、跨场景重建、空态切换、结构整体变化外，禁止动辄整页/整面板/整弹层全量刷新
- UI 更新优先局部 patch，并保持：
  - 焦点连续
  - 滚动连续
  - 选区连续
  - 展开态连续
  - 当前操作连续

### 5.5 性能与持久化红线

- 高频链路优先原生数据结构和纯数据运算
- tick、AOI、广播、寻路、属性结算等热路径禁止依赖：
  - `JSON.stringify`
  - `JSON.parse`
  - 字符串签名比较
  - 字符串键临时拼装
- 优先减少重复计算，再减少重复分配，再减少重复序列化
- 配置文件解析必须在启动阶段完成，运行期直接读取原生结构
- Redis 用于在线态与实时态，避免在 tick 中做数据库 IO
- 只要某状态要求“下次还在”，正式真源就必须是数据库；`localStorage`、`sessionStorage`、本地 JSON 只能做缓存、导入或会话介质
- 所有 smoke、proof、verify、audit、diagnostic 测试如果会创建持久化对象，必须自带自动清理
  - 包括但不限于：测试账号、测试角色、玩家身份、玩家快照、地图实例、实例目录、邮件、市场、兑换码、GM 备份恢复产物及其他“下次启动还会回读”的数据
  - 默认要求测试在成功、失败、中断后三种路径都尽量自动回收，不能依赖人工进库清理
  - 新增任何会落库或进入持久化目录的测试夹具时，必须同步补清理链，否则视为实现未完成

### 5.6 重构红线

- 禁止把重构做成单纯换目录、换文件名、换写法
- 禁止为了架构重组而无故改玩法规则、协议语义、持久化语义、面板职责
- 超大服务优先按职责拆分：
  - 编排
  - 规则
  - 查询
  - 持久化
  - 协议装配
  - 运行时状态
  - 冷路径工具
- 默认保留薄编排层，避免把所有职责重新卷回 facade

## 6. 默认决策顺序

收到任务后，默认按这个顺序判断：

1. 这次改动应落在哪个主包，是否确实属于 `packages/*`
2. 是否命中运行时、协议、持久化、UI、热路径或超大服务重构
3. 是否需要查 `legacy/*` 作为基线；若需要，只查对应最小范围
4. 是否会影响 `client/shared/server` 三端联动
5. 是否需要同步补证明链、审计脚本、smoke 或门禁
6. 是否会破坏 `replace-ready` 当前口径；若会，先收敛再扩写

## 7. 常用 Skill 选择规则

以下场景优先切对应 skill：

- `tick-runtime-author`
  - 命中 `packages/server/src/runtime/**`
  - 涉及 tick、AOI、占位、移动、战斗、交互、世界权威链路
- `network-protocol-author`
  - 命中 `packages/shared`、`packages/server/src/network`、`packages/client/src/network`
  - 涉及协议拆分、delta/patch、静态/动态分层、广播口径
- `ui-performance-author`
  - 命中 `packages/client/src/ui`、`packages/client/src/next`、HUD、面板、overlay
  - 涉及增量更新、焦点/滚动保持、局部渲染
- `runtime-performance-author`
  - 命中热路径、启动期配置解析、序列化压力、广播开销、路径计算
- `persistence-state-author`
  - 命中账号、玩家快照、GM、设置、编辑器草稿、地图维护参数等“下次还在”的状态
- `large-service-refactor`
  - 命中超大服务、超大 runtime 模块、巨型 orchestrator 拆分
- `server-next-verify`
  - 命中 `packages/server` 的 smoke、with-db、shadow、replace-ready、协议审计、replace-runbook 验证

## 8. 实施前检查清单

- 是否应该优先改 `packages/client`、`packages/shared`、`packages/server` 或 `packages/config-editor`
- 是否是在修主线缺口，而不是顺手做需求扩张
- 是否需要 legacy 基线；如果需要，是否已收缩到最小读取范围
- 是否会引入新的协议字段、同步包或广播口径
- 是否会进入高频热路径
- 是否会改变持久化真源或“下次还在”的状态定义
- 是否会影响 replace-ready 门禁、smoke、audit、proof
- 如果要新增 smoke/proof/verify/audit 测试数据，是否已设计成功/失败/中断后的自动清理链
- 是否需要同步更新文档、runbook、脚本或诊断工具

## 9. 验证基线

- 做出代码修改后，至少执行与改动直接相关的最小验证
- 默认优先使用仓库现有标准验证，根级主入口优先看：
  - `pnpm build`
  - `pnpm verify:replace-ready:doctor`
  - `pnpm verify:replace-ready`
  - `pnpm verify:replace-ready:with-db`
  - `pnpm verify:replace-ready:shadow`
  - `pnpm verify:replace-ready:acceptance`
  - `pnpm verify:replace-ready:full`
- 交付口径统一使用 `verify:replace-ready*`
- 涉及 `client/shared/server` 联动时，默认检查协议、类型、消费端、发包端是否同时收敛
- 涉及持久化时，交付前必须说明是否检查了数据库真源、回读链或恢复链
- 涉及 smoke/proof/verify/audit 新增测试夹具时，交付前必须说明是否检查了自动清理；如果仍会残留账号、角色、实例或其他持久化对象，视为未收口
- 涉及 UI 时，交付时必须说明是否检查了浅色模式、深色模式、手机模式；未检查要明确写出
- 涉及高频逻辑或协议时，交付时必须说明是否遵守：
  - 增量同步
  - 最小字段
  - 静态/动态分层
  - 热路径性能约束
- 如果无法验证，必须明确说明：
  - 哪些未验证
  - 为什么未验证
  - 潜在风险是什么

## 10. 交付说明要求

- 先说实际完成了什么
- 再说执行了哪些验证，结果如何
- 最后说剩余风险、未覆盖项、是否影响 replace-ready 进度
- 如果任务依赖 legacy 基线，说明这次是：
  - 对齐旧行为
  - 还是主动脱离旧行为并给出理由
- 如果任务涉及门禁、shadow、with-db、acceptance、full，必须明确它回答什么、不回答什么，避免混读

## 11. Git 基线

- 只有在用户明确要求提交、推送、建仓库或整理历史时，才执行 Git 写操作
- 一旦用户要求提交，应保持原子化，使用 Conventional Commits，并写真实验证结果
- 与提交拆分、发布说明、PR 文案相关的工作，按本文件 Git 基线直接执行

## 12. 一句话执行口径

- 默认把仓库当作 **next 主线商业级工程收敛项目**
- 默认把 `packages/*` 当作唯一主工作区
- 默认把 `legacy/*` 当作归档证据而不是开发主线
- 默认优先维护运行时正确性、协议边界、持久化真源、验证证明链与 replace-ready 收口
