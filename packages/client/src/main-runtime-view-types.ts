import type { MonsterTier, PlayerState, RenderEntity } from '@mud/shared-next';

export type MainRuntimeObservedEntity = {
  id: string;
  wx: number;
  wy: number;
  char: string;
  color: string;
  name?: string;
  kind?: string;
  monsterTier?: MonsterTier;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: RenderEntity['npcQuestMarker'];
  observation?: RenderEntity['observation'];
  buffs?: PlayerState['temporaryBuffs'];
};

export function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}

export function isPlayerLikeEntityKind(kind: string | null | undefined): boolean {
  return kind === 'player' || isCrowdEntityKind(kind);
}
