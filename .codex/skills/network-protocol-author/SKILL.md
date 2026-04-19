---
name: network-protocol-author
description: Use this skill when creating or refactoring network protocols and packet emission in this repo, including shared socket payload types, server emit paths, bootstrap/static/detail/delta splitting, AOI broadcast design, protobuf payload shaping, and minimizing packet size by excluding static information from high-frequency messages.
---

# 网络协议与发包

这个 skill 用于正式修改协议和发包链路。核心目标只有两个：最小包体、正确分层。高频包里不发静态信息，不靠“先全发再让客户端自己忽略”偷懒。

适用场景：

- 修改 `packages/shared/src/protocol.ts`
- 修改 `packages/shared/src/network-protobuf.ts`
- 修改 `packages/server/src/game/` 的发包逻辑
- 新增 socket 事件、重构现有 delta、拆分 bootstrap/static/detail/panel/world/self 同步
- 审查某段广播是否发太多、发太宽、发错层

## 先看哪里

优先参考：

- `packages/shared/src/protocol.ts`
- `packages/shared/src/network-protobuf.ts`
- `docs/next-protocol-audit.md`
- `docs/qi-system-design.md`

## 先分层，再发包

任何字段先判断它属于哪一层：

- `Bootstrap / Init / MapEnter`
  只放首包建立运行上下文必需的数据
- `MapStatic / MapStaticSync`
  只放地图静态或低频静态数据，以及这类数据的增量补丁
- `WorldDelta / Tick`
  只放视野世界态、高频地块 patch、实体 patch、战斗表现、路径、时序类字段
- `SelfDelta / AttrUpdate / RealmUpdate`
  只放玩家自己当前状态的小型变化
- `PanelDelta / InventoryUpdate / EquipmentUpdate / TechniqueUpdate / ActionsUpdate`
  只放面板运行态变化，不混地图静态、长文本、详情文案
- `Detail / TileDetail / AttrDetail / MailDetail / NpcShop / MarketItemBook`
  只放客户端主动请求后的低频详情
- `Notice / Error / Result`
  只放一次性提示、错误、操作结果

拿不准时，默认往更低频、按需请求的层拆，不要往高频包塞。

## 强制流程

1. 先列出这次改动涉及的字段清单，不要先写事件名。
2. 对每个字段判断：
   - 是高频动态，还是低频静态
   - 是公共数据，还是玩家相关投影
   - 是首包必需，还是按需详情
   - 是单播、AOI 广播，还是全局广播
3. 静态信息、完整说明文本、完整详情、完整面板结构，默认拆去 `Bootstrap / MapStatic / Detail / Request-Response`，不要留在高频包。
4. 高频包只保留“这次真的变了”的最小字段集合；没有变化就不发，可拆 add/remove 就不要整包替换。
5. 如果字段是玩家相关投影结果，只发给相关玩家，不做公共广播。
6. 如果已有现成层级可复用，优先沿用 `MapStatic`、`WorldDelta`、`SelfDelta`、`PanelDelta`、`Detail` 等现有事件，不要平地起新大包。
7. 需要二进制高频链路时，优先把字段做成真正的 protobuf message，不要在 protobuf 里再塞 JSON 字符串。
8. 改完后执行最小必要验证；默认优先跑 `pnpm build` 或服务端相关最小编译验证。

## 硬规则

- 高频包禁止混入静态资源、静态说明文本、完整详情、完整面板数据、地图全量静态、完整 NPC/商店/邮件正文。
- 能发 id、revision、枚举、增量 patch 的，不要发完整对象。
- 能单播的不要 AOI 广播，能 AOI 广播的不要全图广播，能全图广播的也不要全服广播。
- 没变的字段不要重复发；能 add/remove 的数组不要每次整数组重发。
- 客户端可由已有静态真源、首包缓存或本地上下文恢复的信息，不要在高频包重复带。
- 不要为了图省事把高频 UI 所需数据做成“整面板整包同步”。
- 玩家相关观察结果、感知结果、详情可见性，必须由服务端按玩家视角决定，不能偷成公共静态字段。
- 如果某段链路需要长文本或大对象，默认改成主动请求详情，不做常驻推送。

## 字段判断口诀

- 会不会频繁变：会，就压窄字段
- 会不会所有人都一样：不会，就按玩家单独投影
- 客户端是否当前就必须知道：不是，就改成按需请求
- 能不能从已知上下文推回：能，就别再发
- 这次是否真的变化了：没有，就别发

## 交付时必须说明

- 这次改的是哪几个事件、哪层协议
- 哪些字段留在高频包，为什么必须留
- 哪些字段被拆到首包、静态包或详情包
- 是否遵守了最小包体和“高频不发静态信息”
- 是否执行了 `pnpm build` 或其他直接验证
