/**
 * 角色状态 HUD
 * 显示名称、坐标、地图、境界、气血/灵力/修炼进度条及突破按钮
 */

import { PlayerState, resolveCharacterAge } from '@mud/shared';
import { formatDisplayCurrentMax, formatDisplayInteger } from '../utils/number';

/** HUDMeta：HUD 附加显示元数据。 */
interface HUDMeta {
/**
 * mapName：地图名称名称或显示文本。
 */

  mapName?: string;  
  /**
 * mapDanger：地图Danger相关字段。
 */

  mapDanger?: string;  
  /**
 * realmLabel：realmLabel名称或显示文本。
 */

  realmLabel?: string;  
  /**
 * realmReviewLabel：realmReviewLabel名称或显示文本。
 */

  realmReviewLabel?: string;  
  /**
 * realmActionLabel：realmActionLabel名称或显示文本。
 */

  realmActionLabel?: string;  
  /**
 * showRealmAction：showRealmAction相关字段。
 */

  showRealmAction?: boolean;  
  /**
 * realmProgressLabel：realm进度Label名称或显示文本。
 */

  realmProgressLabel?: string;  
  /**
 * objectiveLabel：objectiveLabel名称或显示文本。
 */

  objectiveLabel?: string;  
  /**
 * threatLabel：threatLabel名称或显示文本。
 */

  threatLabel?: string;  
  /**
 * boneAgeLabel：boneAgeLabel名称或显示文本。
 */

  boneAgeLabel?: string;  
  /**
 * lifespanLabel：lifespanLabel名称或显示文本。
 */

  lifespanLabel?: string;  
  /**
 * titleLabel：titleLabel名称或显示文本。
 */

  titleLabel?: string;
}

/** HUD：HUD实现。 */
export class HUD {
  /** nameDiv：名称Div。 */
  private nameDiv = document.getElementById('hud-name')!;
  /** titleDiv：标题Div。 */
  private titleDiv = document.getElementById('hud-title')!;
  /** posDiv：pos Div。 */
  private posDiv = document.getElementById('hud-pos')!;
  /** mapDiv：地图Div。 */
  private mapDiv = document.getElementById('hud-map')!;
  /** objectiveDiv：objective Div。 */
  private objectiveDiv = document.getElementById('hud-objective')!;
  /** threatDiv：threat Div。 */
  private threatDiv = document.getElementById('hud-threat')!;
  /** realmValue：境界值。 */
  private realmValue = document.getElementById('hud-realm')!;
  /** realmSub：境界Sub。 */
  private realmSub = document.getElementById('hud-realm-sub')!;
  /** breakthroughButton：breakthrough按钮。 */
  private breakthroughButton = document.getElementById('hud-breakthrough') as HTMLButtonElement | null;
  /** hpText：hp文本。 */
  private hpText = document.getElementById('hud-hp-text')!;
  /** hpBar：hp Bar。 */
  private hpBar = document.getElementById('hud-hp-bar')!;
  /** qiText：qi文本。 */
  private qiText = document.getElementById('hud-qi-text')!;
  /** qiBar：qi Bar。 */
  private qiBar = document.getElementById('hud-qi-bar')!;
  /** cultivateText：cultivate文本。 */
  private cultivateText = document.getElementById('hud-cultivate')!;
  /** cultivateBar：cultivate Bar。 */
  private cultivateBar = document.getElementById('hud-cultivate-bar')!;
  /** onBreakthrough：on Breakthrough。 */
  private onBreakthrough: (() => void) | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.breakthroughButton?.addEventListener('click', () => {
      this.onBreakthrough?.();
    });
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onBreakthrough () => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(onBreakthrough: () => void): void {
    this.onBreakthrough = onBreakthrough;
  }

  /** 根据玩家状态刷新所有 HUD 元素 */
  update(player: PlayerState, meta?: HUDMeta) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      this.cultivateText.textContent = `境界修为 (${formatDisplayInteger(player.realm.progress)}/${formatDisplayInteger(player.realm.progressToNext)})`;
    } else {
      this.cultivateBar.style.width = '0%';
      this.cultivateText.textContent = '境界圆满';
    }
  }

  /** setResource：处理set资源。 */
  private setResource(bar: HTMLElement, text: HTMLElement, value: number, max: number) {
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    bar.style.width = `${Math.round(ratio * 100)}%`;
    text.textContent = formatDisplayCurrentMax(Math.max(0, Math.round(value)), Math.max(0, Math.round(max)));
  }

  /** buildBoneAgeLabel：构建Bone Age标签。 */
  private buildBoneAgeLabel(player: PlayerState): string {
    const age = resolveCharacterAge(player);
    return age.days > 0
      ? `${formatDisplayInteger(age.years)}载${formatDisplayInteger(age.days)}日`
      : `${formatDisplayInteger(age.years)}载`;
  }

  /** buildLifespanLabel：构建Lifespan标签。 */
  private buildLifespanLabel(player: PlayerState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const lifespanYears = player.lifespanYears ?? player.realm?.lifespanYears ?? null;
    if (lifespanYears == null || lifespanYears <= 0) {
      return '???';
    }
    return `${formatDisplayInteger(lifespanYears)}载`;
  }
}
