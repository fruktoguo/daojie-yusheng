import type { MonsterTier, VisibleBuffState } from './world-core-types';
import type { ItemStack } from './item-runtime-types';
import type { ObservedTileEntityDetail } from './detail-view-types';
import type { ObservationInsight } from './observation-types';
import type { NpcQuestMarker } from './world-view-types';

/**
 * 低频实体/地块详情投影视图，供协议层和客户端详情面板共用。
 */

export interface PortalDetailView {
  id: string;
  x: number;
  y: number;
  kind?: string;
  targetMapId: string;
  targetMapName?: string;
  targetX?: number;
  targetY?: number;
  trigger?: 'manual' | 'auto';
}

export interface GroundDetailView {
  sourceId: string;
  x: number;
  y: number;
  items: ItemStack[];
}

export interface ContainerDetailView {
  id: string;
  name: string;
  x: number;
  y: number;
  grade: number;
  desc?: string;
}

export interface NpcDetailView {
  id: string;
  name: string;
  char: string;
  color: string;
  x: number;
  y: number;
  dialogue: string;
  role?: string;
  hasShop?: 1;
  questCount?: number;
  questMarker?: NpcQuestMarker | null;
  observation?: ObservationInsight;
}

export interface MonsterDetailView {
  id: string;
  mid: string;
  name: string;
  char: string;
  color: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  tier: MonsterTier;
  alive: boolean;
  respawnTicks?: number;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

export interface PlayerDetailView {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  observation?: ObservationInsight;
  buffs?: VisibleBuffState[];
}

export interface TileDetailView {
  x: number;
  y: number;
  aura?: number;
  safeZone?: {
    x: number;
    y: number;
    radius: number;
  };
  portal?: PortalDetailView;
  ground?: GroundDetailView;
  entities?: ObservedTileEntityDetail[];
  error?: string;
}
