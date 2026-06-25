# 落盘逻辑全面审计清单（2026-06-25）

## 审计范围

本次围绕“旧内存态/旧存档覆盖新状态”“宗门扩张后偶发恢复旧地盘”做持久化链路审计。重点阅读了：

- 机制文档：`docs/mechanics/economy/31-sect.md`、`docs/mechanics/core-loop/01-tick-scheduling.md`、`docs/mechanics/building-env/23-building-system.md`。
- 数据 schema 文档：`docs/data-schema/README.md`、`12-instance-catalog.md`、`13-instance-domain.md`、`14-durable-outbox.md`、玩家资产/杂项/邮件/市场相关 schema。
- 代码范围：`packages/server/src/persistence/**`、`packages/server/src/runtime/**`、`packages/server/src/http/native/**` 中和 SQL、flush、snapshot、checkpoint、watermark、restore、hydrate、purge 相关的 291 个 TypeScript 文件。

勾选规则：`[x]` 表示当前代码已经有明确防线；`[ ]` 表示仍需实现、补迁移或补验证。

## 结论摘要

最贴近现象的风险是宗门持久化链路：`server_sect` 仍是“从内存整表覆盖数据库”，并且宗门边界扩张后的模板刷新条件不完整。即使实例域分域持久化已经退役旧 map snapshot，只要宗门文档或模板仓库回到旧边界，玩家看到的宗门地盘仍可能回退。

第二类风险是实例分域写入缺少数据库层 lease/ownership_epoch fence，当前主要靠内存态判断。发生长 GC、进程暂停、跨节点 lease handoff 或恢复接管时，旧节点仍有理论机会把旧实例域写回库。

第三类风险是“删除语义不完整”：overlay、container、purge/restore cleanup 等路径存在只 upsert 不删除或清理表清单不完整的情况，重启后容易把旧 portal、旧容器、旧建筑/房间/风水状态加载回来。

## 问题清单

### - [x] P0-01 宗门保存仍是整表从内存覆盖数据库

**问题**：`WorldRuntimeSectService.saveSectDocument()` 每次保存会 `DELETE FROM server_sect`，再把当前进程内 `sectsById` 的所有宗门重新插入。只要当前进程的内存宗门状态比数据库旧，或者它在另一个更新之后才执行 debounce 保存，就可能把新宗门边界、成员、入口、权限覆盖回旧值。

**原因**：宗门真源虽然已经从旧 `persistent_documents` 迁到 `server_sect`，但写入语义仍是全量文档覆盖，没有 per-sect revision/CAS，没有 `updated_at_ms` 单行保护，没有 tombstone，也没有按宗门操作的幂等审计。证据：`packages/server/src/runtime/world/world-runtime-sect.service.ts` 的 `persistSectsSoon()` 5 秒延迟保存，`saveSectDocument()` 内部 `DELETE FROM ${SECT_TABLE}` 后循环插入。

**建议**：把宗门持久化改成按宗门行级 upsert，所有会改变资产/地盘/成员的操作必须以单宗门事务写库，删除用显式 tombstone 或状态字段，不再用“内存全量 = 数据库全量”的模型。

**解决方案**：新增 `server_sect.revision` 或使用严格单调 `updated_at_ms`，`UPSERT ... WHERE server_sect.revision <= EXCLUDED.revision`；解散宗门写 `status='dissolved'` 和 tombstone，不在普通保存里删除全表；扩地、成员审批、入口迁移、权限变更都调用 `saveSect(sect, expectedRevision)`；补 smoke：两个旧/新内存镜像交错保存时，新 revision 不得被旧 revision 覆盖。

### - [x] P0-02 宗门扩张后的模板刷新条件失效

**问题**：宗门模板 ID 被固定为 `sect_domain:${sectId}`。`registerSectTemplate()` 如果发现模板仓库已有这个 ID，会直接返回旧模板；`refreshSectTemplateForBounds()` 只有在 `instance.meta.templateId !== template.id` 时才 rebase。边界变了但模板 ID 不变时，旧模板可能继续留在运行时。

