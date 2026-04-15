import {
  MAIL_TEMPLATE_BEGINNER_JOURNEY_ID,
  MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID,
  MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID,
  type GmEditorBuffOption,
  type GmEditorCatalogRes,
  type GmEditorItemOption,
  type GmEditorTechniqueOption,
  TECHNIQUE_GRADE_LABELS,
  type ItemStack,
  type TemporaryBuffState,
  type TechniqueState,
  TechniqueRealm,
  EQUIP_SLOT_LABELS,
  GM_MAIL_TEMPLATE_OPTIONS,
  ITEM_TYPE_LABELS,
} from '@mud/shared';

export type EditorCatalog = GmEditorCatalogRes | null;

export function getTechniqueOptionLabel(
  option: GmEditorTechniqueOption,
  editorCatalog: EditorCatalog,
): string {
  const realmLevelLabel = editorCatalog?.realmLevels.find((entry) => entry.realmLv === option.realmLv)?.displayName;
  return `${option.name}${option.grade ? ` · ${TECHNIQUE_GRADE_LABELS[option.grade] ?? option.grade}` : ''}${realmLevelLabel ? ` · ${realmLevelLabel}` : ''}`;
}

export function getItemOptionLabel(option: GmEditorItemOption): string {
  const parts = [option.name];
  if (option.type === 'equipment' && option.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[option.equipSlot]);
  } else {
    parts.push(ITEM_TYPE_LABELS[option.type] ?? option.type);
  }
  return parts.join(' · ');
}

export function getBuffOptionLabel(option: GmEditorBuffOption): string {
  const source = option.sourceSkillName || option.sourceSkillId;
  return source ? `${option.name} · ${source}` : option.name;
}

