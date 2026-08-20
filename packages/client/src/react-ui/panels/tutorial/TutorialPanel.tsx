/**
 * 本文件负责 教程与引导 面板的主要 React 视图入口，
 * 统一展示 4 大分类新手引导（核心操作、战斗引导、技艺引导、玩法引导）、机制百科与境界表。
 */
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TUTORIAL_MECHANIC_TOPICS,
  type TutorialTopic,
} from "../../../constants/ui/tutorial";
import {
  GUIDED_TOUR_FLOWS,
  GUIDED_TOUR_CATEGORY_METAS,
  type GuidedTourCategory,
  type GuidedTourFlow,
  type GuidedTourStep,
} from "../../../constants/ui/guided-tour";
import { getTutorialRealmLevelTableRows } from "../../../constants/ui/realm-level-table";
import { t } from "../../../ui/i18n";
import { FloatingTooltip, prefersPinnedTooltipInteraction } from "../../../ui/floating-tooltip";
import { requestGuidedTour } from "../../../ui/guided-tour-events";
import { detailModalHost } from "../../../ui/detail-modal-host";

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface TutorialOperationHint {
  label: string;
  path: string;
  title?: string;
}

type MainCategoryTabId = GuidedTourCategory | "mechanics";

interface CategoryTabItem {
  id: MainCategoryTabId;
  label: string;
  badge?: string;
}

const CATEGORY_TABS: CategoryTabItem[] = [
  { id: "core", label: "核心操作", badge: "11" },
  { id: "combat", label: "战斗引导", badge: "3" },
  { id: "craft", label: "技艺引导", badge: "5" },
  { id: "gameplay", label: "玩法引导", badge: "6" },
  { id: "mechanics", label: "机制百科", badge: "8" },
];

// ─── 静态数据 ─────────────────────────────────────────────────────────────────

