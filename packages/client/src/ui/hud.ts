/**
 * 角色状态 HUD
 * 显示名称、坐标、地图、境界、气血/灵力/修炼进度条及突破按钮
 */

import { PlayerState, resolveCharacterAge } from '@mud/shared';
import { formatDisplayCurrentMax, formatDisplayInteger } from '../utils/number';

interface HUDMeta {
  mapName?: string;
  mapDanger?: string;
  realmLabel?: string;
  realmReviewLabel?: string;
  realmActionLabel?: string;
  showRealmAction?: boolean;
  realmProgressLabel?: string;
  objectiveLabel?: string;
  threatLabel?: string;
  boneAgeLabel?: string;
  lifespanLabel?: string;
  titleLabel?: string;
}

export class HUD {
  private nameDiv = document.getElementById('hud-name')!;
  private titleDiv = document.getElementById('hud-title')!;
  private posDiv = document.getElementById('hud-pos')!;
  private mapDiv = document.getElementById('hud-map')!;
  private objectiveDiv = document.getElementById('hud-objective')!;
  private threatDiv = document.getElementById('hud-threat')!;
  private realmValue = document.getElementById('hud-realm')!;
  private realmSub = document.getElementById('hud-realm-sub')!;
  private breakthroughButton = document.getElementById('hud-breakthrough') as HTMLButtonElement | null;
  private hpText = document.getElementById('hud-hp-text')!;
  private hpBar = document.getElementById('hud-hp-bar')!;
  private qiText = document.getElementById('hud-qi-text')!;
  private qiBar = document.getElementById('hud-qi-bar')!;
  private cultivateText = document.getElementById('hud-cultivate')!;
  private cultivateBar = document.getElementById('hud-cultivate-bar')!;
  private onBreakthrough: (() => void) | null = null;

  constructor() {
    this.breakthroughButton?.addEventListener('click', () => {
      this.onBreakthrough?.();
    });
  }

  setCallbacks(onBreakthrough: () => void): void {
    this.onBreakthrough = onBreakthrough;
  }

  /** 根据玩家状态刷新所有 HUD 元素 */
  update(player: PlayerState, meta?: HUDMeta) {
    this.nameDiv.textContent = player.displayName ?? player.name;
    this.titleDiv.textContent = meta?.titleLabel ?? '无号散修';
    this.posDiv.textContent = `(${player.x}, ${player.y})`;
    this.mapDiv.textContent = meta?.mapDanger ? `${meta.mapName ?? player.mapId} · ${meta.mapDanger}` : (meta?.mapName ?? player.mapId);
    this.objectiveDiv.textContent = meta?.boneAgeLabel ?? this.buildBoneAgeLabel(player);
    this.threatDiv.textContent = meta?.lifespanLabel ?? this.buildLifespanLabel(player);

    const realmLabel = meta?.realmLabel ?? player.realm?.displayName ?? player.realmName ?? player.realmStage ?? '-';
    this.realmValue.textContent = realmLabel;
    const realmReviewLabel = meta?.realmReviewLabel ?? player.realm?.review ?? player.realmReview ?? '-';
    this.realmSub.textContent = realmReviewLabel;
    const breakthroughPreview = player.realm?.breakthrough;
    if (this.breakthroughButton) {
      const canBreakthrough = player.realm?.breakthroughReady && breakthroughPreview;
      const showRealmAction = meta?.showRealmAction ?? canBreakthrough;
      this.breakthroughButton.hidden = !showRealmAction;
      this.breakthroughButton.textContent = meta?.realmActionLabel ?? (canBreakthrough ? `突破 · ${breakthroughPreview.targetDisplayName}` : '突破');
      this.breakthroughButton.disabled = !showRealmAction;
    }

    this.setResource(this.hpBar, this.hpText, player.hp, player.maxHp);
    const qiMax = Math.max(0, Math.round(player.numericStats?.maxQi ?? 0));
    const qiCurrent = Math.max(0, Math.round(player.qi));
    this.setResource(this.qiBar, this.qiText, qiCurrent, qiMax);

    if (player.realm && player.realm.progressToNext > 0) {
      const ratio = Math.min(1, player.realm.progress / player.realm.progressToNext);
      this.cultivateBar.style.width = `${Math.round(ratio * 100)}%`;
      this.cultivateText.textContent = `境界经验 (${formatDisplayInteger(player.realm.progress)}/${formatDisplayInteger(player.realm.progressToNext)})`;
    } else {
      this.cultivateBar.style.width = '0%';
      this.cultivateText.textContent = '境界经验 (已满)';
    }
  }

  private setResource(bar: HTMLElement, text: HTMLElement, value: number, max: number) {
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    bar.style.width = `${Math.round(ratio * 100)}%`;
    text.textContent = formatDisplayCurrentMax(Math.max(0, Math.round(value)), Math.max(0, Math.round(max)));
  }

  private buildBoneAgeLabel(player: PlayerState): string {
    const age = resolveCharacterAge(player);
    return age.days > 0
      ? `${formatDisplayInteger(age.years)} 岁零 ${formatDisplayInteger(age.days)} 天`
      : `${formatDisplayInteger(age.years)} 岁`;
  }

  private buildLifespanLabel(player: PlayerState): string {
    const lifespanYears = player.lifespanYears ?? player.realm?.lifespanYears ?? null;
    if (lifespanYears == null || lifespanYears <= 0) {
      return '???';
    }
    return `${formatDisplayInteger(lifespanYears)} 岁`;
  }
}
