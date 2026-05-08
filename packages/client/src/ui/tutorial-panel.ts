import {
  TUTORIAL_FLOW_TOPICS,
  TUTORIAL_MECHANIC_TOPICS,
  TUTORIAL_TOPICS,
  type TutorialFlowTopic,
  type TutorialTopic,
} from '../constants/ui/tutorial';
import { detailModalHost } from './detail-modal-host';
import { patchElementHtml } from './dom-patch';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';
import { t } from './i18n';

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
  { label: t('tutorial.hint.suggestion.label', undefined), path: t('tutorial.hint.suggestion.path', undefined) },
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
    patchElementHtml(body, `
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
            <div class="tutorial-modal-shell ui-split-panel-shell">
              <div class="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical" aria-label="${escapeHtml(t('tutorial.panel.operations-tabs.aria', undefined))}">
                ${TUTORIAL_TOPICS.map((topic) => this.renderTab(topic)).join('')}
              </div>
              <div class="tutorial-modal-content ui-split-panel-content">
                ${TUTORIAL_TOPICS.map((topic) => this.renderPane(topic)).join('')}
              </div>
            </div>
          </section>
          <section
            class="tutorial-modal-main-pane tutorial-modal-main-pane--mechanics${this.activeMainTabId === 'mechanics' ? ' active' : ''}"
            data-tutorial-main-pane="mechanics"
            role="tabpanel"
            aria-hidden="${this.activeMainTabId === 'mechanics' ? 'false' : 'true'}"
          >
            <div class="tutorial-modal-shell ui-split-panel-shell">
              <div class="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical" aria-label="${escapeHtml(t('tutorial.panel.mechanics-tabs.aria', undefined))}">
                ${TUTORIAL_MECHANIC_TOPICS.map((topic) => this.renderMechanicTab(topic)).join('')}
              </div>
              <div class="tutorial-modal-content ui-split-panel-content">
                ${TUTORIAL_MECHANIC_TOPICS.map((topic) => this.renderMechanicPane(topic)).join('')}
              </div>
            </div>
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
    `);
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
    return `
      <button
        class="tutorial-modal-tab ui-split-panel-tab${active ? ' active' : ''}"
        type="button"
        role="tab"
        data-tutorial-tab="${escapeHtml(topic.id)}"
        aria-selected="${active ? 'true' : 'false'}"
      >
        <span class="tutorial-modal-tab-label ui-split-panel-tab-label">${escapeHtml(topic.label)}</span>
      </button>
    `;
  }

  /** renderPane：渲染Pane。 */
  private renderPane(topic: TutorialTopic): string {
    const active = topic.id === this.activeTopicId;
    return `
      <section
        class="tutorial-modal-pane${active ? ' active' : ''}"
        data-tutorial-pane="${escapeHtml(topic.id)}"
        role="tabpanel"
        aria-hidden="${active ? 'false' : 'true'}"
      >
        <div class="tutorial-pane-hero">
          <div class="tutorial-pane-kicker">${escapeHtml(t('tutorial.panel.kicker.operations', undefined))}</div>
          <div class="tutorial-pane-summary">${renderTutorialRichText(topic.summary)}</div>
        </div>
        <div class="tutorial-pane-sections">
          ${topic.sections.map((section) => `
            <section class="tutorial-section-card">
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

  /** renderMechanicTab：渲染Mechanic Tab。 */
  private renderMechanicTab(topic: TutorialTopic): string {
    const active = topic.id === this.activeMechanicTopicId;
    return `
      <button
        class="tutorial-modal-tab ui-split-panel-tab${active ? ' active' : ''}"
        type="button"
        role="tab"
        data-tutorial-mechanic-tab="${escapeHtml(topic.id)}"
        aria-selected="${active ? 'true' : 'false'}"
      >
        <span class="tutorial-modal-tab-label ui-split-panel-tab-label">${escapeHtml(topic.label)}</span>
      </button>
    `;
  }

  /** renderMechanicPane：渲染Mechanic Pane。 */
  private renderMechanicPane(topic: TutorialTopic): string {
    const active = topic.id === this.activeMechanicTopicId;
    return `
      <section
        class="tutorial-modal-pane${active ? ' active' : ''}"
        data-tutorial-mechanic-pane="${escapeHtml(topic.id)}"
        role="tabpanel"
        aria-hidden="${active ? 'false' : 'true'}"
      >
        <div class="tutorial-pane-hero">
          <div class="tutorial-pane-kicker">${escapeHtml(t('tutorial.panel.kicker.mechanics', undefined))}</div>
          <div class="tutorial-pane-summary">${renderTutorialRichText(topic.summary)}</div>
        </div>
        <div class="tutorial-pane-sections">
          ${topic.sections.map((section) => `
            <section class="tutorial-section-card">
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

  /** renderFlowGuide：渲染流转Guide。 */
  private renderFlowGuide(): string {
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
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-pane]').forEach((entry) => {
      const active = entry.dataset.tutorialPane === this.activeTopicId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-tab]').forEach((entry) => {
      const active = entry.dataset.tutorialMechanicTab === this.activeMechanicTopicId;
      entry.classList.toggle('active', active);
      entry.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    body.querySelectorAll<HTMLElement>('[data-tutorial-mechanic-pane]').forEach((entry) => {
      const active = entry.dataset.tutorialMechanicPane === this.activeMechanicTopicId;
      entry.classList.toggle('active', active);
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