const TUTORIAL_OPERATION_HINTS: TutorialOperationHint[] = [
  { label: t("tutorial.hint.attr.label"), path: t("tutorial.hint.attr.path") },
  { label: t("tutorial.hint.bag-scroll.label"), path: t("tutorial.hint.bag-scroll.path") },
  { label: t("tutorial.hint.body-training.label"), path: t("tutorial.hint.body-training.path") },
  { label: t("tutorial.hint.map-info.label"), path: t("tutorial.hint.map-info.path") },
  { label: t("tutorial.hint.leaderboard.label"), path: t("tutorial.hint.leaderboard.path") },
  { label: t("tutorial.hint.world-info.label"), path: t("tutorial.hint.world-info.path") },
  { label: t("tutorial.hint.log.label"), path: t("tutorial.hint.log.path") },
  { label: t("tutorial.hint.mail.label"), path: t("tutorial.hint.mail.path") },
  { label: t("tutorial.hint.auction.label"), path: t("tutorial.hint.auction.path") },
  { label: t("tutorial.hint.system-shop.label"), path: t("tutorial.hint.system-shop.path") },
  { label: t("tutorial.hint.interaction.label"), path: t("tutorial.hint.interaction.path") },
  { label: t("tutorial.hint.skill-management.label"), path: t("tutorial.hint.skill-management.path") },
  { label: t("tutorial.hint.combat-settings.label"), path: t("tutorial.hint.combat-settings.path") },
  { label: t("tutorial.hint.skill-preset.label"), path: t("tutorial.hint.skill-preset.path") },
  { label: t("tutorial.hint.target-lock-preset.label"), path: t("tutorial.hint.target-lock-preset.path") },
  { label: t("tutorial.hint.retreat.label"), path: t("tutorial.hint.retreat.path") },
  { label: t("tutorial.hint.click-map-tile.label"), path: t("tutorial.hint.click-map-tile.path") },
  { label: t("tutorial.hint.simple-tutorial.label"), path: t("tutorial.hint.simple-tutorial.path") },
  { label: t("tutorial.hint.breakthrough-button.label"), path: t("tutorial.hint.breakthrough-button.path") },
  { label: t("tutorial.hint.auto-idle-cultivation.label"), path: t("tutorial.hint.auto-idle-cultivation.path") },
  { label: t("tutorial.hint.auto-switch-cultivation.label"), path: t("tutorial.hint.auto-switch-cultivation.path") },
  { label: t("tutorial.hint.current-cultivation.label"), path: t("tutorial.hint.current-cultivation.path") },
  { label: t("tutorial.hint.force-attack.label"), path: t("tutorial.hint.force-attack.path") },
  { label: t("tutorial.hint.auto-battle.label"), path: t("tutorial.hint.auto-battle.path") },
  { label: t("tutorial.hint.auto-retaliate.label"), path: t("tutorial.hint.auto-retaliate.path") },
  { label: t("tutorial.hint.stationary-battle.label"), path: t("tutorial.hint.stationary-battle.path") },
  { label: t("tutorial.hint.allow-aoe-hit.label"), path: t("tutorial.hint.allow-aoe-hit.path") },
  { label: t("tutorial.hint.sense-qi.label"), path: t("tutorial.hint.sense-qi.path") },
  { label: t("tutorial.hint.open-market.label"), path: t("tutorial.hint.open-market.path") },
  { label: t("tutorial.hint.go-target.label"), path: t("tutorial.hint.go-target.path") },
  { label: t("tutorial.hint.go-submit.label"), path: t("tutorial.hint.go-submit.path") },
  { label: t("tutorial.hint.take-all.label"), path: t("tutorial.hint.take-all.path") },
  { label: t("tutorial.hint.set-cultivate.label"), path: t("tutorial.hint.set-cultivate.path") },
  { label: "GitHub", path: t("tutorial.hint.github.path") },
  { label: t("tutorial.hint.cancel-key.label"), path: t("tutorial.hint.cancel-key.path") },
  { label: t("tutorial.hint.observe.label"), path: t("tutorial.hint.observe.path") },
  { label: t("tutorial.hint.take.label"), path: t("tutorial.hint.take.path") },
  { label: t("tutorial.hint.execute.label"), path: t("tutorial.hint.execute.path") },
  { label: t("tutorial.hint.technique.label"), path: t("tutorial.hint.technique.path") },
  { label: t("tutorial.hint.inventory.label"), path: t("tutorial.hint.inventory.path") },
  { label: t("tutorial.hint.equipment.label"), path: t("tutorial.hint.equipment.path") },
  { label: t("tutorial.hint.quest.label"), path: t("tutorial.hint.quest.path") },
  { label: t("tutorial.hint.market.label"), path: t("tutorial.hint.market.path") },
  { label: t("tutorial.hint.skill.label"), path: t("tutorial.hint.skill.path") },
  { label: t("tutorial.hint.dialog.label"), path: t("tutorial.hint.dialog.path") },
  { label: t("tutorial.hint.action.label"), path: t("tutorial.hint.action.path") },
  { label: t("tutorial.hint.toggle.label"), path: t("tutorial.hint.toggle.path") },
  { label: t("tutorial.hint.breakthrough.label"), path: t("tutorial.hint.breakthrough.path") },
  { label: t("tutorial.hint.settings.label"), path: t("tutorial.hint.settings.path") },
  { label: t("tutorial.hint.activity.label"), path: t("tutorial.hint.activity.path") },
  { label: t("tutorial.hint.changelog.label"), path: t("tutorial.hint.changelog.path") },
  { label: "QQ", path: t("tutorial.hint.qq.path") },
];

const SORTED_HINTS = [...TUTORIAL_OPERATION_HINTS].sort((a, b) => b.label.length - a.label.length);

// ─── Rich text 解析 ──────────────────────────────────────────────────────────

interface RichTextSegment {
  type: "text" | "hint";
  value: string;
  hint?: TutorialOperationHint;
}

