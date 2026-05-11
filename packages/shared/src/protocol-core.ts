/**
 * 协议域文件：核心（会话、移动、系统、面板）相关 payload 接口。
 * 由 protocol.ts 统一 re-export，外部消费者不需要直接导入本文件。
 */
import type {
  S2C_ContainerDetail,
  S2C_GroundDetail,
  S2C_NpcDetail,
  S2C_MonsterDetail,
  S2C_PanelActionDelta,
  S2C_PanelAttrDelta,
  S2C_PanelBuffDelta,
  S2C_PanelEquipmentDelta,
  S2C_PanelInventoryDelta,
  S2C_PanelTechniqueDelta,
  S2C_PlayerDetail,
  S2C_PortalDetail,
} from './protocol-response-payload-types';
import type { BootstrapView, MapStaticView } from './session-sync-types';
import type { AttrDetailView } from './attr-detail-types';

/** 首次连接引导包：同步自身状态、首屏地图和小地图图鉴。 */
export interface S2C_Bootstrap extends BootstrapView {}

/** 地图静态快照：地图元数据、小地图、静态地块和标记增量。 */
export interface S2C_MapStatic extends MapStaticView {}

/** 面板总增量，按模块拆分下发。首连阶段允许只发 revision 占位，完整面板以 Bootstrap.self 为真源。 */
export interface S2C_PanelDelta {
  /** inv：背包相关增量。 */
  inv?: S2C_PanelInventoryDelta;
  /** eq：装备相关增量。 */
  eq?: S2C_PanelEquipmentDelta;
  /** tech：功法相关增量。 */
  tech?: S2C_PanelTechniqueDelta;
  /** attr：属性相关增量。 */
  attr?: S2C_PanelAttrDelta;
  /** act：行动相关增量。 */
  act?: S2C_PanelActionDelta;
  /** buff：buff相关增量。 */
  buff?: S2C_PanelBuffDelta;
}

/** 通用详情包，根据 kind 携带不同目标的详情。 */
export interface S2C_Detail {
  kind: 'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container';
  id: string;
  error?: string;
  npc?: S2C_NpcDetail;
  monster?: S2C_MonsterDetail;
  player?: S2C_PlayerDetail;
  portal?: S2C_PortalDetail;
  ground?: S2C_GroundDetail;
  container?: S2C_ContainerDetail;
}

/** 属性详情包。 */
export interface S2C_AttrDetail extends AttrDetailView {}
