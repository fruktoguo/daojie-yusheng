import {
  GmMapContainerLootPoolRecord,
  GmMapNpcRecord,
  GmMapQuestRecord,
  GmMapResourceRecord,
  QUEST_LINE_LABELS,
  QUEST_OBJECTIVE_TYPE_LABELS,
  getAuraLevel,
  normalizeConfiguredAuraValue,
  parseQiResourceKey,
} from '@mud/shared';

type TileResourcePointLike = Partial<GmMapResourceRecord>;
type ComposeRotation = 0 | 90 | 180 | 270;

const QI_FAMILY_LABELS = {
  aura: '灵气',
  demonic: '魔气',
  sha: '煞气',
} as const;

const QI_FORM_LABELS = {
  refined: '',
  dispersed: '逸散',
} as const;

const QI_ELEMENT_LABELS = {
  neutral: '无属性',
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
} as const;


export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}


export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** formatJson：格式化输出字符串用于展示。 */
export function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

/** isEditableTarget：判断并返回条件结果。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

/** setValueByPath：设置并同步相关状态。 */
export function setValueByPath(target: unknown, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = target as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = cursor[key];
    if (next === undefined || next === null) {
      cursor[key] = /^\d+$/.test(segments[index + 1] ?? '') ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

export function getValueByPath(target: unknown, path: string): unknown {
  let cursor = target as Record<string, unknown> | undefined;
  for (const segment of path.split('.')) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[segment] as Record<string, unknown> | undefined;
  }
  return cursor;
}

/** removeArrayIndex：移除并回收资源。 */
export function removeArrayIndex(target: unknown, path: string, index: number): void {
  const value = getValueByPath(target, path);
  if (!Array.isArray(value)) return;
  value.splice(index, 1);
}


export function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-map-bind="${escapeHtml(path)}" data-map-kind="string" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}


export function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-map-bind="${escapeHtml(path)}" data-map-kind="number" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}


export function decimalField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" step="0.01" data-map-bind="${escapeHtml(path)}" data-map-kind="float" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}


export function nullableNumberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-map-bind="${escapeHtml(path)}" data-map-kind="nullable-number" value="${Number.isFinite(value) ? String(value) : ''}" />
    </label>
  `;
}


export function nullableDecimalField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" step="0.01" data-map-bind="${escapeHtml(path)}" data-map-kind="nullable-float" value="${Number.isFinite(value) ? String(value) : ''}" />
    </label>
  `;
}


export function selectField(
  label: string,
  path: string,
  value: string | undefined,
  options: Array<{ value: string; label: string }>,
  extraClass = '',
): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <select data-map-bind="${escapeHtml(path)}" data-map-kind="string">
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === (value ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}


export function nullableSelectField(
  label: string,
  path: string,
  value: string | undefined,
  options: Array<{ value: string; label: string }>,
  extraClass = '',
): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <select data-map-bind="${escapeHtml(path)}" data-map-kind="nullable-string">
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === (value ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}


export function textareaField(label: string, path: string, value: string | undefined, extraClass = '', kind = 'string'): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-map-bind="${escapeHtml(path)}" data-map-kind="${escapeHtml(kind)}">${escapeHtml(value ?? '')}</textarea>
    </label>
  `;
}


export function booleanField(label: string, path: string, value: boolean | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <select data-map-bind="${escapeHtml(path)}" data-map-kind="boolean">
        <option value="false" ${value === true ? '' : 'selected'}>否</option>
        <option value="true" ${value === true ? 'selected' : ''}>是</option>
      </select>
    </label>
  `;
}


