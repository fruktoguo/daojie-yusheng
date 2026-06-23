/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  TUTORIAL_MECHANIC_TOPICS,
  type TutorialTopic,
} from '../../../constants/ui/tutorial';
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

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function TutorialPanelContent() {
  const [mechanicId, setMechanicId] = useState(TUTORIAL_MECHANIC_TOPICS[0]?.id ?? 'growth');
  const panelRef = useRef<HTMLDivElement | null>(null);

  const hidePinnedTooltips = useCallback(() => {
    panelRef.current?.querySelectorAll<HTMLElement>('[data-tutorial-tip-title]').forEach((node) => {
      node.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    });
  }, []);

  return (
    <div className="tutorial-modal-body" ref={panelRef}>
      {/* 直接展示百科内容，无需主 Tab 切换 */}
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
            tabDataAttr="data-tutorial-mechanic-tab"
            paneDataAttr="data-tutorial-mechanic-pane"
            kickerKey="tutorial.panel.kicker.mechanics"
          />
        </section>
      </div>
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
  tabDataAttr: string;
  paneDataAttr: string;
  kickerKey: string;
}

function TopicShell({ topics, ariaLabel, activeId, onSelect, tabDataAttr, paneDataAttr, kickerKey }: TopicShellProps) {
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
          const attrs: Record<string, string> = {};
          attrs[tabDataAttr.replace('data-', '')] = topic.id;
          return (
            <button
              key={topic.id}
              className={`tutorial-modal-tab ui-split-panel-tab${active ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={active ? 'true' : 'false'}
              onClick={() => onSelect(topic.id)}
              {...{ [tabDataAttr.replace('data-', '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())]: topic.id }}
            >
              <span className="tutorial-modal-tab-label ui-split-panel-tab-label">{topic.label}</span>
            </button>
          );
        })}
      </div>
      <div className="tutorial-modal-content ui-split-panel-content">
        {topics.map((topic) => (
          <TopicPane key={topic.id} topic={topic} active={topic.id === activeId} paneDataAttr={paneDataAttr} kickerKey={kickerKey} />
        ))}
      </div>
    </div>
  );
}

const TopicPane = memo(function TopicPane({ topic, active, paneDataAttr, kickerKey }: {
  topic: TutorialTopic;
  active: boolean;
  paneDataAttr: string;
  kickerKey: string;
}) {
  const paneAttrName = paneDataAttr.replace('data-', '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return (
    <section
      className={`tutorial-modal-pane${active ? ' active' : ''}`}
      role="tabpanel"
      aria-hidden={active ? 'false' : 'true'}
      {...{ [paneAttrName]: topic.id }}
    >
      <div className="tutorial-pane-hero">
        <div className="tutorial-pane-kicker">{t(kickerKey)}</div>
        <div className="tutorial-pane-summary"><RichText text={topic.summary} /></div>
      </div>
      <div className="tutorial-pane-sections">
        {topic.sections.map((section, si) => (
          <section key={si} className="tutorial-section-card">
            <div className="tutorial-section-title">{section.title}</div>
            <ul className="tutorial-section-list">
              {section.items.map((item, ii) => (
                <li key={ii}><RichText text={item} /></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {topic.tips && topic.tips.length > 0 && (
        <section className="tutorial-tip-card">
          <div className="tutorial-section-title">{t('tutorial.panel.tip-title')}</div>
          <ul className="tutorial-section-list tutorial-section-list--tips">
            {topic.tips.map((tip, ti) => (
              <li key={ti}><RichText text={tip} /></li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
});
