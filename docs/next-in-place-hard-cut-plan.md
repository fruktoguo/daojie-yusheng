# next 原地硬切执行文档

更新时间：2026-04-16

这份文档的目标不是讨论“要不要硬切”，而是默认结论已经成立：

- 继续在当前仓库原地推进，比再开第三套主线更快
- `packages/*` 直接作为唯一主线
- `legacy/*` 不再继续承担“行为对齐目标”
- compat / parity / 桥接层开始系统性删除

一句话定义这次策略：

**不再做“next 兼容迁移”，改做“原地硬切 next + 一次性数据迁移 + legacy 归档”。**

## 1. 当前判断

当前仓库已经不是“只有一些零散 next 尝试”，而是已经具备完整主线骨架：

- `packages/client`
- `packages/server`
- `packages/shared`
- 共享协议
- 世界 runtime
- 面板与 HUD
- GM HTTP / Socket 面
- smoke / audit / replace-ready 验证链
- 内容数据和地图数据

在这个阶段再新开一个主开发文件夹，等于：

- 再复制一套 client/server/shared
- 再接一次内容和地图
- 再重建一遍协议、面板、验证链
- 再产生一套新的“未完成主线”

这通常不会更快，只会把已经完成的部分再重做一遍。

所以这份文档的前提是：

- **不新开第三套主线**
- **只在当前仓库里收口**

## 2. 总目标

原地硬切的真正目标不是“把 legacy 全删光”，而是先做到下面四件事：

1. `packages/*` 成为唯一开发主线。
2. 旧档通过一次性转换进入 next 数据结构。
3. 运行时、协议、UI 不再为了 legacy 对齐额外背负复杂度。
4. legacy 退化成只读参考和归档，不再阻塞开发速度。

## 3. 立刻生效的规则

从这份文档开始，默认执行下面这些规则。

### 3.1 主线规则

- 所有新改动默认只落在 `packages/client`、`packages/server`、`packages/shared`
- 不再为 legacy 增补新功能
- 不再把“与旧版行为一模一样”当作默认目标
- 只保留“必须保留的数据真源”和“必须保留的玩法目标”

### 3.2 停止事项

下面这些工作默认停止：

- 为了对齐 legacy 而做的额外 parity 修复
- 为了保留旧协议语义而继续扩 compat 层
- 为了兼容旧调用链而保留双路径实现
- 为了证明 legacy/next 对齐而继续写成倍的桥接逻辑
- 没有业务价值、只是“旧版也这样”的行为收边

### 3.3 允许事项

下面这些变化现在允许直接做：

- 修改 next 协议字段，只要客户端和服务端一起收口
- 修改 next UI 结构，只要功能闭环更直接
- 改写 runtime 内部职责边界，只要 tick 权威性不破
- 删除 compat facade、legacy wrapper、双路径分支
- 用一次性迁移脚本替代长期兼容代码

## 4. 范围划分

### 4.1 保留为主线的目录

- `packages/client`
- `packages/server`
- `packages/shared`
- `packages/server/data`

`packages/config-editor` 只作为可选辅助工具包保留，不再计入 hard cut 的活跃主线范围。

### 4.2 退化为参考 / 归档的目录

- `legacy/client`
- `legacy/server`
- `legacy/shared`

legacy 之后只承担三种用途：

- 查旧规则
- 查旧数据格式
- 写一次性迁移脚本时做来源参考

### 4.3 优先保留的数据真源

必须保留并迁移的核心数据至少包括：

- 账号身份
- 玩家角色基础信息
- 地图位置 / 出生点 / 当前地图
- 境界 / 属性 / 数值成长
- 背包 / 装备 / 物品
- 功法 / 技能 / 修炼状态
- 任务
- 邮件
- 市场
- 建议 / 回复
- 兑换码相关持久态
- GM 必须长期保留的配置与认证信息

### 4.4 不值得为了兼容长期保留的东西

下面这些默认不值得为它们继续背 compat：

- 旧事件名
- 旧 UI 结构
- 旧面板刷新方式
- 旧 Socket 包体形状
- 旧服务拆分方式
- 旧临时 persistence 结构
- 旧 GM 页面实现细节

## 5. 执行原则

### 5.1 先迁数据，不迁行为

原地硬切时最常见的错误，是继续拿行为兼容当第一优先级。

这次要反过来：

- 第一优先级是数据可迁
- 第二优先级是 next 主线能跑通
- 第三优先级才是体验细节补齐

### 5.2 先删桥，再补洞

只要某段代码的存在理由是：

- 给 legacy 让路
- 给 compat 兜底
- 给双路径同时存在

那它默认就不是资产，而是负担。

优先做法应该是：

1. 找到桥接层
2. 判断是否还被 next 真正使用
3. 如果只是兼容旧线，直接删除
4. 删除后由 next 主链补最小必要能力

### 5.3 允许 next 和 legacy 长得不一样

硬切不是“把旧实现不顾一切搬过去”。

可以直接接受：

- next 的协议和 legacy 不同
- next 的 UI 结构和 legacy 不同
- next 的模块分层和 legacy 不同
- next 的内部状态结构和 legacy 不同

只要满足：

- 玩法目标还在
- 关键数据可迁
- 运行链路更简单

就算是正确方向。

## 6. 分阶段执行

### 阶段 A：冻结 legacy

目标：

- 让 legacy 退出主开发面

动作：

- 停止向 `legacy/*` 落新功能
- 停止新写基于 legacy parity 的任务
- 所有任务默认先看 `packages/*`
- 把“兼容旧实现”从默认完成定义中移除

完成定义：

- 新任务不再把 legacy 当默认落点
- 新文档和新任务不再写“先对齐旧版再说”

### 阶段 B：钉死 next 真源

目标：

