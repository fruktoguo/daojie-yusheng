/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import {
  ActionDef,
  AutoBattleSkillConfig,
  AutoBattleTargetingMode,
  AutoUsePillConfig,
  COMBAT_ATTACK_INTENSITY_OPTIONS,
  CombatTargetingRules,
  DEFAULT_COMBAT_ATTACK_INTENSITY,
  DEFAULT_PLAYER_REALM_STAGE,
  PlayerState,
  SkillDef,
  getTechniqueMaxLevel,
  normalizeCombatAttackIntensity,
  resolveSkillRequiresTarget,
  resolveSkillUnlockLevel,
  type C2S_RequestSectApplicationPage,
  type CombatAttackIntensity,
  type S2C_SectApplicationPage,
} from '@mud/shared';
import { detailModalHost } from '../detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../floating-tooltip';
import { FloatingListPanel } from '../floating-list-panel';
import {
  FLOATING_PANEL_PREFERENCES_CHANGED_EVENT,
  isFloatingPanelEnabled,
  updateFloatingPanelPreference,
} from '../floating-panel-preferences';
import { buildSkillTooltipContent } from '../skill-tooltip';
import { preserveSelection } from '../selection-preserver';
import { getLocalRealmLevelEntry, resolveClientTechniqueName } from '../../content/local-templates';
import { getActionTypeLabel, getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../../domain-labels';
import {
  ACTION_SHORTCUTS_CHANGED_EVENT,
  ACTION_SHORTCUTS_KEY,
  RETURN_TO_SPAWN_ACTION_ID,
  getStaticClientActionDef,
} from '../../constants/ui/action';
import { formatDisplayInteger, formatDisplayNumber } from '../../utils/number';
import { t } from '../i18n';
import {
  escapeHtml,
  getSkillAffinityBadge,
  getSkillEnabledTechniques,
  normalizeShortcutKey,
} from './action-panel-helpers';
import { SkillManagementSubpanel } from './action-panel-skill-management';
import { CombatSettingsSubpanel } from './action-panel-combat-settings';
import { SectManagementSubpanel } from './action-panel-sect-management';
import type {
  AutoUsePillSubview,
  CombatSettingsTab,
  SectManagementTab,
  SkillManagementFilterToggle,
  SkillManagementSortDirection,
  SkillManagementSortField,
  SkillManagementTab,
  SkillPresetRecord,
  SkillPresetStatus,
} from './action-panel-internal';
import {
  mountReactActionPanel,
  isReactActionPanelMounted,
  setReactActionPanelAfterContentRender,
  shouldUseReactActionPanel,
  syncReactActionPanelState,
  unmountReactActionPanel,
} from '../../react-ui/panels/action/mount-action-panel';

type SkillEnabledEntry = {
  skillEnabled?: boolean;
};

const FLOATING_INTERACTION_ACTION_TYPES = new Set(['quest', 'interact', 'travel', 'craft']);

function replaceElementHtml(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  root.replaceChildren(template.content.cloneNode(true));
}

function getPlayerEnabledSkillSlotLimitByLevel(level: number | undefined): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(1, Math.floor(Number(level))) : 1;
  let extraSlots = 0;

  const earlyLevels = Math.min(normalizedLevel, 6);
  extraSlots += Math.max(0, earlyLevels - 1);

  if (normalizedLevel >= 7) {
    extraSlots += Math.floor((Math.min(normalizedLevel, 18) - 6) / 3);
  }

  if (normalizedLevel >= 19) {
    extraSlots += Math.floor((Math.min(normalizedLevel, 30) - 18) / 5);
  }

  if (normalizedLevel >= 31) {
    extraSlots += Math.floor((normalizedLevel - 30) / 6);
  }

  extraSlots += Math.floor(normalizedLevel / 6);
  extraSlots += Math.floor(normalizedLevel / 12);

  return 4 + extraSlots;
}

function resolvePlayerSkillSlotLimitLocal(
  player: Pick<PlayerState, 'realmLv' | 'realm'> | null | undefined,
): number {
  return getPlayerEnabledSkillSlotLimitByLevel(player?.realm?.realmLv ?? player?.realmLv);
}

function countEnabledSkillEntriesLocal<T extends SkillEnabledEntry>(entries: readonly T[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.skillEnabled !== false) {
      count += 1;
    }
  }
  return count;
}

function enforceSkillEnabledLimitLocal<T extends SkillEnabledEntry>(
  entries: readonly T[],
  limit: number,
): T[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  let enabledCount = 0;
  return entries.map((entry) => {
    if (entry.skillEnabled === false) {
      return entry;
    }
    if (enabledCount < normalizedLimit) {
      enabledCount += 1;
      return entry;
    }
    return {
      ...entry,
      skillEnabled: false,
    };
  });
}

/** 行动面板的主标签页：交互、技能、开关和通用动作。 */
type ActionMainTab = 'dialogue' | 'skill' | 'toggle' | 'utility';
/** 技能区的子标签页：自动技能和手动技能。 */
type SkillSubTab = 'auto' | 'manual';

const SECT_MANAGEMENT_DATA_PATTERN = /\n?@@sect:([^@\n]+)@@/;

function stripSectManagementData(desc: string | undefined): string {
  return (desc ?? '').replace(SECT_MANAGEMENT_DATA_PATTERN, '').trim();
}

function normalizeActionText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/** 动作列表行里需要缓存的节点引用，供局部 patch 直接改 DOM。 */
interface ActionRowRefs {
/**
 * row：row相关字段。
 */

  row: HTMLElement;  
  /**
 * cdNode：cdNode相关字段。
 */

  cdNode: HTMLElement;  
  /**
 * execNode：execNode相关字段。
 */

  execNode: HTMLButtonElement;  
  /**
 * stateNode：状态Node相关字段。
 */

  stateNode?: HTMLElement;  
  /**
 * orderNode：订单Node相关字段。
 */

  orderNode?: HTMLElement;  
  /**
 * toggleNode：toggleNode相关字段。
 */

  toggleNode?: HTMLButtonElement;
  /** nameNode：动作标题节点。 */
  nameNode?: HTMLElement;
  /** descNode：动作描述节点。 */
  descNode?: HTMLElement;
  /** rangeNode：范围标签节点。 */
  rangeNode?: HTMLElement;
  /** bindNode：快捷键绑定按钮。 */
  bindNode?: HTMLButtonElement;
}

