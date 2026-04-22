import type { ReactNode } from 'react';

import { LOCAL_EDITOR_CATALOG } from '../../content/editor-catalog';
import { getLocalItemTemplate } from '../../content/local-templates';
import { getMonsterLocationEntry, loadMonsterLocationEntry } from '../../content/monster-locations';
import { getItemTypeLabel } from '../../domain-labels';
import { hideTooltip, moveTooltip, showTooltip } from '../overlays/overlay-store';
/**
 * UiInlineReferenceTone：统一结构类型，保证协议与运行时一致性。
 */


export type UiInlineReferenceTone = 'default' | 'reward' | 'required' | 'material' | 'monster';
/**
 * UiInlineReference：定义接口结构约束，明确可交付字段含义。
 */


export interface UiInlineReference {
/**
 * kind：kind相关字段。
 */

  kind: 'item' | 'monster';  
  /**
 * id：ID标识。
 */

  id: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * tone：tone相关字段。
 */

  tone?: UiInlineReferenceTone;
}
/**
 * TooltipPayload：定义接口结构约束，明确可交付字段含义。
 */


interface TooltipPayload {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * lines：line相关字段。
 */

  lines: string[];
}

const tooltipCache = new Map<string, TooltipPayload | Promise<TooltipPayload>>();
let activeReferenceKey = '';
let tooltipRequestToken = 0;
/**
 * buildItemTooltipPayload：构建并返回目标对象。
 * @param itemId string 道具 ID。
 * @param fallbackLabel string 参数说明。
 * @returns 返回道具提示载荷。
 */


function buildItemTooltipPayload(itemId: string, fallbackLabel: string): TooltipPayload {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * loadMonsterTooltipPayload：读取怪物提示载荷并返回结果。
 * @param monsterId string monster ID。
 * @param fallbackLabel string 参数说明。
 * @returns 返回 Promise，完成后得到怪物提示载荷。
 */


async function loadMonsterTooltipPayload(monsterId: string, fallbackLabel: string): Promise<TooltipPayload> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * resolveReferenceTooltip：规范化或转换Reference提示。
 * @param reference UiInlineReference 参数说明。
 * @returns 返回 Promise，完成后得到Reference提示。
 */


async function resolveReferenceTooltip(reference: UiInlineReference): Promise<TooltipPayload> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * UiInlineReferenceChip：渲染UiInlineReferenceChip组件。
 * @param {
  reference,
} {
  reference: UiInlineReference;
} 参数说明。
 * @returns 无返回值，直接更新UiInlineReferenceChip相关状态。
 */


function UiInlineReferenceChip({
  reference,
}: {
/**
 * reference：reference相关字段。
 */

  reference: UiInlineReference;
}) {
  const tone = reference.tone ?? (reference.kind === 'monster' ? 'monster' : 'default');

  const handlePointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const key = `${reference.kind}:${reference.id}`;
    activeReferenceKey = key;
    moveTooltip(event.clientX, event.clientY);
    const requestToken = ++tooltipRequestToken;
    void resolveReferenceTooltip(reference).then((tooltip) => {
      if (activeReferenceKey !== key || requestToken !== tooltipRequestToken) {
        return;
      }
      showTooltip(tooltip.title, tooltip.lines, event.clientX, event.clientY);
    });
  };

  return (
    <span
      className={`next-ui-inline-ref next-ui-inline-ref--${tone}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        activeReferenceKey = '';
        hideTooltip();
      }}
    >
      {reference.label}
    </span>
  );
}
/**
 * UiInlineReferenceTextProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiInlineReferenceTextProps {
/**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * references：reference相关字段。
 */

  references: UiInlineReference[];  
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiInlineReferenceText：渲染UiInlineReferenceText组件。
 * @param {
  text,
  references,
  className,
} UiInlineReferenceTextProps 参数说明。
 * @returns 无返回值，直接更新UiInlineReferenceText相关状态。
 */


export function UiInlineReferenceText({
  text,
  references,
  className,
}: UiInlineReferenceTextProps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
