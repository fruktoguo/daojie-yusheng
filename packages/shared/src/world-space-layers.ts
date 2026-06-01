/**
 * 本文件定义世界空间分层的共享语义，供服务端权威运行时、网络投影和客户端渲染统一口径。
 *
 * 这里描述的是“对象属于哪一类世界空间层”，不是协议拆包格式，也不是 Canvas 的具体绘制实现。
 */
import type { CellLayerTarget } from './map-layer-types';

export const WORLD_SPACE_LAYER_KEYS = [
  'base_space',
  'mobile_entity',
  'presentation',
] as const;

export type WorldSpaceLayerKey = (typeof WORLD_SPACE_LAYER_KEYS)[number];

export const BASE_SPACE_CELL_LAYER_KEYS = [
  'terrain',
  'surface',
  'structure',
  'ground_interactable',
] as const;

export type BaseSpaceCellLayerKey = (typeof BASE_SPACE_CELL_LAYER_KEYS)[number];

export const GROUND_INTERACTABLE_OBJECT_KINDS = [
  'building',
  'container',
  'formation',
  'portal',
  'mechanism',
] as const;

export type GroundInteractableObjectKind = (typeof GROUND_INTERACTABLE_OBJECT_KINDS)[number];

export const MOBILE_ENTITY_OBJECT_KINDS = [
  'player',
  'npc',
  'monster',
  'crowd',
] as const;

export type MobileEntityObjectKind = (typeof MOBILE_ENTITY_OBJECT_KINDS)[number];

export const WORLD_OBJECT_KINDS = [
  ...GROUND_INTERACTABLE_OBJECT_KINDS,
  ...MOBILE_ENTITY_OBJECT_KINDS,
] as const;

export type WorldObjectKind = (typeof WORLD_OBJECT_KINDS)[number];

export const PRESENTATION_LAYER_KINDS = [
  'preview',
  'overlay',
  'highlight',
  'effect',
  'mask',
  'floating_text',
] as const;

export type PresentationLayerKind = (typeof PRESENTATION_LAYER_KINDS)[number];

const groundInteractableObjectKindSet = new Set<string>(GROUND_INTERACTABLE_OBJECT_KINDS);
const mobileEntityObjectKindSet = new Set<string>(MOBILE_ENTITY_OBJECT_KINDS);
const worldObjectKindSet = new Set<string>(WORLD_OBJECT_KINDS);

export function isWorldObjectKind(kind: string | null | undefined): kind is WorldObjectKind {
  return typeof kind === 'string' && worldObjectKindSet.has(kind);
}

export function isGroundInteractableObjectKind(kind: string | null | undefined): kind is GroundInteractableObjectKind {
  return typeof kind === 'string' && groundInteractableObjectKindSet.has(kind);
}

export function isMobileEntityObjectKind(kind: string | null | undefined): kind is MobileEntityObjectKind {
  return typeof kind === 'string' && mobileEntityObjectKindSet.has(kind);
}

export function isGroundInteractableCellLayerTarget(target: CellLayerTarget | string | null | undefined): boolean {
  return target === 'interactable';
}

export function resolveWorldObjectSpaceLayer(kind: string | null | undefined): 'ground_interactable' | 'mobile_entity' {
  if (isMobileEntityObjectKind(kind)) {
    return 'mobile_entity';
  }
  return 'ground_interactable';
}

export function isAttackableGroundInteractableObjectKind(kind: string | null | undefined): boolean {
  return kind === 'container' || kind === 'formation' || kind === 'building';
}

export function resolveWorldObjectRenderOrder(kind: string | null | undefined): number {
  switch (kind) {
    case 'formation':
      return 10;
    case 'building':
      return 20;
    case 'container':
      return 30;
    case 'portal':
      return 40;
    case 'mechanism':
      return 50;
    case 'npc':
      return 100;
    case 'monster':
      return 110;
    case 'crowd':
      return 120;
    case 'player':
      return 130;
    default:
      return 50;
  }
}
