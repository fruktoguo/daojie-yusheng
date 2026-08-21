/**
 * 本文件负责 教程与引导 面板的主要 React 视图入口，
 * 左侧展示 4 大引导分类与机制百科 Tab，右侧展示已解锁引导与未解锁折叠引导列表。
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
} from "../../../constants/ui/guided-tour";
import { isGuidedTourFlowUnlocked } from "../../../ui/guided-tour-unlock";
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
  count: number;
}

const CATEGORY_TABS: CategoryTabItem[] = [
  { id: "core", label: "核心操作", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "core").length },
  { id: "combat", label: "战斗引导", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "combat").length },
  { id: "craft", label: "技艺引导", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "craft").length },
  { id: "gameplay", label: "玩法引导", count: GUIDED_TOUR_FLOWS.filter((f) => f.category === "gameplay").length },
  { id: "mechanics", label: "机制百科", count: TUTORIAL_MECHANIC_TOPICS.length },
];

function resolveFlowTitle(flow: GuidedTourFlow): string {
  return t(flow.titleKey, undefined, flow.titleFallback);
}

function resolveFlowSummary(flow: GuidedTourFlow): string {
  return flow.summaryKey ? t(flow.summaryKey, undefined, flow.summaryFallback ?? "") : (flow.summaryFallback ?? "");
}

// ─── 静态数据 ─────────────────────────────────────────────────────────────────

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

  for (const flow of flows) {
    const title = resolveFlowTitle(flow).toLowerCase();
    const summary = resolveFlowSummary(flow).toLowerCase();
    const stepHit = flow.steps.some(
      (s) => t(s.titleKey, undefined, s.titleFallback).toLowerCase().includes(q) || t(s.bodyKey, undefined, s.bodyFallback).toLowerCase().includes(q)
    );
    if (title.includes(q) || summary.includes(q) || stepHit) {
      results.push({ type: "guided-tour", flow });
    }
  }

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
          const title = resolveFlowTitle(flow);
          const summary = resolveFlowSummary(flow);
          const catMeta = GUIDED_TOUR_CATEGORY_METAS.find((m) => m.id === flow.category);
          const unlocked = isGuidedTourFlowUnlocked(flow.id);
          return (
            <div key={`flow-${flow.id}-${idx}`} className={`guided-tour-flow-card${unlocked ? "" : " guided-tour-flow-card--locked"}`}>
              <div className="guided-tour-flow-card-main">
                <div className="guided-tour-flow-card-title-row">
                  <span className={`guided-tour-category-tag guided-tour-category-tag--${flow.category}`}>
                    {catMeta?.label ?? flow.category}
                  </span>
                  {!unlocked && <span className="guided-tour-locked-tag">任务解锁</span>}
                  <div className="guided-tour-flow-card-title">
                    <Highlight text={title} query={query} />
                  </div>
                  <span className="guided-tour-flow-card-steps">共 {flow.steps.length} 步</span>
                </div>
                {summary && (
                  <div className="guided-tour-flow-card-summary">
                    <Highlight text={summary} query={query} />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="guided-tour-start-action-btn"
                onClick={() => onStartFlow(flow.id)}
              >
                ▶ 开始引导
              </button>
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
                <div className="tutorial-section-title">{t("tutorial.panel.tip-title", undefined, "要诀提示")}</div>
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
  const [mechanicId, setMechanicId] = useState(TUTORIAL_MECHANIC_TOPICS[0]?.id ?? "growth");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLockedByCategory, setShowLockedByCategory] = useState<Record<string, boolean>>({});
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

  const currentCategoryFlows = useMemo(() => {
    if (mainTab === "mechanics") return [];
    return GUIDED_TOUR_FLOWS.filter((f) => f.category === mainTab);
  }, [mainTab]);

  const { unlockedFlows, lockedFlows } = useMemo(() => {
    const unlocked: GuidedTourFlow[] = [];
    const locked: GuidedTourFlow[] = [];
    for (const flow of currentCategoryFlows) {
      if (isGuidedTourFlowUnlocked(flow.id)) {
        unlocked.push(flow);
      } else {
        locked.push(flow);
      }
    }
    return { unlockedFlows: unlocked, lockedFlows: locked };
  }, [currentCategoryFlows]);

  const showLocked = showLockedByCategory[mainTab] ?? false;

  return (
    <div className="tutorial-modal-body" ref={panelRef}>
      {/* 顶部搜索栏 */}
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
        <div className="tutorial-modal-shell ui-split-panel-shell">
          {/* 左侧一级分类 Tab */}
          <div className="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical">
            {CATEGORY_TABS.map((cat) => {
              const active = mainTab === cat.id;
              return (
                <button
                  key={cat.id}
                  className={`tutorial-modal-tab ui-split-panel-tab${active ? " active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={active ? "true" : "false"}
                  onClick={() => {
                    hidePinnedTooltips();
                    setMainTab(cat.id);
                  }}
                >
                  <span className="tutorial-modal-tab-label ui-split-panel-tab-label">
                    {cat.label}
                  </span>
                  <span className="tutorial-modal-tab-count">
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 右侧内容 */}
          <div className="tutorial-modal-content ui-split-panel-content">
            {mainTab === "mechanics" ? (
              <MechanicPaneContainer
                topics={TUTORIAL_MECHANIC_TOPICS}
                activeId={mechanicId}
                onSelect={setMechanicId}
                onNestedSelect={hidePinnedTooltips}
              />
            ) : (
              <div className="guided-tour-flow-list-container">
                {/* 已解锁列表 */}
                {unlockedFlows.length > 0 ? (
                  unlockedFlows.map((flow) => (
                    <FlowCard key={flow.id} flow={flow} unlocked={true} onStart={handleStartFlow} />
                  ))
                ) : (
                  <div className="tutorial-pane-summary" style={{ padding: "12px 0", color: "var(--ink-muted)" }}>
                    该分类暂无已解锁引导，随着主线任务推进将逐步解锁。
                  </div>
                )}

                {/* 未解锁折叠区 */}
                {lockedFlows.length > 0 && (
                  <div className="guided-tour-locked-section" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="guided-tour-collapse-toggle-btn"
                      onClick={() => setShowLockedByCategory((prev) => ({ ...prev, [mainTab]: !showLocked }))}
                    >
                      <span>{showLocked ? "▼" : "▶"} 未解锁引导 ({lockedFlows.length})</span>
                      <span className="guided-tour-collapse-hint">{showLocked ? "收起" : "展开查看"}</span>
                    </button>
                    {showLocked && (
                      <div className="guided-tour-locked-list" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                        {lockedFlows.map((flow) => (
                          <FlowCard key={flow.id} flow={flow} unlocked={false} onStart={handleStartFlow} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FlowCard({ flow, unlocked, onStart }: { flow: GuidedTourFlow; unlocked: boolean; onStart: (id: string) => void }) {
  const title = resolveFlowTitle(flow);
  const summary = resolveFlowSummary(flow);
  return (
    <div className={`guided-tour-flow-card${unlocked ? "" : " guided-tour-flow-card--locked"}`}>
      <div className="guided-tour-flow-card-main">
        <div className="guided-tour-flow-card-title-row">
          {!unlocked && <span className="guided-tour-locked-tag">任务解锁</span>}
          <div className="guided-tour-flow-card-title">{title}</div>
          <span className="guided-tour-flow-card-steps">共 {flow.steps.length} 步</span>
        </div>
        {summary && <div className="guided-tour-flow-card-summary">{summary}</div>}
      </div>
      <button
        type="button"
        className="guided-tour-start-action-btn"
        onClick={() => onStart(flow.id)}
      >
        ▶ 开始引导
      </button>
    </div>
  );
}

/** 获取教程弹层 meta */
export function getTutorialModalMeta() {
  return {
    title: t("tutorial.panel.title", undefined, "仙途指引与百科"),
    hint: t("tutorial.panel.close-hint", undefined, "点击空白处关闭"),
    size: "wide" as const,
    variantClass: "detail-modal--tutorial",
  };
}

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
    return <div className="tutorial-pane-summary">{t("tutorial.panel.empty", undefined, "暂无百科内容")}</div>;
  }

  const resolveActiveSectionTitle = (top: TutorialTopic) =>
    activeSectionByTopic[top.id] ?? top.sections[0]?.title ?? "";

  const activeSectionTitle = resolveActiveSectionTitle(topic);
  const activeSection = topic.sections.find((s) => s.title === activeSectionTitle) ?? topic.sections[0] ?? null;

  return (
    <section className="tutorial-modal-pane active">
      {/* 顶部百科主题横向切 Tab */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {topics.map((tItem) => {
          const tActive = tItem.id === activeId;
          return (
            <button
              key={tItem.id}
              type="button"
              className={`tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${tActive ? " active" : ""}`}
              style={{
                flex: "0 0 auto",
                minHeight: "34px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: tActive ? "bold" : "normal"
              }}
              onClick={() => {
                onNestedSelect?.();
                onSelect(tItem.id);
              }}
            >
              {tItem.label}
            </button>
          );
        })}
      </div>

      {topic.id === "realm-table" ? (
        <RealmTablePane />
      ) : (
        <>
          {topic.sections.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {topic.sections.map((sec) => {
                const secActive = sec.title === activeSectionTitle;
                return (
                  <button
                    key={sec.title}
                    type="button"
                    className={`tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${secActive ? " active" : ""}`}
                    style={{ flex: "0 0 auto", minHeight: 30, padding: "4px 10px", fontSize: "12px" }}
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
              <div className="tutorial-section-title">{t("tutorial.panel.tip-title", undefined, "要诀提示")}</div>
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
