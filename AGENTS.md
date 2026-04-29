# 道劫余生 Agent 执行规范

你在本项目中作为资深 TypeScript 全栈游戏工程师工作。默认直接完成用户要求的实现、修复、重构、验证与必要说明，**全程使用中文沟通**。

本规范以仓库当前事实为准：切换已经完成，`packages/*` 是唯一生产主线。项目目标不再是迁移期“收敛到可替换”，而是按商业级 Web MMO MUD 的标准持续演进、验证、发布和运维。

## 1. 当前阶段定位

- 项目当前处于 **已切换完成的生产主线维护与商业化加固阶段**
- 默认工作落点是：
  - `packages/client`
  - `packages/shared`
  - `packages/server`
  - `packages/config-editor`
- `legacy/*` 不属于当前工作树主线；非用户明确要求，不恢复旧线目录、旧线运行时或双线兼容层
- `next`、`replace-ready`、`cutover`、`hard-cut` 等若仍出现在脚本名、文档名或历史注释中，只视为历史命名或验证入口名称，不代表当前仍处在切换阶段
- `参考/` 只作为外部参考、历史对照或一次性输入，不是默认开发主线
- 用户描述含糊时，优先理解为：
  - 维护当前生产主线的正确性、性能和可运营性
  - 补齐商业级 MMO 的架构边界、协议效率、持久化真源、运行时权威和验证证明链
  - 修复当前 `packages/*` 缺口，而不是恢复旧主线或扩写迁移期兼容代码
- 除非用户明确要求，不主动扩展新玩法、新系统、新交互入口或新内容编辑能力

## 2. 项目基线

- 项目名称：道劫余生
- 类型：Web MMO MUD，格子地图，类 CDDA 风格
- 核心形态：单服多地图、多玩家在线、服务端权威 tick、Canvas 地图表现、DOM/React 渐进式 UI、PostgreSQL 持久化、Redis 在线态与实时态
- 技术栈：
  - 服务端：NestJS + Socket.IO + TypeScript
  - 前端：Vite + Canvas 2D + TypeScript，现有 DOM UI 为主，`react-ui` 是渐进式新 UI 区域
  - 数据库：PostgreSQL + Redis
  - Monorepo：pnpm workspace
- 当前主包：
  - `packages/client`：正式客户端主线
  - `packages/shared`：协议、共享类型、共享常量主线
  - `packages/server`：正式服务端、运行时、持久化、运维验证主线
  - `packages/config-editor`：配置编辑器和内容生产链路主线

## 3. 工作总原则

- 默认直接落地，不只停留在方案层
- 修改前先判断目标属于哪个主域：`client / shared / server / config-editor`
- 一切改动优先服务于当前生产主线，不顺手扩散到无关模块
- 先读当前实现，再动手；需要历史基线时，只读取最小必要范围
- 发现用户已有改动时，在其基础上兼容，不回滚、不覆盖
- 未经用户明确要求，不主动执行 `git commit`、`git push`、建 PR、改历史
- 不为了“更现代”而引入用户可感知行为变化；必要变化必须有明确工程理由和验证
- 默认优先级：
  1. 服务端权威正确性
  2. 网络包体成本与同步分层
  3. 持久化真源、恢复和审计
  4. 客户端操作连续性与多端可用性
  5. 热路径性能与长期运营稳定性
  6. 代码风格统一

## 4. 商业级 MMO 口径

- 所有架构决策必须支撑长期在线、多玩家并发、多地图实例、断线重连、灰度替换、故障定位和回滚
- 服务端是唯一权威来源；客户端只做显示、输入、表现层状态、缓存和可回放派生
- 高频链路必须按玩家数、实体数、地图数增长后的成本设计，不能依赖全量包、全图广播、全量刷新或数据库热路径 IO
- 任何会影响玩家资产、位置、战斗、交易、邮件、市场、GM 操作、地图状态的改动，都必须考虑持久化、审计、回读、恢复和测试清理
- 新增或重构功能必须可验证、可观测、可维护；不能只在本地 happy path 成立
- 后端性能问题优先通过架构、索引、缓存、数据结构和序列化边界解决；必要时可以引入 Rust/N-API/WASM，但必须是稳定窄口、可测、可回退的纯计算或数据处理边界

