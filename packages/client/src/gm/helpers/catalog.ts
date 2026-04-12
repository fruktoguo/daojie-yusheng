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

/** EditorCatalog：定义该类型的结构与数据语义。 */
export type EditorCatalog = GmEditorCatalogRes | null;

/** getTechniqueOptionLabel：执行对应的业务逻辑。 */
export function getTechniqueOptionLabel(
  option: GmEditorTechniqueOption,
  editorCatalog: EditorCatalog,
): string {
/** realmLevelLabel：定义该变量以承载业务值。 */
  const realmLevelLabel = editorCatalog?.realmLevels.find((entry) => entry.realmLv === option.realmLv)?.displayName;
  return `${option.name}${option.grade ? ` · ${TECHNIQUE_GRADE_LABELS[option.grade] ?? option.grade}` : ''}${realmLevelLabel ? ` · ${realmLevelLabel}` : ''}`;
}

/** getItemOptionLabel：执行对应的业务逻辑。 */
export function getItemOptionLabel(option: GmEditorItemOption): string {
/** parts：定义该变量以承载业务值。 */
  const parts = [option.name];
  if (option.type === 'equipment' && option.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[option.equipSlot]);
  } else {
    parts.push(ITEM_TYPE_LABELS[option.type] ?? option.type);
  }
  return parts.join(' · ');
}

/** getBuffOptionLabel：执行对应的业务逻辑。 */
export function getBuffOptionLabel(option: GmEditorBuffOption): string {
/** source：定义该变量以承载业务值。 */
  const source = option.sourceSkillName || option.sourceSkillId;
  return source ? `${option.name} · ${source}` : option.name;
}