**原因**：当前 `buildSectTemplateId()` 和 `resolveSectTemplateIdForBounds()` 都忽略 bounds；`buildSectMapDocument()` 虽然会从 `mapMinX/mapMaxX/mapMinY/mapMaxY` 生成边界，但已有模板时不会重新注册/替换。证据：`world-runtime-sect.service.ts` 中 `registerSectTemplate()` 的 `templateRepository.has()` 短路，以及 `resolveSectTemplateIdForBounds()` 固定返回 stable id。

**建议**：模板是否需要替换不能只看 templateId，应比较模板内容版本或 bounds。

**解决方案**：给 runtime template 增加 `boundsRevision` 或直接支持同 ID 替换；`refreshSectTemplateForBounds()` 比较旧模板的 `sectMapMinX/MaxX/MinY/MaxY`，只要不同就调用实例的 `replaceTemplateForSectExpansion()` 或等价 rebase；把 `server_sect.raw_payload` 中的边界作为启动恢复唯一来源；补 smoke：扩张一次后不重启、重启恢复、租约接管三种场景下，运行时可行走格数和 `server_sect` 边界一致。

### - [x] P0-03 宗门持久化 debounce 未纳入 shutdown final flush

**问题**：宗门改动通过 `persistSectsSoon()` 延迟 5 秒落库。关机 drain 只强刷玩家、地图和通天塔，没有显式 flush 宗门；`closePersistencePool()` 还会清掉 pending timer。滚动发布、异常退出或进程回收时，5 秒窗口内的宗门扩张/成员变更可能丢失。

**原因**：宗门服务没有 `flushAllNow()`/`onModuleDestroy()` 接入 `WorldShutdownDrainService`。证据：`world-shutdown-drain.service.ts` final_flushing 只有 `playerPersistenceFlushService.flushAllNow()`、`mapPersistenceFlushService.flushAllNow()`、`tongtianTowerPersistenceService.flushAllProgress()`。

**建议**：宗门属于资产和地图状态，不应只依赖 debounce。

**解决方案**：提供 `worldRuntimeSectService.flushAllNow()`，先清 timer 再同步执行当前 pending save，并加入 shutdown drain；扩地、解散、入宗审批等高价值操作可以直接等待 per-sect 落库成功后再返回；补 smoke：触发扩张后立即调用 shutdown drain，重启后边界仍为扩张后的值。

### - [x] P0-04 玩家个人 `sectId` 没有分域落盘域

**问题**：`PlayerRuntimeService.setPlayerSectId()` 只修改内存 `player.sectId` 并 bump `persistentRevision`，没有标记任何 projectable dirty domain；玩家分域列表中也没有 `sect` 域。入宗、退宗、宗门修复时，玩家个人快照里的 `sectId` 可能长期不落库，甚至触发 fallback dirty 后被 flush 拒绝。

**原因**：`PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS` 未包含宗门字段；`listDirtyPlayerDomains()` 在没有 dirtyDomains 但 revision 变化时会返回 fallback `snapshot`，`PlayerPersistenceFlushService.flushPlayerDirtyDomains()` 对 fallback 抛 `player_domain_delta_required`。宗门服务虽然有 `playerSectId` 索引和 `server_sect.members`，但玩家自身 `sectId` 没有结构化真源。

**建议**：明确玩家所属宗门的真源。如果真源是 `server_sect.members`，玩家 snapshot 不应持久化 `sectId`；如果客户端/玩家投影需要该字段，就必须有独立分域。

**解决方案**：优先新增 `player_social_state` 或 `player_sect_membership` 分域，包含 `player_id`、`sect_id`、`role`、`revision`、`updated_at`；`setPlayerSectId()` 标记 `sect_membership` dirty；宗门审批事务同时写 `server_sect` 和玩家 membership，或通过 durable outbox 保证最终一致；启动 hydrate 从 membership 读玩家 `sectId`，并和 `server_sect.members` 做审计修复。

### - [x] P0-05 实例分域写入缺少数据库层 lease/ownership_epoch fence

