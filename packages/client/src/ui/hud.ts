/**
 * 角色状态 HUD
 * 显示名称、坐标、地图、境界、气血/灵力/修炼进度条及突破按钮
 */

import { PlayerState, resolveCharacterAge } from '@mud/shared';
import { formatDisplayCurrentMax, formatDisplayInteger } from '../utils/number';
import { t } from './i18n';
import {
  mountReactHudCornerActions,
  mountReactHudLinkActions,
  mountReactHudStatus,
  setReactHudBreakthroughHandler,
  syncReactHudStatus,
  type ReactHudStatusState,
} from '../react-ui/shell/HudStatus';

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
  /** useReactHud：是否由 React 接管 HUD 状态展示。 */
  private readonly useReactHud: boolean;

  /** HUD 最近一次写入的显示签名，做短路避免无意义的 DOM 写入。 */
  private lastSignatures: Record<string, string> = Object.create(null);  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    const hudRoot = document.getElementById('hud')!;
    this.useReactHud = mountReactHudStatus(hudRoot);
    mountReactHudLinkActions(hudRoot);
    mountReactHudCornerActions(hudRoot);
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
    setReactHudBreakthroughHandler(onBreakthrough);
  }

  /** 根据玩家状态刷新所有 HUD 元素 */
  update(player: PlayerState, meta?: HUDMeta) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const state = this.buildReactHudStatus(player, meta);
    if (this.useReactHud) {
      syncReactHudStatus(state);
      return;
    }

    this.setText(this.nameDiv, 'name', player.displayName ?? player.name);
    this.setText(this.titleDiv, 'title', meta?.titleLabel ?? t('hud.title.default', undefined));
    this.setText(this.posDiv, 'pos', `(${player.x}, ${player.y})`);
    this.setText(
      this.mapDiv,
      'map',
      meta?.mapDanger ? `${meta.mapName ?? '未知地域'} · ${meta.mapDanger}` : (meta?.mapName ?? '未知地域'),
    );
    this.setText(this.objectiveDiv, 'objective', meta?.boneAgeLabel ?? this.buildBoneAgeLabel(player));
    this.setText(this.threatDiv, 'threat', meta?.lifespanLabel ?? this.buildLifespanLabel(player));

    const realmLabel = meta?.realmLabel ?? player.realm?.displayName ?? player.realmName ?? player.realmStage ?? '-';
    this.setText(this.realmValue, 'realm', realmLabel);
    const realmReviewLabel = meta?.realmReviewLabel ?? player.realm?.review ?? player.realmReview ?? '-';
    this.setText(this.realmSub, 'realm-sub', realmReviewLabel);
    const breakthroughPreview = player.realm?.breakthrough;
    if (this.breakthroughButton) {
      const canBreakthrough = player.realm?.breakthroughReady === true && breakthroughPreview?.canBreakthrough === true;
      const hasSpecialRealmAction = meta?.showRealmAction === true && Boolean(meta.realmActionLabel);
      const isActionAvailable = hasSpecialRealmAction || Boolean(canBreakthrough);
      const showRealmAction = meta?.showRealmAction ?? true;
      const nextHidden = !showRealmAction;
      if (this.breakthroughButton.hidden !== nextHidden) {
        this.breakthroughButton.hidden = nextHidden;
      }
      const nextLabel = meta?.realmActionLabel ?? (
        breakthroughPreview
          ? t('hud.action.breakthrough-target', { target: breakthroughPreview.targetDisplayName })
          : t('hud.action.breakthrough', undefined)
      );
      this.setText(this.breakthroughButton, 'breakthrough-label', nextLabel);
      if (this.breakthroughButton.disabled) {
        this.breakthroughButton.disabled = false;
      }
      const unavailableFlag = isActionAvailable ? '0' : '1';
      if (this.lastSignatures['breakthrough-available'] !== unavailableFlag) {
        this.lastSignatures['breakthrough-available'] = unavailableFlag;
        this.breakthroughButton.classList.toggle('is-unavailable', !isActionAvailable);
        this.breakthroughButton.setAttribute('aria-disabled', isActionAvailable ? 'false' : 'true');
      }
    }

    this.setResource('hp', this.hpBar, this.hpText, player.hp, player.maxHp);
    const qiMax = Math.max(0, Math.round(player.numericStats?.maxQi ?? 0));
    const qiCurrent = Math.max(0, Math.round(player.qi));
    this.setResource('qi', this.qiBar, this.qiText, qiCurrent, qiMax);

    if (player.realm && player.realm.progressToNext > 0) {
      const ratio = Math.min(1, player.realm.progress / player.realm.progressToNext);
      const nextWidth = `${Math.round(ratio * 100)}%`;
      if (this.lastSignatures['cultivate-width'] !== nextWidth) {
        this.lastSignatures['cultivate-width'] = nextWidth;
        this.cultivateBar.style.width = nextWidth;
      }
      const current = formatDisplayInteger(player.realm.progress);
      const next = formatDisplayInteger(player.realm.progressToNext);
      this.setText(this.cultivateText, 'cultivate-text', t('hud.cultivate.progress', { current, next }));
    } else {
      if (this.lastSignatures['cultivate-width'] !== '0%') {
        this.lastSignatures['cultivate-width'] = '0%';
        this.cultivateBar.style.width = '0%';
      }
      this.setText(this.cultivateText, 'cultivate-text', t('hud.cultivate.complete', undefined));
    }
  }

  private buildReactHudStatus(player: PlayerState, meta?: HUDMeta): ReactHudStatusState {
    const realmLabel = meta?.realmLabel ?? player.realm?.displayName ?? player.realmName ?? player.realmStage ?? '-';
    const realmReviewLabel = meta?.realmReviewLabel ?? player.realm?.review ?? player.realmReview ?? '-';
    const breakthroughPreview = player.realm?.breakthrough;
    const canBreakthrough = player.realm?.breakthroughReady === true && breakthroughPreview?.canBreakthrough === true;
    const hasSpecialRealmAction = meta?.showRealmAction === true && Boolean(meta.realmActionLabel);
    const realmActionAvailable = hasSpecialRealmAction || Boolean(canBreakthrough);
    const showRealmAction = meta?.showRealmAction ?? true;
    const realmActionLabel = meta?.realmActionLabel ?? (
      breakthroughPreview
        ? t('hud.action.breakthrough-target', { target: breakthroughPreview.targetDisplayName })
        : t('hud.action.breakthrough', undefined)
    );
    const hp = this.buildResource(player.hp, player.maxHp);
    const qiMax = Math.max(0, Math.round(player.numericStats?.maxQi ?? 0));
    const qiCurrent = Math.max(0, Math.round(player.qi));
    const qi = this.buildResource(qiCurrent, qiMax);
    const cultivate = this.buildCultivate(player);

    return {
      name: player.displayName ?? player.name,
      title: meta?.titleLabel ?? t('hud.title.default', undefined),
      position: `(${player.x}, ${player.y})`,
      map: meta?.mapDanger ? `${meta.mapName ?? '未知地域'} · ${meta.mapDanger}` : (meta?.mapName ?? '未知地域'),
      objective: meta?.boneAgeLabel ?? this.buildBoneAgeLabel(player),
      threat: meta?.lifespanLabel ?? this.buildLifespanLabel(player),
      realmLabel,
      realmReviewLabel,
      realmActionLabel,
      showRealmAction,
      realmActionAvailable,
      hpText: hp.text,
      hpWidth: hp.width,
      qiText: qi.text,
      qiWidth: qi.width,
      cultivateText: cultivate.text,
      cultivateWidth: cultivate.width,
    };
  }

  private buildResource(value: number, max: number): { text: string; width: string } {
    const roundedValue = Math.max(0, Math.round(value));
    const roundedMax = Math.max(0, Math.round(max));
    const ratio = roundedMax <= 0 ? 0 : Math.max(0, Math.min(1, roundedValue / roundedMax));
    return {
      text: formatDisplayCurrentMax(roundedValue, roundedMax),
      width: `${Math.round(ratio * 100)}%`,
    };
  }

  private buildCultivate(player: PlayerState): { text: string; width: string } {
    if (player.realm && player.realm.progressToNext > 0) {
      const ratio = Math.min(1, player.realm.progress / player.realm.progressToNext);
      const current = formatDisplayInteger(player.realm.progress);
      const next = formatDisplayInteger(player.realm.progressToNext);
      return {
        text: t('hud.cultivate.progress', { current, next }),
        width: `${Math.round(ratio * 100)}%`,
      };
    }
    return {
      text: t('hud.cultivate.complete', undefined),
      width: '0%',
    };
  }

  /** setResource：处理set资源。 */
  private setResource(prefix: string, bar: HTMLElement, text: HTMLElement, value: number, max: number) {
    const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    const nextWidth = `${Math.round(ratio * 100)}%`;
    const widthKey = `${prefix}-width`;
    if (this.lastSignatures[widthKey] !== nextWidth) {
      this.lastSignatures[widthKey] = nextWidth;
      bar.style.width = nextWidth;
    }
    this.setText(
      text,
      `${prefix}-text`,
      formatDisplayCurrentMax(Math.max(0, Math.round(value)), Math.max(0, Math.round(max))),
    );
  }

  /** setText：只有文本真的变化时再写 textContent，避免覆盖屏幕阅读器朗读和 CSS 过渡。 */
  private setText(node: HTMLElement, key: string, value: string): void {
    if (this.lastSignatures[key] === value) {
      return;
    }
    this.lastSignatures[key] = value;
    node.textContent = value;
  }

  /** buildBoneAgeLabel：构建Bone Age标签。 */
  private buildBoneAgeLabel(player: PlayerState): string {
    const age = resolveCharacterAge(player);
    return age.days > 0
      ? t('hud.age.years-days', {
        years: formatDisplayInteger(age.years),
        days: formatDisplayInteger(age.days),
      })
      : t('hud.age.years', { years: formatDisplayInteger(age.years) });
  }

  /** buildLifespanLabel：构建Lifespan标签。 */
  private buildLifespanLabel(player: PlayerState): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const lifespanYears = player.lifespanYears ?? player.realm?.lifespanYears ?? null;
    if (lifespanYears == null || lifespanYears <= 0) {
      return t('hud.lifespan.unknown', undefined);
    }
    const years = formatDisplayInteger(lifespanYears);
    return t('hud.lifespan.years', { years });
  }
}