/** 动作面板实现，负责动作、技能和预设的局部交互。 */
export class ActionPanel {
  /** 技能管理弹窗的归属标识，和其他详情弹层互斥。 */
  private readonly SKILL_MANAGEMENT_MODAL_OWNER = 'action-panel-skill-management';
  /** 战斗设置弹层。 */
  private readonly COMBAT_SETTINGS_MODAL_OWNER = 'action-panel-combat-settings';
  /** 技能预设弹窗的归属标识，和技能管理弹层分开管理。 */
  private readonly SKILL_PRESET_MODAL_OWNER = 'action-panel-skill-preset';
  /** 索敌方案弹层。 */
  private readonly TARGETING_PLAN_MODAL_OWNER = 'action-panel-targeting-plan';
  /** 宗门管理弹层。 */
  private readonly SECT_MANAGEMENT_MODAL_OWNER = 'action-panel-sect-management';
  /** 自动吃药槽位上限。 */
  private readonly AUTO_USE_PILL_SLOT_LIMIT = 12;
  /** 面板根节点，后续只做局部 patch。 */
  private pane = document.getElementById('pane-action')!;
  /** 缓存出手力度控制条 DOM，避免频繁全量 re-render 破坏 SVG 及 CSS 关键帧动画的连贯性 */
  private cachedAttackIntensityEl: HTMLElement | null = null;
  /** 执行动作的外部回调，由战斗/交互层接手真正执行。 */
  private onAction: ((actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void) | null = null;
  /** 同步自动战斗技能配置的外部回调，保存顺位和开关状态。 */
  private onUpdateAutoBattleSkills: ((skills: AutoBattleSkillConfig[]) => void) | null = null;
  /** 同步自动吃药配置。 */
  private onUpdateAutoUsePills: ((pills: AutoUsePillConfig[]) => void) | null = null;
  /** 同步目标选择规则。 */
  private onUpdateCombatTargetingRules: ((rules: CombatTargetingRules) => void) | null = null;
  /** 同步优先索敌方案。 */
  private onUpdateAutoBattleTargetingMode: ((mode: AutoBattleTargetingMode) => void) | null = null;
  /** 请求宗门待审批申请分页。 */
  private onRequestSectApplicationPage: ((payload: C2S_RequestSectApplicationPage) => boolean) | null = null;
  /** 当前主标签页，决定展示对话、技能、开关还是通用动作。 */
  private activeTab: ActionMainTab = 'dialogue';
  /** 当前技能子标签页。 */
  private activeSkillTab: SkillSubTab = 'auto';
  /** 技能管理弹层当前分组。 */
  private skillManagementTab: SkillManagementTab = 'auto';
  /** 技能管理弹层里的草稿缓存，未应用前只留在本地。 */
  private skillManagementDraft: AutoBattleSkillConfig[] | null = null;
  /** 技能管理排序面板是否展开。 */
  private skillManagementSortOpen = false;
  /** 技能管理当前排序字段。 */
  private skillManagementSortField: SkillManagementSortField = 'custom';
  /** 技能管理当前排序方向。 */
  private skillManagementSortDirection: SkillManagementSortDirection = 'desc';
  /** 技能管理筛选面板是否展开。 */
  private skillManagementFilterOpen = false;
  /** 技能管理当前启用的筛选条件。 */
  private skillManagementFilterToggles = new Set<SkillManagementFilterToggle>();
  /** 外部技能管理状态摘要，用来判断弹层是否需要重绘。 */
  private skillManagementExternalRevision: string | null = null;
  /** 技能管理弹层内的状态提示。 */
  private skillManagementStatus: SkillPresetStatus | null = null;
  /** 外部技能预设状态摘要，用来判断弹层是否需要重绘。 */
  private skillPresetExternalRevision: string | null = null;
  /** 外部索敌方案状态摘要。 */
  private targetingPlanExternalRevision: string | null = null;
  /** 战斗设置弹层外部摘要。 */
  private combatSettingsExternalRevision: string | null = null;
  /** 战斗设置弹层内的状态提示。 */
  private combatSettingsStatus: SkillPresetStatus | null = null;
  /** 技能管理列表的滚动位置，重绘后尽量恢复。 */
  private skillManagementListScrollTop = 0;
  /** 战斗设置当前标签。 */
  private combatSettingsActiveTab: CombatSettingsTab = 'auto_pills';
  /** 宗门管理当前标签。 */
  private sectManagementTab: SectManagementTab = 'guardian';
  /** 宗门管理弹层最近一次外部内容签名。 */
  private sectManagementExternalRevision = '';
  /** 自动吃药草稿。 */
  private autoUsePillDraft: AutoUsePillConfig[] | null = null;
  /** 目标选择草稿。 */
  private combatTargetingDraft: CombatTargetingRules | null = null;
  /** 自动丹药当前选中的槽位。 */
  private autoUsePillSelectedIndex = 0;
  /** 自动丹药弹层当前子视图。 */
  private autoUsePillSubview: AutoUsePillSubview = 'main';
  /** 角色是否开启自动战斗。 */
  private autoBattle = false;
  /** 角色是否开启自动反击。 */
  private autoRetaliate = true;
  /** 自动战斗时是否保持原地。 */
  private autoBattleStationary = false;
  /** 是否允许范围技能误伤玩家。 */
  private allowAoePlayerHit = false;
  /** 是否开启离线自动修炼。 */
  private autoIdleCultivation = true;
  /** 是否自动切换修炼模式。 */
  private autoSwitchCultivation = false;
  /** 当前出手力度档位，单位为“成”。 */
  private combatAttackIntensity: CombatAttackIntensity = DEFAULT_COMBAT_ATTACK_INTENSITY;
  /** 当前是否处于修炼态。 */
  private cultivationActive = false;
  /** 当前动作列表快照，包含系统补进来的工具动作。 */
  private currentActions: ActionDef[] = [];
  /** 快捷键绑定表，key 是 actionId，value 是按键。 */
  private shortcutBindings = new Map<string, string>();
  /** 技能预设列表，按本地保存顺序排列。 */
  private skillPresets: SkillPresetRecord[] = [];
  /** 当前选中的技能预设 ID。 */
  private selectedSkillPresetId: string | null = null;
  /** 新建或重命名时的预设名称草稿。 */
  private skillPresetNameDraft = '';
  /** 导入技能预设时的原始文本。 */
  private skillPresetImportText = '';
  /** 技能预设的状态提示。 */
  private skillPresetStatus: SkillPresetStatus | null = null;
  /** 正在等待绑定快捷键的动作 ID。 */
  private bindingActionId: string | null = null;
  /** 正在拖拽的技能 ID。 */
  private draggingSkillId: string | null = null;
  /** 拖拽悬停到的技能 ID。 */
  private dragOverSkillId: string | null = null;
  /** 拖拽悬停位置，决定插在目标前还是后。 */
  private dragOverPosition: 'before' | 'after' | null = null;
  /** 预览角色快照，用来算技能说明和管理指标。 */
  private previewPlayer?: PlayerState;
  /** 技能查询缓存，保存技能定义、等级和已知技能列表。 */
  private skillLookup = new Map<string, {  
  /**
 * skill：技能相关字段。
 */
 skill: SkillDef;  
 /**
 * techLevel：tech等级数值。
 */
 techLevel: number;  
 /**
 * knownSkills：known技能相关字段。
 */
 knownSkills: SkillDef[] }>();
  /** 面板内统一复用的悬浮提示。 */
  private tooltip = new FloatingTooltip();
  /** 战斗设置中的丹药提示。 */
  private autoUsePillTooltip = new FloatingTooltip('floating-tooltip inventory-tooltip');
  /** 当前显示丹药提示的节点。 */
  private autoUsePillTooltipNode: HTMLElement | null = null;
  /** 动作行节点缓存，供冷却、顺位和开关状态局部更新。 */
  private actionRowRefs = new Map<string, ActionRowRefs>();  
  /** 最近一次完整渲染的结构指纹；秒级冷却变化不进入该指纹。 */
  private lastRenderedContentKey = '';
  /** 当前面板主体这一轮 render 绑定的 DOM 监听，重绘前统一撤销。 */
  private paneRenderEvents: AbortController | null = null;
  /** 交互浮窗宿主，复用行动面板动作卡片和执行逻辑。 */
  private interactionFloatingPanel: FloatingListPanel | null = null;
  /** 交互浮窗当前内容绑定的事件。 */
  private interactionFloatingEvents: AbortController | null = null;

  // ─── 子面板实例 ───
  private readonly skillMgmt = new SkillManagementSubpanel(this);
  private readonly combatSettings = new CombatSettingsSubpanel(this);
  private readonly sectMgmt = new SectManagementSubpanel(this);

  constructor() {
    this.shortcutBindings = this.loadShortcutBindings();
    this.skillPresets = this.skillMgmt.loadSkillPresets();
    this.selectedSkillPresetId = this.skillPresets[0]?.id ?? null;
    window.addEventListener('keydown', (event) => this.handleGlobalKeydown(event));
    window.addEventListener(FLOATING_PANEL_PREFERENCES_CHANGED_EVENT, () => this.refreshInteractionFloatingPanel());
  }

  /** 清空面板、重置缓存并关掉关联弹层。 */
  clear(): void {
    this.tooltip.hide(true);
    this.autoUsePillTooltip.hide(true);
    this.autoUsePillTooltipNode = null;
    this.paneRenderEvents?.abort();
    this.paneRenderEvents = null;
    this.actionRowRefs.clear();
    this.lastRenderedContentKey = '';
    this.skillManagementDraft = null;
    this.autoUsePillDraft = null;
    this.combatTargetingDraft = null;
    this.skillManagementExternalRevision = null;
    this.skillManagementStatus = null;
    this.skillPresetExternalRevision = null;
    this.targetingPlanExternalRevision = null;
    this.combatSettingsExternalRevision = null;
    this.skillManagementListScrollTop = 0;
    this.combatSettingsActiveTab = 'auto_pills';
    this.sectManagementTab = 'guardian';
    this.sectMgmt.reset();
    this.autoUsePillSelectedIndex = 0;
    this.autoUsePillSubview = 'main';
    detailModalHost.close(this.SKILL_MANAGEMENT_MODAL_OWNER);
    detailModalHost.close(this.COMBAT_SETTINGS_MODAL_OWNER);
    detailModalHost.close(this.SKILL_PRESET_MODAL_OWNER);
    detailModalHost.close(this.TARGETING_PLAN_MODAL_OWNER);
    detailModalHost.close(this.SECT_MANAGEMENT_MODAL_OWNER);
    if (this.useReactPanel()) {
      this.renderReactPanel(`<div class="empty-hint">${t('action.empty.no-actions', undefined)}</div>`, 'empty');
    } else {
      unmountReactActionPanel();
      replaceElementHtml(this.pane, `<div class="empty-hint">${t('action.empty.no-actions', undefined)}</div>`);
    }
    this.interactionFloatingPanel?.setTransientHidden(true);
  }  
  /**
 * setCallbacks：写入Callback。
 * @param onAction (actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void 参数说明。
 * @param onUpdateAutoBattleSkills (skills: AutoBattleSkillConfig[]) => void 参数说明。
 * @returns 无返回值，直接更新Callback相关状态。
 */


  setCallbacks(
    onAction: (actionId: string, requiresTarget?: boolean, targetMode?: string, range?: number, actionName?: string) => void,
    onUpdateAutoBattleSkills?: (skills: AutoBattleSkillConfig[]) => void,
    onUpdateAutoUsePills?: (pills: AutoUsePillConfig[]) => void,
    onUpdateCombatTargetingRules?: (rules: CombatTargetingRules) => void,
    onUpdateAutoBattleTargetingMode?: (mode: AutoBattleTargetingMode) => void,
    onRequestSectApplicationPage?: (payload: C2S_RequestSectApplicationPage) => boolean,
  ): void {
    this.onAction = onAction;
    this.onUpdateAutoBattleSkills = onUpdateAutoBattleSkills ?? null;
    this.onUpdateAutoUsePills = onUpdateAutoUsePills ?? null;
    this.onUpdateCombatTargetingRules = onUpdateCombatTargetingRules ?? null;
    this.onUpdateAutoBattleTargetingMode = onUpdateAutoBattleTargetingMode ?? null;
    this.onRequestSectApplicationPage = onRequestSectApplicationPage ?? null;
  }

  /** 消费宗门待审批申请的低频分页响应。 */
  handleSectApplicationPage(page: S2C_SectApplicationPage): void {
    this.sectMgmt.handleSectApplicationPage(page);
  }

  /** 读取外部面板展示用的绑键按钮文案。 */
  getShortcutBindLabel(actionId: string): string {
    return this.getBindButtonLabel(actionId);
  }

  /** 供属性等外部面板进入或退出行动绑键模式。 */
  toggleShortcutBinding(actionId: string): void {
    this.bindingActionId = this.bindingActionId === actionId ? null : actionId;
    this.render(this.currentActions);
    this.refreshInteractionFloatingPanel();
    this.renderSkillManagementModalIfOpen();
    this.notifyShortcutBindingChanged();
  }

  /** 用新的动作快照覆盖当前状态，并重绘面板和已开的弹层。 */
  update(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (player) {
      this.previewPlayer = player;
      this.syncPlayerContext(player);
      this.autoBattleStationary = player.autoBattleStationary === true;
      this.allowAoePlayerHit = player.allowAoePlayerHit === true;
      this.autoIdleCultivation = player.autoIdleCultivation !== false;
      this.autoSwitchCultivation = player.autoSwitchCultivation === true;
      this.combatAttackIntensity = normalizeCombatAttackIntensity(player.combatAttackIntensity);
      this.cultivationActive = player.cultivationActive === true;
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;
    const contentKey = this.buildActionPanelContentKey(this.currentActions);
    if (this.lastRenderedContentKey === contentKey && this.patchDynamicActionPanel()) {
      this.renderSkillManagementModalIfOpen();
      this.renderSkillPresetModalIfOpen();
      this.renderCombatSettingsModalIfOpen();
      this.renderSectManagementModalIfOpen();
      this.refreshInteractionFloatingPanel();
      return;
    }
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.renderSkillPresetModalIfOpen();
    this.renderCombatSettingsModalIfOpen();
    this.renderSectManagementModalIfOpen();
    this.refreshInteractionFloatingPanel();
  }

  /** 只同步会变的动作状态，优先走局部 patch，避免整块重绘。 */
  syncDynamic(actions: ActionDef[], _autoBattle?: boolean, _autoRetaliate?: boolean, player?: PlayerState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (player) {
      this.previewPlayer = player;
      this.syncPlayerContext(player);
      this.autoBattleStationary = player.autoBattleStationary === true;
      this.allowAoePlayerHit = player.allowAoePlayerHit === true;
      this.autoIdleCultivation = player.autoIdleCultivation !== false;
      this.autoSwitchCultivation = player.autoSwitchCultivation === true;
      this.combatAttackIntensity = normalizeCombatAttackIntensity(player.combatAttackIntensity);
      this.cultivationActive = player.cultivationActive === true;
    }
    this.currentActions = this.withUtilityActions(actions);
    if (_autoBattle !== undefined) this.autoBattle = _autoBattle;
    if (_autoRetaliate !== undefined) this.autoRetaliate = _autoRetaliate;

    const contentKey = this.buildActionPanelContentKey(this.currentActions);
    if (this.lastRenderedContentKey !== contentKey || !this.patchDynamicActionPanel()) {
      this.render(this.currentActions);
    }
    this.renderSkillManagementModalIfOpen();
    this.renderSkillPresetModalIfOpen();
    this.renderTargetingPlanModalIfOpen();
    this.renderCombatSettingsModalIfOpen();
    this.renderSectManagementModalIfOpen();
    this.refreshInteractionFloatingPanel();
  }

  /** 从玩家快照初始化面板状态。 */
  initFromPlayer(player: PlayerState): void {
    this.previewPlayer = player;
    this.syncPlayerContext(player);
    this.currentActions = this.withUtilityActions(player.actions);
    this.autoBattle = player.autoBattle ?? false;
    this.autoRetaliate = player.autoRetaliate !== false;
    this.autoBattleStationary = player.autoBattleStationary === true;
    this.allowAoePlayerHit = player.allowAoePlayerHit === true;
    this.autoIdleCultivation = player.autoIdleCultivation !== false;
    this.autoSwitchCultivation = player.autoSwitchCultivation === true;
    this.combatAttackIntensity = normalizeCombatAttackIntensity(player.combatAttackIntensity);
    this.cultivationActive = player.cultivationActive === true;
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.renderSkillPresetModalIfOpen();
    this.renderTargetingPlanModalIfOpen();
    this.renderCombatSettingsModalIfOpen();
    this.renderSectManagementModalIfOpen();
    this.refreshInteractionFloatingPanel();
  }

  /** 同步玩家上下文到面板缓存。 */
  private syncPlayerContext(player: PlayerState): void {
    const knownSkills = player.techniques.flatMap((technique) => technique.skills);
    this.skillLookup = new Map(
      player.techniques.flatMap((technique) => technique.skills.map((skill) => [
        skill.id,
        { skill, techLevel: technique.level, knownSkills },
      ] as const)),
    );
  }

  /** 渲染动作面板主体。 */
  private render(actions: ActionDef[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (actions.length === 0) {
      this.clear();
      return;
    }

    const contentKey = this.buildActionPanelContentKey(actions);
    const html = this.buildActionPanelHtml(actions);
    this.lastRenderedContentKey = contentKey;
    if (this.useReactPanel()) {
      this.renderReactPanel(html, contentKey);
      return;
    }

    preserveSelection(this.pane, () => {
      this.paneRenderEvents?.abort();
      replaceElementHtml(this.pane, html);
      this.paneRenderEvents = new AbortController();
      const eventSignal = this.paneRenderEvents.signal;
      this.injectCachedAttackIntensityControl();
      this.captureActionRowRefs();
      this.bindEvents(actions, eventSignal);
      this.bindTooltips(this.pane, eventSignal);
    });
  }

  private useReactPanel(): boolean {
    return shouldUseReactActionPanel();
  }

  private renderReactPanel(html: string, contentKey: string): void {
    this.paneRenderEvents?.abort();
    this.paneRenderEvents = new AbortController();
    const eventSignal = this.paneRenderEvents.signal;
    const bindCurrentReactContent = () => {
      this.injectCachedAttackIntensityControl();
      this.captureActionRowRefs();
      this.bindEvents(this.currentActions, eventSignal);
      this.bindTooltips(this.pane, eventSignal);
    };
    setReactActionPanelAfterContentRender(bindCurrentReactContent);
    const wasMounted = isReactActionPanelMounted();
    const didRender = syncReactActionPanelState({ html, contentKey });
    mountReactActionPanel();
    if (!didRender && wasMounted) {
      bindCurrentReactContent();
    }
  }

  private buildActionPanelContentKey(actions: ActionDef[]): string {
    const visibleStructure = this.getActionPanelVisibleStructure(actions);
    return [
      this.activeTab,
      this.activeSkillTab,
      this.previewPlayer?.autoBattleTargetingMode ?? '',
      visibleStructure,
    ].join('::');
  }

  /** 只记录会改变行动栏 DOM 结构的字段；文本、冷却、开关状态由局部 patch 负责。 */
  private getActionPanelVisibleStructure(actions: ActionDef[]): string {
    const parts: string[] = [];
    for (const action of actions) {
      if (!this.isActionVisibleInCurrentPane(action)) {
        continue;
      }
      parts.push([
        action.id,
        action.type,
        this.isSwitchAction(action) ? 'switch' : '',
        this.isUtilityAction(action) ? 'utility' : '',
        action.skillEnabled === false ? 'skill-off' : '',
        action.passiveOnly === true ? 'passive' : '',
        action.autoBattleEnabled === false ? 'manual' : 'auto',
      ].join('/'));
    }
    return parts.join('|');
  }

  /** patch 行动栏里随 tick 变化的节点，失败时由调用方回退到完整渲染。 */
  private patchDynamicActionPanel(): boolean {
    this.syncCachedAttackIntensityControl();
    return this.patchToggleCards() && this.patchActionRows();
  }

  private buildActionPanelHtml(actions: ActionDef[]): string {
    const tabGroups: Array<{
      id: ActionMainTab;
      label: string;
      types: string[];
    }> = [
      { id: 'dialogue', label: t('action.tab.dialogue', undefined), types: ['quest', 'interact', 'travel', 'craft'] },
      { id: 'skill', label: t('action.tab.skill', undefined), types: ['skill', 'battle', 'gather'] },
      { id: 'toggle', label: t('action.tab.toggle', undefined), types: ['toggle'] },
      { id: 'utility', label: t('action.tab.utility', undefined), types: ['toggle'] },
    ];
    const groups = new Map<string, ActionDef[]>();
    for (const action of actions) {
      const list = groups.get(action.type) ?? [];
      list.push(action);
      groups.set(action.type, list);
    }
    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(actions);
    const enabledSkillCount = this.getEnabledSkillCount(actions);
    const skillSlotLimit = this.getSkillSlotLimit();

    let html = `<div class="action-tab-bar">
      ${tabGroups.map((tab) => `
        <button class="action-tab-btn ${this.activeTab === tab.id ? 'active' : ''}" data-action-tab="${tab.id}" type="button">${tab.id === 'skill'
          ? `${tab.label} <span class="action-skill-subtab-count">${enabledSkillCount}/${skillSlotLimit}</span>`
          : tab.label}</button>
      `).join('')}
    </div>`;

    for (const tab of tabGroups) {
      html += `<div class="action-tab-pane ${this.activeTab === tab.id ? 'active' : ''}" data-action-pane="${tab.id}">`;
      if (tab.id === 'toggle') {
        const switchEntries = actions.filter((action) => this.isSwitchAction(action));
        if (switchEntries.length === 0) {
          html += `<div class="empty-hint">${t('action.empty.current-group', undefined)}</div></div>`;
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">${t('action.section.toggle', undefined)}</div>
          <div class="intel-grid compact">`;
        for (const action of switchEntries) {
          html += this.renderSwitchItem(action);
        }
        html += `</div>${this.renderAttackIntensityControl()}</div></div>`;
        continue;
      }
      if (tab.id === 'utility') {
        const utilityEntries = actions.filter((action) => (
          (action.type === 'toggle' && !this.isSwitchAction(action))
          || this.isUtilityAction(action)
        ));
        if (utilityEntries.length === 0) {
          html += `<div class="empty-hint">${t('action.empty.current-group', undefined)}</div></div>`;
          continue;
        }
        html += `<div class="panel-section">
          <div class="panel-section-title">${t('action.section.utility', undefined)}</div>
          <div class="action-card-list">`;
        for (const action of utilityEntries) {
          html += this.renderActionItem(action);
        }
        html += '</div></div></div>';
        continue;
      }
      const relevantTypes = tab.types.filter((type) => (groups.get(type)?.length ?? 0) > 0);
      if (relevantTypes.length === 0) {
        html += `<div class="empty-hint">${t('action.empty.current-group', undefined)}</div>`;
      } else {
        for (const type of relevantTypes) {
          const entries = (groups.get(type) ?? []).filter((action) => !this.isUtilityAction(action) && !this.isSwitchAction(action));
          if (entries.length === 0) {
            continue;
          }
          if (type === 'skill') {
            html += this.renderSkillSection(entries, autoBattleDisplayOrders);
            continue;
          }
          html += `<div class="panel-section" data-action-type-section="${escapeHtml(type)}">
      <div class="panel-section-title">${getActionTypeLabel(type)}</div>
      <div class="action-card-list">`;
          for (const action of entries) {
            html += this.renderActionItem(action);
          }
          html += '</div></div>';
        }
      }
      html += '</div>';
    }
    return html;
  }

  /** 缓存动作行里后续 patch 会直接改到的节点引用。 */
  private captureActionRowRefs(): void {
    this.actionRowRefs.clear();
    this.pane.querySelectorAll<HTMLElement>('[data-action-row]').forEach((row) => {
      const actionId = row.dataset.actionRow;
      const cdNode = row.querySelector<HTMLElement>('[data-action-cd]');
      const execNode = row.querySelector<HTMLButtonElement>('[data-action-exec]');
      if (!actionId || !cdNode || !execNode) {
        return;
      }
      const stateNode = row.querySelector<HTMLElement>('[data-action-auto-state]');
      const orderNode = row.querySelector<HTMLElement>('[data-action-auto-order]');
      const toggleNode = row.querySelector<HTMLButtonElement>('[data-auto-battle-toggle]');
      const nameNode = row.querySelector<HTMLElement>('[data-action-name-node]');
      const descNode = row.querySelector<HTMLElement>('[data-action-desc-node]');
      const rangeNode = row.querySelector<HTMLElement>('[data-action-range-node]');
      const bindNode = row.querySelector<HTMLButtonElement>('[data-bind-action]');
      this.actionRowRefs.set(actionId, {
        row,
        cdNode,
        execNode,
        stateNode: stateNode ?? undefined,
        orderNode: orderNode ?? undefined,
        toggleNode: toggleNode ?? undefined,
        nameNode: nameNode ?? undefined,
        descNode: descNode ?? undefined,
        rangeNode: rangeNode ?? undefined,
        bindNode: bindNode ?? undefined,
      });
    });
  }

  /** 刷新独立浮动交互列表，保持主行动面板以外也能快速执行附近交互。 */
  private refreshInteractionFloatingPanel(): void {
    if (!isFloatingPanelEnabled('interactionList')) {
      this.interactionFloatingPanel?.setTransientHidden(true);
      return;
    }
    const actions = this.getFloatingInteractionActions();
    if (actions.length === 0) {
      this.interactionFloatingPanel?.setTransientHidden(true);
      this.interactionFloatingEvents?.abort();
      this.interactionFloatingEvents = null;
      return;
    }
    const panel = this.ensureInteractionFloatingPanel();
    panel.setClosed(false);
    const contentKey = this.buildFloatingInteractionKey(actions);
    if (panel.getBodyKey() !== contentKey) {
      panel.updateContent(this.renderFloatingInteractionList(actions));
      panel.setBodyKey(contentKey);
      this.interactionFloatingEvents?.abort();
      this.interactionFloatingEvents = new AbortController();
      const signal = this.interactionFloatingEvents.signal;
      this.bindActionExecEvents(panel.body, signal);
    }
    panel.setTransientHidden(false);
  }

  private ensureInteractionFloatingPanel(): FloatingListPanel {
    if (!this.interactionFloatingPanel) {
      this.interactionFloatingPanel = new FloatingListPanel({
        id: 'floating-interaction-list',
        title: '交互列表',
        storageKey: 'mud:floating-interaction-list:v2',
        className: 'floating-list-panel--interaction',
        defaultLeft: Math.max(12, window.innerWidth - 280),
        defaultTop: 128,
        minWidth: 200,
        maxWidth: 280,
        onClose: () => updateFloatingPanelPreference('interactionList', false),
      });
    }
    return this.interactionFloatingPanel;
  }

  private getFloatingInteractionActions(): ActionDef[] {
    return this.currentActions.filter((action) => (
      FLOATING_INTERACTION_ACTION_TYPES.has(action.type)
      && !this.isUtilityAction(action)
      && !this.isSwitchAction(action)
    ));
  }

  private buildFloatingInteractionKey(actions: ActionDef[]): string {
    return actions
      .map((action) => [
        action.id,
        action.type,
        action.name,
        action.cooldownLeft,
        action.range ?? '',
        action.requiresTarget ? 'target' : 'instant',
        action.targetMode ?? '',
      ].join(':'))
      .join('|');
  }

  private renderFloatingInteractionList(actions: ActionDef[]): string {
    const groups = this.getFloatingInteractionGroups(actions);
    return `
      <div class="floating-list-panel__list floating-interaction-quick-list">
        ${groups.map((group) => `
          <section class="floating-interaction-group">
            <div class="floating-interaction-group-title">${escapeHtml(group.label)}</div>
            <div class="floating-interaction-group-list">
              ${group.actions.map((action) => this.renderFloatingInteractionButton(action)).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    `;
  }

  private getFloatingInteractionGroups(actions: ActionDef[]): Array<{ label: string; actions: ActionDef[] }> {
    const order: Array<{ type: ActionDef['type']; label: string }> = [
      { type: 'craft', label: '技艺' },
      { type: 'quest', label: '任务' },
      { type: 'travel', label: '传送' },
      { type: 'interact', label: '交互' },
    ];
    return order
      .map((group) => ({
        label: group.label,
        actions: actions.filter((action) => action.type === group.type),
      }))
      .filter((group) => group.actions.length > 0);
  }

  private renderFloatingInteractionButton(action: ActionDef): string {
    const onCd = action.cooldownLeft > 0;
    return `
      <button
        class="floating-interaction-quick-btn${onCd ? ' is-cooldown' : ''}"
        type="button"
        data-action="${escapeHtml(action.id)}"
        data-action-exec="${escapeHtml(action.id)}"
        data-action-name="${escapeHtml(action.name)}"
        data-action-range="${action.range ?? ''}"
        data-action-target="${action.requiresTarget ? '1' : '0'}"
        data-action-target-mode="${action.targetMode ?? ''}"
        ${onCd ? 'disabled aria-disabled="true" title="冷却中"' : ''}
      >${escapeHtml(action.name)}</button>
    `;
  }

  /** 给当前渲染出来的动作区装配标签切换、入口按钮和快捷操作事件。 */
  private bindEvents(actions: ActionDef[], signal: AbortSignal): void {
    this.pane.querySelectorAll<HTMLElement>('[data-action-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionTab as ActionMainTab | undefined;
        if (!tab) return;
        this.activeTab = tab;
        this.render(actions);
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLButtonElement>('[data-attack-intensity]').forEach((button) => {
      button.addEventListener('click', () => {
        const intensity = normalizeCombatAttackIntensity(button.dataset.attackIntensity);
        if (intensity === this.combatAttackIntensity) {
          return;
        }
        this.combatAttackIntensity = intensity;
        if (this.previewPlayer) {
          this.previewPlayer.combatAttackIntensity = intensity;
        }
        this.syncCachedAttackIntensityControl();
        this.onAction?.(`combat:attack_intensity:${intensity}`, false, undefined, undefined, t('action.attack-intensity.title', undefined));
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.actionSkillTab as SkillSubTab | undefined;
        if (!tab) return;
        this.activeSkillTab = tab;
        this.render(actions);
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-manage-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openSkillManagement();
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-skill-preset-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openSkillPresetModal();
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-combat-settings-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openCombatSettingsModal();
      }, { signal });
    });
    this.pane.querySelectorAll<HTMLElement>('[data-action-targeting-plan-open]').forEach((button) => {
      button.addEventListener('click', () => {
        this.openTargetingPlanModal();
      }, { signal });
    });
    this.bindActionCardEvents(this.pane, signal);
    this.bindActionExecEvents(this.pane, signal);
    this.bindBindActionEvents(this.pane, signal);
    this.bindAutoBattleToggleEvents(this.pane, signal);
    this.bindSkillEnabledToggleEvents(this.pane, signal);
    this.bindAutoBattleDragEvents(this.pane, signal);
  }

  /** 只给带提示信息的节点绑定悬浮提示，避免重复装配整棵树。 */
  private bindTooltips(root: HTMLElement, signal?: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    root.querySelectorAll<HTMLElement>('[data-action-tooltip-title]').forEach((node) => {
      const title = node.dataset.actionTooltipTitle ?? '';
      const rich = node.dataset.actionTooltipRich === '1';
      const skillId = node.dataset.actionTooltipSkillId ?? '';
      const skillContext = skillId ? this.skillLookup.get(skillId) : undefined;
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
        const tooltip = skillContext ? buildSkillTooltipContent(skillContext.skill, {
          techLevel: skillContext.techLevel,
          player: this.previewPlayer,
          knownSkills: skillContext.knownSkills,
        }) : { lines: [], asideCards: [] };
        this.tooltip.showPinned(node, title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: rich,
          asideCards: tooltip.asideCards,
        });
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, signal });
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        const tooltip = skillContext ? buildSkillTooltipContent(skillContext.skill, {
          techLevel: skillContext.techLevel,
          player: this.previewPlayer,
          knownSkills: skillContext.knownSkills,
        }) : { lines: [], asideCards: [] };
        this.tooltip.show(title, tooltip.lines, event.clientX, event.clientY, {
          allowHtml: rich,
          asideCards: tooltip.asideCards,
        });
      }, { signal });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-action-technique-tooltip="true"]').forEach((node) => {
      const showTechniqueTooltip = (event: MouseEvent, pinned = false): void => {
        const tooltip = this.buildActionTechniqueTooltip(node);
        if (!tooltip) {
          return;
        }
        if (pinned) {
          this.tooltip.showPinned(node, tooltip.title, tooltip.lines, event.clientX, event.clientY);
          return;
        }
        this.tooltip.show(tooltip.title, tooltip.lines, event.clientX, event.clientY);
      };
      node.addEventListener('click', (event) => {
        if (!tapMode || !(event instanceof MouseEvent)) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
        showTechniqueTooltip(event, true);
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, signal });
      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        showTechniqueTooltip(event);
      }, { signal });
      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      }, { signal });
      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      }, { signal });
    });
  }

  /** 处理全局按键：一边支持绑键，一边支持直接触发动作。 */
  private handleGlobalKeydown(event: KeyboardEvent): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (this.bindingActionId) {
      if (event.key === 'Escape') {
        this.bindingActionId = null;
        this.render(this.currentActions);
        this.renderSkillManagementModalIfOpen();
        this.notifyShortcutBindingChanged();
        return;
      }
      const normalized = normalizeShortcutKey(event.key);
      if (!normalized) return;
      event.preventDefault();
      for (const [actionId, binding] of this.shortcutBindings.entries()) {
        if (binding === normalized) {
          this.shortcutBindings.delete(actionId);
        }
      }
      this.shortcutBindings.set(this.bindingActionId, normalized);
      this.saveShortcutBindings();
      this.bindingActionId = null;
      this.render(this.currentActions);
      this.renderSkillManagementModalIfOpen();
      this.notifyShortcutBindingChanged();
      return;
    }

    const normalized = normalizeShortcutKey(event.key);
    if (!normalized) return;
    const actionId = [...this.shortcutBindings.entries()].find(([, binding]) => binding === normalized)?.[0];
    if (!actionId) return;
    const action = this.resolveShortcutAction(actionId);
    if (!action || action.cooldownLeft > 0) return;
    if (action.type === 'skill' && (action.skillEnabled === false || action.passiveOnly === true)) return;
    event.preventDefault();
    this.onAction?.(action.id, action.requiresTarget, action.targetMode, action.range, action.name);
  }

  /** 快捷键允许命中当前动作列表，也允许命中客户端稳定静态入口。 */
  private resolveShortcutAction(actionId: string): ActionDef | null {
    return this.currentActions.find((entry) => entry.id === actionId)
      ?? getStaticClientActionDef(actionId);
  }

  /** 在动作标题旁补一枚快捷键标记。 */
  private renderShortcutBadge(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? `<span class="action-shortcut-tag">${t('action.shortcut.badge', { key: binding.toUpperCase() })}</span>` : '';
  }

  /** 在动作摘要里补一段快捷键说明。 */
  private renderShortcutMeta(actionId: string): string {
    const binding = this.shortcutBindings.get(actionId);
    return binding ? t('action.shortcut.meta', { key: binding.toUpperCase() }) : '';
  }

  /** 判断是否属于需要显示开关卡片的动作。 */
  private isSwitchAction(action: ActionDef): boolean {
    return this.isSwitchActionId(action.id);
  }

  /** 判断是否属于客户端补进来的通用动作。 */
  private isUtilityAction(action: ActionDef): boolean {
    return this.isUtilityActionId(action.id);
  }

  /** 判断动作 id 是否落在通用动作范围内。 */
  private isUtilityActionId(actionId: string): boolean {
    return actionId === RETURN_TO_SPAWN_ACTION_ID || actionId === 'battle:force_attack';
  }

  /** 判断动作 id 是否是状态开关类动作。 */
  private isSwitchActionId(actionId: string): boolean {
    return actionId === 'toggle:auto_battle'
      || actionId === 'toggle:auto_retaliate'
      || actionId === 'toggle:auto_battle_stationary'
      || actionId === 'toggle:allow_aoe_player_hit'
      || actionId === 'toggle:auto_idle_cultivation'
      || actionId === 'toggle:auto_switch_cultivation'
      || actionId === 'cultivation:toggle'
      || actionId === 'sense_qi:toggle';
  }

  /** 返回开关卡片在面板里显示的标题。 */
  private getSwitchCardTitle(action: ActionDef): string {
    switch (action.id) {
      case 'toggle:auto_battle':
        return t('action.switch.auto-battle', undefined);
      case 'toggle:auto_retaliate':
        return t('action.switch.auto-retaliate', undefined);
      case 'toggle:auto_battle_stationary':
        return t('action.switch.stationary', undefined);
      case 'toggle:allow_aoe_player_hit':
        return t('action.switch.aoe-player-hit', undefined);
      case 'toggle:auto_idle_cultivation':
        return t('action.switch.auto-idle-cultivation', undefined);
      case 'toggle:auto_switch_cultivation':
        return t('action.switch.auto-switch-cultivation', undefined);
      case 'cultivation:toggle':
        return t('action.switch.cultivation-active', undefined);
      case 'sense_qi:toggle':
        return t('action.switch.sense-qi', undefined);
      default:
        return action.name;
    }
  }

  /** 读取开关卡片当前状态，顺便决定按钮上的开/关文案。 */
  private getSwitchCardState(action: ActionDef): {  
  /**
 * active：启用开关或状态标识。
 */
 active: boolean;  
 /**
 * label：label名称或显示文本。
 */
  label: string } {
    const onLabel = t('common.state.on', undefined);
    const offLabel = t('common.state.off', undefined);
    switch (action.id) {
      case 'toggle:auto_battle':
        return { active: this.autoBattle, label: this.autoBattle ? onLabel : offLabel };
      case 'toggle:auto_retaliate':
        return { active: this.autoRetaliate, label: this.autoRetaliate ? onLabel : offLabel };
      case 'toggle:auto_battle_stationary':
        return { active: this.autoBattleStationary, label: this.autoBattleStationary ? onLabel : offLabel };
      case 'toggle:allow_aoe_player_hit':
        return { active: this.allowAoePlayerHit, label: this.allowAoePlayerHit ? onLabel : offLabel };
      case 'toggle:auto_idle_cultivation':
        return { active: this.autoIdleCultivation, label: this.autoIdleCultivation ? onLabel : offLabel };
      case 'toggle:auto_switch_cultivation':
        return { active: this.autoSwitchCultivation, label: this.autoSwitchCultivation ? onLabel : offLabel };
      case 'cultivation:toggle':
        return { active: this.cultivationActive, label: this.cultivationActive ? onLabel : offLabel };
      case 'sense_qi:toggle': {
        const active = this.previewPlayer?.senseQiActive === true;
        return { active, label: active ? onLabel : offLabel };
      }
      default:
        return { active: false, label: t('common.action.execute', undefined) };
    }
  }

  /** 渲染出手力度分段横条。 */
  private renderAttackIntensityControl(): string {
    return `<div class="attack-intensity-control-placeholder" data-attack-intensity-placeholder="true"></div>`;
  }

  /** 将缓存的出手力度控制条插入到占位符中，并增量同步状态，以保证 SVG 动效不被打断 */
  private injectCachedAttackIntensityControl(): void {
    const active = normalizeCombatAttackIntensity(this.combatAttackIntensity);
    const placeholder = this.pane.querySelector('[data-attack-intensity-placeholder="true"]');
    if (!placeholder) {
      return;
    }

    // 如果还没有创建过缓存的控制条，在这里初始化它
    if (!this.cachedAttackIntensityEl) {
      const container = document.createElement('div');
      container.className = `attack-intensity-control state-${active}`;
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', t('action.attack-intensity.title', undefined));

      // 预生成 12 成万剑归宗的随机飞剑粒子
      let domainHtml = '';
      for (let i = 0; i < 45; i++) {
        const isRightToLeft = Math.random() > 0.5;
        const startX = isRightToLeft ? '110%' : '-10%';
        const endX = isRightToLeft ? '-10%' : '110%';
        const yOffset = (Math.random() * 80 + 10) + '%';
        const scale = (Math.random() * 0.4 + 0.3).toFixed(2);
        const duration = (Math.random() * 0.8 + 0.4).toFixed(2);
        const delay = (Math.random() * 1.5).toFixed(2);
        const opacity = (Math.random() * 0.6 + 0.4).toFixed(2);
        const color = isRightToLeft ? '#ff4d4d' : '#ff7676';
        const angle = isRightToLeft ? '180deg' : '0deg';
        
        domainHtml += `
          <svg class="mini-arrow" style="
            --start-x: ${startX}; --end-x: ${endX}; --y-offset: ${yOffset}; 
            --scale: ${scale}; --duration: ${duration}s; --delay: ${delay}s;
            --max-opacity: ${opacity}; --angle: ${angle};
          " viewBox="0 0 100 20">
            <path d="M 0 10 L 80 0 L 100 10 L 80 20 Z" fill="${color}"/>
            <path d="M 20 5 L 20 15" stroke="#333" stroke-width="2"/>
          </svg>
        `;
      }

      // 翻译按钮标签和成数 (1成=封, 3成=刃, 7成=芒, 10成=御, 12成=极)
      const labelsMap: Record<number, string> = {
        1: '封',
        3: '刃',
        7: '芒',
        10: '御',
        12: '极'
      };

      container.innerHTML = `
        <!-- 头部信息 -->
        <div class="mystic-force-header">
          <div class="mystic-force-title-container">
            <div class="mystic-force-icon"></div>
            <div class="mystic-force-title">${t('action.attack-intensity.title', undefined)}</div>
          </div>
        </div>

        <div class="mystic-sword-box" id="swordBox">
          <!-- 特殊背景光效层 -->
          <div class="mystic-box-glow-effect glow-state-${active}" id="boxGlow"></div>

          <!-- 万剑大阵：覆盖整个横条 -->
          <div class="mystic-sword-domain" id="swordDomain">
            ${domainHtml}
          </div>

          <!-- 武器层 -->
          <div class="mystic-weapon-layer">
            <!-- 剑身: 剑柄在右，剑刃指向左 -->
            <div class="mystic-sword-body">
              <svg viewBox="0 0 1000 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="metal-light" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ffffff"/>
                    <stop offset="30%" stop-color="#e8ebf0"/>
                    <stop offset="100%" stop-color="#b8bec7"/>
                  </linearGradient>
                  <linearGradient id="metal-dark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#9fa5ad"/>
                    <stop offset="70%" stop-color="#6a727d"/>
                    <stop offset="100%" stop-color="#3d444d"/>
                  </linearGradient>
                  <linearGradient id="gold-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#8a6f1d"/>
                    <stop offset="20%" stop-color="#ffe89e"/>
                    <stop offset="45%" stop-color="#d4af37"/>
                    <stop offset="55%" stop-color="#fdf0cd"/>
                    <stop offset="80%" stop-color="#d4af37"/>
                    <stop offset="100%" stop-color="#5c4910"/>
                  </linearGradient>
                  <linearGradient id="jade-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#a3e2c9"/>
                    <stop offset="50%" stop-color="#3a9668"/>
                    <stop offset="100%" stop-color="#144027"/>
                  </linearGradient>
                  <linearGradient id="tassel-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ff5e5e"/>
                    <stop offset="50%" stop-color="#cc0000"/>
                    <stop offset="100%" stop-color="#660000"/>
                  </linearGradient>
                  <pattern id="cord-wrap" width="8" height="18" patternUnits="userSpaceOnUse">
                    <path d="M 0 0 L 4 9 L 0 18 L 4 18 L 8 9 L 4 0 Z" fill="#991f1f" stroke="#4d0f0f" stroke-width="0.3"/>
                    <path d="M 4 0 L 8 9 L 4 18 L 0 9 Z" fill="#1b1c1e" stroke="#000000" stroke-width="0.3"/>
                  </pattern>
                </defs>

                <g id="main-sword-geom">
                  <path d="M 733 100 L 733 88 L 90 88 L 50 100 Z" fill="url(#metal-light)"/>
                  <path d="M 733 100 L 733 112 L 90 112 L 50 100 Z" fill="url(#metal-dark)"/>
                  <path d="M 733 100 L 50 100" stroke="#ffffff" stroke-width="1.2" opacity="0.9"/>
                  <path class="sword-runes" d="M 680 100 L 220 100" stroke="#6cf" stroke-width="1.5" stroke-dasharray="10 5 3 5" fill="none" opacity="0.8" />
                  <path d="M 743 76 L 743 124 L 733 124 L 733 76 Z" fill="url(#gold-grad)" stroke="#4d3b0e" stroke-width="1"/>
                  <line x1="738" y1="76" x2="738" y2="124" stroke="#4d3b0e" stroke-width="1"/>
                  <circle cx="738" cy="100" r="4" fill="#e61d1d" stroke="#ffe89e" stroke-width="0.6"/>
                  <rect x="743" y="91" width="137" height="18" rx="2" fill="url(#cord-wrap)"/>
                  <circle cx="888" cy="100" r="9" fill="url(#gold-grad)" stroke="#4d3b0e" stroke-width="1"/>
                  <circle cx="888" cy="100" r="4.5" fill="#e61d1d"/>
                </g>

                <g class="tassel-sway">
                  <path d="M 897 100 Q 920 112, 932 125" fill="none" stroke="url(#tassel-grad)" stroke-width="3.0" stroke-linecap="round"/>
                  <circle cx="932" cy="125" r="6" fill="url(#jade-grad)" stroke="#144027" stroke-width="1"/>
                  <circle cx="932" cy="125" r="2.5" fill="#ffe89e"/>
                  <path d="M 932 131 C 928 144, 920 174, 925 194 M 932 131 C 932 149, 935 177, 937 196 M 932 131 C 936 144, 945 174, 942 193" fill="none" stroke="url(#tassel-grad)" stroke-width="1.8" stroke-linecap="round" opacity="0.95"/>
                </g>
              </svg>
            </div>
            
            <!-- 剑鞘 -->
            <div class="mystic-sheath-body">
              <svg viewBox="0 0 1000 200" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="wood-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#140b05"/>
                    <stop offset="25%" stop-color="#2c1a10"/>
                    <stop offset="50%" stop-color="#20120b"/>
                    <stop offset="75%" stop-color="#3b2316"/>
                    <stop offset="100%" stop-color="#0f0703"/>
                  </linearGradient>
                  <linearGradient id="gold-grad-s" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#8a6f1d"/>
                    <stop offset="30%" stop-color="#ffe89e"/>
                    <stop offset="50%" stop-color="#d4af37"/>
                    <stop offset="100%" stop-color="#5c4910"/>
                  </linearGradient>
                  <linearGradient id="jade-grad-s" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#a3e2c9"/>
                    <stop offset="50%" stop-color="#3a9668"/>
                    <stop offset="100%" stop-color="#144027"/>
                  </linearGradient>
                  <linearGradient id="tassel-grad-s" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ff5e5e"/>
                    <stop offset="100%" stop-color="#660000"/>
                  </linearGradient>
                </defs>

                <g id="main-sheath-geom">
                  <path d="M 733 100 L 733 85 L 85 85 L 30 100 Z" fill="url(#wood-grad)" stroke="#1a0d06" stroke-width="0.5"/>
                  <path d="M 733 100 L 733 115 L 85 115 L 30 100 Z" fill="url(#wood-grad)" stroke="#1a0d06" stroke-width="0.5"/>
                  <path d="M 733 82 L 733 118 L 700 115 L 700 85 Z" fill="url(#gold-grad-s)" stroke="#4d3b0e" stroke-width="1"/>
                  <rect x="708" y="93" width="8" height="14" rx="1" fill="url(#jade-grad-s)" stroke="#144027" stroke-width="0.5"/>
                  <path d="M 100 85 L 30 100 L 100 115 L 85 100 Z" fill="url(#gold-grad-s)" stroke="#4d3b0e" stroke-width="1"/>
                  <rect x="495" y="86" width="15" height="28" fill="url(#gold-grad-s)" stroke="#4d3b0e" stroke-width="0.5"/>
                  <circle cx="502" cy="114" r="4" fill="none" stroke="url(#gold-grad-s)" stroke-width="1.5"/>
                  <rect x="295" y="87" width="15" height="26" fill="url(#gold-grad-s)" stroke="#4d3b0e" stroke-width="0.5"/>
                  <circle cx="302" cy="113" r="4" fill="none" stroke="url(#gold-grad-s)" stroke-width="1.5"/>
                  <path d="M 302 113 Q 400 132, 502 114" fill="none" stroke="url(#tassel-grad-s)" stroke-width="2.5" stroke-linecap="round"/>
                </g>

                <g class="pendant-sway">
                  <path d="M 302 113 L 302 136" stroke="url(#tassel-grad-s)" stroke-width="1.8" stroke-linecap="round"/>
                  <circle cx="302" cy="145" r="9" fill="url(#jade-grad-s)" stroke="#144027" stroke-width="1"/>
                  <circle cx="302" cy="145" r="3" fill="none" stroke="url(#gold-grad-s)" stroke-width="1.2"/>
                  <path d="M 302 155 L 302 174" stroke="url(#tassel-grad-s)" stroke-width="2.5" stroke-linecap="round"/>
                  <path d="M 300 174 L 297 190 M 302 174 L 302 193 M 304 174 L 307 190" stroke="url(#tassel-grad-s)" stroke-width="1.2" opacity="0.9"/>
                </g>
              </svg>
            </div>
          </div>

          <!-- 点击档位按钮 -->
          <div class="mystic-seal-bar">
            ${COMBAT_ATTACK_INTENSITY_OPTIONS.map((value) => `
              <button
                class="mystic-seal-node mystic-seal--${value} ${value === active ? 'active' : ''}"
                data-attack-intensity="${value}"
                type="button"
                aria-label="${t('action.attack-intensity.option', { value })}"
                aria-pressed="${value === active ? 'true' : 'false'}"
              >
                ${labelsMap[value]} <span>${value}成</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
      this.cachedAttackIntensityEl = container;
    } else {
      this.syncCachedAttackIntensityControl();
    }

    if (this.cachedAttackIntensityEl) {
      placeholder.replaceWith(this.cachedAttackIntensityEl);
    }
  }

  /** 只同步出手力度控制条状态，不重建 SVG 和动画节点。 */
  private syncCachedAttackIntensityControl(): void {
    const active = normalizeCombatAttackIntensity(this.combatAttackIntensity);
    if (!this.cachedAttackIntensityEl) {
      return;
    }
    this.cachedAttackIntensityEl.className = `attack-intensity-control state-${active}`;

    const boxGlow = this.cachedAttackIntensityEl.querySelector('#boxGlow');
    if (boxGlow) {
      boxGlow.className = `mystic-box-glow-effect glow-state-${active}`;
    }

    this.cachedAttackIntensityEl.querySelectorAll('.mystic-seal-node').forEach((node) => {
      if (!(node instanceof HTMLButtonElement)) {
        return;
      }
      const value = normalizeCombatAttackIntensity(node.dataset.attackIntensity);
      const isActive = value === active;
      node.classList.toggle('active', isActive);
      node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  /** 渲染一条状态开关卡片。 */
  private renderSwitchItem(action: ActionDef): string {
    const state = this.getSwitchCardState(action);
    return `<div class="gm-player-row ${state.active ? 'is-active' : ''}" data-action-card="${action.id}" role="button" tabindex="0">
      <div>
        <div class="gm-player-name" data-switch-title="${action.id}">${escapeHtml(this.getSwitchCardTitle(action))}</div>
        <div class="gm-player-meta" data-switch-meta="${action.id}">${escapeHtml(stripSectManagementData(action.desc))}${this.renderShortcutMeta(action.id)}</div>
      </div>
      <div class="action-card-side">
        <div class="gm-player-stat" data-switch-state="${action.id}">${state.label}</div>
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
      </div>
    </div>`;
  }

  /** 根据当前绑键状态返回按钮文案。 */
  private getBindButtonLabel(actionId: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.bindingActionId === actionId) {
      return t('action.shortcut.binding', undefined);
    }
    const binding = this.shortcutBindings.get(actionId);
    return binding ? t('action.shortcut.rebind', { key: binding.toUpperCase() }) : t('action.shortcut.bind', undefined);
  }

  /** 从本地存储读回快捷键绑定。 */
  private loadShortcutBindings(): Map<string, string> {
    try {
      const raw = localStorage.getItem(ACTION_SHORTCUTS_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw) as Record<string, string>;
      const result = new Map<string, string>();
      for (const [actionId, key] of Object.entries(parsed)) {
        const normalized = normalizeShortcutKey(key);
        if (normalized) {
          result.set(actionId, normalized);
        }
      }
      return result;
    } catch {
      return new Map();
    }
  }

  /** 把快捷键绑定写回本地存储。 */
  private saveShortcutBindings(): void {
    const payload = Object.fromEntries(this.shortcutBindings.entries());
    localStorage.setItem(ACTION_SHORTCUTS_KEY, JSON.stringify(payload));
  }

  /** 通知其他面板刷新绑键按钮状态。 */
  private notifyShortcutBindingChanged(): void {
    window.dispatchEvent(new CustomEvent(ACTION_SHORTCUTS_CHANGED_EVENT));
  }

  /** 给动作列表补上客户端工具动作和兜底技能。 */
  private withUtilityActions(actions: ActionDef[]): ActionDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const result = [...actions];
    const knownSkillActions = this.previewPlayer ? this.buildTechniqueFallbackActions(this.previewPlayer, result) : [];
    for (const action of knownSkillActions) {
      if (!result.some((entry) => entry.id === action.id)) {
        result.push(action);
      }
    }
    if (!result.some((action) => action.id === 'loot:open')) {
      result.push({
        id: 'loot:open',
        name: t('action.utility.loot.name', undefined),
        type: 'toggle',
        desc: t('action.utility.loot.desc', undefined),
        cooldownLeft: 0,
        requiresTarget: true,
        targetMode: 'tile',
        range: 1,
      });
    }
    if (!result.some((action) => action.id === 'client:observe')) {
      result.push({
        id: 'client:observe',
        name: t('action.utility.observe.name', undefined),
        type: 'toggle',
        desc: t('action.utility.observe.desc', undefined),
        cooldownLeft: 0,
        requiresTarget: true,
        targetMode: 'tile',
      });
    }
    return result;
  }

  /** 从角色已学功法里补出当前列表缺失的技能动作。 */
  private buildTechniqueFallbackActions(player: PlayerState, currentActions: ActionDef[]): ActionDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const currentSkillActions = currentActions.filter((action) => action.type === 'skill');
    const existingSkillIds = new Set(currentSkillActions.map((action) => action.id));
    const autoBattleSkillMap = new Map((player.autoBattleSkills ?? []).map((entry, index) => [entry.skillId, { entry, index }] as const));
    const playerRealmStage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const fallback: ActionDef[] = [];
    for (const technique of getSkillEnabledTechniques(player)) {
      for (const skill of technique.skills ?? []) {
        const unlockPlayerRealm = skill.unlockPlayerRealm ?? DEFAULT_PLAYER_REALM_STAGE;
        if (technique.level < resolveSkillUnlockLevel(skill) || playerRealmStage < unlockPlayerRealm) {
          continue;
        }
        if (existingSkillIds.has(skill.id)) {
          continue;
        }
        const config = autoBattleSkillMap.get(skill.id);
        fallback.push({
          id: skill.id,
          name: skill.name,
          type: 'skill',
          desc: skill.desc,
          cooldownLeft: 0,
          range: skill.targeting?.range ?? skill.range,
          requiresTarget: resolveSkillRequiresTarget(skill),
          autoBattleEnabled: skill.active === false ? false : (config?.entry.enabled ?? true),
          autoBattleOrder: config?.index,
          skillEnabled: config?.entry.skillEnabled ?? true,
          passiveOnly: skill.active === false ? true : undefined,
        });
      }
    }
    fallback.sort((left, right) => {
      const leftOrder = left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
      return (leftOrder - rightOrder) || left.id.localeCompare(right.id, 'zh-Hans-CN');
    });
    const combined = [...currentSkillActions, ...fallback]
      .sort((left, right) => {
        const leftOrder = left.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.autoBattleOrder ?? Number.MAX_SAFE_INTEGER;
        return (leftOrder - rightOrder) || left.id.localeCompare(right.id, 'zh-Hans-CN');
      });
    const normalized = this.normalizeSkillActions(combined);
    const fallbackMap = new Map(normalized.map((action) => [action.id, action] as const));
    return fallback.map((action) => fallbackMap.get(action.id) ?? action);
  }

  private renderActionDescription(action: ActionDef): string {
    if (!action.id.startsWith('scripture:contemplate:')) {
      return escapeHtml(stripSectManagementData(action.desc));
    }
    const techniqueId = normalizeActionText(action.scriptureTechniqueId);
    const techniqueName = resolveClientTechniqueName(techniqueId, action.scriptureTechniqueName, this.resolveKnownTechniqueName(techniqueId));
    const chip = `<span class="action-technique-chip" data-action-technique-tooltip="true">${escapeHtml(techniqueName)}</span>`;
    return `参悟藏经台内的${chip}。`;
  }

  private buildActionTechniqueTooltip(node: HTMLElement): { title: string; lines: string[] } | null {
    const actionId = node.closest<HTMLElement>('[data-action-row]')?.dataset.actionRow ?? '';
    const action = this.currentActions.find((entry) => entry.id === actionId);
    if (!action) {
      return null;
    }
    const techniqueId = normalizeActionText(action.scriptureTechniqueId);
    const knownTechnique = techniqueId
      ? this.previewPlayer?.techniques?.find((entry) => entry.techId === techniqueId)
      : undefined;
    const title = resolveClientTechniqueName(techniqueId, knownTechnique?.name, action.scriptureTechniqueName);
    const grade = knownTechnique?.grade ?? action.scriptureTechniqueGrade;
    const category = knownTechnique?.category ?? action.scriptureTechniqueCategory;
    const realmLv = Math.max(1, Math.trunc(Number(knownTechnique?.realmLv ?? action.scriptureTechniqueRealmLv) || 1));
    const lines = [
      `品阶：${getTechniqueGradeLabel(grade)}`,
      `类别：${getTechniqueCategoryLabel(category)}`,
      `境界：${getLocalRealmLevelEntry(realmLv)?.displayName ?? `Lv.${formatDisplayInteger(realmLv)}`}`,
    ];
    if (knownTechnique) {
      const level = Math.max(1, Math.trunc(Number(knownTechnique.level) || 1));
      const maxLevel = getTechniqueMaxLevel(Array.isArray(knownTechnique.layers) ? knownTechnique.layers : undefined, level);
      lines.push(`层数：第 ${formatDisplayInteger(level)}/${formatDisplayInteger(maxLevel)} 层`);
      const skillCount = Array.isArray(knownTechnique.skills) ? knownTechnique.skills.length : 0;
      if (skillCount > 0) {
        lines.push(`术法：${formatDisplayInteger(skillCount)} 个`);
      }
    }
    return { title, lines };
  }

  private resolveKnownTechniqueName(techniqueId: string): string {
    if (!techniqueId) {
      return '';
    }
    return normalizeActionText(this.previewPlayer?.techniques?.find((entry) => entry.techId === techniqueId)?.name);
  }

  /** 渲染单条动作或技能卡片。 */
  private renderActionItem(
    action: ActionDef,
    options?: {    
    /**
 * showDragHandle：showDragHandle相关字段。
 */

      showDragHandle?: boolean;      
      /**
 * autoBattleDisplayOrder：autoBattle显示订单相关字段。
 */

      autoBattleDisplayOrder?: number | null;
    },
  ): string {
    const onCd = action.cooldownLeft > 0;
    const isAutoBattleSkill = action.type === 'skill';
    const skillContext = this.skillLookup.get(action.id);
    const tooltipAttrs = skillContext
      ? ` data-action-tooltip-title="${escapeHtml(skillContext.skill.name)}" data-action-tooltip-skill-id="${escapeHtml(skillContext.skill.id)}" data-action-tooltip-rich="1"`
      : '';
    const autoBattleEnabled = action.autoBattleEnabled !== false;
    const autoBattleOrder = typeof options?.autoBattleDisplayOrder === 'number'
      ? options.autoBattleDisplayOrder + 1
      : undefined;
    const rowAttrs = isAutoBattleSkill && options?.showDragHandle
      ? ` data-auto-battle-skill-row="${action.id}"`
      : '';
    const autoBattleMeta = isAutoBattleSkill
      ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}">${autoBattleEnabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined)}</span>
         ${autoBattleOrder ? `<span class="action-type">${t('action.skill.order', { order: formatDisplayInteger(autoBattleOrder) })}</span>` : ''}`
      : '';
    const autoBattleControls = isAutoBattleSkill
      ? `<button class="small-btn ghost ${autoBattleEnabled ? 'active' : ''}" data-auto-battle-toggle="${action.id}" type="button">${autoBattleEnabled ? t('action.skill.auto-toggle.on', undefined) : t('action.skill.auto-toggle.off', undefined)}</button>
         ${options?.showDragHandle ? `<button class="small-btn ghost action-drag-handle" data-auto-battle-drag="${action.id}" draggable="true" type="button">${t('common.action.drag', undefined)}</button>` : ''}`
      : '';
    const affinityChip = skillContext ? this.renderActionSkillAffinityChip(skillContext.skill) : '';
    const executeLabel = action.id === 'sect:manage'
      ? t('common.action.open', undefined)
      : action.id === 'wang_qi:toggle'
        ? (this.previewPlayer?.wangQiActive === true ? t('common.action.close', undefined) : t('common.action.enable', undefined))
        : t('common.action.execute', undefined);

    return `<div class="action-item ${onCd ? 'cooldown' : ''} ${isAutoBattleSkill ? 'action-item-draggable' : ''}" data-action-row="${action.id}" data-action-card="${action.id}" role="button" tabindex="0"${rowAttrs}>
      <div class="action-copy ${skillContext ? 'action-copy-tooltip' : ''} ${affinityChip ? 'action-copy--with-affinity' : ''}"${tooltipAttrs}>
        <div>
          <span class="action-name" data-action-name-node="${action.id}">${escapeHtml(action.name)}</span>
          <span class="action-type">[${getActionTypeLabel(action.type)}]</span>
          <span class="action-type" data-action-range-node="${action.id}"${typeof action.range === 'number' ? '' : ' hidden'}>${typeof action.range === 'number' ? t('action.range', { range: formatDisplayNumber(action.range) }) : ''}</span>
          ${isAutoBattleSkill
            ? `<span class="action-type ${autoBattleEnabled ? 'auto-battle-enabled' : 'auto-battle-disabled'}" data-action-auto-state="${action.id}">${autoBattleEnabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined)}</span>
               <span class="action-type" data-action-auto-order="${action.id}"${autoBattleOrder ? '' : ' hidden'}>${autoBattleOrder ? t('action.skill.order', { order: formatDisplayInteger(autoBattleOrder) }) : ''}</span>`
            : autoBattleMeta}
          ${this.renderShortcutBadge(action.id)}
        </div>
        <div class="action-desc" data-action-desc-node="${action.id}">${this.renderActionDescription(action)}</div>
        ${affinityChip}
      </div>
      <div class="action-cta ui-action-row ui-action-row--end">
        ${autoBattleControls}
        <button class="small-btn ghost" data-bind-action="${action.id}" type="button">${this.getBindButtonLabel(action.id)}</button>
        <span class="action-cd" data-action-cd="${action.id}"${onCd ? '' : ' hidden'}>${onCd ? t('action.cooldown', { ticks: formatDisplayInteger(action.cooldownLeft) }) : ''}</span>
        <button class="small-btn" data-action="${action.id}" data-action-exec="${action.id}" data-action-name="${escapeHtml(action.name)}" data-action-range="${action.range ?? ''}" data-action-target="${action.requiresTarget ? '1' : '0'}" data-action-target-mode="${action.targetMode ?? ''}"${onCd ? ' hidden' : ''}>${executeLabel}</button>
      </div>
    </div>`;
  }

  /** 把技能的元素倾向渲染成一枚徽章。 */
  private renderActionSkillAffinityChip(skill: SkillDef): string {
    const badge = getSkillAffinityBadge(skill);
    const elementClass = badge.element === 'neutral' ? '' : ` item-card-chip--element-${badge.element}`;
    const title = escapeHtml(badge.title);
    return `<span class="item-card-chip item-card-chip--affinity item-card-chip--${badge.tone}${elementClass} action-skill-affinity-chip" aria-label="${title}">${escapeHtml(badge.label)}</span>`;
  }

  /** 切换某个自动战斗技能的启用状态。 */
  private toggleAutoBattleSkill(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, autoBattleEnabled: action.autoBattleEnabled === false }
        : action
    )));
  }

  /** 切换某个技能在列表里的可用状态。 */
  private toggleSkillEnabled(actionId: string): void {
    this.applyAutoBattleSkillMutation((skills) => skills.map((action) => (
      action.id === actionId
        ? { ...action, skillEnabled: action.skillEnabled === false }
        : action
    )));
  }

  /** 在自动战斗列表里调整技能顺位。 */
  private moveAutoBattleSkill(actionId: string, targetId: string, position: 'before' | 'after'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (actionId === targetId) return;
    this.applyAutoBattleSkillMutation((skills) => {
      const sourceIndex = skills.findIndex((action) => action.id === actionId);
      const targetIndex = skills.findIndex((action) => action.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return skills;
      }
      const next = [...skills];
      const [moved] = next.splice(sourceIndex, 1);
      const baseIndex = next.findIndex((action) => action.id === targetId);
      const insertIndex = position === 'before' ? baseIndex : baseIndex + 1;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

  /** 把自动战斗技能改动写回 currentActions 和预览角色。 */
  private applyAutoBattleSkillMutation(mutator: (skills: ActionDef[]) => ActionDef[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const skillActions = this.currentActions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        ...action,
        autoBattleEnabled: action.passiveOnly === true ? false : action.autoBattleEnabled !== false,
      }));
    const mutated = this.normalizeSkillActions(mutator(skillActions));
    this.currentActions = this.replaceSkillActions(mutated);
    if (this.previewPlayer) {
      this.previewPlayer.actions = this.currentActions.filter((action) => action.id !== 'client:observe');
      this.previewPlayer.autoBattleSkills = this.getAutoBattleSkillConfigs(this.currentActions);
    }
    this.render(this.currentActions);
    this.renderSkillManagementModalIfOpen();
    this.onUpdateAutoBattleSkills?.(this.getAutoBattleSkillConfigs(this.currentActions));
  }

  /** 按当前顺序重新编号自动战斗顺位。 */
  private withSequentialAutoBattleOrder(actions: ActionDef[]): ActionDef[] {
    return actions.map((action, index) => ({
      ...action,
      autoBattleEnabled: action.passiveOnly === true ? false : action.autoBattleEnabled !== false,
      skillEnabled: action.skillEnabled !== false,
      autoBattleOrder: index,
    }));
  }

  /** 用新的技能数组替换 currentActions 里对应的位置。 */
  private replaceSkillActions(skillActions: ActionDef[]): ActionDef[] {
    let skillIndex = 0;
    return this.currentActions.map((action) => {
      if (action.type !== 'skill') {
        return action;
      }
      return skillActions[skillIndex++] ?? action;
    });
  }

  /** 把动作快照压成自动战斗技能配置。 */
  private getAutoBattleSkillConfigs(actions: ActionDef[]): AutoBattleSkillConfig[] {
    return actions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        skillId: action.id,
        enabled: action.passiveOnly === true ? false : action.autoBattleEnabled !== false,
        skillEnabled: action.skillEnabled !== false,
      }));
  }

  /** 同步拖拽高亮状态，让当前悬停行显出插入位置。 */
  private updateDragIndicators(): void {
    document.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row], [data-skill-manage-skill-row]').forEach((row) => {
      const actionId = row.dataset.autoBattleSkillRow ?? row.dataset.skillManageSkillRow;
      const isDragging = actionId === this.draggingSkillId;
      const isBefore = actionId === this.dragOverSkillId && this.dragOverPosition === 'before';
      const isAfter = actionId === this.dragOverSkillId && this.dragOverPosition === 'after';
      row.classList.toggle('dragging', isDragging);
      row.classList.toggle('drag-over-before', isBefore);
      row.classList.toggle('drag-over-after', isAfter);
    });
  }

  /** 清掉拖拽过程中的临时状态。 */
  private clearDragState(): void {
    this.draggingSkillId = null;
    this.dragOverSkillId = null;
    this.dragOverPosition = null;
    this.updateDragIndicators();
  }

  /** 开关卡片只更新状态文本和高亮，避免自动化开关频繁触发整栏重建。 */
  private patchToggleCards(): boolean {
    if (this.activeTab !== 'toggle') {
      return true;
    }
    for (const action of this.currentActions) {
      if (!this.isSwitchAction(action)) {
        continue;
      }
      const row = this.pane.querySelector<HTMLElement>(`[data-action-card="${CSS.escape(action.id)}"]`);
      const stateNode = row?.querySelector<HTMLElement>('[data-switch-state]');
      const titleNode = row?.querySelector<HTMLElement>('[data-switch-title]');
      const metaNode = row?.querySelector<HTMLElement>('[data-switch-meta]');
      const bindNode = row?.querySelector<HTMLButtonElement>('[data-bind-action]');
      if (!row || !stateNode) {
        return false;
      }
      const state = this.getSwitchCardState(action);
      row.classList.toggle('is-active', state.active);
      stateNode.textContent = state.label;
      if (titleNode) {
        titleNode.textContent = this.getSwitchCardTitle(action);
      }
      if (metaNode) {
        metaNode.textContent = `${stripSectManagementData(action.desc)}${this.renderShortcutMeta(action.id)}`;
      }
      if (bindNode) {
        bindNode.textContent = this.getBindButtonLabel(action.id);
      }
    }
    return true;
  }

  /** 只更新动作行里会变的部分，保住冷却、顺位和按钮状态。 */
  private patchActionRows(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const autoBattleDisplayOrders = this.buildAutoBattleDisplayOrderMap(this.currentActions);
    for (const action of this.currentActions) {
      if (
        this.isSwitchAction(action)
        || action.id === 'client:observe'
        || action.type === 'breakthrough'
        || !this.isActionVisibleInCurrentPane(action)
      ) {
        continue;
      }
      const refs = this.actionRowRefs.get(action.id);
      const row = refs?.row;
      if (!row) {
        if (action.type === 'skill') {
          continue;
        }
        return false;
      }
      const onCd = action.cooldownLeft > 0;
      row.classList.toggle('cooldown', onCd);

      const cdNode = refs.cdNode;
      const execNode = refs.execNode;
      if (!cdNode || !execNode) {
        return false;
      }
      this.patchActionRowStaticText(action, refs);
      cdNode.textContent = onCd ? t('action.cooldown.left', { ticks: formatDisplayInteger(action.cooldownLeft) }) : '';
      cdNode.hidden = !onCd;
      execNode.hidden = onCd;
      execNode.disabled = onCd;
      execNode.dataset.actionName = action.name;
      execNode.dataset.actionRange = action.range == null ? '' : String(action.range);
      execNode.dataset.actionTarget = action.requiresTarget ? '1' : '0';
      execNode.dataset.actionTargetMode = action.targetMode ?? '';

      if (action.type === 'skill') {
        const stateNode = refs.stateNode;
        const orderNode = refs.orderNode;
        const toggleNode = refs.toggleNode;
        if (!stateNode || !orderNode || !toggleNode) {
          return false;
        }
        const enabled = action.autoBattleEnabled !== false;
        const showOrder = this.activeSkillTab === 'auto' && enabled;
        const order = showOrder ? (autoBattleDisplayOrders.get(action.id) ?? null) : null;
        stateNode.textContent = enabled ? t('action.skill.auto-state.enabled', undefined) : t('action.skill.auto-state.disabled', undefined);
        stateNode.classList.toggle('auto-battle-enabled', enabled);
        stateNode.classList.toggle('auto-battle-disabled', !enabled);
        orderNode.hidden = order === null;
        orderNode.textContent = order === null ? '' : t('action.skill.order', { order: order + 1 });
        toggleNode.classList.toggle('active', enabled);
        toggleNode.textContent = enabled ? t('action.skill.auto-toggle.on', undefined) : t('action.skill.auto-toggle.off', undefined);
      }
    }

    return true;
  }

  /** 动作行中允许每息变化的展示字段只改节点内容，不重建整行。 */
  private patchActionRowStaticText(action: ActionDef, refs: ActionRowRefs): void {
    if (refs.nameNode) {
      refs.nameNode.textContent = action.name;
    }
    if (refs.descNode) {
      const nextDesc = this.renderActionDescription(action);
      if (refs.descNode.innerHTML !== nextDesc) {
        refs.descNode.innerHTML = nextDesc;
      }
    }
    if (refs.rangeNode) {
      const range = typeof action.range === 'number' ? action.range : null;
      const hasRange = range !== null;
      refs.rangeNode.hidden = !hasRange;
      refs.rangeNode.textContent = range === null ? '' : t('action.range', { range: formatDisplayNumber(range) });
    }
    if (refs.bindNode) {
      refs.bindNode.textContent = this.getBindButtonLabel(action.id);
    }
  }

  /** 判断当前页签里是否实际渲染了这条行动。 */
  private isActionVisibleInCurrentPane(action: ActionDef): boolean {
    if (this.isSwitchAction(action)) {
      return this.activeTab === 'toggle';
    }
    if (this.isUtilityAction(action) || (action.type === 'toggle' && !this.isSwitchAction(action))) {
      return this.activeTab === 'utility';
    }
    switch (this.activeTab) {
      case 'dialogue':
        return ['quest', 'interact', 'travel', 'craft'].includes(action.type);
      case 'skill':
        if (action.type === 'skill') {
          if (action.skillEnabled === false || action.passiveOnly === true) {
            return false;
          }
          return this.activeSkillTab === 'auto'
            ? action.autoBattleEnabled !== false
            : action.autoBattleEnabled === false;
        }
        return action.type === 'battle' || action.type === 'gather';
      case 'toggle':
        return this.isSwitchAction(action);
      case 'utility':
        return this.isUtilityAction(action) || (action.type === 'toggle' && !this.isSwitchAction(action));
      default:
        return false;
    }
  }

  /** 渲染技能区主体，并按自动/手动给出不同说明。 */
  private renderSkillSection(actions: ActionDef[], autoBattleDisplayOrders: Map<string, number>): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const enabledSkills = actions.filter((action) => action.skillEnabled !== false && action.passiveOnly !== true);
    const autoSkills = enabledSkills.filter((action) => action.autoBattleEnabled !== false);
    const manualSkills = enabledSkills.filter((action) => action.autoBattleEnabled === false);
    const visibleSkills = this.activeSkillTab === 'auto' ? autoSkills : manualSkills;
    const slotSummary = this.getSkillSlotSummary(actions);
    const hint = this.activeSkillTab === 'auto'
      ? t('action.skill.hint.auto', { slotSummary })
      : t('action.skill.hint.manual', { slotSummary });

    let html = `<div class="panel-section action-skill-section">
      <div class="panel-section-head">
        <div class="panel-section-title">${t('action.skill.section-title', { slotSummary })}</div>
        <div class="action-section-actions">
          <button class="small-btn ghost" data-action-skill-manage-open type="button">${t('action.skill.manage', undefined)}</button>
          <button class="small-btn ghost" data-action-combat-settings-open type="button">${t('action.combat-settings.title', undefined)}</button>
          <button class="small-btn ghost" data-action-skill-preset-open type="button">${t('action.skill-preset.title', undefined)}</button>
          <button class="small-btn ghost" data-action-targeting-plan-open type="button">${t('action.targeting-plan.title-with-mode', { mode: escapeHtml(this.getAutoBattleTargetingModeLabel()) })}</button>
        </div>
      </div>
      <div class="action-skill-subtabs">
        <button class="action-skill-subtab-btn ${this.activeSkillTab === 'auto' ? 'active' : ''}" data-action-skill-tab="auto" type="button">
          ${t('action.skill.tab.auto', undefined)}
          <span class="action-skill-subtab-count">${autoSkills.length}</span>
        </button>
        <button class="action-skill-subtab-btn ${this.activeSkillTab === 'manual' ? 'active' : ''}" data-action-skill-tab="manual" type="button">
          ${t('action.skill.tab.manual', undefined)}
          <span class="action-skill-subtab-count">${manualSkills.length}</span>
        </button>
      </div>
      <div class="action-section-hint">${hint}</div>`;

    if (visibleSkills.length === 0) {
      html += `<div class="empty-hint">${this.activeSkillTab === 'auto' ? t('action.skill.empty.auto', undefined) : t('action.skill.empty.manual', undefined)}</div>`;
    } else {
      html += '<div class="action-skill-list">';
      for (const action of visibleSkills) {
        html += this.renderActionItem(action, {
          showDragHandle: this.activeSkillTab === 'auto',
          autoBattleDisplayOrder: this.activeSkillTab === 'auto'
            ? (autoBattleDisplayOrders.get(action.id) ?? null)
            : null,
        });
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /** 为可自动施放的技能生成展示顺位。 */
  private buildAutoBattleDisplayOrderMap(actions: ActionDef[]): Map<string, number> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const displayOrder = new Map<string, number>();
    let nextOrder = 0;
    for (const action of actions) {
      if (action.type !== 'skill' || action.skillEnabled === false || action.autoBattleEnabled === false) {
        continue;
      }
      displayOrder.set(action.id, nextOrder);
      nextOrder += 1;
    }
    return displayOrder;
  }

  /** 点击卡片本体时直接触发动作。 */
  private bindActionCardEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-action-card]').forEach((card) => {
      card.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea')) {
          return;
        }
        const actionId = card.dataset.actionCard;
        if (!actionId) return;
        if (actionId === 'sect:manage') {
          this.openSectManagementModal();
          return;
        }
        const action = this.currentActions.find((entry) => entry.id === actionId);
        if (action && action.cooldownLeft > 0) {
          return;
        }
        this.onAction?.(actionId, action?.requiresTarget, action?.targetMode, action?.range, action?.name?.trim() || '未知行动');
      }, { signal });
    });
  }

  /** 绑定执行按钮，读取 data-* 参数后交给外部回调。 */
  private bindActionExecEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.action!;
        if (actionId === 'sect:manage') {
          this.openSectManagementModal();
          return;
        }
        const actionName = button.dataset.actionName?.trim() || '未知行动';
        const requiresTarget = button.dataset.actionTarget === '1';
        const targetMode = button.dataset.actionTargetMode || undefined;
        const rangeText = button.dataset.actionRange;
        const range = rangeText ? Number(rangeText) : undefined;
        this.onAction?.(actionId, requiresTarget, targetMode, Number.isFinite(range) ? range : undefined, actionName);
      }, { signal });
    });
  }

  /** 进入或退出动作绑键模式。 */
  private bindBindActionEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-bind-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.bindAction;
        if (!actionId) return;
        this.toggleShortcutBinding(actionId);
      }, { signal });
    });
  }

  /** 绑定自动战斗开关按钮。 */
  private bindAutoBattleToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.autoBattleToggle;
        if (!actionId) return;
        this.toggleAutoBattleSkill(actionId);
      }, { signal });
    });
  }

  /** 绑定技能启用开关按钮。 */
  private bindSkillEnabledToggleEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-skill-enabled-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const actionId = button.dataset.skillEnabledToggle;
        if (!actionId) return;
        this.toggleSkillEnabled(actionId);
      }, { signal });
    });
  }

  /** 绑定自动战斗列表的拖拽排序交互。 */
  private bindAutoBattleDragEvents(root: HTMLElement, signal: AbortSignal): void {
    root.querySelectorAll<HTMLElement>('[data-auto-battle-drag]').forEach((handle) => {
      handle.addEventListener('dragstart', (event) => {
        const actionId = handle.dataset.autoBattleDrag;
        if (!actionId || !(event.dataTransfer instanceof DataTransfer)) return;
        this.draggingSkillId = actionId;
        this.dragOverSkillId = null;
        this.dragOverPosition = null;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', actionId);
        this.updateDragIndicators();
      }, { signal });
      handle.addEventListener('dragend', () => {
        this.clearDragState();
      }, { signal });
    });
    root.querySelectorAll<HTMLElement>('[data-auto-battle-skill-row]').forEach((row) => {
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        const actionId = row.dataset.autoBattleSkillRow;
        if (!actionId || !this.draggingSkillId || actionId === this.draggingSkillId) return;
        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        this.dragOverSkillId = actionId;
        this.dragOverPosition = event.clientY < midpoint ? 'before' : 'after';
        this.updateDragIndicators();
      }, { signal });
      row.addEventListener('dragleave', (event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && row.contains(related)) {
          return;
        }
        if (this.dragOverSkillId === row.dataset.autoBattleSkillRow) {
          this.dragOverSkillId = null;
          this.dragOverPosition = null;
          this.updateDragIndicators();
        }
      }, { signal });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const targetId = row.dataset.autoBattleSkillRow;
        if (!this.draggingSkillId || !targetId || !this.dragOverPosition) {
          this.clearDragState();
          return;
        }
        this.moveAutoBattleSkill(this.draggingSkillId, targetId, this.dragOverPosition);
        this.clearDragState();
      }, { signal });
    });
  }

  /** 从动作列表里筛出技能动作。 */
  private getSkillActions(actions: ActionDef[] = this.currentActions): ActionDef[] {
    return actions.filter((action) => action.type === 'skill');
  }

  /** 读取当前角色可启用的技能槽位上限。 */
  private getSkillSlotLimit(): number {
    return resolvePlayerSkillSlotLimitLocal(this.previewPlayer);
  }

  /** 统计当前已启用的技能数量。 */
  private getEnabledSkillCount(actions: ActionDef[] = this.currentActions): number {
    return countEnabledSkillEntriesLocal(this.getSkillActions(actions));
  }

  /** 汇总当前技能槽启用情况，供方案弹层摘要复用。 */
  private getSkillSlotSummary(actions: ActionDef[] = this.currentActions): string {
    return `${this.getEnabledSkillCount(actions)}/${this.getSkillSlotLimit()} 项`;
  }

  /** 按槽位上限规整自动战斗技能配置。 */
  private normalizeSkillConfigs(configs: AutoBattleSkillConfig[]): AutoBattleSkillConfig[] {
    return enforceSkillEnabledLimitLocal(configs.map((entry) => ({
      skillId: entry.skillId,
      enabled: entry.enabled !== false,
      skillEnabled: entry.skillEnabled !== false,
    })), this.getSkillSlotLimit());
  }

  /** 按槽位上限规整技能动作。 */
  private normalizeSkillActions(actions: ActionDef[]): ActionDef[] {
    return enforceSkillEnabledLimitLocal(this.withSequentialAutoBattleOrder(actions), this.getSkillSlotLimit());
  }

  /** 把自动战斗技能配置规整成稳定顺序，便于比较草稿差异。 */
  private normalizeAutoBattleSkillConfigsLocal(
    configs: AutoBattleSkillConfig[] | null | undefined,
  ): AutoBattleSkillConfig[] {
    const source = Array.isArray(configs) ? configs : [];
    const normalized: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();
    for (const entry of source) {
      const skillId = typeof entry?.skillId === 'string' ? entry.skillId.trim() : '';
      if (!skillId || seen.has(skillId)) {
        continue;
      }
      normalized.push({
        skillId,
        enabled: entry.enabled !== false,
        skillEnabled: entry.skillEnabled !== false,
      });
      seen.add(skillId);
    }
    return normalized;
  }

  /** 比较两份自动战斗技能配置是否完全一致。 */
  private areAutoBattleSkillConfigsEqual(
    left: AutoBattleSkillConfig[] | null | undefined,
    right: AutoBattleSkillConfig[] | null | undefined,
  ): boolean {
    const normalizedLeft = this.normalizeAutoBattleSkillConfigsLocal(left);
    const normalizedRight = this.normalizeAutoBattleSkillConfigsLocal(right);
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return normalizedLeft.every((entry, index) => {
      const target = normalizedRight[index];
      return target?.skillId === entry.skillId
        && target.enabled === entry.enabled
        && target.skillEnabled === entry.skillEnabled;
    });
  }

  /** 打开技能管理弹层，并以当前自动/手动页签作为初始视图。 */
  private openSkillManagement(): void {
    this.skillMgmt.openSkillManagement();
  }

  /** 打开战斗设置弹层。 */
  private openCombatSettingsModal(): void {
    this.combatSettings.openCombatSettingsModal();
  }

  private openTargetingPlanModal(): void {
    this.combatSettings.openTargetingPlanModal();
  }

  /** 读取当前索敌方案标签。 */
  private getAutoBattleTargetingModeLabel(mode?: AutoBattleTargetingMode): string {
    return this.combatSettings.getAutoBattleTargetingModeLabel(mode);
  }

  private renderCombatSettingsModalIfOpen(): void {
    this.combatSettings.renderCombatSettingsModalIfOpen();
  }

  private renderSectManagementModalIfOpen(): void {
    this.sectMgmt.renderSectManagementModalIfOpen();
  }

  private openSectManagementModal(): void {
    this.sectMgmt.openSectManagementModal();
  }

  /** 仅在索敌方案弹层已打开且内容变化时重绘。 */
  private renderTargetingPlanModalIfOpen(): void {
    this.combatSettings.renderTargetingPlanModalIfOpen();
  }

  /** 打开技能方案弹层。 */
  private openSkillPresetModal(): void {
    this.skillMgmt.openSkillPresetModal();
  }

  /** 仅在技能管理弹层已打开且内容变化时重绘。 */
  private renderSkillManagementModalIfOpen(): void {
    this.skillMgmt.renderSkillManagementModalIfOpen();
  }

  /** 仅在技能方案弹层已打开且内容变化时重绘。 */
  private renderSkillPresetModalIfOpen(): void {
    this.skillMgmt.renderSkillPresetModalIfOpen();
  }
}
