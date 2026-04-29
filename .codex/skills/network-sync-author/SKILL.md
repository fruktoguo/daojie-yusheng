---
name: network-sync-author
description: Use this skill when changing shared protocol types, Socket.IO events, server emit paths, client network consumers, packet splitting, bootstrap/static/detail/delta sync, AOI broadcast design, packet size minimization, or high-frequency network payloads in packages/shared, packages/server/src/network, or packages/client/src/network.
---

# 网络同步与包体拆分

用于修改协议、发包和客户端网络消费。核心目标：包体足够小、同步层次清晰、高频只发必要变化。

## 商业级 MMO 口径

- 协议设计必须按多人同屏、弱网、移动端流量和长时间在线成本来评估。
- 高频同步默认面向“每秒大量玩家和实体变化”设计，不能靠全量包、宽广播或客户端丢弃来兜底。
- 每个字段都要有明确层级、接收者、频率和生命周期；大对象必须按需或低频下发。
- 协议变更必须可向前排查、可审计、可灰度，不制造难以定位的隐式客户端依赖。

## 分层口径

- `Bootstrap / Init / MapEnter`：建立上下文必需的数据。
- `Static / Catalog / MapStatic`：低频静态数据、版本号、revision、静态 patch。
- `WorldDelta / TickDelta`：AOI 内高频世界变化。
- `SelfDelta`：只给玩家自己的状态变化。
- `PanelDelta`：面板运行态增量，不带完整详情。
- `Detail / RequestResponse`：主动请求的低频详情、长文本、大对象。
- `Notice / Result / Error`：一次性提示、操作结果和错误。

## 强制流程

1. 先列字段，再决定事件名。
2. 对每个字段判断：高频/低频、静态/动态、公共/玩家投影、首包必需/按需详情、单播/AOI/全局。
3. 高频包只保留这次真的变化的最小字段；能发 id、revision、枚举、短 patch，就不发完整对象。
4. 静态资源、长文本、完整详情、完整面板结构默认拆到静态层或详情请求。
5. 能单播就不 AOI，能 AOI 就不全图，能全图也不全服。
6. 客户端能从首包缓存、静态表或本地上下文恢复的信息，不在高频包重复带。
7. 前后端联动时，同步修改 `packages/shared` 类型、服务端发包和客户端消费。

## 硬规则

- 高频包禁止混入静态资源、长文本说明、完整详情、完整面板数据、地图全量静态。
- 没变的字段不重复发；数组能 add/remove 就不要整数组重发。
- 玩家视角相关数据必须由服务端按玩家投影后发送，不能偷成公共字段。
- 不为了 UI 省事把高频协议改成整面板整包同步。
- 需要二进制链路时，字段必须是真正结构化消息，不在二进制容器里塞 JSON 字符串。

## 交付说明

- 改了哪些事件和哪层同步。
- 是否满足商业级 MMO 的小包体、低浪费、弱网和高并发同步要求。
- 哪些字段留在高频包，为什么必须留。
- 哪些字段拆到了首包、静态包或详情请求。
- 是否遵守最小字段、最小范围、最小频率。
- 执行了哪些协议、类型或构建验证。
