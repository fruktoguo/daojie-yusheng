/**
 * 本文件是客户端 DOM UI 的 tutorial panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import {
  TUTORIAL_FLOW_TOPICS,
  TUTORIAL_MECHANIC_TOPICS,
  TUTORIAL_TOPICS,
  type TutorialFlowTopic,
  type TutorialTopic,
} from '../constants/ui/tutorial';
import { getTutorialRealmLevelTableRows } from '../constants/ui/realm-level-table';
import { detailModalHost } from './detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { t } from './i18n';
import {
  mountReactTutorialPanel,
  resolveReactTutorialModalMeta,
  shouldUseReactTutorialPanel,
  unmountReactTutorialPanel,
} from '../react-ui/panels/tutorial/mount-tutorial-panel';

/** TutorialOperationHint：教程操作提示。 */
interface TutorialOperationHint {
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * path：路径相关字段。
 */

  path: string;  
  /**
 * title：title名称或显示文本。
 */

  title?: string;
}

const TUTORIAL_OPERATION_HINTS: TutorialOperationHint[] = [
  { label: t('tutorial.hint.attr.label', undefined), path: t('tutorial.hint.attr.path', undefined) },
  { label: t('tutorial.hint.bag-scroll.label', undefined), path: t('tutorial.hint.bag-scroll.path', undefined) },
  { label: t('tutorial.hint.body-training.label', undefined), path: t('tutorial.hint.body-training.path', undefined) },
  { label: t('tutorial.hint.map-info.label', undefined), path: t('tutorial.hint.map-info.path', undefined) },
  { label: t('tutorial.hint.leaderboard.label', undefined), path: t('tutorial.hint.leaderboard.path', undefined) },
  { label: t('tutorial.hint.world-info.label', undefined), path: t('tutorial.hint.world-info.path', undefined) },
  { label: t('tutorial.hint.log.label', undefined), path: t('tutorial.hint.log.path', undefined) },
  { label: t('tutorial.hint.mail.label', undefined), path: t('tutorial.hint.mail.path', undefined) },
  { label: t('tutorial.hint.auction.label', undefined), path: t('tutorial.hint.auction.path', undefined) },
  { label: t('tutorial.hint.system-shop.label', undefined), path: t('tutorial.hint.system-shop.path', undefined) },
  { label: t('tutorial.hint.interaction.label', undefined), path: t('tutorial.hint.interaction.path', undefined) },
  { label: t('tutorial.hint.skill-management.label', undefined), path: t('tutorial.hint.skill-management.path', undefined) },
  { label: t('tutorial.hint.combat-settings.label', undefined), path: t('tutorial.hint.combat-settings.path', undefined) },
  { label: t('tutorial.hint.skill-preset.label', undefined), path: t('tutorial.hint.skill-preset.path', undefined) },
  { label: t('tutorial.hint.target-lock-preset.label', undefined), path: t('tutorial.hint.target-lock-preset.path', undefined) },
  { label: t('tutorial.hint.retreat.label', undefined), path: t('tutorial.hint.retreat.path', undefined) },
  { label: t('tutorial.hint.click-map-tile.label', undefined), path: t('tutorial.hint.click-map-tile.path', undefined) },
  { label: t('tutorial.hint.simple-tutorial.label', undefined), path: t('tutorial.hint.simple-tutorial.path', undefined) },
  { label: t('tutorial.hint.breakthrough-button.label', undefined), path: t('tutorial.hint.breakthrough-button.path', undefined) },
  { label: t('tutorial.hint.auto-idle-cultivation.label', undefined), path: t('tutorial.hint.auto-idle-cultivation.path', undefined) },
  { label: t('tutorial.hint.auto-switch-cultivation.label', undefined), path: t('tutorial.hint.auto-switch-cultivation.path', undefined) },
  { label: t('tutorial.hint.current-cultivation.label', undefined), path: t('tutorial.hint.current-cultivation.path', undefined) },
  { label: t('tutorial.hint.force-attack.label', undefined), path: t('tutorial.hint.force-attack.path', undefined) },
  { label: t('tutorial.hint.auto-battle.label', undefined), path: t('tutorial.hint.auto-battle.path', undefined) },
  { label: t('tutorial.hint.auto-retaliate.label', undefined), path: t('tutorial.hint.auto-retaliate.path', undefined) },
  { label: t('tutorial.hint.stationary-battle.label', undefined), path: t('tutorial.hint.stationary-battle.path', undefined) },
  { label: t('tutorial.hint.allow-aoe-hit.label', undefined), path: t('tutorial.hint.allow-aoe-hit.path', undefined) },
  { label: t('tutorial.hint.sense-qi.label', undefined), path: t('tutorial.hint.sense-qi.path', undefined) },
  { label: t('tutorial.hint.open-market.label', undefined), path: t('tutorial.hint.open-market.path', undefined) },
  { label: t('tutorial.hint.go-target.label', undefined), path: t('tutorial.hint.go-target.path', undefined) },
  { label: t('tutorial.hint.go-submit.label', undefined), path: t('tutorial.hint.go-submit.path', undefined) },
  { label: t('tutorial.hint.take-all.label', undefined), path: t('tutorial.hint.take-all.path', undefined) },
  { label: t('tutorial.hint.set-cultivate.label', undefined), path: t('tutorial.hint.set-cultivate.path', undefined) },
  { label: 'GitHub', path: t('tutorial.hint.github.path', undefined) },
  { label: t('tutorial.hint.cancel-key.label', undefined), path: t('tutorial.hint.cancel-key.path', undefined) },
  { label: t('tutorial.hint.observe.label', undefined), path: t('tutorial.hint.observe.path', undefined) },
  { label: t('tutorial.hint.take.label', undefined), path: t('tutorial.hint.take.path', undefined) },
  { label: t('tutorial.hint.execute.label', undefined), path: t('tutorial.hint.execute.path', undefined) },
  { label: t('tutorial.hint.technique.label', undefined), path: t('tutorial.hint.technique.path', undefined) },
  { label: t('tutorial.hint.inventory.label', undefined), path: t('tutorial.hint.inventory.path', undefined) },
  { label: t('tutorial.hint.equipment.label', undefined), path: t('tutorial.hint.equipment.path', undefined) },
  { label: t('tutorial.hint.quest.label', undefined), path: t('tutorial.hint.quest.path', undefined) },
  { label: t('tutorial.hint.market.label', undefined), path: t('tutorial.hint.market.path', undefined) },
  { label: t('tutorial.hint.skill.label', undefined), path: t('tutorial.hint.skill.path', undefined) },
  { label: t('tutorial.hint.dialog.label', undefined), path: t('tutorial.hint.dialog.path', undefined) },
  { label: t('tutorial.hint.action.label', undefined), path: t('tutorial.hint.action.path', undefined) },
  { label: t('tutorial.hint.toggle.label', undefined), path: t('tutorial.hint.toggle.path', undefined) },
  { label: t('tutorial.hint.breakthrough.label', undefined), path: t('tutorial.hint.breakthrough.path', undefined) },
  { label: t('tutorial.hint.settings.label', undefined), path: t('tutorial.hint.settings.path', undefined) },
  { label: t('tutorial.hint.activity.label', undefined), path: t('tutorial.hint.activity.path', undefined) },
  { label: t('tutorial.hint.changelog.label', undefined), path: t('tutorial.hint.changelog.path', undefined) },
  { label: 'QQ', path: t('tutorial.hint.qq.path', undefined) },
];