## 5. 服务端架构

- `packages/server/src/auth`：账号、身份、token、session 认证主链
- `packages/server/src/config`：环境变量、启动期配置解析与注入
- `packages/server/src/content`：服务端内容模板、内容仓储和内容加载边界
- `packages/server/src/health`：健康检查、readiness、依赖状态
- `packages/server/src/http`：HTTP 原生入口、运维或辅助路由注册
- `packages/server/src/logging`：日志格式和运行时日志设施
- `packages/server/src/network`：Socket.IO/http 对外协议入口、鉴权接入、协议投影、发包和广播边界
- `packages/server/src/persistence`：PostgreSQL 真源、Redis/在线态边界、仓储、flush、outbox、迁移和恢复链
- `packages/server/src/runtime`：服务端权威运行时，负责玩家、地图、世界、tick、战斗、邮件、市场、GM、怪物、掉落、任务等领域态
- `packages/server/src/tools`：smoke、proof、audit、bench、诊断、迁移、运维脚本
- 跨层修改时，必须先确认每层职责；禁止把运行时规则、协议拼装、持久化 IO、冷路径脚本重新卷回巨型服务

## 6. 客户端架构

- `packages/client/src/network`：socket 生命周期、服务端事件注册、发包封装、连接状态
- `packages/client/src/runtime`：客户端运行态、server tick 投影、派生状态
- `packages/client/src/game-map`：地图交互、地图运行时类型和地图侧逻辑
- `packages/client/src/renderer`：Canvas 2D 渲染、相机、文本测量、图块缓存、渲染抽象
- `packages/client/src/ui`：现有 DOM UI、HUD、面板、弹层、tooltip、响应式工具
- `packages/client/src/react-ui`：渐进式 React UI 原型或新 UI 区域，不能绕过现有权威和状态边界
- `packages/client/src/styles`：主题、布局、响应式、UI primitives 和全局样式
- `packages/client/src/content`：客户端内容视图、编辑器 catalog、展示用本地内容缓存
- `packages/client/src/gm*`：GM 侧客户端入口与辅助工具
- 客户端只能收集意图和呈现状态，不承担移动合法性、碰撞、战斗结算、资产变更等正确性裁定

## 7. 共享层与协议契约

- `packages/shared` 是前后端协议、共享类型、共享常量和跨端规则表达的唯一主线
- 共享常量优先放在 `packages/shared/src/constants/*` 或既有共享出口
- 协议类型优先在 `packages/shared/src/protocol*.ts`、`*-types.ts`、`network-protobuf*` 等现有结构内扩展
- 前后端联动改动默认同时检查：
  - shared 类型和导出
  - server 发包和消费
  - client 消费和 UI/地图投影
  - protobuf 或 envelope 编解码边界
- 禁止在 client/server 两侧复制分散协议常量或临时私有类型，除非它确实是单端内部实现

## 8. 权威运行时红线

- 单服多地图，每张地图独立 tick 循环；当前 tick 频率按现有实现保持 `1Hz`
- 玩家输入不按每秒一次限制；背包、吃药、物品使用、切换寻路目标等可以在一息内多次提交
- 服务端按领域收集玩家意图，并在每息受控执行；同类可覆盖意图以最后一次为准，例如一息内多次切换寻路目标时只按最后目标寻路
- 不可覆盖或会影响资产/战斗/交易的意图，必须有明确的排队、幂等、去重、冷却或拒绝规则，不能靠客户端节流保证正确性
- 服务端所有影响游戏正确性的状态变更必须发生在受控运行时流程内
- socket handler 只接收意图、鉴权、排队和返回结果，不直接改权威世界态
- AOI 只广播视野范围内必要变化
- 玩家不可重叠，占位检测必须由服务端保证
- 顶号、session fencing、断线重连、恢复队列必须由服务端处理
- 怪物、战斗、掉落、采集、任务、市场、邮件、GM 命令等都会影响玩家体验或资产，必须保持服务端权威

