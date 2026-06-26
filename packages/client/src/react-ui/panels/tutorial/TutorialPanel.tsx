/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { type ReactNode, memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  TUTORIAL_MECHANIC_TOPICS,
  type TutorialTopic,
} from '../../../constants/ui/tutorial';
import { getTutorialRealmLevelTableRows } from '../../../constants/ui/realm-level-table';
import { t } from '../../../ui/i18n';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from '../../../ui/floating-tooltip';

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface TutorialOperationHint {
  label: string;
  path: string;
  title?: string;
}

// ─── 静态数据 ─────────────────────────────────────────────────────────────────

const TUTORIAL_OPERATION_HINTS: TutorialOperationHint[] = [
  { label: t('tutorial.hint.attr.label'), path: t('tutorial.hint.attr.path') },
  { label: t('tutorial.hint.bag-scroll.label'), path: t('tutorial.hint.bag-scroll.path') },
  { label: t('tutorial.hint.body-training.label'), path: t('tutorial.hint.body-training.path') },
  { label: t('tutorial.hint.map-info.label'), path: t('tutorial.hint.map-info.path') },
  { label: t('tutorial.hint.leaderboard.label'), path: t('tutorial.hint.leaderboard.path') },
  { label: t('tutorial.hint.world-info.label'), path: t('tutorial.hint.world-info.path') },
  { label: t('tutorial.hint.log.label'), path: t('tutorial.hint.log.path') },
  { label: t('tutorial.hint.mail.label'), path: t('tutorial.hint.mail.path') },
  { label: t('tutorial.hint.auction.label'), path: t('tutorial.hint.auction.path') },
  { label: t('tutorial.hint.system-shop.label'), path: t('tutorial.hint.system-shop.path') },
  { label: t('tutorial.hint.interaction.label'), path: t('tutorial.hint.interaction.path') },
  { label: t('tutorial.hint.skill-management.label'), path: t('tutorial.hint.skill-management.path') },
  { label: t('tutorial.hint.combat-settings.label'), path: t('tutorial.hint.combat-settings.path') },
  { label: t('tutorial.hint.skill-preset.label'), path: t('tutorial.hint.skill-preset.path') },
  { label: t('tutorial.hint.target-lock-preset.label'), path: t('tutorial.hint.target-lock-preset.path') },
  { label: t('tutorial.hint.retreat.label'), path: t('tutorial.hint.retreat.path') },
  { label: t('tutorial.hint.click-map-tile.label'), path: t('tutorial.hint.click-map-tile.path') },
  { label: t('tutorial.hint.simple-tutorial.label'), path: t('tutorial.hint.simple-tutorial.path') },
  { label: t('tutorial.hint.breakthrough-button.label'), path: t('tutorial.hint.breakthrough-button.path') },
  { label: t('tutorial.hint.auto-idle-cultivation.label'), path: t('tutorial.hint.auto-idle-cultivation.path') },
  { label: t('tutorial.hint.auto-switch-cultivation.label'), path: t('tutorial.hint.auto-switch-cultivation.path') },
  { label: t('tutorial.hint.current-cultivation.label'), path: t('tutorial.hint.current-cultivation.path') },
  { label: t('tutorial.hint.force-attack.label'), path: t('tutorial.hint.force-attack.path') },
  { label: t('tutorial.hint.auto-battle.label'), path: t('tutorial.hint.auto-battle.path') },
  { label: t('tutorial.hint.auto-retaliate.label'), path: t('tutorial.hint.auto-retaliate.path') },
  { label: t('tutorial.hint.stationary-battle.label'), path: t('tutorial.hint.stationary-battle.path') },
  { label: t('tutorial.hint.allow-aoe-hit.label'), path: t('tutorial.hint.allow-aoe-hit.path') },
  { label: t('tutorial.hint.sense-qi.label'), path: t('tutorial.hint.sense-qi.path') },
  { label: t('tutorial.hint.open-market.label'), path: t('tutorial.hint.open-market.path') },
  { label: t('tutorial.hint.go-target.label'), path: t('tutorial.hint.go-target.path') },
  { label: t('tutorial.hint.go-submit.label'), path: t('tutorial.hint.go-submit.path') },
  { label: t('tutorial.hint.take-all.label'), path: t('tutorial.hint.take-all.path') },
  { label: t('tutorial.hint.set-cultivate.label'), path: t('tutorial.hint.set-cultivate.path') },
  { label: 'GitHub', path: t('tutorial.hint.github.path') },
  { label: t('tutorial.hint.cancel-key.label'), path: t('tutorial.hint.cancel-key.path') },
  { label: t('tutorial.hint.observe.label'), path: t('tutorial.hint.observe.path') },
  { label: t('tutorial.hint.take.label'), path: t('tutorial.hint.take.path') },
  { label: t('tutorial.hint.execute.label'), path: t('tutorial.hint.execute.path') },
  { label: t('tutorial.hint.technique.label'), path: t('tutorial.hint.technique.path') },
  { label: t('tutorial.hint.inventory.label'), path: t('tutorial.hint.inventory.path') },
  { label: t('tutorial.hint.equipment.label'), path: t('tutorial.hint.equipment.path') },
  { label: t('tutorial.hint.quest.label'), path: t('tutorial.hint.quest.path') },
  { label: t('tutorial.hint.market.label'), path: t('tutorial.hint.market.path') },
  { label: t('tutorial.hint.skill.label'), path: t('tutorial.hint.skill.path') },
  { label: t('tutorial.hint.dialog.label'), path: t('tutorial.hint.dialog.path') },
  { label: t('tutorial.hint.action.label'), path: t('tutorial.hint.action.path') },
  { label: t('tutorial.hint.toggle.label'), path: t('tutorial.hint.toggle.path') },
  { label: t('tutorial.hint.breakthrough.label'), path: t('tutorial.hint.breakthrough.path') },
  { label: t('tutorial.hint.settings.label'), path: t('tutorial.hint.settings.path') },
  { label: t('tutorial.hint.activity.label'), path: t('tutorial.hint.activity.path') },
  { label: t('tutorial.hint.changelog.label'), path: t('tutorial.hint.changelog.path') },
  { label: 'QQ', path: t('tutorial.hint.qq.path') },
];