**问题**：实例域 flush 写 `instance_tile_cell`、`instance_overlay_chunk`、`instance_checkpoint`、`instance_building_*` 等表时，只在运行时进入写库前调用 `isInstanceLeaseWritable(instance)`。实际 SQL 写域表时没有检查 `instance_catalog.assigned_node_id/lease_token/ownership_epoch`。旧节点如果在 lease 变更后仍持有旧内存，仍可能写入旧域状态。

**原因**：`InstanceDomainPersistenceService` 的各 `save/replace` 方法只拿 instance advisory lock，不校验 catalog lease；advisory lock 只能串行同一实例写入，不能证明写入者是当前 owner。相比之下，玩家分域有 `assertPlayerSnapshotProjectionFenceCurrent()` 和 session/owner fence。

**建议**：实例域表写入必须和 `instance_catalog` lease token/ownership_epoch 在同一事务内校验。

**解决方案**：所有实例域写入入口增加 `{ expectedNodeId, expectedLeaseToken, expectedOwnershipEpoch }`；事务内 `SELECT ... FOR UPDATE` 或 `UPDATE ... WHERE ownership_epoch = $expected AND lease_token = $expected` 验证当前租约；失败时抛 `instance_domain_fence_failed` 并 fence 本地 runtime；批量 worker/flush ledger 也使用同一校验。补 smoke：旧 epoch 和新 epoch 交错写同一 overlay/tile/checkpoint，旧 epoch 写入必须被拒绝。

### - [x] P0-06 实例 checkpoint 可被旧 tick 无条件覆盖

**问题**：`saveInstanceCheckpoint()` 对 `instance_checkpoint` 使用无条件 upsert，`checkpoint_payload` 直接被新请求覆盖。旧节点、旧内存或恢复过程的低 tick checkpoint 可以把更高 tick 的时间状态写回旧值。

**原因**：checkpoint payload 没有独立的 `tick`、`revision`、`ownership_epoch` 列，也没有 `WHERE existing_tick <= incoming_tick` 或 lease fence。

**建议**：实例时间是跨 tick 状态，不能用最后提交者获胜。

**解决方案**：拆出 `tick`、`tick_speed`、`paused`、`ownership_epoch` 列；普通 tick checkpoint 只允许 tick 单调前进；GM 暂停/改速用单独操作 revision；写入时同时校验 lease epoch。补 smoke：先保存 tick=100，再模拟旧 writer 保存 tick=80，恢复后必须仍是 tick=100。

### - [x] P0-07 overlay 正常 flush 只 upsert 不删除，旧 portal 可复活

**问题**：`flushInstanceDomains()` 处理 `overlay` 域时，遍历 `buildOverlayPersistenceChunks()` 并调用 `saveOverlayChunk()`。当运行时 portal 已被移除，`buildOverlayPersistenceChunks()` 返回空数组；flush 仍把 overlay 标记为已落库，但数据库里的旧 `runtime_portals` chunk 不会删除。重启后 `hydrateOverlayChunks()` 会把旧 portal 加回来。

**原因**：全量替换 API `replaceOverlayChunks()` 已存在且会删除快照外 chunk，但正常 flush 没有使用；`saveOverlayChunk()` 是 upsert 语义，不表达删除。

**建议**：overlay 域要么全量替换，要么有显式 delete/tombstone delta，不能以“没有 chunk”表示“无变化”。

**解决方案**：在 `flushInstanceDomains()` 中对 overlay 使用 `replaceOverlayChunks(instanceId, chunks)`；或让 `buildOverlayPersistenceDelta()` 返回 `upserts/deletes`，当 `runtimePortals` 为空时删除 `portal:runtime_portals`；补 smoke：移除宗门入口 portal 后 flush，数据库 `instance_overlay_chunk` 对应行应删除，重启后 portal 不复活。

### - [x] P0-08 purge/restore cleanup 漏掉 building/room/fengshui 表

**问题**：`purgeInstanceState()` 和 `cleanupPostgresRestoreOrphanSectState()` 删除实例域状态时没有覆盖 `instance_building_state`、`instance_building_cell`、`instance_room_state`、`instance_room_cell`、`instance_fengshui_state` 以及 building audit/idempotency 表。删除/恢复宗门实例后，旧建筑、房间和风水状态可能残留并在下次恢复时重新加载。