/** getTechniqueCatalogOptions：执行对应的业务逻辑。 */
export function getTechniqueCatalogOptions(editorCatalog: EditorCatalog, includeEmpty = false): Array<{ value: string; label: string }> {
/** options：定义该变量以承载业务值。 */
  const options = editorCatalog?.techniques.map((option) => ({
    value: option.id,
    label: getTechniqueOptionLabel(option, editorCatalog),
  })) ?? [];
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

/** getLearnedTechniqueOptions：执行对应的业务逻辑。 */
export function getLearnedTechniqueOptions(
  techniques: TechniqueState[],
  includeEmpty = false,
): Array<{ value: string; label: string }> {
/** options：定义该变量以承载业务值。 */
  const options = techniques.map((technique) => ({
    value: technique.techId,
    label: technique.name || technique.techId,
  }));
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

/** getRealmCatalogOptions：执行对应的业务逻辑。 */
export function getRealmCatalogOptions(editorCatalog: EditorCatalog): Array<{ value: number; label: string }> {
  return editorCatalog?.realmLevels.map((entry) => ({
    value: entry.realmLv,
    label: `${entry.displayName} · Lv.${entry.realmLv}`,
  })) ?? [];
}

/** getItemCatalogOptions：执行对应的业务逻辑。 */
export function getItemCatalogOptions(
  editorCatalog: EditorCatalog,
  filter?: (option: GmEditorItemOption) => boolean,
): Array<{ value: string; label: string }> {
/** items：定义该变量以承载业务值。 */
  const items = filter ? (editorCatalog?.items.filter(filter) ?? []) : (editorCatalog?.items ?? []);
  return items.map((option) => ({
    value: option.itemId,
    label: getItemOptionLabel(option),
  }));
}

/** getBuffCatalogOptions：执行对应的业务逻辑。 */
export function getBuffCatalogOptions(editorCatalog: EditorCatalog, selectedBuffId?: string): Array<{ value: string; label: string }> {
/** options：定义该变量以承载业务值。 */
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

/** getMailAttachmentItemOptions：执行对应的业务逻辑。 */
export function getMailAttachmentItemOptions(editorCatalog: EditorCatalog): Array<{ value: string; label: string }> {
  return getItemCatalogOptions(editorCatalog);
}

/** findTechniqueCatalogEntry：执行对应的业务逻辑。 */
export function findTechniqueCatalogEntry(editorCatalog: EditorCatalog, techId: string | undefined): GmEditorTechniqueOption | null {
  if (!techId) return null;
  return editorCatalog?.techniques.find((entry) => entry.id === techId) ?? null;
}

/** findItemCatalogEntry：执行对应的业务逻辑。 */
export function findItemCatalogEntry(editorCatalog: EditorCatalog, itemId: string | undefined): GmEditorItemOption | null {
  if (!itemId) return null;
  return editorCatalog?.items.find((entry) => entry.itemId === itemId) ?? null;
}

/** findBuffCatalogEntry：执行对应的业务逻辑。 */
export function findBuffCatalogEntry(editorCatalog: EditorCatalog, buffId: string | undefined): GmEditorBuffOption | null {
  if (!buffId) return null;
  return editorCatalog?.buffs.find((entry) => entry.buffId === buffId) ?? null;
}

/** createTechniqueFromCatalog：执行对应的业务逻辑。 */
export function createTechniqueFromCatalog(
  techId: string,
  editorCatalog: EditorCatalog,
  createDefaultTechnique: () => TechniqueState,
  clone: <T>(value: T) => T,
): TechniqueState {
/** option：定义该变量以承载业务值。 */
  const option = findTechniqueCatalogEntry(editorCatalog, techId);
  if (!option) {
    return createDefaultTechnique();
  }
/** initialExpToNext：定义该变量以承载业务值。 */
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

/** createItemFromCatalog：执行对应的业务逻辑。 */
export function createItemFromCatalog(
  itemId: string,
  editorCatalog: EditorCatalog,
  createDefaultItem: (itemId: string, count: number) => ItemStack,
  clone: <T>(value: T) => T,
  count = 1,
): ItemStack {
/** option：定义该变量以承载业务值。 */
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

/** createBuffFromCatalog：执行对应的业务逻辑。 */
export function createBuffFromCatalog(
  buffId: string,
  editorCatalog: EditorCatalog,
  createDefaultBuff: () => TemporaryBuffState,
  clone: <T>(value: T) => T,
  current?: Pick<TemporaryBuffState, 'stacks' | 'remainingTicks'>,
): TemporaryBuffState {
/** option：定义该变量以承载业务值。 */
  const option = findBuffCatalogEntry(editorCatalog, buffId);
  if (!option) {
    return {
      ...createDefaultBuff(),
      buffId,
      remainingTicks: Math.max(0, current?.remainingTicks ?? 1),
      stacks: Math.max(1, current?.stacks ?? 1),
    };
  }

/** next：定义该变量以承载业务值。 */
  const next = clone(option) as TemporaryBuffState;
  next.duration = Math.max(1, next.duration);
  next.maxStacks = Math.max(1, next.maxStacks);
  next.stacks = Math.max(1, Math.min(next.maxStacks, Math.floor(current?.stacks ?? next.stacks ?? 1)));
  next.remainingTicks = Math.max(0, Math.floor(current?.remainingTicks ?? next.duration));
  return next;
}

/** getTechniqueSummary：执行对应的业务逻辑。 */
export function getTechniqueSummary(technique: TechniqueState): string {
  return `${technique.name || technique.techId} · ${technique.grade ?? 'mortal'} · 境界 Lv.${technique.realmLv} · 等级 ${technique.level}`;
}

/** getTechniqueTemplateMaxLevel：执行对应的业务逻辑。 */
export function getTechniqueTemplateMaxLevel(technique: TechniqueState, editorCatalog: EditorCatalog): number {
/** catalogEntry：定义该变量以承载业务值。 */
  const catalogEntry = findTechniqueCatalogEntry(editorCatalog, technique.techId);
/** levels：定义该变量以承载业务值。 */
  const levels = catalogEntry?.layers?.map((layer) => layer.level)
    ?? technique.layers?.map((layer) => layer.level)
    ?? [];
  if (levels.length === 0) {
    return Math.max(1, Math.floor(technique.level || 1));
  }
  return Math.max(1, ...levels);
}

/** getInventoryRowMeta：执行对应的业务逻辑。 */
export function getInventoryRowMeta(item: ItemStack): string {
/** parts：定义该变量以承载业务值。 */
  const parts = [ITEM_TYPE_LABELS[item.type] ?? item.type];
  if (item.type === 'equipment' && item.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[item.equipSlot] ?? item.equipSlot);
  }
  return parts.join(' · ');
}

/** getMailTemplateOptionMeta：执行对应的业务逻辑。 */
export function getMailTemplateOptionMeta(templateId: string): { label: string; description: string } | null {
  return GM_MAIL_TEMPLATE_OPTIONS.find((entry) => entry.templateId === templateId) ?? null;
}

/** isServerManagedMailTemplate：执行对应的业务逻辑。 */
export function isServerManagedMailTemplate(templateId: string): boolean {
  return templateId === MAIL_TEMPLATE_BEGINNER_JOURNEY_ID
    || templateId === MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID
    || templateId === MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID;
}

/** getMailAttachmentRowMeta：执行对应的业务逻辑。 */
export function getMailAttachmentRowMeta(editorCatalog: EditorCatalog, itemId: string): string {
/** entry：定义该变量以承载业务值。 */
  const entry = findItemCatalogEntry(editorCatalog, itemId);
  if (!entry) {
    return itemId ? `未找到物品模板：${itemId}` : '请选择物品模板';
  }
  return getItemOptionLabel(entry);
}