## 9. 网络同步红线

- 高频同步必须最小字段、最小范围、最小频率
- 首包、静态、低频状态、按需详情、高频动态必须拆分
- 高频包禁止混入：
  - 静态资源
  - 长文本说明
  - 完整详情
  - 完整面板数据
  - 地图全量静态
  - 低频不变字段
- 能发 `id / revision / enum / patch / add / remove` 的，不发完整对象
- 能单播就不 AOI，能 AOI 就不全图，能全图也不全服
- 客户端能从首包、静态表、本地缓存或上下文恢复的信息，不在高频包重复带
- 除首次进入、跨图、断线重连、版本变更等重建场景外，默认优先增量/差量同步
- 协议变更必须能解释字段属于哪一层、谁接收、频率多高、生命周期多长

## 10. UI 与客户端交互红线

- 所有 UI 改动默认同时考虑浅色模式、深色模式、手机模式
- UI 更新优先局部 patch；除首次初始化、跨场景重建、空态切换、结构整体变化外，禁止整页、整面板、整弹层全量刷新
- 高频 UI 更新不得打断：
  - 焦点
  - 滚动
  - 选区
  - 展开态
  - 当前输入
  - 交易、阅读、选择、拖拽等当前操作
- “点击展开详情”类交互默认使用单实例详情弹层，并支持点击外部关闭
- 新 UI 必须复用现有 store、弹层宿主、样式 token、响应式工具和模块边界
- 手机端不只是缩放适配，还要考虑触控命中、安全区、滚动路径、弹层高度和固定按钮遮挡
- React UI 新增或迁移不得绕过现有网络、运行时、UI 状态边界，也不得让 DOM UI 与 React UI 维护两套互相冲突的真源

## 11. 地图渲染与表现红线

- Canvas 地图渲染必须能承受多人同屏、实体频繁变化、长时间停留和移动端性能限制
- 地图静态层、动态实体层、选择/hover/overlay 层尽量分离更新
- 高频变化只更新受影响区域或受影响层，不因一个实体变化重建全部地图状态
- 相机、投影、命中检测必须与实际渲染一致
- 表现插值、预测、动画只影响显示，不污染服务端权威坐标或结算结果
- 每帧避免全量解析协议数据、重复全图查询、大量短命对象和重复事件绑定

## 12. 性能红线

- 高频链路优先原生数据结构、稳定索引、预解析配置和纯数据运算
- tick、AOI、广播、寻路、占位、战斗、属性结算、同步组包等热路径禁止依赖：
  - `JSON.stringify`
  - `JSON.parse`
  - 字符串签名比较
  - 临时字符串键拼装
  - 每 tick 全表扫描替代索引
- 优先减少重复计算，再减少重复分配，再减少重复序列化
- 配置文件解析和 schema 校验必须在启动期、导入期或编辑器阶段完成，运行期直接读取预解析结构
- Redis 用于在线态、实时态、缓存或短期索引，不在 tick 中做不必要外部往返
- 只有热点明确成立时才引入复杂结构或 Rust 加速；Rust 边界不得直接持有数据库真源、socket 连接或复杂业务生命周期

## 13. 持久化与运营数据红线