**原因**：实例域表扩展后，清理表清单没有同步更新。证据：`native-postgres-restore-cleanup.ts` 的 `INSTANCE_DOMAIN_INSTANCE_TABLES` 到 `instance_overlay_chunk` 为止；`InstanceDomainPersistenceService.purgeInstanceState()` 同样只删到 overlay/event/container/monster 等旧清单。

**建议**：实例状态清理必须由统一表注册表驱动，新增域表时清理/恢复工具自动覆盖。

**解决方案**：把所有 instance domain 表集中到 `INSTANCE_DOMAIN_TABLES` 常量，供 purge、restore cleanup、doctor/audit 复用；补齐 building/room/fengshui/audit/idempotency 表；补 smoke：构造孤儿宗门实例的 building/room/fengshui 行，执行 cleanup 后必须全部删除。

### - [x] P1-09 宗门实例 catalog/template 信息可被旧 upsert 覆盖

**问题**：`InstanceCatalogService.upsertInstanceCatalog()` 对 `template_id`、owner、route_domain、last_persisted 等字段无条件覆盖；`preserveExistingLease` 只保护活跃 lease 字段。宗门扩张如果未来重新引入带 bounds 的 templateId，旧创建/恢复路径仍可能把 catalog 的 template_id 写回旧模板。

**原因**：catalog 更新没有按 instance ownership epoch 或模板 revision 做 CAS。

**建议**：catalog 元数据也应有“谁可以写”和“哪个版本更新”的语义。

**解决方案**：catalog upsert 增加 `metadata_revision` 或 `template_revision`；更新 template/owner/route 时要求 `metadata_revision <= incoming`；运行时普通 lease 续租不得顺手覆盖模板元数据；补 smoke：旧 template revision 的 upsert 不得覆盖新 template revision。

### - [x] P1-10 `server_player_snapshot` 旧整档写接口仍存在

**问题**：`PlayerPersistenceService.savePlayerSnapshot()` 仍可无条件 upsert `server_player_snapshot`，且 `saved_at/payload` 直接覆盖旧行。当前主线 flush 已禁止调用它，但接口保留给迁移/工具，未来误用会重新制造旧整档覆盖问题。

**原因**：旧表被标记为非运行时真源，但接口本身没有 source 权限、单调时间、调用白名单或运行时保护。

**建议**：旧整档表只能作为导出/迁移兼容输入，不应保留通用 save API。

**解决方案**：把 `savePlayerSnapshot()` 改名为 `saveLegacyPlayerSnapshotForMigration()` 并限制只在迁移工具注入；加 `saved_at <= incoming_saved_at` 的保护；`persistence-retirement-audit` 扩展到所有 runtime/native 文件，禁止主线 import `PlayerPersistenceService`。

### - [x] P1-11 `restoreSnapshot()` 会整对象替换在线玩家内存态

**问题**：`PlayerRuntimeService.restoreSnapshot(snapshot)` 直接 `players.set(snapshot.playerId, cloneRuntimePlayerState(snapshot))`，没有 session、revision 或 dirty domain merge。GM 修改和坊市失败回滚都会调用它；如果恢复的是旧 snapshot，后续玩家 flush 会把旧内存态落库。

**原因**：restoreSnapshot 是“整对象回滚”语义，适合测试或受控导入，不适合和在线运行时并发 mutation 混用。坊市 `restoreMutationContext()` 在失败时会恢复事前捕获的在线玩家 snapshot。

**建议**：在线玩家应使用领域级 mutation/rollback，不用整对象替换；必须替换时要检查 `selfRevision/persistentRevision/sessionEpoch`。

**解决方案**：拆成 `restoreSnapshotForTestOrOfflineImport()` 和在线 `applyRuntimePatch()`；线上 restore 需要 expected revision，失败时拒绝覆盖；坊市回滚只回滚本次 market mutation 涉及的钱包/背包域，并在应用前校验 revision 未变化；补 smoke：market action 失败期间并发给玩家发放物品，回滚不得吞掉并发发放。

