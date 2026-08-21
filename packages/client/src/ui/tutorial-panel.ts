/**
 * 本文件是客户端 DOM UI 的 tutorial panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import {
  TUTORIAL_MECHANIC_TOPICS,
  type TutorialTopic,
} from "../constants/ui/tutorial";
import {
  GUIDED_TOUR_FLOWS,
  type GuidedTourCategory,
  type GuidedTourFlow,
} from "../constants/ui/guided-tour";
import { isGuidedTourFlowUnlocked } from "./guided-tour-unlock";
import { getTutorialRealmLevelTableRows } from "../constants/ui/realm-level-table";
import { detailModalHost } from "./detail-modal-host";
import { FloatingTooltip, prefersPinnedTooltipInteraction } from "./floating-tooltip";
import { t } from "./i18n";
import { requestGuidedTour } from "./guided-tour-events";
import {
  mountReactTutorialPanel,
  resolveReactTutorialModalMeta,
  shouldUseReactTutorialPanel,
  unmountReactTutorialPanel,
} from "../react-ui/panels/tutorial/mount-tutorial-panel";

interface TutorialOperationHint {
  label: string;
  path: string;
  title?: string;
}

type MainCategoryTabId = GuidedTourCategory | "mechanics";

function resolveFlowTitle(flow: GuidedTourFlow): string {
  return t(flow.titleKey, undefined, flow.titleFallback);
}

function resolveFlowSummary(flow: GuidedTourFlow): string {
  return flow.summaryKey ? t(flow.summaryKey, undefined, flow.summaryFallback ?? "") : (flow.summaryFallback ?? "");
}

const CATEGORY_TABS: Array<{ id: MainCategoryTabId; label: string; count: number }> = [
  { id: "core", label: "核心操作", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "core").length },
  { id: "combat", label: "战斗引导", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "combat").length },
  { id: "craft", label: "技艺引导", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "craft").length },
  { id: "gameplay", label: "玩法引导", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "gameplay").length },
  { id: "mechanics", label: "机制百科", count: TUTORIAL_MECHANIC_TOPICS.length },
];

const TUTORIAL_OPERATION_HINTS: TutorialOperationHint[] = [
  { label: t("tutorial.hint.attr.label", undefined, "属性"), path: t("tutorial.hint.attr.path", undefined, "左下角") },
  { label: t("tutorial.hint.bag-scroll.label", undefined, "行囊"), path: t("tutorial.hint.bag-scroll.path", undefined, "右侧卷轴") },
  { label: t("tutorial.hint.body-training.label", undefined, "炼体"), path: t("tutorial.hint.body-training.path", undefined, "右侧卷轴->炼体") },
  { label: t("tutorial.hint.map-info.label", undefined, "地图"), path: t("tutorial.hint.map-info.path", undefined, "地图区域") },
  { label: t("tutorial.hint.mail.label", undefined, "邮件"), path: t("tutorial.hint.mail.path", undefined, "左上角->邮件") },
  { label: t("tutorial.hint.skill-management.label", undefined, "技能管理"), path: t("tutorial.hint.skill-management.path", undefined, "右下角->技能->技能管理") },
  { label: t("tutorial.hint.combat-settings.label", undefined, "战斗设置"), path: t("tutorial.hint.combat-settings.path", undefined, "右下角->技能->战斗设置") },
  { label: t("tutorial.hint.force-attack.label", undefined, "强制攻击"), path: t("tutorial.hint.force-attack.path", undefined, "右下角行动栏->通用->强制攻击") },
  { label: t("tutorial.hint.auto-battle.label", undefined, "自动战斗"), path: t("tutorial.hint.auto-battle.path", undefined, "右下角行动栏->开关->自动战斗") },
  { label: t("tutorial.hint.sense-qi.label", undefined, "感气"), path: t("tutorial.hint.sense-qi.path", undefined, "右下角行动栏->开关->感气") },
  { label: t("tutorial.hint.open-market.label", undefined, "坊市"), path: t("tutorial.hint.open-market.path", undefined, "左上角->坊市") },
  { label: t("tutorial.hint.observe.label", undefined, "观察"), path: t("tutorial.hint.observe.path", undefined, "右下角行动栏->通用->观察") },
  { label: t("tutorial.hint.take.label", undefined, "拿取"), path: t("tutorial.hint.take.path", undefined, "右下角行动栏->通用->拿取") },
];

const SORTED_TUTORIAL_OPERATION_HINTS = [...TUTORIAL_OPERATION_HINTS].sort((left, right) => right.label.length - left.label.length);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderOperationHint(hint: TutorialOperationHint): string {
  const title = hint.title ?? hint.label;
  return `<span class="tutorial-inline-action" data-tutorial-tip-title="${escapeHtml(title)}" data-tutorial-tip-detail="${escapeHtml(`[${hint.path}]`)}">${escapeHtml(hint.label)}</span>`;
}

function renderTutorialRichText(value: string): string {
  if (!value) return "";
  let cursor = 0;
  let html = "";
  while (cursor < value.length) {
    let nextHint: TutorialOperationHint | null = null;
    let nextIndex = Number.POSITIVE_INFINITY;
    for (const hint of SORTED_TUTORIAL_OPERATION_HINTS) {
      const index = value.indexOf(hint.label, cursor);
      if (index === -1) continue;
      if (index < nextIndex || (index === nextIndex && nextHint && hint.label.length > nextHint.label.length) || (index === nextIndex && !nextHint)) {
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
    cursor = nextIndex + nextHint.label.length;
  }
  return html;
}

export class TutorialPanel {
  public static readonly MODAL_OWNER = "tutorial-panel";
  private activeMainTabId: MainCategoryTabId = "core";
  private activeMechanicTopicId = TUTORIAL_MECHANIC_TOPICS[0]?.id ?? "growth";
  private readonly activeSectionTitleByTopic: Record<string, string> = {};
  private readonly showLockedByCategory: Record<string, boolean> = {};
  private readonly tooltip = new FloatingTooltip();

  constructor() {
    document.getElementById("hud-open-tutorial")?.addEventListener("click", () => this.open());
  }

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
      size: "wide",
      variantClass: "detail-modal--tutorial",
      title: t("tutorial.panel.title", undefined, "仙途指引与百科"),
      hint: t("tutorial.panel.close-hint", undefined, "点击空白处关闭"),
      renderBody: (body) => {
        this.renderBody(body);
      },
      onClose: () => {
        this.tooltip.hide(true);
      },
      onAfterRender: (body, signal) => {
        this.bind(body, signal);
      },
    });
  }

  private renderBody(body: HTMLElement): void {
    const mainTab = this.activeMainTabId;
    const isMechanics = mainTab === "mechanics";
    const flows = isMechanics ? [] : GUIDED_TOUR_FLOWS.filter((f) => f.category === mainTab);
    const unlockedFlows = flows.filter((f) => isGuidedTourFlowUnlocked(f.id));
    const lockedFlows = flows.filter((f) => !isGuidedTourFlowUnlocked(f.id));
    const showLocked = this.showLockedByCategory[mainTab] ?? false;

    body.innerHTML = `
      <div class="tutorial-modal-body">
        <div class="tutorial-modal-shell ui-split-panel-shell">
          <div class="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical">
            ${CATEGORY_TABS.map((cat) => {
              const active = mainTab === cat.id;
              return `
                <button
                  class="tutorial-modal-tab ui-split-panel-tab${active ? " active" : ""}"
                  type="button"
                  role="tab"
                  data-tutorial-cat-tab="${cat.id}"
                  aria-selected="${active ? "true" : "false"}"
                >
                  <span class="tutorial-modal-tab-label ui-split-panel-tab-label">${escapeHtml(cat.label)}</span>
                  <span class="tutorial-modal-tab-count">${cat.count}</span>
                </button>
              `;
            }).join("")}
          </div>

          <div class="tutorial-modal-content ui-split-panel-content">
            ${isMechanics ? this.renderMechanicContent() : `
              <div class="guided-tour-flow-list-container">
                ${unlockedFlows.length > 0 ? unlockedFlows.map((flow) => this.renderFlowCard(flow, true)).join("") : `
                  <div class="tutorial-pane-summary" style="padding: 12px 0; color: var(--ink-muted);">该分类暂无已解锁引导，随着主线任务推进将逐步解锁。</div>
                `}

                ${lockedFlows.length > 0 ? `
                  <div class="guided-tour-locked-section" style="margin-top: 8px;">
                    <button
                      type="button"
                      class="guided-tour-collapse-toggle-btn"
                      data-tutorial-toggle-locked="true"
                    >
                      <span>${showLocked ? "▼" : "▶"} 未解锁引导 (${lockedFlows.length})</span>
                      <span class="guided-tour-collapse-hint">${showLocked ? "收起" : "展开查看"}</span>
                    </button>
                    ${showLocked ? `
                      <div class="guided-tour-locked-list" style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                        ${lockedFlows.map((flow) => this.renderFlowCard(flow, false)).join("")}
                      </div>
                    ` : ""}
                  </div>
                ` : ""}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  private renderFlowCard(flow: GuidedTourFlow, unlocked: boolean): string {
    const title = resolveFlowTitle(flow);
    const summary = resolveFlowSummary(flow);
    return `
      <div class="guided-tour-flow-card${unlocked ? "" : " guided-tour-flow-card--locked"}">
        <div class="guided-tour-flow-card-main">
          <div class="guided-tour-flow-card-title-row">
            ${unlocked ? "" : `<span class="guided-tour-locked-tag">任务解锁</span>`}
            <div class="guided-tour-flow-card-title">${escapeHtml(title)}</div>
            <span class="guided-tour-flow-card-steps">共 ${flow.steps.length} 步</span>
          </div>
          ${summary ? `<div class="guided-tour-flow-card-summary">${escapeHtml(summary)}</div>` : ""}
        </div>
        <button
          type="button"
          class="guided-tour-start-action-btn"
          data-tutorial-start-flow="${flow.id}"
        >
          ▶ 开始引导
        </button>
      </div>
    `;
  }

  private renderMechanicContent(): string {
    const topic = TUTORIAL_MECHANIC_TOPICS.find((t) => t.id === this.activeMechanicTopicId) ?? TUTORIAL_MECHANIC_TOPICS[0];
    if (!topic) return `<div class="tutorial-pane-summary">${escapeHtml(t("tutorial.panel.empty", undefined, "暂无百科内容"))}</div>`;

    if (topic.id === "realm-table") {
      const rows = getTutorialRealmLevelTableRows();
      return `
        <section class="tutorial-modal-pane active">
          <table class="realm-table">
            <thead>
              <tr><th>Lv</th><th>等级名</th><th>大境界</th><th>升级所需修为</th></tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>Lv.${row.realmLv}</td>
                  <td>${escapeHtml(row.displayName)}</td>
                  <td>${escapeHtml(row.repeatedMajorRealm ? "—" : row.majorRealmName)}</td>
                  <td>${row.expToNext > 0 ? row.expToNext.toLocaleString() : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </section>
      `;
    }

    const activeSectionTitle = this.activeSectionTitleByTopic[topic.id] ?? topic.sections[0]?.title ?? "";
    const activeSection = topic.sections.find((s) => s.title === activeSectionTitle) ?? topic.sections[0];

    return `
      <section class="tutorial-modal-pane active">
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
          ${TUTORIAL_MECHANIC_TOPICS.map((tItem) => {
            const tActive = tItem.id === this.activeMechanicTopicId;
            return `
              <button
                type="button"
                class="tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${tActive ? " active" : ""}"
                style="flex: 0 0 auto; min-height: 34px; padding: 6px 12px; font-size: 13px; font-weight: ${tActive ? "bold" : "normal"};"
                data-tutorial-mech-topic="${tItem.id}"
              >
                ${escapeHtml(tItem.label)}
              </button>
            `;
          }).join("")}
        </div>

        ${topic.sections.length > 1 ? `
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
            ${topic.sections.map((sec) => {
              const secActive = sec.title === activeSectionTitle;
              return `
                <button
                  type="button"
                  class="tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${secActive ? " active" : ""}"
                  style="flex: 0 0 auto; min-height: 30px; padding: 4px 10px; font-size: 12px;"
                  data-tutorial-mech-sec="${escapeHtml(sec.title)}"
                >
                  ${escapeHtml(sec.title)}
                </button>
              `;
            }).join("")}
          </div>
        ` : ""}

        ${activeSection ? `
          <section class="tutorial-section-card">
            <div class="tutorial-section-title">${escapeHtml(activeSection.title)}</div>
            <ul class="tutorial-section-list">
              ${activeSection.items.map((item) => `<li>${renderTutorialRichText(item)}</li>`).join("")}
            </ul>
          </section>
        ` : ""}

        ${topic.tips && topic.tips.length > 0 ? `
          <section class="tutorial-tip-card">
            <div class="tutorial-section-title">${escapeHtml(t("tutorial.panel.tip-title", undefined, "要诀提示"))}</div>
            <ul class="tutorial-section-list tutorial-section-list--tips">
              ${topic.tips.map((tip) => `<li>${renderTutorialRichText(tip)}</li>`).join("")}
            </ul>
          </section>
        ` : ""}
      </section>
    `;
  }

  private bind(body: HTMLElement, signal?: AbortSignal): void {
    body.querySelectorAll<HTMLElement>("[data-tutorial-cat-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-tutorial-cat-tab") as MainCategoryTabId;
        if (cat) {
          this.activeMainTabId = cat;
          this.renderBody(body);
          this.bind(body, signal);
        }
      }, { signal });
    });

    body.querySelectorAll<HTMLElement>("[data-tutorial-toggle-locked]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = this.activeMainTabId;
        this.showLockedByCategory[cat] = !this.showLockedByCategory[cat];
        this.renderBody(body);
        this.bind(body, signal);
      }, { signal });
    });

    body.querySelectorAll<HTMLElement>("[data-tutorial-mech-topic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const topId = btn.getAttribute("data-tutorial-mech-topic");
        if (topId) {
          this.activeMechanicTopicId = topId;
          this.renderBody(body);
          this.bind(body, signal);
        }
      }, { signal });
    });

    body.querySelectorAll<HTMLElement>("[data-tutorial-mech-sec]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const secTitle = btn.getAttribute("data-tutorial-mech-sec");
        if (secTitle) {
          this.activeSectionTitleByTopic[this.activeMechanicTopicId] = secTitle;
          this.renderBody(body);
          this.bind(body, signal);
        }
      }, { signal });
    });

    body.querySelectorAll<HTMLElement>("[data-tutorial-start-flow]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const flowId = btn.getAttribute("data-tutorial-start-flow");
        if (flowId) {
          detailModalHost.close(TutorialPanel.MODAL_OWNER);
          requestGuidedTour(flowId);
        }
      }, { signal });
    });

    const tapMode = prefersPinnedTooltipInteraction();
    body.querySelectorAll<HTMLElement>("[data-tutorial-tip-title]").forEach((node) => {
      const title = node.getAttribute("data-tutorial-tip-title") ?? "";
      const detail = node.getAttribute("data-tutorial-tip-detail") ?? "";
      const lines = detail ? [detail] : [];
      if (!title && lines.length === 0) return;

      if (tapMode) {
        node.addEventListener("click", (e) => {
          if (this.tooltip.isPinnedTo(node)) {
            this.tooltip.hide(true);
            return;
          }
          this.tooltip.showPinned(node, title, lines, e.clientX, e.clientY);
          e.preventDefault();
          e.stopPropagation();
        }, { signal });
      } else {
        node.addEventListener("pointerenter", (e) => {
          this.tooltip.show(title, lines, e.clientX, e.clientY);
        }, { signal });
        node.addEventListener("pointermove", (e) => {
          this.tooltip.move(e.clientX, e.clientY);
        }, { signal });
        node.addEventListener("pointerleave", () => {
          this.tooltip.hide();
        }, { signal });
      }
    });
  }
}
