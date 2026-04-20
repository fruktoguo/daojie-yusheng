import {
  TUTORIAL_FLOW_TOPICS,
  TUTORIAL_MECHANIC_TOPICS,
  TUTORIAL_TOPICS,
  type TutorialFlowTopic,
  type TutorialTopic,
} from '../constants/ui/tutorial';
import { detailModalHost } from './detail-modal-host';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';

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
  { label: '点击地图格子', path: '地图区域->目标格子' },
  { label: '简易教程', path: '左上角外链区->简易教程' },
  { label: '境界/突破按钮', path: '左上角角色状态区->突破' },
  { label: '闲置自动修炼', path: '右下角行动栏->开关->闲置自动修炼' },
  { label: '修满自动切换', path: '右下角行动栏->开关->修满自动切换' },
  { label: '当前修炼', path: '右下角行动栏->开关->当前修炼' },
  { label: '强制攻击', path: '右下角行动栏->行动->强制攻击->执行' },
  { label: '自动战斗', path: '右下角行动栏->开关->自动战斗' },
  { label: '自动反击', path: '右下角行动栏->开关->自动反击' },
  { label: '原地战斗', path: '右下角行动栏->开关->原地战斗' },
  { label: '全体攻击', path: '右下角行动栏->开关->全体攻击' },
  { label: '感气视角', path: '右下角行动栏->开关->感气视角' },
  { label: '打开坊市', path: '右侧卷轴区->坊市->打开坊市' },
  { label: '前往目标', path: '右侧卷轴区->任务->任务详情->前往目标' },
  { label: '前往交付', path: '右侧卷轴区->任务->任务详情->前往交付' },
  { label: '全部拿取', path: '拾取弹层->全部拿取' },
  { label: '设为主修', path: '右侧卷轴区->功法->对应功法->设为主修' },
  { label: 'GitHub', path: '左上角外链区->GitHub' },
  { label: 'Esc', path: '键盘->Esc' },
  { label: '观察', path: '右下角行动栏->行动->观察->执行' },
  { label: '拿取', path: '右下角行动栏->行动->拿取->执行' },
  { label: '执行', path: '右下角行动栏->对应条目->执行' },
  { label: '功法', path: '右侧卷轴区->功法' },
  { label: '背包', path: '右侧卷轴区->背包' },
  { label: '装备', path: '右侧卷轴区->装备' },
  { label: '任务', path: '右侧卷轴区->任务' },
  { label: '坊市', path: '右侧卷轴区->坊市' },
  { label: '技能', path: '右下角行动栏->技能' },
  { label: '对话', path: '右下角行动栏->对话' },
  { label: '行动', path: '右下角行动栏->行动' },
  { label: '开关', path: '右下角行动栏->开关' },
  { label: '突破', path: '左上角角色状态区->突破' },
  { label: '设置', path: '左上角操作区->设置' },
  { label: '意见', path: '左上角操作区->意见' },
  { label: '史书', path: '左上角操作区->史书' },
  { label: 'QQ', path: '左上角外链区->QQ' },
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
  { id: 'operations', label: '基础操作' },
  { id: 'mechanics', label: '机制' },
  { id: 'flow', label: '流程指导' },
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
      title: '简易教程',
      subtitle: '把常用玩法讲明白，迷路时回来翻一眼就够用。',
      hint: '点击空白处关闭',
      renderBody: (body) => {
        this.renderBody(body);
      },
      onClose: () => {
        this.tooltip.hide(true);
      },
      onAfterRender: (body) => {
        this.bind(body);
        this.sync(body);
      },
    });
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement): void {
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="tutorial-modal-body">
        <div class="tutorial-modal-main-tabs ui-modal-main-tabs" role="tablist" aria-label="简易教程分类">
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
              <div class="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical" aria-label="基础操作目录">
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
              <div class="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical" aria-label="机制目录">
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
    `;
    body.replaceChildren(template.content.cloneNode(true));
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
          <div class="tutorial-pane-kicker">简明说明</div>
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
            <div class="tutorial-section-title">小提醒</div>
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
          <div class="tutorial-pane-kicker">核心机制</div>
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
            <div class="tutorial-section-title">小提醒</div>
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
        <div class="tutorial-pane-kicker">流程指导</div>
        <div class="tutorial-pane-summary">
          把常见问题按场景拆开了。你现在卡在哪一步，就直接切到对应 tab 看结论，不用从头翻完整攻略。
        </div>
      </div>
      <div class="tutorial-flow-shell ui-split-panel-shell">
        <div class="tutorial-flow-tabs ui-split-panel-tabs" role="tablist" aria-label="流程指导目录">
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
            <div class="tutorial-section-title">小提醒</div>
            <ul class="tutorial-section-list tutorial-section-list--tips">
              ${topic.tips.map((tip) => `<li>${renderTutorialRichText(tip)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
      </section>
    `;
  }

  /** bind：绑定bind。 */
  private bind(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (body.dataset.tutorialBound !== '1') {
      body.dataset.tutorialBound = '1';
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
      });
    }
    this.bindTooltips(body);
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
  private bindTooltips(body: HTMLElement): void {
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
      }, true);

      node.addEventListener('pointerenter', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.show(title, splitTooltipLines(detail), event.clientX, event.clientY);
      });

      node.addEventListener('pointermove', (event) => {
        if (tapMode && this.tooltip.isPinned()) {
          return;
        }
        this.tooltip.move(event.clientX, event.clientY);
      });

      node.addEventListener('pointerleave', () => {
        this.tooltip.hide();
      });
    });
  }
}