### - [x] P1-12 玩家全量投影接口可能被 partial snapshot 误用

**问题**：`savePlayerSnapshotProjection()` 会把 snapshot 投影到大量分域表，包含 replace/prune 语义。GM 离线保存仍可调用全量投影；如果传入的是局部 snapshot，未包含的资产、装备、任务、日志等域可能被清空或写成默认。

**原因**：全量投影入口没有和“完整快照”做类型/运行时断言，也没有要求调用方声明域列表。虽然主线 flush 已使用 `savePlayerSnapshotProjectionDomains()`，但全量入口仍是 public。

**建议**：全量投影只允许迁移、首次导入或明确完整快照；普通 GM 更新必须走 dirty domains。

**解决方案**：将 `savePlayerSnapshotProjection()` 降为 import/migration-only，或要求传入 `assertCompleteSnapshot: true`；GM 保存默认调用 `savePlayerSnapshotProjectionDomains()`；补 smoke：只传 vitals 局部 snapshot 给 GM 保存时，背包/装备/功法等表不得被删除。

### - [x] P1-13 artifact 域无法表达“清空所有神器槽”

**问题**：dirty domain 为 `artifact` 时，`replacePlayerArtifactSlots()` 的 `allowEmptyOverwrite` 条件是 `options.allowEquipmentEmptyOverwrite === true && artifactSlots.length > 0`。当玩家确实卸下所有神器槽，空数组不会被允许覆盖已有 DB 行，旧 artifact 行可能保留并在恢复时复活。

**原因**：代码把“空数组可能是局部快照缺字段”和“显式清空所有槽”混在一起，没有独立的显式空投影标记。

**建议**：空覆盖保护必须能区分缺省和显式清空。

**解决方案**：为 artifact 域增加 `allowArtifactEmptyOverwrite` 或 `explicitArtifactProjection`，当 snapshot 明确包含 `artifacts.slots: []` 且 dirty domain 包含 artifact 时允许删除旧行；补 smoke：装备神器后清空全部神器槽，flush+恢复后不得复活。

### - [x] P1-14 玩家投影恢复状态判断漏掉 wallet/market_storage

**问题**：`hasProjectedPlayerDomainState()` 不把 wallet rows、market storage rows 或对应 watermark 视为 projected state；`hasAnyLoadedPlayerDomainState()` 才包含它们。某些修复/迁移场景如果只剩钱包或市场托管仓数据，`loadProjectedSnapshot()` 可能返回 null，而不是从这些资产域构建玩家投影。

**原因**：投影恢复的“是否有状态”判断和“是否加载到任何状态”判断不一致。

**建议**：资产域不能被排除在恢复存在性判断之外；如果需要最小角色锚点，应明确报错并提供修复工具。

**解决方案**：把 `wallet_version`、`market_storage_version` 和对应行计入 projected state；或者在发现仅资产域存在时返回 `partial_domain_requires_anchor_repair`，由 GM 一键修复补 world anchor/vitals。补 smoke：仅有 wallet/market_storage watermark 的玩家不应被当作全新空玩家。

### - [x] P1-15 hydrateRuntimeTiles 的规范化修复会被 clearDirtyDomains 吞掉

**问题**：`applyPersistedTileLayers()` 发现旧库 tileType 与分层字段矛盾时会 `markPersistenceDirtyDomains(['tile_cell'])`，但 `hydrateRuntimeTiles()` 末尾立刻 `clearDirtyDomains()`。因此旧数据在内存里被修正，数据库却不会自动写回。

**原因**：hydrate 流程把“恢复态不应脏”和“恢复时发现需要自愈写回”合并处理，导致修复脏标记丢失。

**建议**：恢复期自愈应有独立 repair report，不能靠普通 dirty 标记再清掉。

**解决方案**：`hydrateRuntimeTiles()` 返回 `{ repairedTileCells }` 或保留 repair dirty domain；启动恢复结束后通过受控 repair flush 写回；补 smoke：构造旧分层矛盾的 `instance_tile_cell`，恢复后执行一次 flush，数据库行应被规范化。