const SORTED_TUTORIAL_OPERATION_HINTS = [...TUTORIAL_OPERATION_HINTS].sort((left, right) => right.label.length - left.label.length);

/** TutorialMainTabId：教程主分类页签。 */
type TutorialMainTabId = 'operations' | 'mechanics' | 'flow';
/** TutorialFlowTopicId：流程指导主题 ID。 */
type TutorialFlowTopicId = string;

const TUTORIAL_MAIN_TABS: Array<{
/**
 * id：ID标识。
 */
 id: TutorialMainTabId;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { id: 'operations', label: t('tutorial.main-tab.operations', undefined) },
  { id: 'mechanics', label: t('tutorial.main-tab.mechanics', undefined) },
  { id: 'flow', label: t('tutorial.main-tab.flow', undefined) },
];

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** splitTooltipLines：处理split提示Lines。 */
function splitTooltipLines(detail: string): string[] {
  return detail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** renderOperationHint：渲染Operation Hint。 */
function renderOperationHint(hint: TutorialOperationHint): string {
  const title = hint.title ?? hint.label;
  return `<span class="tutorial-inline-action" data-tutorial-tip-title="${escapeHtml(title)}" data-tutorial-tip-detail="${escapeHtml(`[${hint.path}]`)}">${escapeHtml(hint.label)}</span>`;
}

/** renderTutorialRichText：渲染Tutorial Rich文本。 */
function renderTutorialRichText(value: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value) {
    return '';
  }
  let cursor = 0;
  let html = '';
  while (cursor < value.length) {
    let nextHint: TutorialOperationHint | null = null;
    let nextIndex = Number.POSITIVE_INFINITY;

    for (const hint of SORTED_TUTORIAL_OPERATION_HINTS) {
      const index = value.indexOf(hint.label, cursor);
      if (index === -1) {
        continue;
      }
      if (
        index < nextIndex
        || (index === nextIndex && nextHint && hint.label.length > nextHint.label.length)
        || (index === nextIndex && !nextHint)
      ) {
        nextHint = hint;
        nextIndex = index;
      }
    }

    if (!nextHint || !Number.isFinite(nextIndex)) {
      html += escapeHtml(value.slice(cursor));
      break;
    }

    if (nextIndex > cursor) {
      html += escapeHtml(value.slice(cursor, nextIndex));
    }
    html += renderOperationHint(nextHint);
    /** cursor：cursor。 */
    cursor = nextIndex + nextHint.label.length;
  }
  return html;
}