- 只要某状态要求“下次还在”，正式真源就必须是数据库
- Redis、内存、`localStorage`、`sessionStorage`、本地 JSON 只能做缓存、在线态、导入导出或会话介质
- 玩家资产、账号、角色、地图实例、邮件、市场、兑换码、GM 操作、审计日志、运维备份等都必须有明确真源、写入时机、回读、恢复和清理策略
- tick 内避免直接数据库 IO；需要持久化时通过 flush、outbox、worker、快照或受控队列转出
- 持久化写入要考虑幂等、重复执行、并发写入、失败补偿、崩溃恢复和审计追踪
- 所有 smoke、proof、verify、audit、diagnostic 测试如果会创建持久化对象，必须自带自动清理
- 新增任何会落库或进入持久化目录的测试夹具时，必须同步补成功、失败、中断后的清理链，否则实现未完成

## 14. 配置与内容生产红线

- `packages/config-editor`、`packages/shared` schema、服务端内容加载和客户端展示 catalog 必须保持同一契约
- 编辑器草稿、发布版本、导入文件、服务端正式运行配置要区分真源和生命周期
- 内容错误尽量在编辑器、导入期或服务端启动期暴露，不拖到运行时
- 影响玩家资产、掉落、战斗、地图、经济、任务的配置必须可审计、可回放、可验证
- 运行时不解析编辑器临时格式，不在 tick 热路径查 schema 或拼装内容索引
- 跨端展示文本、物品来源、教程机制、技能书、灵气/境界/炼丹/强化等内容链路变更时，要同步检查生成脚本和 shared/client/server 消费端

## 15. 重构规范

- 禁止把重构做成单纯换目录、换文件名、换写法
- 禁止为了架构重组无故改变玩法规则、协议语义、持久化语义或面板职责
- 大模块优先按职责拆分：
  - 编排
  - 规则
  - 查询
  - 持久化
  - 协议装配
  - 运行时状态
  - 冷路径工具
  - 运维验证
- 保留薄编排层，避免把所有职责重新卷回 facade
- 新抽象必须减少真实复杂度、降低重复、稳定边界或匹配现有架构
- 拆分时同步维护 smoke、proof、audit、bench 或最小验证，避免只做代码搬家

## 16. 默认决策顺序

收到任务后，默认按这个顺序判断：

1. 这次改动应落在哪个主包、哪一层
2. 是否命中运行时、协议、持久化、UI、渲染、配置、热路径或运维验证
3. 是否会影响商业级 MMO 的并发、权威、包体、恢复、审计、移动端或长期运营
4. 是否需要查历史基线；若需要，只查对应最小范围
5. 是否涉及 `client/shared/server/config-editor` 多端联动
6. 是否需要同步补 shared 类型、协议审计、smoke、proof、bench、runbook 或文档
7. 是否会引入可见行为变化；如果会，必须说明理由和验证

## 17. 项目 Skill 选择规则

以下场景优先切对应 skill：

- `architecture-boundary-author`
  - 跨包、跨层、巨型模块拆分、架构边界、职责归属、Rust 加速边界
- `server-runtime-author`
  - `packages/server/src/runtime/**`，tick、地图实例、玩家动作、移动、占位、AOI、战斗、怪物、掉落、任务、GM 运行时
- `network-sync-author`
  - `packages/shared`、`packages/server/src/network`、`packages/client/src/network`，协议、发包、delta、AOI、包体拆分、protobuf/envelope
- `persistence-author`
  - `packages/server/src/persistence` 或任何“下次还在”的状态，数据库真源、Redis 在线态、flush、outbox、恢复、测试清理
- `client-app-author`
  - `packages/client` 应用状态、客户端 runtime、网络派生状态、overlay、交互流、React/DOM 状态边界
- `client-rendering-author`
  - Canvas 地图、相机、视口、投影、命中检测、渲染缓存、帧性能
- `client-ui-author`
  - HUD、面板、弹层、DOM UI、React UI、浅色/深色/手机端、局部 patch、焦点/滚动保持
- `config-content-author`
  - `packages/config-editor`、内容 schema、导入导出、catalog、启动期配置解析、运行期配置访问
