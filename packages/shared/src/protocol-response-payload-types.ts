import type { LeaderboardView, RealmUpdateView, WorldSummaryView } from './protocol-envelope-types';
import type {
  ContainerDetailView,
  GroundDetailView,
  MonsterDetailView,
  NpcDetailView,
  PlayerDetailView,
  PortalDetailView,
  TileDetailView,
} from './entity-detail-types';
import type { GmStateView } from './gm-runtime-types';
import type { NoticeItemView, NoticeView, SystemMessageView } from './notice-types';
import type {
  BootstrapView,
  EnterView,
  ErrorView,
  InitSessionView,
  InitView,
  LeaveView,
  MapEnterView,
  MapStaticSyncView,
  PongView,
  QuestNavigateResultView,
  RealmView,
} from './session-sync-types';
import type {
  EquipmentUpdateView,
  InventoryUpdateView,
  LootWindowUpdateView,
  MailOpResultView,
  MailPageSyncView,
  MailSummarySyncView,
  MarketItemBookView,
  MarketListingsView,
  MarketOrdersView,
  MarketStorageView,
  MarketTradeHistoryView,
  MarketUpdateView,
  NpcQuestsView,
  NpcShopSyncView,
  QuestUpdateView,
  RedeemCodesResultView,
  SuggestionUpdateView,
  TileRuntimeDetailView,
} from './service-sync-types';
import type {
  GroundItemPilePatchView,
  SelfDeltaView,
  TickRenderEntityView,
  TickView,
  VisibleTilePatchView,
  WorldContainerPatchView,
  WorldDeltaView,
  WorldGroundPatchView,
  WorldMonsterPatchView,
  WorldNpcPatchView,
  WorldPlayerPatchView,
  WorldPortalPatchView,
} from './world-patch-types';
import type {
  ActionsUpdateView,
  ActionUpdateEntryView,
  AttrUpdateView,
  PanelActionDeltaView,
  PanelAttrDeltaView,
  PanelBuffDeltaView,
  PanelTechniqueDeltaView,
  TechniqueUpdateEntryView,
  TechniqueUpdateView,
} from './panel-update-types';
import type {
  PanelEquipmentDeltaView,
  PanelInventoryDeltaView,
} from './synced-panel-types';