function parseRichText(value: string): RichTextSegment[] {
  if (!value) return [];
  const segments: RichTextSegment[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    let nextHint: TutorialOperationHint | null = null;
    let nextIndex = Infinity;
    for (const hint of SORTED_HINTS) {
      const idx = value.indexOf(hint.label, cursor);
      if (idx === -1) continue;
      if (idx < nextIndex || (idx === nextIndex && nextHint && hint.label.length > nextHint.label.length)) {
        nextHint = hint;
        nextIndex = idx;
      }
    }
    if (!nextHint || !Number.isFinite(nextIndex)) {
      segments.push({ type: "text", value: value.slice(cursor) });
      break;
    }
    if (nextIndex > cursor) {
      segments.push({ type: "text", value: value.slice(cursor, nextIndex) });
    }
    segments.push({ type: "hint", value: nextHint.label, hint: nextHint });
    cursor = nextIndex + nextHint.label.length;
  }
  return segments;
}

function RichText({ text }: { text: string }) {
  const segments = useMemo(() => parseRichText(text), [text]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <TutorialInlineAction key={i} hint={seg.hint!} />
        ),
      )}
    </>
  );
}

function TutorialInlineAction({ hint }: { hint: TutorialOperationHint }) {
  const title = hint.title ?? hint.label;
  const tooltipRef = useRef<FloatingTooltip | null>(null);
  const nodeRef = useRef<HTMLSpanElement | null>(null);
  const tapMode = useMemo(() => prefersPinnedTooltipInteraction(), []);
  const lines = useMemo(() => [`[${hint.path}]`], [hint.path]);
  const getTooltip = useCallback(() => {
    if (!tooltipRef.current) {
      tooltipRef.current = new FloatingTooltip();
    }
    return tooltipRef.current;
  }, []);
  const hide = useCallback((immediate = false) => {
    tooltipRef.current?.hide(immediate);
  }, []);

  useEffect(() => () => {
    const tooltip = tooltipRef.current;
    tooltipRef.current = null;
    tooltip?.destroy();
  }, []);

  return (
    <span
      ref={nodeRef}
      className="tutorial-inline-action"
      data-tutorial-tip-title={title}
      data-tutorial-tip-detail={`[${hint.path}]`}
      onClick={(event) => {
        if (!tapMode || !nodeRef.current) {
          return;
        }
        const tooltip = getTooltip();
        if (tooltip.isPinnedTo(nodeRef.current)) {
          hide(true);
          return;
        }
        tooltip.showPinned(nodeRef.current, title, lines, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerEnter={(event) => {
        const tooltip = getTooltip();
        if (tapMode && tooltip.isPinned()) {
          return;
        }
        tooltip.show(title, lines, event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        const tooltip = getTooltip();
        if (tapMode && tooltip.isPinned()) {
          return;
        }
        tooltip.move(event.clientX, event.clientY);
      }}
      onPointerLeave={() => {
        hide();
      }}
    >
      {hint.label}
    </span>
  );
}

// ─── 搜索 ─────────────────────────────────────────────────────────────────────

type SearchMatch =
  | { type: "guided-tour"; flow: GuidedTourFlow }
  | { type: "mechanic"; topic: TutorialTopic; sections: Array<{ title: string; items: string[] }>; tips: string[] };

function getSearchMatches(topics: TutorialTopic[], flows: GuidedTourFlow[], query: string): SearchMatch[] {
  const q = query.toLowerCase();
  const results: SearchMatch[] = [];

  // 搜索 GuidedTourFlows
  for (const flow of flows) {
    const title = (t(flow.titleKey) || flow.titleFallback).toLowerCase();
    const summary = (flow.summaryKey ? t(flow.summaryKey) : flow.summaryFallback ?? "").toLowerCase();
    const stepHit = flow.steps.some(
      (s) => (t(s.titleKey) || s.titleFallback).toLowerCase().includes(q) || (t(s.bodyKey) || s.bodyFallback).toLowerCase().includes(q)
    );
    if (title.includes(q) || summary.includes(q) || stepHit) {
      results.push({ type: "guided-tour", flow });
    }
  }

  // 搜索机制百科
  for (const topic of topics) {
    const topicHit = topic.label.toLowerCase().includes(q) || topic.summary.toLowerCase().includes(q);
    if (topic.id === "realm-table") {
      const realmHit = topicHit || REALM_LEVEL_TABLE_ROWS.some(
        (row) => row.displayName.toLowerCase().includes(q) || row.majorRealmName.toLowerCase().includes(q)
      );
      if (realmHit) {
        results.push({ type: "mechanic", topic, sections: [], tips: [] });
      }
      continue;
    }
    const sections = topic.sections.flatMap((s) => {
      const sectionHit = s.title.toLowerCase().includes(q);
      const items = (topicHit || sectionHit) ? s.items : s.items.filter((item) => item.toLowerCase().includes(q));
      return items.length > 0 ? [{ title: s.title, items }] : [];
    });
    const tips = topicHit ? (topic.tips ?? []) : (topic.tips ?? []).filter((tip) => tip.toLowerCase().includes(q));
    if (sections.length > 0 || tips.length > 0) {
      results.push({ type: "mechanic", topic, sections, tips });
    }
  }

  return results;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let key = 0;
  while (start < text.length) {
    const idx = text.toLowerCase().indexOf(q, start);
    if (idx === -1) { parts.push(text.slice(start)); break; }
    if (idx > start) parts.push(text.slice(start, idx));
    parts.push(<mark key={key++} className="tutorial-search-highlight">{text.slice(idx, idx + q.length)}</mark>);
    start = idx + q.length;
  }
  return <>{parts}</>;
}

function SearchResults({ query, topics, flows, onStartFlow }: {
  query: string;
  topics: TutorialTopic[];
  flows: GuidedTourFlow[];
  onStartFlow: (flowId: string) => void;
}) {
  const matches = useMemo(() => getSearchMatches(topics, flows, query), [topics, flows, query]);
  if (matches.length === 0) return <div className="tutorial-search-empty">无匹配结果</div>;
  return (
    <div className="tutorial-search-results">
      {matches.map((match, idx) => {
        if (match.type === "guided-tour") {
          const flow = match.flow;
          const title = t(flow.titleKey) || flow.titleFallback;
          const summary = flow.summaryKey ? t(flow.summaryKey) : flow.summaryFallback;
          return (
            <div key={`flow-${flow.id}-${idx}`} className="tutorial-search-group">
              <div className="guided-tour-hero-header">
                <div className="guided-tour-hero-title-group">
                  <span className={`guided-tour-category-tag guided-tour-category-tag--${flow.category}`}>
                    {GUIDED_TOUR_CATEGORY_METAS.find((m) => m.id === flow.category)?.label ?? flow.category}
                  </span>
                  <div className="tutorial-search-group-label">
                    <Highlight text={title} query={query} />
                  </div>
                </div>
                <button
                  type="button"
                  className="guided-tour-start-action-btn"
                  onClick={() => onStartFlow(flow.id)}
                >
                  ▶ 开始引导
                </button>
              </div>
              {summary && <div className="tutorial-flow-step-summary"><Highlight text={summary} query={query} /></div>}
            </div>
          );
        }
        const { topic, sections, tips } = match;
        return (
          <div key={`topic-${topic.id}-${idx}`} className="tutorial-search-group">
            <div className="tutorial-search-group-label"><Highlight text={topic.label} query={query} /></div>
            {topic.id === "realm-table" && <div className="tutorial-search-match-item">境界升级数据表</div>}
            {sections.map((section) => (
              <div key={section.title} className="tutorial-section-card tutorial-search-section">
                <div className="tutorial-section-title"><Highlight text={section.title} query={query} /></div>
                <ul className="tutorial-section-list">
                  {section.items.map((item, i) => <li key={i}><RichText text={item} /></li>)}
                </ul>
              </div>
            ))}
            {tips.length > 0 && (
              <div className="tutorial-tip-card tutorial-search-section">
                <div className="tutorial-section-title">{t("tutorial.panel.tip-title")}</div>
                <ul className="tutorial-section-list tutorial-section-list--tips">
                  {tips.map((tip, i) => <li key={i}><RichText text={tip} /></li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function TutorialPanelContent() {
  const [mainTab, setMainTab] = useState<MainCategoryTabId>("core");
  const [activeFlowIdByCategory, setActiveFlowIdByCategory] = useState<Record<GuidedTourCategory, string>>({
    core: GUIDED_TOUR_FLOWS.find((f) => f.category === "core")?.id ?? "starter-basics",
    combat: GUIDED_TOUR_FLOWS.find((f) => f.category === "combat")?.id ?? "force-attack-guide",
    craft: GUIDED_TOUR_FLOWS.find((f) => f.category === "craft")?.id ?? "mining-guide",
    gameplay: GUIDED_TOUR_FLOWS.find((f) => f.category === "gameplay")?.id ?? "tower-guide",
  });
  const [mechanicId, setMechanicId] = useState(TUTORIAL_MECHANIC_TOPICS[0]?.id ?? "operations");
  const [searchQuery, setSearchQuery] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  const hidePinnedTooltips = useCallback(() => {
    panelRef.current?.querySelectorAll<HTMLElement>("[data-tutorial-tip-title]").forEach((node) => {
      node.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
    });
  }, []);

  const handleStartFlow = useCallback((flowId: string) => {
    detailModalHost.close("tutorial-panel");
    requestGuidedTour(flowId);
  }, []);

  return (
    <div className="tutorial-modal-body" ref={panelRef}>
      <div className="tutorial-search-bar">
        <input
          className="tutorial-search-input"
          type="text"
          placeholder="搜索新手引导或机制百科内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="tutorial-search-clear" type="button" onClick={() => setSearchQuery("")}>✕</button>
        )}
      </div>

      {searchQuery ? (
        <SearchResults
          query={searchQuery}
          topics={TUTORIAL_MECHANIC_TOPICS}
          flows={GUIDED_TOUR_FLOWS}
          onStartFlow={handleStartFlow}
        />
      ) : (
        <div className="tutorial-modal-shell ui-split-panel-shell" style={{ gridTemplateColumns: "190px minmax(0, 1fr)" }}>
          {/* 左侧一级主分类列表 + 选中的二级条目 */}
          <div className="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical">
            {CATEGORY_TABS.map((cat) => {
              const active = mainTab === cat.id;
              const isMechanics = cat.id === "mechanics";
              const catFlows = isMechanics ? [] : GUIDED_TOUR_FLOWS.filter((f) => f.category === cat.id);
              const currentActiveFlowId = !isMechanics ? (activeFlowIdByCategory[cat.id as GuidedTourCategory] ?? catFlows[0]?.id ?? "") : "";

              return (
                <div key={cat.id} className="tutorial-modal-tab-group" style={{ marginBottom: 4 }}>
                  {/* 一级分类 Tab */}
                  <button
                    className={`tutorial-modal-tab ui-split-panel-tab${active ? " active" : ""}`}
                    style={{
                      fontWeight: "bold",
                      fontSize: "14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: active ? "linear-gradient(180deg, rgba(214, 188, 142, 0.28), rgba(197, 60, 60, 0.12))" : undefined
                    }}
                    type="button"
                    role="tab"
                    aria-selected={active ? "true" : "false"}
                    onClick={() => {
                      hidePinnedTooltips();
                      setMainTab(cat.id);
                    }}
                  >
                    <span className="tutorial-modal-tab-label ui-split-panel-tab-label">{cat.label}</span>
                    <span style={{ fontSize: "11px", opacity: 0.7, padding: "1px 5px", borderRadius: 4, background: "rgba(0,0,0,0.06)" }}>
                      {cat.badge}
                    </span>
                  </button>

                  {/* 二级引导条目列表（展开当前选中分类） */}
                  {active && !isMechanics && catFlows.length > 0 && (
                    <div className="tutorial-modal-subtabs" role="tablist" style={{ paddingLeft: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                      {catFlows.map((flow) => {
                        const flowActive = currentActiveFlowId === flow.id;
                        const title = t(flow.titleKey) || flow.titleFallback;
                        return (
                          <button
                            key={flow.id}
                            className={`tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${flowActive ? " active" : ""}`}
                            style={{ padding: "6px 8px", fontSize: "12px", minHeight: 30 }}
                            type="button"
                            role="tab"
                            aria-selected={flowActive ? "true" : "false"}
                            onClick={() => {
                              hidePinnedTooltips();
                              setActiveFlowIdByCategory((prev) => ({ ...prev, [cat.id as GuidedTourCategory]: flow.id }));
                            }}
                          >
                            <span className="tutorial-modal-tab-label ui-split-panel-tab-label">{title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 机制百科子章节 */}
                  {active && isMechanics && (
                    <div className="tutorial-modal-subtabs" role="tablist" style={{ paddingLeft: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                      {TUTORIAL_MECHANIC_TOPICS.map((topic) => {
                        const topicActive = mechanicId === topic.id;
                        return (
                          <button
                            key={topic.id}
                            className={`tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${topicActive ? " active" : ""}`}
                            style={{ padding: "6px 8px", fontSize: "12px", minHeight: 30 }}
                            type="button"
                            role="tab"
                            aria-selected={topicActive ? "true" : "false"}
                            onClick={() => {
                              hidePinnedTooltips();
                              setMechanicId(topic.id);
                            }}
                          >
                            <span className="tutorial-modal-tab-label ui-split-panel-tab-label">{topic.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 右侧内容详情 */}
          <div className="tutorial-modal-content ui-split-panel-content">
            {mainTab === "mechanics" ? (
              <MechanicPaneContainer
                topics={TUTORIAL_MECHANIC_TOPICS}
                activeId={mechanicId}
                onSelect={setMechanicId}
                onNestedSelect={hidePinnedTooltips}
              />
            ) : (
              <GuidedTourCategoryPane
                category={mainTab}
                activeFlowId={activeFlowIdByCategory[mainTab]}
                onStartFlow={handleStartFlow}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 获取教程弹层 meta */
export function getTutorialModalMeta() {
  return {
    title: t("tutorial.panel.title"),
    hint: t("tutorial.panel.close-hint"),
    size: "wide" as const,
    variantClass: "detail-modal--tutorial",
  };
}

// ─── 引导流视图面板 ──────────────────────────────────────────────────────────

const GuidedTourCategoryPane = memo(function GuidedTourCategoryPane({
  category,
  activeFlowId,
  onStartFlow,
}: {
  category: GuidedTourCategory;
  activeFlowId?: string;
  onStartFlow: (flowId: string) => void;
}) {
  const catFlows = useMemo(() => GUIDED_TOUR_FLOWS.filter((f) => f.category === category), [category]);
  const flow = catFlows.find((f) => f.id === activeFlowId) ?? catFlows[0];

  if (!flow) {
    return <div className="tutorial-pane-summary">该分类下暂无引导条目</div>;
  }

  const title = t(flow.titleKey) || flow.titleFallback;
  const summary = flow.summaryKey ? t(flow.summaryKey) : flow.summaryFallback;
  const categoryMeta = GUIDED_TOUR_CATEGORY_METAS.find((m) => m.id === flow.category);

  return (
    <section className="tutorial-modal-pane active">
      {/* 头部 Hero 卡片 */}
      <div className="guided-tour-flow-hero">
        <div className="guided-tour-hero-header">
          <div className="guided-tour-hero-title-group">
            <span className={`guided-tour-category-tag guided-tour-category-tag--${flow.category}`}>
              {categoryMeta?.label ?? flow.category}
            </span>
            <div className="tutorial-section-title" style={{ margin: 0 }}>
              {title}
            </div>
          </div>
          <button
            type="button"
            className="guided-tour-start-action-btn"
            onClick={() => onStartFlow(flow.id)}
          >
            ▶ 开始操作引导
          </button>
        </div>
        {summary && <div className="tutorial-pane-summary">{summary}</div>}
      </div>

      {/* 步骤列表 */}
      <div className="guided-tour-steps-container">
        <div className="tutorial-section-title" style={{ marginTop: 8 }}>
          引导步骤清单（共 {flow.steps.length} 步）
        </div>
        {flow.steps.map((step: GuidedTourStep, idx: number) => {
          const stepTitle = t(step.titleKey) || step.titleFallback;
          const stepBody = t(step.bodyKey) || step.bodyFallback;
          return (
            <div key={step.id} className="guided-tour-step-card">
              <div className="guided-tour-step-index">{idx + 1}</div>
              <div className="guided-tour-step-content">
                <div className="guided-tour-step-title">{stepTitle}</div>
                <div className="guided-tour-step-desc">
                  <RichText text={stepBody} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
});

// ─── 机制百科容器 ────────────────────────────────────────────────────────────

function MechanicPaneContainer({
  topics,
  activeId,
  onSelect,
  onNestedSelect,
}: {
  topics: TutorialTopic[];
  activeId: string;
  onSelect: (id: string) => void;
  onNestedSelect?: () => void;
}) {
  const [activeSectionByTopic, setActiveSectionByTopic] = useState<Record<string, string>>({});
  const topic = topics.find((t) => t.id === activeId) ?? topics[0];

  if (!topic) {
    return <div className="tutorial-pane-summary">{t("tutorial.panel.empty")}</div>;
  }

  const resolveActiveSectionTitle = (top: TutorialTopic) =>
    activeSectionByTopic[top.id] ?? top.sections[0]?.title ?? "";

  const activeSectionTitle = resolveActiveSectionTitle(topic);
  const activeSection = topic.sections.find((s) => s.title === activeSectionTitle) ?? topic.sections[0] ?? null;

  return (
    <section className="tutorial-modal-pane active">
      {topic.id === "realm-table" ? (
        <RealmTablePane />
      ) : (
        <>
          {/* 子章节 Tab 切换（若有多个子节） */}
          {topic.sections.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {topic.sections.map((sec) => {
                const secActive = sec.title === activeSectionTitle;
                return (
                  <button
                    key={sec.title}
                    type="button"
                    className={`tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${secActive ? " active" : ""}`}
                    style={{ flex: "0 0 auto", minHeight: 32, padding: "4px 10px" }}
                    onClick={() => {
                      onNestedSelect?.();
                      setActiveSectionByTopic((prev) => ({ ...prev, [topic.id]: sec.title }));
                    }}
                  >
                    {sec.title}
                  </button>
                );
              })}
            </div>
          )}

          {activeSection && (
            <section className="tutorial-section-card" role="tabpanel" aria-label={activeSection.title}>
              <div className="tutorial-section-title">{activeSection.title}</div>
              <ul className="tutorial-section-list">
                {activeSection.items.map((item, ii) => (
                  <li key={ii}><RichText text={item} /></li>
                ))}
              </ul>
            </section>
          )}

          {topic.tips && topic.tips.length > 0 && (
            <section className="tutorial-tip-card">
              <div className="tutorial-section-title">{t("tutorial.panel.tip-title")}</div>
              <ul className="tutorial-section-list tutorial-section-list--tips">
                {topic.tips.map((tip, ti) => (
                  <li key={ti}><RichText text={tip} /></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}

// ─── 境界表 ──────────────────────────────────────────────────────────────────

const REALM_LEVEL_TABLE_ROWS = getTutorialRealmLevelTableRows();

const RealmTablePane = memo(function RealmTablePane() {
  return (
    <section className="tutorial-modal-pane active">
      <table className="realm-table">
        <thead>
          <tr>
            <th>Lv</th>
            <th>等级名</th>
            <th>大境界</th>
            <th>升级所需修为</th>
          </tr>
        </thead>
        <tbody>
          {REALM_LEVEL_TABLE_ROWS.map((row) => (
            <tr key={row.realmLv}>
              <td>Lv.{row.realmLv}</td>
              <td>{row.displayName}</td>
              <td>{row.repeatedMajorRealm ? "—" : row.majorRealmName}</td>
              <td>{row.expToNext > 0 ? row.expToNext.toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