- 让 `packages/*` 内部不存在“到底谁才是主线”的歧义

动作：

- `packages/shared/src/protocol.ts` 作为唯一协议真源
- `packages/server/data/*` 作为内容和地图真源
- `packages/server/src/runtime/*` 作为运行时主链
- `packages/client/src/network/socket.ts` + `main.ts` 作为前台交互主链

完成定义：

- 不再新增 shared / server / client 双份 next 合同
- 不再通过 legacy 文件定义 next 行为

### 阶段 C：列出必须迁移的数据清单

目标：

- 先知道要迁什么，再写迁移脚本

动作：

- 把所有正式持久化真源列出来
- 区分“必须迁移”和“可以丢弃重建”
- 逐项映射 legacy 来源字段到 next 目标字段

完成定义：

- 形成一份明确的数据迁移表
- 每个领域都知道来源、目标、转换规则、默认值

### 阶段 D：写一次性迁移脚本

目标：

- 用离线转换代替运行时兼容

动作：

- 读取 legacy 存档 / 数据库 / 文档表
- 输出 next 所需持久化结构
- 提供 dry-run
- 输出迁移摘要、失败项、统计信息

完成定义：

- 同一份 legacy 数据可以稳定转换为 next 真源
- 转换失败时能明确知道卡在哪

### 阶段 E：删除 compat / bridge / parity 层

目标：

- 把速度拖慢的中间层系统性删掉

动作：

- 删除旧事件名兼容
- 删除 legacy wrapper
- 删除仅为 parity 存在的投影代码
- 删除无业务价值的 dual-path 分支
- 删除“next/legacy 双读双写”里不再需要的部分

完成定义：

- next 主链不再默认回退到 compat
- 主要玩法路径只剩单一路径

### 阶段 F：只补 next 自己的缺口

目标：

- 删除 compat 后，针对真实缺口补功能

动作：

- 补主链缺失的协议
- 补 UI 未收口的面板
- 补 runtime 未拆完的职责
- 补 GM / 运维必需面
- 补验证链缺口

完成定义：

- 待办只剩 next 自己的未完项
- 不再掺杂“旧版是不是这样”的历史包袱

## 7. 具体要先做什么

### 7.1 第一批立刻做

- 新增这份硬切文档
- 把总盘点文档当作唯一功能索引
- 产出“必须迁移的数据清单”
- 标出当前所有 compat / parity / bridge 入口

### 7.2 第二批紧接着做

- 决定哪些 runtime/debug API 只留给 smoke
- 决定哪些 GM 面长期保留
- 清理共享协议里“声明了但服务端没实现”的事件
- 删除最外层无价值兼容代码

### 7.3 第三批再做

- 写 legacy -> next 数据迁移脚本
- 跑 with-db / shadow / acceptance 的 next-only 验证口径
- 继续拆大 runtime、大 UI 面板、大协议块

## 8. 当前仓库下的优先切点

最值得最先收口的文件 / 模块：

- `packages/shared/src/protocol.ts`
- `packages/server/src/network/world.gateway.js`
- `packages/server/src/network/world-sync.service.js`
- `packages/server/src/network/world-projector.service.js`
- `packages/server/src/runtime/world/world-runtime.service.ts`
- `packages/client/src/network/socket.ts`
- `packages/client/src/main.ts`
- `packages/client/src/ui/panels/*`

优先原因：

- 这些文件直接决定协议、主循环、面板同步、世界同步和玩家可见行为
- 只要这些地方还在背 compat，开发速度就很难提起来

## 9. 当前已知硬缺口

基于当前代码盘点，已经明确的一项协议缺口是：

- `packages/shared/src/protocol.ts` 已声明 `SaveAlchemyPreset`、`DeleteAlchemyPreset`
- `packages/server/src/network/world.gateway.js` 当前没有对应处理

这类问题在硬切策略下的处理方式不是“先兼容旧行为”，而是二选一：

1. 真的需要，就补成 next 主链正式能力
2. 不需要，就从共享协议里删掉

## 10. 完成定义

原地硬切完成，不等于“legacy 文件夹全删光”。

更准确的完成定义应该是：

### 10.1 工程完成定义

- `packages/*` 是唯一活跃主线
- 新任务不再需要 legacy 才能推进
- 主要玩法链路不再默认走 compat fallback

### 10.2 数据完成定义

- 必要历史数据都能迁到 next
- 迁移脚本可重复执行
- 迁移失败可定位、可回滚

### 10.3 运行时完成定义

- 玩家从登录到进入世界到交互到持久化，全走 next 主链
- GM 关键面、管理面和必要运维面能闭环
- 高优先级玩法不再依赖 legacy 代码兜底

### 10.4 验证完成定义

- `local`
- `with-db`
- `acceptance`
- `full`

这几层门禁都以 next 主链为口径，不再把 legacy 对齐当成默认证明项。

## 11. 不要做的事

下面这些事在当前阶段大概率会继续拖慢你：

- 再开第三套 next 主线文件夹
- 一边说硬切，一边继续做 parity
- 为了“保险”长期保留双路径
- 没列数据清单就开始写迁移脚本
- 没删 compat 就继续补 next 缺口
- 把所有 legacy 细节都当成必须保留

## 12. 下一份文档

这份文档之后，最应该立刻补的不是更多策略讨论，而是：

**`next 必须迁移的数据清单`**

那份文档应该逐项列清：

- 数据域
- legacy 来源
- next 目标
- 转换规则
- 默认值
- 可丢弃项
- 风险项

没有这份清单，硬切就还是停留在口号层。

## 13. 相关文档

- [next 系统模块 / API / 数据目录总盘点](./next-system-module-api-inventory.md)
- [当前主计划总表](./next-plan/main.md)
- [server 验证](../packages/server/TESTING.md)