### - [x] P1-16 container_state 正常 flush 只保存当前容器，缺少删除 delta

**问题**：`flushInstanceDomains()` 对 `container_state` 遍历当前 `buildContainerPersistenceStates(instanceId)` 并调用 `saveContainerState()`。如果某个容器已从运行时移除但没有单独删除路径，这个 flush 不会删除数据库旧容器；重启后旧容器可能被加载回来。

**原因**：`replaceContainerStates()` 全量替换 API 已存在，但普通 flush 没用；当前 dirty domain 没有携带 deleted container IDs。

**建议**：容器域应和 ground/monster 一样具备显式 delta delete 或全量替换语义。

**解决方案**：为 loot container runtime 增加 `deletedContainerIds`；flush 时先删除这些 ID 再 upsert 当前状态；对全量重建场景使用 `replaceContainerStates()`；补 smoke：删除容器后 flush+重启，旧容器不得恢复。

### - [x] P1-17 instance_recovery_watermark 是最后写入者覆盖

**问题**：`saveInstanceRecoveryWatermark()` 和 batch 版本会直接覆盖 `watermark_payload`。虽然当前恢复主要读取真实域表，watermark 不是真源，但诊断、恢复判断和后续 repair 可能被旧 payload 误导。

**原因**：实例 watermark 没有按 domain 分列，也没有 `GREATEST`/merge 语义；玩家 watermark 已经使用 `GREATEST` 防止倒退。

**建议**：实例 watermark 应至少按域记录单调 revision/tick。

**解决方案**：把 watermark JSON 拆成 `tile_cell_revision`、`overlay_revision`、`checkpoint_tick` 等列，或 JSONB merge 时每个 domain 取最大 revision；写入同时校验 ownership_epoch。

### - [x] P2-18 邮件整箱保存仍有全量 prune 入口

**问题**：`MailPersistenceService.saveMailbox()` 会基于完整 mailbox 全量 upsert 并 prune 快照外邮件。当前 mutation 路径有 `saveMailboxMutation()` 按 affected mail 写入，但全量入口仍存在；如果传入 partial mailbox，会删掉未包含邮件。

**原因**：全量入口和增量入口并存，调用方必须保证 mailbox 完整。

**建议**：全量 prune 只用于离线导入/全箱重建；在线操作默认使用 mutation 入口。

**解决方案**：给 `saveMailbox()` 加 `assertCompleteMailbox: true` 参数或改名为 `replaceMailboxSnapshot()`；全局搜索调用方并迁移到 `saveMailboxMutation()`；补 smoke：局部邮件更新不会删除其他邮件。

### - [x] P2-19 宗门通知链路仍有服务端中文拼接

**问题**：宗门链路中多处 `queuePlayerNotice()` 直接拼接中文文本，包括入宗、退宗、扩张、传送等消息。它不是落盘问题，但和本次宗门链路同文件同操作相关，后续改宗门持久化时容易继续新增文本通知。

**原因**：旧通知调用未迁到结构化消息 key + 变量。

**建议**：整改宗门持久化时同步避免扩大技术债，但不要把通知迁移和 P0 持久化修复绑成一个大改。

**解决方案**：已把宗门入宗、审批、退宗、职位、转让、解散、扩张、传送等 `queuePlayerNotice()` 迁为 `notice.sect.*` 结构化 key + vars，并补齐客户端 i18n key/generated 常量。

## 本次修复落地记录