export function jsonField(label: string, path: string, value: unknown, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-map-bind="${escapeHtml(path)}" data-map-kind="json">${escapeHtml(formatJson(value ?? []))}</textarea>
    </label>
  `;
}


export function readonlyField(label: string, value: string): string {
  return `
    <div class="map-field">
      <span>${escapeHtml(label)}</span>
      <input value="${escapeHtml(value)}" readonly />
    </div>
  `;
}

/** formatTagGroups：格式化输出字符串用于展示。 */
export function formatTagGroups(tagGroups: string[][] | undefined): string {
  return (tagGroups ?? [])
    .filter((group) => group.length > 0)
    .map((group) => group.join(', '))
    .join('\n');
}

/** parseTagGroups：解析参数并返回标准化结果。 */
export function parseTagGroups(raw: string): string[][] {
  return raw
    .split('\n')
    .map((line) => line.split(/[，,]/).map((entry) => entry.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

export function getResourceRecordKeyName(point: TileResourcePointLike): string {
  const key = Object.keys(point).find((entry) => entry.startsWith('resourceK'));
  return key ?? 'resourceKey';
}

export function getResourceRecordKey(point: TileResourcePointLike): string {
  const keyName = getResourceRecordKeyName(point);
  const value = (point as Record<string, unknown>)[keyName];
  return typeof value === 'string' ? value.trim() : '';
}

/** setResourceRecordKey：设置并同步相关状态。 */
export function setResourceRecordKey(point: TileResourcePointLike, resourceKey: string): void {
  const keyName = getResourceRecordKeyName(point);
  (point as Record<string, unknown>)[keyName] = resourceKey;
}

export function getConfiguredAuraLevel(value: number): number {
  return getAuraLevel(normalizeConfiguredAuraValue(value));
}

/** formatAuraLevelText：格式化输出字符串用于展示。 */
export function formatAuraLevelText(value: number): string {
  const level = getConfiguredAuraLevel(value);
  return level > 0 ? `${level}级` : `值${value}`;
}

/** formatAuraPointLabel：格式化输出字符串用于展示。 */
export function formatAuraPointLabel(value: number): string {
  return `无属性灵气 ${formatAuraLevelText(value)}`;
}

/** formatResourceTypeLabel：格式化输出字符串用于展示。 */
export function formatResourceTypeLabel(resourceKey: string): string {
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    return resourceKey || '未设资源键';
  }
  const familyLabel = QI_FAMILY_LABELS[descriptor.family];
  const formLabel = QI_FORM_LABELS[descriptor.form];
  const elementLabel = QI_ELEMENT_LABELS[descriptor.element];
  if (descriptor.element === 'neutral') {
    return descriptor.form === 'refined'
      ? `${elementLabel}${familyLabel}`
      : `${formLabel}${elementLabel}${familyLabel}`;
  }
  return `${formLabel}${elementLabel}${familyLabel}`;
}

/** formatResourcePointLabel：格式化输出字符串用于展示。 */
export function formatResourcePointLabel(point: TileResourcePointLike): string {
  return `${formatResourceTypeLabel(getResourceRecordKey(point))} ${formatAuraLevelText(Number(point.value ?? 0))}`;
}

/** formatResourceSummary：格式化输出字符串用于展示。 */
export function formatResourceSummary(points: TileResourcePointLike[]): string {
  if (points.length === 0) {
    return '无';
  }
  return points.map((point) => formatResourcePointLabel(point)).join('；');
}

export function getResourceTypeSortKey(resourceKey: string): string {
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    return `9-${resourceKey}`;
  }
  const familyOrder = { aura: 0, demonic: 1, sha: 2 } as const;
  const formOrder = { refined: 0, dispersed: 1 } as const;
  const elementOrder = { neutral: 0, metal: 1, wood: 2, water: 3, fire: 4, earth: 5 } as const;
  return `${familyOrder[descriptor.family]}-${formOrder[descriptor.form]}-${elementOrder[descriptor.element]}`;
}

export function getResourcePointGlyphColor(point: TileResourcePointLike): string {
  const descriptor = parseQiResourceKey(getResourceRecordKey(point));
  if (!descriptor) {
    return '#f6d27e';
  }
  switch (descriptor.element) {
    case 'metal':
      return '#f0c768';
    case 'wood':
      return '#58c98b';
    case 'water':
      return '#69b7ff';
    case 'fire':
      return '#ff885c';
    case 'earth':
      return '#cda15d';
    default:
      return descriptor.family === 'aura' ? '#8fd4ff' : '#d7c4ff';
  }
}

export function getResourcePointLabelColor(point: TileResourcePointLike): string {
  const descriptor = parseQiResourceKey(getResourceRecordKey(point));
  if (!descriptor) {
    return '#ffe6b2';
  }
  switch (descriptor.element) {
    case 'metal':
      return '#ffe3a6';
    case 'wood':
      return '#c6ffd7';
    case 'water':
      return '#d3ebff';
    case 'fire':
      return '#ffd6c8';
    case 'earth':
      return '#f1ddbb';
    default:
      return descriptor.family === 'aura' ? '#d6ecff' : '#eadbff';
  }
}


export function normalizeComposeRotation(value: number): ComposeRotation {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}


export function rotateComposeClockwise(rotation: ComposeRotation): ComposeRotation {
  return normalizeComposeRotation(rotation + 90);
}


export function rotateComposeCounterClockwise(rotation: ComposeRotation): ComposeRotation {
  return normalizeComposeRotation(rotation + 270);
}


export function createDefaultContainerLootPool(): GmMapContainerLootPoolRecord {
  return {
    rolls: 1,
    chance: 1,
    minLevel: 1,
    maxLevel: 1,
    maxGrade: 'mortal',
    tagGroups: [['药品'], ['基础药品']],
    allowDuplicates: false,
  };
}

export function getQuestCardTitle(quest: GmMapQuestRecord, index: number): string {
  return quest.title?.trim() || quest.id?.trim() || `任务 ${index + 1}`;
}

export function getQuestCardMeta(quest: GmMapQuestRecord): string {
  const lineLabel = QUEST_LINE_LABELS[quest.line ?? 'side'] ?? (quest.line ?? 'side');
  const objectiveType = quest.objectiveType ?? 'kill';
  const objectiveLabel = QUEST_OBJECTIVE_TYPE_LABELS[objectiveType] ?? objectiveType;
  const targetLabel = quest.targetName?.trim()
    || quest.targetNpcName?.trim()
    || quest.targetNpcId?.trim()
    || quest.targetMonsterId?.trim()
    || quest.requiredItemId?.trim()
    || '未填写目标';
  return `${lineLabel} · ${objectiveLabel} · ${targetLabel}`;
}


export function createDefaultQuestRecord(npc: GmMapNpcRecord, index: number): GmMapQuestRecord {
  return {
    id: `quest_${npc.id}_${index + 1}`,
    title: '新任务',
    desc: '请填写任务描述',
    line: 'side',
    objectiveType: 'kill',
    targetName: '',
    required: 1,
    rewardText: '无',
    reward: [],
  };
}