/** 战利品窗口增量：同步当前可拾取源与条目。 */
export interface NEXT_S2C_LootWindowUpdate extends LootWindowUpdateView {}
/** 任务自动导航回执：返回自动寻路是否成功。 */
export interface NEXT_S2C_QuestNavigateResult extends QuestNavigateResultView {}
/** 兑换码兑换结果：返回每个兑换码的奖励结果。 */
export interface NEXT_S2C_RedeemCodesResult extends RedeemCodesResultView {}
/** GM 总览状态：在线玩家、地图列表、机器人数量和性能快照。 */
export interface NEXT_S2C_GmState extends GmStateView {}
/** 会话初始化包：下发会话 ID、角色 ID 和服务器时间。 */
export interface NEXT_S2C_InitSession extends InitSessionView {}
/** 地图进入包：同步地图实例、地图基础信息和进入坐标。 */
export interface NEXT_S2C_MapEnter extends MapEnterView {}
/** 单条通知消息，支持持久化待确认标记。 */
export interface NEXT_S2C_NoticeItem extends NoticeItemView {}
/** 通知消息批次。 */
export interface NEXT_S2C_Notice extends NoticeView {}
/** 境界面板快照。 */
export interface NEXT_S2C_Realm extends RealmView {}
/** 世界增量中的玩家实体补丁。 */
export interface NEXT_S2C_WorldPlayerPatch extends WorldPlayerPatchView {}
/** 世界增量中的怪物实体补丁。 */
export interface NEXT_S2C_WorldMonsterPatch extends WorldMonsterPatchView {}
/** 世界增量中的 NPC 实体补丁。 */
export interface NEXT_S2C_WorldNpcPatch extends WorldNpcPatchView {}
/** 世界增量中的传送点补丁。 */
export interface NEXT_S2C_WorldPortalPatch extends WorldPortalPatchView {}
/** 世界增量中的地面掉落补丁。 */
export interface NEXT_S2C_WorldGroundPatch extends WorldGroundPatchView {}
/** 世界增量中的容器实体补丁。 */
export interface NEXT_S2C_WorldContainerPatch extends WorldContainerPatchView {}
/** 世界增量包：同步可见实体、战斗特效、路径、时间和地图局部补丁。 */
export interface NEXT_S2C_WorldDelta extends WorldDeltaView {
  p?: NEXT_S2C_WorldPlayerPatch[];
  m?: NEXT_S2C_WorldMonsterPatch[];
  n?: NEXT_S2C_WorldNpcPatch[];
  o?: NEXT_S2C_WorldPortalPatch[];
  g?: NEXT_S2C_WorldGroundPatch[];
  c?: NEXT_S2C_WorldContainerPatch[];
  tp?: VisibleTilePatch[];
}
/** 自身状态增量：位置、朝向、生命和灵力。 */
export interface NEXT_S2C_SelfDelta extends SelfDeltaView {}
/** 背包面板增量。 */
export interface NEXT_S2C_PanelInventoryDelta extends PanelInventoryDeltaView {}
/** 装备面板增量。 */
export interface NEXT_S2C_PanelEquipmentDelta extends PanelEquipmentDeltaView {}
/** 功法面板增量。 */
export interface NEXT_S2C_PanelTechniqueDelta extends PanelTechniqueDeltaView {
  techniques?: TechniqueUpdateEntry[];
}
/** 属性面板增量。 */
export interface NEXT_S2C_PanelAttrDelta extends PanelAttrDeltaView {}
/** 行动面板增量。 */
export interface NEXT_S2C_PanelActionDelta extends PanelActionDeltaView {
  actions?: ActionUpdateEntry[];
}
/** Buff 面板增量。 */
export interface NEXT_S2C_PanelBuffDelta extends PanelBuffDeltaView {}
/** 服务端立即回显延迟探测 */
export interface NEXT_S2C_Pong extends PongView {}
/** Tick 增量实体数据（支持 null 表示清除字段） */
export interface TickRenderEntity extends TickRenderEntityView {}
/** 地面物品堆增量补丁 */
export interface GroundItemPilePatch extends GroundItemPilePatchView {}
/** 视野内地块增量补丁 */
export interface VisibleTilePatch extends VisibleTilePatchView {}
/** 高频 tick 增量：同步可见实体、地面物品、战斗特效和剩余路径。 */
export interface NEXT_S2C_Tick extends TickView {
  p: TickRenderEntity[];
  t?: VisibleTilePatch[];
  e: TickRenderEntity[];
  g?: GroundItemPilePatch[];
}
/** 地图静态同步：低频重同步地图元数据、小地图与静态标记。 */
export interface NEXT_S2C_MapStaticSync extends MapStaticSyncView {
  tilePatches?: VisibleTilePatch[];
}
/** 实体进入视野的单条事件。 */
export interface NEXT_S2C_Enter extends EnterView {}
/** 实体离开视野的单条事件。 */
export interface NEXT_S2C_Leave extends LeaveView {}
/** 连接成功后的首屏初始化数据。 */
export interface NEXT_S2C_Init extends InitView {}
/** 错误响应。 */
export interface NEXT_S2C_Error extends ErrorView {}
/** 属性面板低频更新。 */
export interface NEXT_S2C_AttrUpdate extends AttrUpdateView {}
/** 境界低频同步：完整下发当前境界展示、突破与开天门详情。 */
export interface NEXT_S2C_RealmUpdate extends RealmUpdateView {}
/** 背包面板更新。 */
export interface NEXT_S2C_InventoryUpdate extends InventoryUpdateView {}
/** 装备面板更新。 */
export interface NEXT_S2C_EquipmentUpdate extends EquipmentUpdateView {}
/** 功法面板局部更新项。 */
export interface TechniqueUpdateEntry extends TechniqueUpdateEntryView {}
/** 功法面板更新。 */
export interface NEXT_S2C_TechniqueUpdate extends TechniqueUpdateView {
  techniques: TechniqueUpdateEntry[];
}
/** 行动面板局部更新项。 */
export interface ActionUpdateEntry extends ActionUpdateEntryView {}
/** 行动面板更新。 */
export interface NEXT_S2C_ActionsUpdate extends ActionsUpdateView {
  actions: ActionUpdateEntry[];
}
/** NPC 商店同步包。 */
export interface NEXT_S2C_NpcShop extends NpcShopSyncView {}
/** 坊市首页同步包。 */
export interface NEXT_S2C_MarketUpdate extends MarketUpdateView {}
/** 坊市分页列表。 */
export interface NEXT_S2C_MarketListings extends MarketListingsView {}
/** 玩家自己的坊市订单列表。 */
export interface NEXT_S2C_MarketOrders extends MarketOrdersView {}
/** 坊市寄存仓库同步。 */
export interface NEXT_S2C_MarketStorage extends MarketStorageView {}
/** 单个物品的坊市订单簿。 */
export interface NEXT_S2C_MarketItemBook extends MarketItemBookView {}
/** 坊市成交历史分页。 */
export interface NEXT_S2C_MarketTradeHistory extends MarketTradeHistoryView {}
/** NPC 可接任务列表。 */
export interface NEXT_S2C_NpcQuests extends NpcQuestsView {}
/** 传送点详情包。 */
export interface NEXT_S2C_PortalDetail extends PortalDetailView {}
/** 地面掉落详情包。 */
export interface NEXT_S2C_GroundDetail extends GroundDetailView {}
/** 容器详情包。 */
export interface NEXT_S2C_ContainerDetail extends ContainerDetailView {}
/** NPC 详情包。 */
export interface NEXT_S2C_NpcDetail extends NpcDetailView {}
/** 怪物详情包。 */
export interface NEXT_S2C_MonsterDetail extends MonsterDetailView {}
/** 玩家详情包。 */
export interface NEXT_S2C_PlayerDetail extends PlayerDetailView {}
/** 地块详情包。 */
export interface NEXT_S2C_TileDetail extends TileDetailView {
  portal?: NEXT_S2C_PortalDetail;
  ground?: NEXT_S2C_GroundDetail;
}
/** 地块运行时详情包，供 GM 或调试面板查看。 */
export interface NEXT_S2C_TileRuntimeDetail extends TileRuntimeDetailView {}
/** 任务列表更新。 */
export interface NEXT_S2C_QuestUpdate extends QuestUpdateView {}
/** 排行榜同步包。 */
export interface NEXT_S2C_Leaderboard extends LeaderboardView {}
/** 世界概览同步包。 */
export interface NEXT_S2C_WorldSummary extends WorldSummaryView {}
/** 系统消息，支持浮字展示。 */
export interface NEXT_S2C_SystemMsg extends SystemMessageView {}
/** 邮件摘要同步包。 */
export interface NEXT_S2C_MailSummary extends MailSummarySyncView {}
/** 邮件分页同步包。 */
export interface NEXT_S2C_MailPage extends MailPageSyncView {}
/** 邮件操作结果。 */
export interface NEXT_S2C_MailOpResult extends MailOpResultView {}
/** 建议列表更新。 */
export interface NEXT_S2C_SuggestionUpdate extends SuggestionUpdateView {}