- P0-01：`server_sect` 改为按宗门行级 upsert，使用 `updated_at_ms` CAS；解散宗门记录 tombstone 后按单宗门删除，移除普通保存里的整表删除。
- P0-02：宗门 runtime template 重新注册时比较 `sectMapMinX/MaxX/MinY/MaxY`，边界变化即替换/同步实例模板，不再只看 stable templateId。
- P0-03：新增 `worldRuntimeSectService.flushAllNow()`，shutdown final drain 会清 pending timer 并强刷宗门。
- P0-04：新增 `player_sect_membership` 分域、watermark 和恢复投影；`setPlayerSectId()` 标记 `sect_membership` dirty。
- P0-05：`flushInstanceDomains()` 在写入前和回标前双重 live catalog lease 校验 `assigned_node_id/lease_token/ownership_epoch/lease_expire_at`，失效即 fence 本地实例并保留 dirty。
- P0-06：`instance_checkpoint` 增加 `checkpoint_version`，按 `persistenceRevision/tick/savedAt` 单调 CAS。
- P0-07：overlay dirty 即使 portal 为空也写入空 `runtime_portals` chunk，恢复时明确清空旧 portal。
- P0-08：`purgeInstanceState()` 和 pg restore cleanup 表清单补齐 building/room/fengshui 分域，并扩展 smoke 覆盖。
- P1-09：`instance_catalog` 增加 `metadata_version`，模板/owner/route/shard 等元数据按版本 CAS，旧 epoch upsert 不能覆盖新元数据。
- P1-10：`server_player_snapshot` 兼容表 upsert 增加 `saved_at <= incoming` 保护。
- P1-11：市场失败回滚不再整对象 `restoreSnapshot()`，只回滚本次市场会修改的在线玩家背包/钱包域，避免吞掉宗门、位置、任务等无关内存态。
- P1-12：玩家全量投影入口增加完整性断言；历史快照缺省 `wallet/marketStorage` 时跳过对应资产域，不再默认空数组清库。
- P1-13：artifact 分域新增 `allowArtifactEmptyOverwrite`，显式 `artifacts.slots: []` 可清空旧神器槽。
- P1-14：`wallet`、`market_storage` 行与 watermark 计入 projected state，wallet-only/market-only 数据不会被当成空玩家。
- P1-15：`hydrateRuntimeTiles()` 保留恢复期自愈产生的 `tile_cell` dirty 并推进 revision，下一轮会写回规范化结果。
- P1-16：普通 runtime flush 和异步 flush payload 的 `container_state` 改走 `replaceContainerStates()`，当前列表为空也会删除旧容器行。
- P1-17：`instance_recovery_watermark` 增加 `watermark_version`，单条和批量写入都按版本 CAS。
- P2-18：`MailPersistenceService.saveMailbox()` 在邮箱锁内增加 revision fence 和空全量覆盖保护；邮件行按 `mail_version` CAS，counter 按 `counter_version` CAS。
- P2-19：宗门运行时通知迁为 `buildStructuredNotice()`，补齐 `notice.sect.*` 客户端 i18n key，避免继续新增纯文本宗门通知。

## 已具备防线

### - [x] S-01 玩家主线 flush 已退役旧整档 snapshot

**问题**：历史上玩家旧整档 snapshot 可能覆盖新分域数据。

**原因**：旧主线曾把完整玩家对象写入 `server_player_snapshot`。

**建议**：玩家在线刷盘只能写结构化分域表，未知 dirty 域必须失败并保留 dirty。

**解决方案**：当前 `PlayerPersistenceFlushService` 注释和实现都明确“硬切后只写分域表”，并通过 `savePlayerSnapshotProjectionDomains()` 写 dirty domains；遇到 fallback `snapshot` 或非 projectable dirty domain 会抛 `player_domain_delta_required`，不会退回整包写入。`persistence-retirement-audit.ts` 也禁止 `player-persistence-flush.service.ts` 调用旧 `savePlayerSnapshot()`。

### - [x] S-02 玩家空白角色覆盖老档已有恢复水位保护

**问题**：PG 读取失败或误判新玩家时，starter snapshot 可能覆盖已有老玩家。

**原因**：新角色默认模板和老玩家 ID 发生冲突时，缺少最后一道“老数据存在”判断。

**建议**：落库前检查恢复水位，发现老玩家 row 时拒绝空白覆盖。

**解决方案**：当前 `PlayerPersistenceFlushService` 在玩家未从持久化 hydrate 时调用 `hasRecoveryWatermark()`；有 watermark 就拒绝写入。`player_recovery_watermark` 使用 `GREATEST` 更新，避免版本倒退。

### - [x] S-03 玩家分域 markPersisted 不会吞掉 IO 期间的新 dirty