/** TutorialPanel：Tutorial面板实现。 */
export class TutorialPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'tutorial-panel';
  /** activeMainTabId：活跃主流程Tab ID。 */
  private activeMainTabId: TutorialMainTabId = 'operations';
  /** activeTopicId：活跃Topic ID。 */
  private activeTopicId = TUTORIAL_TOPICS[0]?.id ?? 'basics';
  /** activeMechanicTopicId：活跃Mechanic Topic ID。 */
  private activeMechanicTopicId = TUTORIAL_MECHANIC_TOPICS[0]?.id ?? 'aura';
  /** activeFlowTopicId：活跃流转Topic ID。 */
  private activeFlowTopicId: TutorialFlowTopicId = TUTORIAL_FLOW_TOPICS[0]?.id ?? 'how-to-play';
  /** activeSectionTitleByTopic：每个百科专题当前选中的子页标题。 */
  private readonly activeSectionTitleByTopic: Record<string, string> = {};
  /** tooltip：提示。 */
  private readonly tooltip = new FloatingTooltip();  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    document.getElementById('hud-open-tutorial')?.addEventListener('click', () => this.open());
  }

  /** open：打开open。 */
  open(): void {
    if (shouldUseReactTutorialPanel()) {
      const meta = resolveReactTutorialModalMeta();
      detailModalHost.open({
        ownerId: TutorialPanel.MODAL_OWNER,
        size: meta.size,
        variantClass: meta.variantClass,
        title: meta.title,
        subtitle: meta.subtitle,
        hint: meta.hint,
        renderBody: (body) => {
          body.replaceChildren();
        },
        onClose: unmountReactTutorialPanel,
        onAfterRender: (body, signal) => {
          mountReactTutorialPanel(body, signal);
        },
      });
      return;
    }
    detailModalHost.open({
      ownerId: TutorialPanel.MODAL_OWNER,
      size: 'wide',
      variantClass: 'detail-modal--tutorial',
      title: t('tutorial.panel.title', undefined),
      subtitle: t('tutorial.panel.subtitle', undefined),
      hint: t('tutorial.panel.close-hint', undefined),
      renderBody: (body) => {
        this.renderBody(body);
      },
      onClose: () => {
        this.tooltip.hide(true);
      },
      onAfterRender: (body, signal) => {
        this.bind(body, signal);
        this.sync(body);
      },
    });
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement): void {
    body.innerHTML = `
      <div class="tutorial-modal-body">
        <div class="tutorial-modal-main-tabs ui-modal-main-tabs" role="tablist" aria-label="${escapeHtml(t('tutorial.panel.main-tabs.aria', undefined))}">
          ${TUTORIAL_MAIN_TABS.map((tab) => this.renderMainTab(tab.id, tab.label)).join('')}
        </div>
        <div class="tutorial-modal-main-panes">
          <section
            class="tutorial-modal-main-pane tutorial-modal-main-pane--operations${this.activeMainTabId === 'operations' ? ' active' : ''}"
            data-tutorial-main-pane="operations"
            role="tabpanel"
            aria-hidden="${this.activeMainTabId === 'operations' ? 'false' : 'true'}"
          >
            ${this.renderTopicShell(
              TUTORIAL_TOPICS,
              t('tutorial.panel.operations-tabs.aria', undefined),
              (topic) => this.renderTab(topic),
              (topic) => this.renderPane(topic),
            )}
          </section>
          <section
            class="tutorial-modal-main-pane tutorial-modal-main-pane--mechanics${this.activeMainTabId === 'mechanics' ? ' active' : ''}"
            data-tutorial-main-pane="mechanics"
            role="tabpanel"
            aria-hidden="${this.activeMainTabId === 'mechanics' ? 'false' : 'true'}"
          >
            ${this.renderTopicShell(
              TUTORIAL_MECHANIC_TOPICS,
              t('tutorial.panel.mechanics-tabs.aria', undefined),
              (topic) => this.renderMechanicTab(topic),
              (topic) => this.renderMechanicPane(topic),
            )}
          </section>
          <section
            class="tutorial-modal-main-pane tutorial-modal-main-pane--flow${this.activeMainTabId === 'flow' ? ' active' : ''}"
            data-tutorial-main-pane="flow"
            role="tabpanel"
            aria-hidden="${this.activeMainTabId === 'flow' ? 'false' : 'true'}"
          >
            ${this.renderFlowGuide()}
          </section>
        </div>
      </div>
    `;
  }

  /** renderTopicShell：渲染教程专题外壳，支持内容留空。 */
  private renderTopicShell(
    topics: TutorialTopic[],
    ariaLabel: string,
    renderTab: (topic: TutorialTopic) => string,
    renderPane: (topic: TutorialTopic) => string,
  ): string {
    if (topics.length <= 0) {
      return this.renderEmptyPane();
    }
    return `
      <div class="tutorial-modal-shell ui-split-panel-shell">
        <div class="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical" aria-label="${escapeHtml(ariaLabel)}">
          ${topics.map((topic) => renderTab(topic)).join('')}
        </div>
        <div class="tutorial-modal-content ui-split-panel-content">
          ${topics.map((topic) => renderPane(topic)).join('')}
        </div>
      </div>
    `;
  }

  /** renderEmptyPane：渲染教程空态。 */
  private renderEmptyPane(): string {
    return `<div class="tutorial-modal-content ui-split-panel-content"><section class="tutorial-modal-pane active"><div class="tutorial-pane-summary">${escapeHtml(t('tutorial.panel.empty', undefined))}</div></section></div>`;
  }

  /** renderMainTab：渲染主流程Tab。 */
  private renderMainTab(id: TutorialMainTabId, label: string): string {
    const active = id === this.activeMainTabId;
    return `
      <button
        class="tutorial-modal-main-tab ui-modal-main-tab${active ? ' active' : ''}"
        type="button"
        role="tab"
        data-tutorial-main-tab="${id}"
        aria-selected="${active ? 'true' : 'false'}"
      >
        ${escapeHtml(label)}
      </button>
    `;
  }

  /** renderTab：渲染Tab。 */
  private renderTab(topic: TutorialTopic): string {
    const active = topic.id === this.activeTopicId;
    const activeSectionTitle = this.resolveActiveSectionTitle(topic);
    const expandedAttr = topic.sections.length > 0 ? `aria-expanded="${active ? 'true' : 'false'}"` : '';
    return `
      <div class="tutorial-modal-tab-group">
        <button
          class="tutorial-modal-tab ui-split-panel-tab${active ? ' active' : ''}"
          type="button"
          role="tab"
          data-tutorial-tab="${escapeHtml(topic.id)}"
          aria-selected="${active ? 'true' : 'false'}"
          ${expandedAttr}
        >
          <span class="tutorial-modal-tab-label ui-split-panel-tab-label">${escapeHtml(topic.label)}</span>
        </button>
        ${this.renderTopicSectionTabs(
          topic,
          active,
          activeSectionTitle,
          'data-tutorial-section-tabs',
          'data-tutorial-section-tab',
          'data-tutorial-section-topic',
        )}
      </div>
    `;
  }

  /** renderPane：渲染Pane。 */
  private renderPane(topic: TutorialTopic): string {
    const active = topic.id === this.activeTopicId;
    const activeSectionTitle = this.resolveActiveSectionTitle(topic);
    return `
      <section
        class="tutorial-modal-pane${active ? ' active' : ''}"
        data-tutorial-pane="${escapeHtml(topic.id)}"
        role="tabpanel"
        aria-hidden="${active ? 'false' : 'true'}"
      >
        <div class="tutorial-pane-sections">
          ${this.renderTopicSectionPanes(
            topic,
            activeSectionTitle,
            'data-tutorial-section-pane',
            'data-tutorial-section-topic',
          )}
        </div>
        ${topic.tips && topic.tips.length > 0 ? `
          <section class="tutorial-tip-card">
            <div class="tutorial-section-title">${escapeHtml(t('tutorial.panel.tip-title', undefined))}</div>
            <ul class="tutorial-section-list tutorial-section-list--tips">
              ${topic.tips.map((tip) => `<li>${renderTutorialRichText(tip)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
      </section>
    `;
  }

  /** renderMechanicTab：渲染Mechanic Tab。 */
  private renderMechanicTab(topic: TutorialTopic): string {
    const active = topic.id === this.activeMechanicTopicId;
    const activeSectionTitle = this.resolveActiveSectionTitle(topic);
    const expandedAttr = topic.sections.length > 0 ? `aria-expanded="${active ? 'true' : 'false'}"` : '';
    return `
      <div class="tutorial-modal-tab-group">
        <button
          class="tutorial-modal-tab ui-split-panel-tab${active ? ' active' : ''}"
          type="button"
          role="tab"
          data-tutorial-mechanic-tab="${escapeHtml(topic.id)}"
          aria-selected="${active ? 'true' : 'false'}"
          ${expandedAttr}
        >
          <span class="tutorial-modal-tab-label ui-split-panel-tab-label">${escapeHtml(topic.label)}</span>
        </button>
        ${this.renderTopicSectionTabs(
          topic,
          active,
          activeSectionTitle,
          'data-tutorial-mechanic-section-tabs',
          'data-tutorial-mechanic-section-tab',
          'data-tutorial-mechanic-section-topic',
        )}
      </div>
    `;
  }

  /** renderMechanicPane：渲染Mechanic Pane。 */
  private renderMechanicPane(topic: TutorialTopic): string {
    const active = topic.id === this.activeMechanicTopicId;
    const activeSectionTitle = this.resolveActiveSectionTitle(topic);
    return `
      <section
        class="tutorial-modal-pane${active ? ' active' : ''}"
        data-tutorial-mechanic-pane="${escapeHtml(topic.id)}"
        role="tabpanel"
        aria-hidden="${active ? 'false' : 'true'}"
      >
        ${topic.id === 'realm-table' ? this.renderRealmTable() : `
          <div class="tutorial-pane-sections">
            ${this.renderTopicSectionPanes(
              topic,
              activeSectionTitle,
              'data-tutorial-mechanic-section-pane',
              'data-tutorial-mechanic-section-topic',
            )}
          </div>
        `}
        ${topic.tips && topic.tips.length > 0 ? `
          <section class="tutorial-tip-card">
            <div class="tutorial-section-title">${escapeHtml(t('tutorial.panel.tip-title', undefined))}</div>
            <ul class="tutorial-section-list tutorial-section-list--tips">
              ${topic.tips.map((tip) => `<li>${renderTutorialRichText(tip)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
      </section>
    `;
  }

  /** resolveActiveSectionTitle：获取专题当前子页标题。 */
  private resolveActiveSectionTitle(topic: TutorialTopic): string {
    return this.activeSectionTitleByTopic[topic.id] ?? topic.sections[0]?.title ?? '';
  }

  /** renderTopicSectionTabs：渲染专题左侧子页签。 */
  private renderTopicSectionTabs(
    topic: TutorialTopic,
    topicActive: boolean,
    activeSectionTitle: string,
    sectionTabsAttr: string,
    sectionTabAttr: string,
    sectionTopicAttr: string,
  ): string {
    if (topic.sections.length <= 0) {
      return '';
    }
    return `
      <div
        class="tutorial-modal-subtabs"
        role="tablist"
        aria-label="${escapeHtml(`${topic.label}子类`)}"
        aria-hidden="${topicActive ? 'false' : 'true'}"
        ${topicActive ? '' : 'hidden'}
        ${sectionTabsAttr}="${escapeHtml(topic.id)}"
      >
        ${topic.sections.map((section) => {
          const sectionActive = topicActive && section.title === activeSectionTitle;
          return `
            <button
              class="tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${sectionActive ? ' active' : ''}"
              type="button"
              role="tab"
              aria-selected="${sectionActive ? 'true' : 'false'}"
              ${sectionTabAttr}="${escapeHtml(section.title)}"
              ${sectionTopicAttr}="${escapeHtml(topic.id)}"
            >
              <span class="tutorial-modal-tab-label ui-split-panel-tab-label">${escapeHtml(section.title)}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  /** renderTopicSectionPanes：渲染专题右侧子页内容。 */
  private renderTopicSectionPanes(
    topic: TutorialTopic,
    activeSectionTitle: string,
    sectionPaneAttr: string,
    sectionTopicAttr: string,
  ): string {
    return topic.sections.map((section) => {
      const sectionActive = section.title === activeSectionTitle;
      return `
        <section
          class="tutorial-section-card tutorial-topic-section-pane${sectionActive ? ' active' : ''}"
          role="tabpanel"
          aria-label="${escapeHtml(section.title)}"
          aria-hidden="${sectionActive ? 'false' : 'true'}"
          ${sectionActive ? '' : 'hidden'}
          ${sectionPaneAttr}="${escapeHtml(section.title)}"
          ${sectionTopicAttr}="${escapeHtml(topic.id)}"
        >
          <div class="tutorial-section-title">${escapeHtml(section.title)}</div>
          <ul class="tutorial-section-list">
            ${section.items.map((item) => `<li>${renderTutorialRichText(item)}</li>`).join('')}
          </ul>
        </section>
      `;
    }).join('');
  }

  /** renderRealmTable：渲染逐级境界表。 */
  private renderRealmTable(): string {
    const rows = getTutorialRealmLevelTableRows();
    return `
      <section class="tutorial-section-card">
        <table class="realm-table">
          <thead>
            <tr>
              <th>Lv</th>
              <th>等级名</th>
              <th>大境界</th>
              <th>升级所需修为</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>Lv.${escapeHtml(String(row.realmLv))}</td>
                <td>${escapeHtml(row.displayName)}</td>
                <td>${escapeHtml(row.repeatedMajorRealm ? '—' : row.majorRealmName)}</td>
                <td>${escapeHtml(row.expToNext > 0 ? row.expToNext.toLocaleString() : '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  /** renderFlowGuide：渲染流转Guide。 */
  private renderFlowGuide(): string {
    if (TUTORIAL_FLOW_TOPICS.length <= 0) {
      return this.renderEmptyPane();
    }
    return `
      <div class="tutorial-pane-hero tutorial-pane-hero--flow">
        <div class="tutorial-pane-kicker">${escapeHtml(t('tutorial.panel.kicker.flow', undefined))}</div>
        <div class="tutorial-pane-summary">
          ${renderTutorialRichText(t('tutorial.panel.flow.summary', undefined))}
        </div>
      </div>
      <div class="tutorial-flow-shell ui-split-panel-shell">
        <div class="tutorial-flow-tabs ui-split-panel-tabs" role="tablist" aria-label="${escapeHtml(t('tutorial.panel.flow-tabs.aria', undefined))}">
          ${TUTORIAL_FLOW_TOPICS.map((topic) => this.renderFlowTab(topic)).join('')}
        </div>
        <div class="tutorial-flow-content ui-split-panel-content">
          ${TUTORIAL_FLOW_TOPICS.map((topic) => this.renderFlowPane(topic)).join('')}
        </div>
      </div>
    `;
  }

  /** renderFlowTab：渲染流转Tab。 */
  private renderFlowTab(topic: TutorialFlowTopic): string {
    const active = topic.id === this.activeFlowTopicId;
    return `
      <button
        class="tutorial-flow-tab ui-split-panel-tab${active ? ' active' : ''}"
        type="button"
        role="tab"
        data-tutorial-flow-tab="${escapeHtml(topic.id)}"
        aria-selected="${active ? 'true' : 'false'}"
      >
        <span class="tutorial-flow-tab-label ui-split-panel-tab-label">${escapeHtml(topic.label)}</span>
      </button>
    `;
  }

  /** renderFlowPane：渲染流转Pane。 */
  private renderFlowPane(topic: TutorialFlowTopic): string {
    const active = topic.id === this.activeFlowTopicId;
    return `
      <section
        class="tutorial-flow-pane${active ? ' active' : ''}"
        data-tutorial-flow-pane="${escapeHtml(topic.id)}"
        role="tabpanel"
        aria-hidden="${active ? 'false' : 'true'}"
      >
        <div class="tutorial-flow-pane-head">
          <div class="tutorial-section-title">${escapeHtml(topic.label)}</div>
          <div class="tutorial-flow-step-summary">${renderTutorialRichText(topic.summary)}</div>
        </div>
        <div class="tutorial-flow-grid">
          ${topic.sections.map((section) => `
            <section class="tutorial-flow-card">
              <div class="tutorial-section-title">${escapeHtml(section.title)}</div>
              <ul class="tutorial-section-list">
                ${section.items.map((item) => `<li>${renderTutorialRichText(item)}</li>`).join('')}
              </ul>
            </section>
          `).join('')}
        </div>
        ${topic.tips && topic.tips.length > 0 ? `
          <section class="tutorial-tip-card">
            <div class="tutorial-section-title">${escapeHtml(t('tutorial.panel.tip-title', undefined))}</div>
            <ul class="tutorial-section-list tutorial-section-list--tips">
              ${topic.tips.map((tip) => `<li>${renderTutorialRichText(tip)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
      </section>
    `;
  }

  /** bind：绑定bind。 */
  private bind(body: HTMLElement, signal: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    body.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const mainTab = target.closest<HTMLElement>('[data-tutorial-main-tab]');
      if (mainTab) {
        const nextId = mainTab.dataset.tutorialMainTab as TutorialMainTabId | undefined;
        if (!nextId || nextId === this.activeMainTabId) {
          return;
        }
        this.activeMainTabId = nextId;
        this.tooltip.hide(true);
        this.sync(body);
        return;
      }
      const topicTab = target.closest<HTMLElement>('[data-tutorial-tab]');
      if (topicTab) {
        const nextId = topicTab.dataset.tutorialTab;
        if (!nextId || nextId === this.activeTopicId) {
          return;
        }
        this.activeTopicId = nextId;
        this.sync(body);
        return;
      }
      const topicSectionTab = target.closest<HTMLElement>('[data-tutorial-section-tab]');
      if (topicSectionTab) {
        const nextTopicId = topicSectionTab.dataset.tutorialSectionTopic;
        const nextSectionTitle = topicSectionTab.dataset.tutorialSectionTab;
        if (!nextTopicId || !nextSectionTitle) {
          return;
        }
        const unchanged = nextTopicId === this.activeTopicId && this.activeSectionTitleByTopic[nextTopicId] === nextSectionTitle;
        this.activeTopicId = nextTopicId;
        this.activeSectionTitleByTopic[nextTopicId] = nextSectionTitle;
        this.tooltip.hide(true);
        if (!unchanged) {
          this.sync(body);
        }
        return;
      }
      const mechanicTab = target.closest<HTMLElement>('[data-tutorial-mechanic-tab]');
      if (mechanicTab) {
        const nextId = mechanicTab.dataset.tutorialMechanicTab;
        if (!nextId || nextId === this.activeMechanicTopicId) {
          return;
        }
        this.activeMechanicTopicId = nextId;
        this.tooltip.hide(true);
        this.sync(body);
        return;
      }
      const mechanicSectionTab = target.closest<HTMLElement>('[data-tutorial-mechanic-section-tab]');
      if (mechanicSectionTab) {
        const nextTopicId = mechanicSectionTab.dataset.tutorialMechanicSectionTopic;
        const nextSectionTitle = mechanicSectionTab.dataset.tutorialMechanicSectionTab;
        if (!nextTopicId || !nextSectionTitle) {
          return;
        }
        const unchanged = nextTopicId === this.activeMechanicTopicId && this.activeSectionTitleByTopic[nextTopicId] === nextSectionTitle;
        this.activeMechanicTopicId = nextTopicId;
        this.activeSectionTitleByTopic[nextTopicId] = nextSectionTitle;
        this.tooltip.hide(true);
        if (!unchanged) {
          this.sync(body);
        }
        return;
      }
      const flowTab = target.closest<HTMLElement>('[data-tutorial-flow-tab]');
      if (!flowTab) {
        return;
      }
      const nextId = flowTab.dataset.tutorialFlowTab;
      if (!nextId || nextId === this.activeFlowTopicId) {
        return;
      }
      this.activeFlowTopicId = nextId;
      this.tooltip.hide(true);
      this.sync(body);
    }, { signal });
    this.bindTooltips(body, signal);
  }

  /** sync：同步同步。 */
  private sync(body: HTMLElement): void {
    body.querySelectorAll<HTMLElement>('[data-tutorial-main-tab]').forEach((entry) => {
      const active = entry.dataset.tutorialMainTab === this.activeMainTabId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-main-pane]').forEach((entry) => {
      const active = entry.dataset.tutorialMainPane === this.activeMainTabId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-tab]').forEach((entry) => {
      const active = entry.dataset.tutorialTab === this.activeTopicId;
      const topic = TUTORIAL_TOPICS.find((item) => item.id === entry.dataset.tutorialTab);
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
      if (topic && topic.sections.length > 0) {
        entry.setAttribute('aria-expanded', active ? 'true' : 'false');
      } else {
        entry.removeAttribute('aria-expanded');
      }
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-pane]').forEach((entry) => {
      const active = entry.dataset.tutorialPane === this.activeTopicId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-section-tabs]').forEach((entry) => {
      const active = entry.dataset.tutorialSectionTabs === this.activeTopicId;
      entry.hidden = !active;
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-section-tab]').forEach((entry) => {
      const topicId = entry.dataset.tutorialSectionTopic ?? '';
      const sectionTitle = entry.dataset.tutorialSectionTab ?? '';
      const topic = TUTORIAL_TOPICS.find((item) => item.id === topicId);
      const active = topicId === this.activeTopicId && sectionTitle === (topic ? this.resolveActiveSectionTitle(topic) : '');
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-section-pane]').forEach((entry) => {
      const topicId = entry.dataset.tutorialSectionTopic ?? '';
      const sectionTitle = entry.dataset.tutorialSectionPane ?? '';
      const topic = TUTORIAL_TOPICS.find((item) => item.id === topicId);
      const active = topicId === this.activeTopicId && sectionTitle === (topic ? this.resolveActiveSectionTitle(topic) : '');
      entry.classList.toggle('active', active);
      entry.hidden = !active;
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-tab]').forEach((entry) => {
      const active = entry.dataset.tutorialMechanicTab === this.activeMechanicTopicId;
      const topic = TUTORIAL_MECHANIC_TOPICS.find((item) => item.id === entry.dataset.tutorialMechanicTab);
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
      if (topic && topic.sections.length > 0) {
        entry.setAttribute('aria-expanded', active ? 'true' : 'false');
      } else {
        entry.removeAttribute('aria-expanded');
      }
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-pane]').forEach((entry) => {
      const active = entry.dataset.tutorialMechanicPane === this.activeMechanicTopicId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-section-tabs]').forEach((entry) => {
      const active = entry.dataset.tutorialMechanicSectionTabs === this.activeMechanicTopicId;
      entry.hidden = !active;
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-section-tab]').forEach((entry) => {
      const topicId = entry.dataset.tutorialMechanicSectionTopic ?? '';
      const sectionTitle = entry.dataset.tutorialMechanicSectionTab ?? '';
      const topic = TUTORIAL_MECHANIC_TOPICS.find((item) => item.id === topicId);
      const active = topicId === this.activeMechanicTopicId && sectionTitle === (topic ? this.resolveActiveSectionTitle(topic) : '');
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-section-pane]').forEach((entry) => {
      const topicId = entry.dataset.tutorialMechanicSectionTopic ?? '';
      const sectionTitle = entry.dataset.tutorialMechanicSectionPane ?? '';
      const topic = TUTORIAL_MECHANIC_TOPICS.find((item) => item.id === topicId);
      const active = topicId === this.activeMechanicTopicId && sectionTitle === (topic ? this.resolveActiveSectionTitle(topic) : '');
      entry.classList.toggle('active', active);
      entry.hidden = !active;
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-flow-tab]').forEach((entry) => {
      const active = entry.dataset.tutorialFlowTab === this.activeFlowTopicId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-flow-pane]').forEach((entry) => {
      const active = entry.dataset.tutorialFlowPane === this.activeFlowTopicId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  }

  /** bindTooltips：绑定Tooltips。 */
  private bindTooltips(body: HTMLElement, signal: AbortSignal): void {
    const tapMode = prefersPinnedTooltipInteraction();
    body.querySelectorAll<HTMLElement>('[data-tutorial-tip-title]').forEach((node) => {
      const title = node.dataset.tutorialTipTitle ?? '';
      const detail = node.dataset.tutorialTipDetail ?? '';

      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (this.tooltip.isPinnedTo(node)) {
          this.tooltip.hide(true);
          return;
        }
        this.tooltip.showPinned(node, title, splitTooltipLines(detail), event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      }, { capture: true, signal });

      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.show(title, splitTooltipLines(detail), event.clientX, event.clientY);
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
}