const SORTED_HINTS = [...TUTORIAL_OPERATION_HINTS].sort((a, b) => b.label.length - a.label.length);

// ─── Rich text 解析 ──────────────────────────────────────────────────────────

interface RichTextSegment {
  type: 'text' | 'hint';
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
      segments.push({ type: 'text', value: value.slice(cursor) });
      break;
    }
    if (nextIndex > cursor) {
      segments.push({ type: 'text', value: value.slice(cursor, nextIndex) });
    }
    segments.push({ type: 'hint', value: nextHint.label, hint: nextHint });
    cursor = nextIndex + nextHint.label.length;
  }
  return segments;
}

function RichText({ text }: { text: string }) {
  const segments = useMemo(() => parseRichText(text), [text]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
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

type SearchMatch = { topic: TutorialTopic; sections: Array<{ title: string; items: string[] }>; tips: string[] };

function getSearchMatches(topics: TutorialTopic[], query: string): SearchMatch[] {
  const q = query.toLowerCase();
  return topics.flatMap((topic) => {
    const topicHit = topic.label.toLowerCase().includes(q) || topic.summary.toLowerCase().includes(q);
    if (topic.id === 'realm-table') {
      const realmHit = topicHit || REALM_LEVEL_TABLE_ROWS.some(
        (row) => row.displayName.toLowerCase().includes(q) || row.majorRealmName.toLowerCase().includes(q)
      );
      return realmHit ? [{ topic, sections: [], tips: [] }] : [];
    }
    const sections = topic.sections.flatMap((s) => {
      const sectionHit = s.title.toLowerCase().includes(q);
      const items = (topicHit || sectionHit) ? s.items : s.items.filter((item) => item.toLowerCase().includes(q));
      return items.length > 0 ? [{ title: s.title, items }] : [];
    });
    const tips = topicHit ? (topic.tips ?? []) : (topic.tips ?? []).filter((tip) => tip.toLowerCase().includes(q));
    return sections.length > 0 || tips.length > 0 ? [{ topic, sections, tips }] : [];
  });
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

function SearchResults({ query, topics }: { query: string; topics: TutorialTopic[] }) {
  const matches = useMemo(() => getSearchMatches(topics, query), [topics, query]);
  if (matches.length === 0) return <div className="tutorial-search-empty">无匹配结果</div>;
  return (
    <div className="tutorial-search-results">
      {matches.map(({ topic, sections, tips }) => (
        <div key={topic.id} className="tutorial-search-group">
          <div className="tutorial-search-group-label"><Highlight text={topic.label} query={query} /></div>
          {topic.id === 'realm-table' && <div className="tutorial-search-match-item">境界升级数据表</div>}
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
              <div className="tutorial-section-title">{t('tutorial.panel.tip-title')}</div>
              <ul className="tutorial-section-list tutorial-section-list--tips">
                {tips.map((tip, i) => <li key={i}><RichText text={tip} /></li>)}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function TutorialPanelContent() {
  const [mechanicId, setMechanicId] = useState(TUTORIAL_MECHANIC_TOPICS[0]?.id ?? 'growth');
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);

  const hidePinnedTooltips = useCallback(() => {
    panelRef.current?.querySelectorAll<HTMLElement>('[data-tutorial-tip-title]').forEach((node) => {
      node.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    });
  }, []);

  return (
    <div className="tutorial-modal-body" ref={panelRef}>
      <div className="tutorial-search-bar">
        <input
          className="tutorial-search-input"
          type="text"
          placeholder="搜索百科内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="tutorial-search-clear" type="button" onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>
      {searchQuery ? (
        <SearchResults query={searchQuery} topics={TUTORIAL_MECHANIC_TOPICS} />
      ) : (
        <div className="tutorial-modal-main-panes">
          <section
            className="tutorial-modal-main-pane tutorial-modal-main-pane--mechanics active"
            data-tutorial-main-pane="mechanics"
            role="tabpanel"
            aria-hidden="false"
          >
            <TopicShell
              topics={TUTORIAL_MECHANIC_TOPICS}
              ariaLabel={t('tutorial.panel.mechanics-tabs.aria')}
              activeId={mechanicId}
              onSelect={(id) => {
                hidePinnedTooltips();
                setMechanicId(id);
              }}
              onNestedSelect={hidePinnedTooltips}
              tabDataAttr="data-tutorial-mechanic-tab"
              paneDataAttr="data-tutorial-mechanic-pane"
            />
          </section>
        </div>
      )}
    </div>
  );
}

/** 获取教程弹层 meta */
export function getTutorialModalMeta() {
  return {
    title: t('tutorial.panel.title'),
    subtitle: t('tutorial.panel.subtitle'),
    hint: t('tutorial.panel.close-hint'),
    size: 'wide' as const,
    variantClass: 'detail-modal--tutorial',
  };
}

// ─── TopicShell ──────────────────────────────────────────────────────────────

interface TopicShellProps {
  topics: TutorialTopic[];
  ariaLabel: string;
  activeId: string;
  onSelect: (id: string) => void;
  onNestedSelect?: () => void;
  tabDataAttr: string;
  paneDataAttr: string;
}

function TopicShell({ topics, ariaLabel, activeId, onSelect, onNestedSelect, tabDataAttr, paneDataAttr }: TopicShellProps) {
  // 每个 topic 各记一份当前选中子节，切回某个一级 Tab 时仍停在上次看的子节
  const [activeSectionByTopic, setActiveSectionByTopic] = useState<Record<string, string>>({});
  const resolveActiveSectionTitle = (topic: TutorialTopic) =>
    activeSectionByTopic[topic.id] ?? topic.sections[0]?.title ?? '';
  const topicAttrName = tabDataAttr.replace('data-', '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

  if (topics.length <= 0) {
    return (
      <div className="tutorial-modal-content ui-split-panel-content">
        <section className="tutorial-modal-pane active">
          <div className="tutorial-pane-summary">{t('tutorial.panel.empty')}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="tutorial-modal-shell ui-split-panel-shell">
      <div className="tutorial-modal-tabs ui-split-panel-tabs" role="tablist" aria-orientation="vertical" aria-label={ariaLabel}>
        {topics.map((topic) => {
          const active = topic.id === activeId;
          return (
            <div key={topic.id} className="tutorial-modal-tab-group">
              <button
                className={`tutorial-modal-tab ui-split-panel-tab${active ? ' active' : ''}`}
                type="button"
                role="tab"
                aria-selected={active ? 'true' : 'false'}
                aria-expanded={topic.sections.length > 0 ? (active ? 'true' : 'false') : undefined}
                onClick={() => onSelect(topic.id)}
                {...{ [topicAttrName]: topic.id }}
              >
                <span className="tutorial-modal-tab-label ui-split-panel-tab-label">{topic.label}</span>
              </button>
              {active && topic.sections.length > 0 && (
                <div className="tutorial-modal-subtabs" role="tablist" aria-label={`${topic.label}子类`}>
                  {topic.sections.map((section) => {
                    const sectionActive = active && resolveActiveSectionTitle(topic) === section.title;
                    return (
                      <button
                        key={section.title}
                        className={`tutorial-modal-tab tutorial-modal-tab--child ui-split-panel-tab${sectionActive ? ' active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={sectionActive ? 'true' : 'false'}
                        data-tutorial-topic-section-tab={section.title}
                        onClick={() => {
                          onNestedSelect?.();
                          setActiveSectionByTopic((prev) => ({ ...prev, [topic.id]: section.title }));
                          if (activeId !== topic.id) {
                            onSelect(topic.id);
                          }
                        }}
                      >
                        <span className="tutorial-modal-tab-label ui-split-panel-tab-label">{section.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="tutorial-modal-content ui-split-panel-content">
        {topics.map((topic) => (
          <TopicPane
            key={topic.id}
            topic={topic}
            active={topic.id === activeId}
            activeSectionTitle={resolveActiveSectionTitle(topic)}
            paneDataAttr={paneDataAttr}
          />
        ))}
      </div>
    </div>
  );
}

const TopicPane = memo(function TopicPane({ topic, active, activeSectionTitle, paneDataAttr }: {
  topic: TutorialTopic;
  active: boolean;
  activeSectionTitle?: string;
  paneDataAttr: string;
}) {
  const paneAttrName = paneDataAttr.replace('data-', '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const activeSection = topic.sections.find((section) => section.title === activeSectionTitle) ?? topic.sections[0] ?? null;
  const renderTips = () => (
    topic.tips && topic.tips.length > 0 && (
      <section className="tutorial-tip-card">
        <div className="tutorial-section-title">{t('tutorial.panel.tip-title')}</div>
        <ul className="tutorial-section-list tutorial-section-list--tips">
          {topic.tips.map((tip, ti) => (
            <li key={ti}><RichText text={tip} /></li>
          ))}
        </ul>
      </section>
    )
  );
  return (
    <section
      className={`tutorial-modal-pane${active ? ' active' : ''}`}
      role="tabpanel"
      aria-hidden={active ? 'false' : 'true'}
      {...{ [paneAttrName]: topic.id }}
    >
      {topic.id === 'operations' ? (
        <>
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
          {renderTips()}
        </>
      ) : topic.id === 'realm-table' ? (
        <RealmTablePane />
      ) : (
        <>
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
          {renderTips()}
        </>
      )}
    </section>
  );
});

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
              <td>{row.repeatedMajorRealm ? '—' : row.majorRealmName}</td>
              <td>{row.expToNext > 0 ? row.expToNext.toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