**问题**：flush 过程中玩家又发生新 mutation 时，完成旧 IO 后如果直接 mark all persisted，会丢掉新 dirty。

**原因**：异步 IO 前后的 `persistentRevision` 可能变化。

**建议**：flush 前记录 snapshotRevision，只清除已经成功写入且版本不超过 snapshotRevision 的域。

**解决方案**：当前 `flushResolvedPlayerDomains()` 在 IO 前读取 `snapshotRevision`，写库成功后 `markPersisted(playerId, persistedDomains, snapshotRevision)`；`PlayerRuntimeService.markPersisted()` 只清除指定域，并基于 revision 收敛 persistedRevision。

### - [x] S-04 地图旧整档 snapshot 写入已退役

**问题**：旧 map snapshot 如果继续参与恢复或保存，会把实例分域状态覆盖回旧整档。

**原因**：历史上地图持久化可能依赖 `persistent_documents` 整包 map snapshot。

**建议**：地图主线只读写 instance domain 表，旧 snapshot 恢复/写入必须被审计禁止。

**解决方案**：当前 `MapPersistenceFlushService.isLegacySnapshotWriteEnabled()` 固定返回 false；`persistence-retirement-audit.ts` 禁止运行时/lease helper 回读旧 map snapshot，也禁止 map flush 写旧 snapshot。

### - [x] S-05 ground item 域具备按 tile 删除语义

**问题**：地面物品过期或拾取后，如果只 upsert 当前物品，不删除旧 tile 行，会重启复活。

**原因**：地面掉落是高频增量域，必须表达 tile 级空集合。

**建议**：dirty tile 替换当前 tile 的所有掉落，空 tile 也要删除旧行。

**解决方案**：当前 `buildGroundPersistenceDelta()` 记录 dirty tile；`replaceGroundItemTiles()` 先删除 dirty tile 下旧行，再插入当前条目；全量场景有 `replaceGroundItems()` 删除快照外行。

### - [x] S-06 monster_runtime 域具备删除 delta 和占位索引恢复

**问题**：妖兽死亡、刷新或位置恢复后，如果旧 runtime 行/占位索引残留，会导致怪物复活或占位错误。

**原因**：妖兽运行态是增量域，需要 upsert/delete 双向表达。

**建议**：恢复时重建 runtimeId 到 tile 的索引；flush 时对 mortal/缺失 runtime 写 deletes。

**解决方案**：当前 `buildMonsterRuntimePersistenceDelta()` 会为缺失或不应持久化的 runtimeId 产生 deletes；`hydrateMonsterRuntimeStates()` 会先清旧 runtime tile index，再按恢复位置重建索引。

## 建议整改顺序

1. 先修 P0-01、P0-02、P0-03、P0-04：这是当前宗门扩张回退最可能的组合原因。
2. 再修 P0-05、P0-06、P0-07、P0-08：这是跨节点、重启恢复和删除不彻底导致旧状态复活的基础防线。
3. 再收敛 P1 玩家旧整包/全量投影风险：降低未来误用造成的覆盖事故。
4. 最后处理 P2 邮件全量入口和通知结构化等边缘技术债。

## 最小验证建议

- 宗门专项 smoke：创建宗门 -> 扩张边界 -> 立即 flush -> 重启/重新 hydrate -> 校验 `server_sect.raw_payload`、template bounds、runtime tile count、可通行边界一致。
- 覆盖竞争 smoke：构造旧 revision 宗门对象和新 revision 宗门对象交错保存，旧 revision 不得覆盖新 revision。
- 实例 lease fence smoke：旧 ownership_epoch writer 和新 ownership_epoch writer 同时写 checkpoint/overlay/tile_cell，旧 writer 必须失败。
- overlay 删除 smoke：删除宗门 portal 后 flush，`instance_overlay_chunk` 不得残留旧 portal，重启后不复活。
- purge cleanup smoke：孤儿 sect instance 的 building/room/fengshui 表执行 restore cleanup 后全部清理。
- 玩家 sect membership smoke：入宗/退宗后只触发 sect membership dirty，flush+重启后玩家 `sectId`、`server_sect.members`、客户端上下文动作一致。