export function getTechniqueCatalogOptions(editorCatalog: EditorCatalog, includeEmpty = false): Array<{ value: string; label: string }> {
  const options = editorCatalog?.techniques.map((option) => ({
    value: option.id,
    label: getTechniqueOptionLabel(option, editorCatalog),
  })) ?? [];
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

export function getLearnedTechniqueOptions(
  techniques: TechniqueState[],
  includeEmpty = false,
): Array<{ value: string; label: string }> {
  const options = techniques.map((technique) => ({
    value: technique.techId,
    label: technique.name || technique.techId,
  }));
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

export function getRealmCatalogOptions(editorCatalog: EditorCatalog): Array<{ value: number; label: string }> {
  return editorCatalog?.realmLevels.map((entry) => ({
    value: entry.realmLv,
    label: `${entry.displayName} · Lv.${entry.realmLv}`,
  })) ?? [];
}

export function getItemCatalogOptions(
  editorCatalog: EditorCatalog,
  filter?: (option: GmEditorItemOption) => boolean,
): Array<{ value: string; label: string }> {
  const items = filter ? (editorCatalog?.items.filter(filter) ?? []) : (editorCatalog?.items ?? []);
  return items.map((option) => ({
    value: option.itemId,
    label: getItemOptionLabel(option),
  }));
}

export function getBuffCatalogOptions(editorCatalog: EditorCatalog, selectedBuffId?: string): Array<{ value: string; label: string }> {
  const options = editorCatalog?.buffs.map((option) => ({
    value: option.buffId,
    label: getBuffOptionLabel(option),
  })) ?? [];
  if (selectedBuffId && !options.some((option) => option.value === selectedBuffId)) {
    options.unshift({
      value: selectedBuffId,
      label: selectedBuffId,
    });
  }
  return [{ value: '', label: '请选择 Buff' }, ...options];
}

export function getMailAttachmentItemOptions(editorCatalog: EditorCatalog): Array<{ value: string; label: string }> {
  return getItemCatalogOptions(editorCatalog);
}

/** findTechniqueCatalogEntry：从集合中查找目标。 */
export function findTechniqueCatalogEntry(editorCatalog: EditorCatalog, techId: string | undefined): GmEditorTechniqueOption | null {
  if (!techId) return null;
  return editorCatalog?.techniques.find((entry) => entry.id === techId) ?? null;
}

/** findItemCatalogEntry：从集合中查找目标。 */
export function findItemCatalogEntry(editorCatalog: EditorCatalog, itemId: string | undefined): GmEditorItemOption | null {
  if (!itemId) return null;
  return editorCatalog?.items.find((entry) => entry.itemId === itemId) ?? null;
}

/** findBuffCatalogEntry：从集合中查找目标。 */
export function findBuffCatalogEntry(editorCatalog: EditorCatalog, buffId: string | undefined): GmEditorBuffOption | null {
  if (!buffId) return null;
  return editorCatalog?.buffs.find((entry) => entry.buffId === buffId) ?? null;
}


export function createTechniqueFromCatalog(
  techId: string,
  editorCatalog: EditorCatalog,
  createDefaultTechnique: () => TechniqueState,
  clone: <T>(value: T) => T,
): TechniqueState {
  const option = findTechniqueCatalogEntry(editorCatalog, techId);
  if (!option) {
    return createDefaultTechnique();
  }
  const initialExpToNext = option.layers?.find((layer) => layer.level === 1)?.expToNext ?? 0;
  return {
    techId: option.id,
    name: option.name,
    level: 1,
    exp: 0,
    expToNext: initialExpToNext,
    realmLv: option.realmLv ?? 1,
    realm: TechniqueRealm.Entry,
    skills: option.skills ? clone(option.skills) : [],
    grade: option.grade ?? 'mortal',
    category: option.category,
    layers: option.layers ? clone(option.layers) : [],
    attrCurves: {},
  } as TechniqueState;
}


export function createItemFromCatalog(
  itemId: string,
  editorCatalog: EditorCatalog,
  createDefaultItem: (itemId: string, count: number) => ItemStack,
  clone: <T>(value: T) => T,
  count = 1,
): ItemStack {
  const option = findItemCatalogEntry(editorCatalog, itemId);
  if (!option) {
    return createDefaultItem(itemId, count);
  }
  return {
    itemId: option.itemId,
    name: option.name,
    type: option.type,
    count,
    desc: option.desc ?? '',
    grade: option.grade,
    level: option.level,
    equipSlot: option.equipSlot,
    equipAttrs: option.equipAttrs ? clone(option.equipAttrs) : undefined,
    equipStats: option.equipStats ? clone(option.equipStats) : undefined,
    equipValueStats: option.equipValueStats ? clone(option.equipValueStats) : undefined,
    tags: option.tags ? [...option.tags] : undefined,
    effects: option.effects ? clone(option.effects) : undefined,
  };
}


export function createBuffFromCatalog(
  buffId: string,
  editorCatalog: EditorCatalog,
  createDefaultBuff: () => TemporaryBuffState,
  clone: <T>(value: T) => T,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
  const option = findBuffCatalogEntry(editorCatalog, buffId);
  if (!option) {
    return {
      ...createDefaultBuff(),
      buffId,
      remainingTicks: Math.max(0, current?.remainingTicks ?? 1),
      stacks: Math.max(1, current?.stacks ?? 1),
    };
  }

  const next = clone(option) as TemporaryBuffState;
  next.duration = Math.max(1, next.duration);
  next.maxStacks = Math.max(1, next.maxStacks);
  next.stacks = Math.max(1, Math.min(next.maxStacks, Math.floor(current?.stacks ?? next.stacks ?? 1)));
  next.remainingTicks = Math.max(0, Math.floor(current?.remainingTicks ?? next.duration));
  return next;
}

export function getTechniqueSummary(technique: TechniqueState): string {
  return `${technique.name || technique.techId} · ${technique.grade ?? 'mortal'} · 境界 Lv.${technique.realmLv} · 等级 ${technique.level}`;
}

export function getTechniqueTemplateMaxLevel(technique: TechniqueState, editorCatalog: EditorCatalog): number {
  const catalogEntry = findTechniqueCatalogEntry(editorCatalog, technique.techId);
  const levels = catalogEntry?.layers?.map((layer) => layer.level)
    ?? technique.layers?.map((layer) => layer.level)
    ?? [];
  if (levels.length === 0) {
    return Math.max(1, Math.floor(technique.level || 1));
  }
  return Math.max(1, ...levels);
}

export function getInventoryRowMeta(item: ItemStack): string {
  const parts = [ITEM_TYPE_LABELS[item.type] ?? item.type];
  if (item.type === 'equipment' && item.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[item.equipSlot] ?? item.equipSlot);
  }
  return parts.join(' · ');
}

export function getMailTemplateOptionMeta(templateId: string): { label: string; description: string } | null {
  return GM_MAIL_TEMPLATE_OPTIONS.find((entry) => entry.templateId === templateId) ?? null;
}

/** isServerManagedMailTemplate：判断并返回条件结果。 */
export function isServerManagedMailTemplate(templateId: string): boolean {
  return templateId === MAIL_TEMPLATE_BEGINNER_JOURNEY_ID
    || templateId === MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID
    || templateId === MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID;
}

export function getMailAttachmentRowMeta(editorCatalog: EditorCatalog, itemId: string): string {
  const entry = findItemCatalogEntry(editorCatalog, itemId);
  if (!entry) {
    return itemId ? `未找到物品模板：${itemId}` : '请选择物品模板';
  }
  return getItemOptionLabel(entry);
}

