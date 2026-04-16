# 05 删除 compat 与桥接层

目标：删掉为了兼容迁移而存在的长期负担。

## 任务

- [ ] 盘点 `packages/server/src/network/` 下所有 compat / bridge 入口
- [ ] 盘点 `packages/server/src/persistence/` 下所有 compat 读取入口
- [ ] 盘点 `packages/client/src/` 下所有旧协议 alias / 旧 UI 兼容入口
- [ ] 盘点 `packages/shared/src/` 下所有仅为旧结构保留的兼容定义
- [ ] 删除只为 legacy 让路的旧事件名兼容
- [ ] 删除只为 parity 存在的双路径分支
- [ ] 删除不再需要的 legacy facade / wrapper
- [ ] 删除 runtime 中只为 compat fallback 存在的回退路径
- [ ] 删除客户端中只为旧协议存在的发送 / 监听兼容逻辑
- [ ] 删除客户端中只为旧 UI 结构存在的兼容代码
- [ ] 每删完一批都补一次最小 build / audit / smoke 验证
- [ ] 更新文档，记录删掉了哪些 compat 面

## 完成定义

- [ ] 玩家主链不再默认走 compat fallback
- [ ] 主要路径只剩 next 单线逻辑
