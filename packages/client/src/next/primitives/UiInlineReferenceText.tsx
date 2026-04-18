import type { ReactNode } from 'react';

import { LOCAL_EDITOR_CATALOG } from '../../content/editor-catalog';
import { getLocalItemTemplate } from '../../content/local-templates';
import { getMonsterLocationEntry, loadMonsterLocationEntry } from '../../content/monster-locations';
import { getItemTypeLabel } from '../../domain-labels';
import { hideNextTooltip, moveNextTooltip, showNextTooltip } from '../overlays/overlay-store';

export type UiInlineReferenceTone = 'default' | 'reward' | 'required' | 'material' | 'monster';

export interface UiInlineReference {
  kind: 'item' | 'monster';
  id: string;
  label: string;
  tone?: UiInlineReferenceTone;
}

interface TooltipPayload {
  title: string;
  lines: string[];
}

const tooltipCache = new Map<string, TooltipPayload | Promise<TooltipPayload>>();
let activeReferenceKey = '';
let tooltipRequestToken = 0;

function buildItemTooltipPayload(itemId: string, fallbackLabel: string): TooltipPayload {
  const item = getLocalItemTemplate(itemId)
    ?? LOCAL_EDITOR_CATALOG.items.find((entry) => entry.name === fallbackLabel)
    ?? null;
  if (!item) {
    return { title: fallbackLabel, lines: ['条目信息待补充'] };
  }

  const lines: string[] = [
    `类型：${getItemTypeLabel(item.type)}`,
  ];
  if (item.grade) {
    lines.push(`品阶：${item.grade}`);
  }
  if (item.desc?.trim()) {
    lines.push(item.desc.trim());
  }
  return {
    title: item.name || fallbackLabel,
    lines,
  };
}

async function loadMonsterTooltipPayload(monsterId: string, fallbackLabel: string): Promise<TooltipPayload> {
  const direct = getMonsterLocationEntry(monsterId) ?? await loadMonsterLocationEntry(monsterId);
  const location = direct ?? await import('../../constants/world/monster-locations.generated.json')
    .then((module) => Object.values(module.default).find((entry) => entry.monsterName === fallbackLabel) ?? null);
  if (!location) {
    return { title: fallbackLabel, lines: ['地图情报待补充'] };
  }
  return {
    title: location.monsterName || fallbackLabel,
    lines: [
      `出没地图：${location.mapName}`,
      ...(typeof location.dangerLevel === 'number' ? [`地图等级：${location.dangerLevel}`] : []),
      ...(location.totalMaps > 1 ? ['已优先显示更低等级地图'] : []),
    ],
  };
}

async function resolveReferenceTooltip(reference: UiInlineReference): Promise<TooltipPayload> {
  const key = `${reference.kind}:${reference.id}`;
  const cached = tooltipCache.get(key);
  if (cached && !(cached instanceof Promise)) {
    return cached;
  }
  if (cached instanceof Promise) {
    return cached;
  }

  const request = (async (): Promise<TooltipPayload> => {
    if (reference.kind === 'item') {
      return buildItemTooltipPayload(reference.id, reference.label);
    }
    return loadMonsterTooltipPayload(reference.id, reference.label);
  })();

  tooltipCache.set(key, request);
  const resolved = await request;
  tooltipCache.set(key, resolved);
  return resolved;
}

function UiInlineReferenceChip({
  reference,
}: {
  reference: UiInlineReference;
}) {
  const tone = reference.tone ?? (reference.kind === 'monster' ? 'monster' : 'default');

  const handlePointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const key = `${reference.kind}:${reference.id}`;
    activeReferenceKey = key;
    moveNextTooltip(event.clientX, event.clientY);
    const requestToken = ++tooltipRequestToken;
    void resolveReferenceTooltip(reference).then((tooltip) => {
      if (activeReferenceKey !== key || requestToken !== tooltipRequestToken) {
        return;
      }
      showNextTooltip(tooltip.title, tooltip.lines, event.clientX, event.clientY);
    });
  };

  return (
    <span
      className={`next-ui-inline-ref next-ui-inline-ref--${tone}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        activeReferenceKey = '';
        hideNextTooltip();
      }}
    >
      {reference.label}
    </span>
  );
}

export interface UiInlineReferenceTextProps {
  text: string;
  references: UiInlineReference[];
  className?: string;
}

export function UiInlineReferenceText({
  text,
  references,
  className,
}: UiInlineReferenceTextProps) {
  const classes = ['next-ui-inline-ref-text'];
  if (className) {
    classes.push(className);
  }

  const normalizedReferences = [...references]
    .filter((reference) => reference.label.trim().length > 0)
    .sort((left, right) => right.label.length - left.label.length);

  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < text.length) {
    const matched = normalizedReferences.find((reference) => text.startsWith(reference.label, index));
    if (matched) {
      nodes.push(
        <UiInlineReferenceChip
          key={`${matched.kind}:${matched.id}:${index}`}
          reference={matched}
        />,
      );
      index += matched.label.length;
      continue;
    }

    const nextChar = text[index];
    if (nextChar === '\n') {
      nodes.push(<br key={`br-${index}`} />);
    } else if (nextChar) {
      nodes.push(nextChar);
    }
    index += 1;
  }

  return <span className={classes.join(' ')}>{nodes}</span>;
}