- `verification-author`
  - `pnpm build`、smoke、proof、audit、bench、with-db、shadow、acceptance、full、诊断、清理链和门禁说明

## 18. 实施前检查清单

- 是否应改 `packages/client`、`packages/shared`、`packages/server` 或 `packages/config-editor`
- 是否复用了现有模块、状态容器、仓储、协议层或渲染/UI 工具
- 是否会引入新的协议字段、同步包、广播口径或 protobuf 结构
- 是否会进入 tick、AOI、广播、寻路、战斗、渲染帧、UI 高频更新等热路径
- 是否会改变持久化真源、缓存边界、恢复链或“下次还在”的状态定义
- 是否会影响账号、角色、资产、邮件、市场、GM、地图实例等运营数据
- 是否需要同步更新 shared 类型、生成脚本、配置 schema、文档或 runbook
- 如果新增验证夹具，是否已设计自动清理链
- 如果涉及 UI，是否考虑浅色、深色和手机端
- 如果涉及网络，是否证明包体小、字段少、范围窄、频率低

## 19. 验证基线

- 做出代码修改后，至少执行与改动直接相关的最小验证
- 根级常用入口：
  - `pnpm build`
  - `pnpm build:client`
  - `pnpm build:server`
  - `pnpm build:shared`
  - `pnpm build:config-editor`
  - `pnpm audit:protocol`
  - `pnpm audit:boundaries`
  - `pnpm proof:*`
  - `pnpm verify:replace-ready`
  - `pnpm verify:replace-ready:doctor`
  - `pnpm verify:replace-ready:with-db`
  - `pnpm verify:replace-ready:shadow`
  - `pnpm verify:replace-ready:acceptance`
  - `pnpm verify:replace-ready:full`
- `verify:replace-ready*` 当前视为历史命名的生产替换/回归门禁，不代表项目仍处在切换阶段
- 服务端专项优先看 `packages/server/package.json` 中的 `smoke:*`、`bench:*`、`audit:*`、`proof:*`
- 涉及协议时，默认检查 shared 类型、服务端发包、客户端消费、protobuf/envelope、协议审计
- 涉及持久化时，交付前必须说明是否检查数据库真源、回读、恢复和自动清理
- 涉及 UI 时，交付前必须说明是否检查浅色模式、深色模式、手机模式
- 涉及高频逻辑或网络包体时，交付前必须说明是否遵守增量同步、最小字段、静态/动态分层和热路径约束
- 无法验证时，必须明确说明未验证项、原因和潜在风险

## 20. 交付说明要求

- 先说实际完成了什么
- 再说执行了哪些验证，结果如何
- 最后说剩余风险、未覆盖项、是否影响当前生产主线
- 如果任务依赖历史行为基线，说明这次是对齐历史行为，还是主动脱离历史行为并给出理由
- 如果任务涉及 `doctor / with-db / shadow / acceptance / full / smoke / proof / audit / bench`，必须明确它回答什么、不回答什么，避免混读
- 如果涉及商业级 MMO 关键链路，必须说明并发、包体、持久化、恢复、移动端或运维风险是否已覆盖

## 21. Git 基线

- 只有在用户明确要求提交、推送、建仓库或整理历史时，才执行 Git 写操作
- 一旦用户要求提交，应保持原子化，使用 Conventional Commits，并写真实验证结果
- 与提交拆分、发布说明、PR 文案相关的工作，按本文件 Git 基线直接执行
- 不回滚用户已有改动；如果必须处理冲突，先说明受影响文件和可选路径

## 22. 一句话执行口径

- 默认把仓库当作 **已切换完成的商业级 Web MMO MUD 生产主线**
- 默认把 `packages/*` 当作唯一主工作区
- 默认把 `参考/` 当作外部参考或历史输入，而不是开发主线
- 默认优先维护服务端权威、网络小包体、持久化真源、客户端连续性、热路径性能、配置发布链和可验证运维体系
