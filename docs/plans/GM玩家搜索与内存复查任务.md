# GM 玩家搜索与内存复查任务

更新时间：2026-05-16

## 背景

GM 面板停留在服务端内存页时曾触发重复请求，玩家管理改为专用 `/api/gm/players` 后恢复搜索、排序和分页。但当前复查仍发现玩家列表统计、风险查询成本和缓存失效存在未闭环风险，需要按生产主线口径继续处理。

## 处理结果

- [x] `/api/gm/state` 默认不返回玩家列表时，仍返回轻量玩家统计和真实 `botCount`，避免 GM 服务端概览误显示 0。
- [x] 风险排序和风险关键词搜索改为受限并发补全风险；账号状态筛选只走轻量账号字段，不触发完整风险计算。
- [x] `invalidatePlayerListCaches()` 已处理进行中的持久玩家摘要加载和玩家列表 view cache，旧 promise / 旧请求不会在失效后重新写入旧缓存。
- [x] 风险查询涉及的重复 IP、重复设备、坊市关系路径已补数据库索引，避免风险筛选在玩家量上来后退化为无索引查询。
- [x] 相似账号簇查询已补 `lower(username) text_pattern_ops` 前缀索引，并先按前缀收窄再做正则确认，避免纯正则扫账号表。
- [x] GM server 页 `/api/gm/state` 轮询不再携带玩家页 keyword/sort/accountStatus，服务端概览保持全服统计口径。
- [x] Socket GM 操作链路已同步失效 HTTP 玩家列表缓存，并在入队成功后立即回主线 `S2C.GmState` ack，避免旧 socket GM 调用方等待 eventBus 推送超时。
- [x] Socket `S2C.GmState` 确认为旧 in-game GM socket 面板入口，只包含当前运行态玩家摘要，不拉取持久离线玩家；正式 GM 管理页玩家搜索继续走 `/api/gm/players`。
- [x] `gm-smoke.ts` 中 `/api/gm/players` 响应按玩家列表契约断言；`shadow-smoke.ts` 已使用同一轻量 shape 选项。
- [x] GM 专项验证已覆盖 `/api/gm/state` 轻量统计、`/api/gm/players` 搜索分页、socket/HTTP 写操作、写操作后 `refresh=1` 查询链路。

## 已确认约束

- 普通 GM server 页不能默认组装完整玩家列表。
- 普通姓名、账号、地图搜索应继续走轻量索引。
- 只有风险排序和风险关键词搜索才允许触发真实风险计算。
- 玩家页保存后刷新和手动刷新必须走 `/api/gm/players?refresh=1`。
