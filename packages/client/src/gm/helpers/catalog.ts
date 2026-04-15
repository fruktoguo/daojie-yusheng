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
} from '@mud/shared-next';

/** EditorCatalog：GM 编辑器当前会话所用的目录快照。 */
export type EditorCatalog = GmEditorCatalogRes | null;

/** 根据功法选项拼接显示名，包含境界与品阶信息，供下拉列表与状态行展示。 */
export function getTechniqueOptionLabel(
  option: GmEditorTechniqueOption,
  editorCatalog: EditorCatalog,
): string {
  const realmLevelLabel = editorCatalog?.realmLevels.find((entry) => entry.realmLv === option.realmLv)?.displayName;
  return `${option.name}${option.grade ? ` · ${TECHNIQUE_GRADE_LABELS[option.grade] ?? option.grade}` : ''}${realmLevelLabel ? ` · ${realmLevelLabel}` : ''}`;
}

/** 组合物品名称与类型（装备位或物品类型）作为展示文本。 */
export function getItemOptionLabel(option: GmEditorItemOption): string {
  const parts = [option.name];
  if (option.type === 'equipment' && option.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[option.equipSlot]);
  } else {
    parts.push(ITEM_TYPE_LABELS[option.type] ?? option.type);
  }
  return parts.join(' · ');
}

/** 显示 Buff 名称并拼接来源技能，便于在筛选与回填表单时识别。 */
export function getBuffOptionLabel(option: GmEditorBuffOption): string {
  const source = option.sourceSkillName || option.sourceSkillId;
  return source ? `${option.name} · ${source}` : option.name;
}

/** 输出功法下拉选项数组，支持是否追加“未选择”。 */
export function getTechniqueCatalogOptions(editorCatalog: EditorCatalog, includeEmpty = false): Array<{ value: string; label: string }> {
  const options = editorCatalog?.techniques.map((option) => ({
    value: option.id,
    label: getTechniqueOptionLabel(option, editorCatalog),
  })) ?? [];
  return includeEmpty ? [{ value: '', label: '未选择' }, ...options] : options;
}

/** 输出当前玩家已学功法选项，用于技能继承/预设回填。 */
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

/** 输出境界下拉选项，供编辑器与保存时的境界选择。 */
export function getRealmCatalogOptions(editorCatalog: EditorCatalog): Array<{ value: number; label: string }> {
  return editorCatalog?.realmLevels.map((entry) => ({
    value: entry.realmLv,
    label: `${entry.displayName} · Lv.${entry.realmLv}`,
  })) ?? [];
}

/** 输出物品下拉选项并支持自定义过滤。 */
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

/** 输出 Buff 下拉选项，始终补齐当前已选值避免回显丢失。 */
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

/** 输出可用于邮件附件的物品列表，复用 `getItemCatalogOptions` 结果。 */
export function getMailAttachmentItemOptions(editorCatalog: EditorCatalog): Array<{ value: string; label: string }> {
  return getItemCatalogOptions(editorCatalog);
}

/** 按功法 ID 查目录，查不到返回空值。 */
export function findTechniqueCatalogEntry(editorCatalog: EditorCatalog, techId: string | undefined): GmEditorTechniqueOption | null {
  if (!techId) return null;
  return editorCatalog?.techniques.find((entry) => entry.id === techId) ?? null;
}

/** 按物品 ID 查目录条目，供草稿回填与详情生成。 */
export function findItemCatalogEntry(editorCatalog: EditorCatalog, itemId: string | undefined): GmEditorItemOption | null {
  if (!itemId) return null;
  return editorCatalog?.items.find((entry) => entry.itemId === itemId) ?? null;
}

/** 按 Buff ID 查目录条目，供编辑器回写和显示文本。 */
export function findBuffCatalogEntry(editorCatalog: EditorCatalog, buffId: string | undefined): GmEditorBuffOption | null {
  if (!buffId) return null;
  return editorCatalog?.buffs.find((entry) => entry.buffId === buffId) ?? null;
}

/** 根据目录模板构建功法状态，优先复用模板能力并补齐运行时字段。 */
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

/** 根据目录条目构建物品实例，并保留可选字段的模板默认值。 */
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

/** 根据目录条目创建 Buff，并保留当前运行时剩余 ticks/stacks 作为衔接值。 */
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

/** 生成功法摘要文本，包含名称、品阶、境界与等级。 */
export function getTechniqueSummary(technique: TechniqueState): string {
  return `${technique.name || technique.techId} · ${technique.grade ?? 'mortal'} · 境界 Lv.${technique.realmLv} · 等级 ${technique.level}`;
}

/** 解析功法模板或运行时数据中的最高层级，决定成长上限展示。 */
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

/** 组合物品类型与装备位，生成背包列表一行的简洁描述。 */
export function getInventoryRowMeta(item: ItemStack): string {
  const parts = [ITEM_TYPE_LABELS[item.type] ?? item.type];
  if (item.type === 'equipment' && item.equipSlot) {
    parts.push(EQUIP_SLOT_LABELS[item.equipSlot] ?? item.equipSlot);
  }
  return parts.join(' · ');
}

/** 获取邮件模板元数据，若不存在返回占位文案。 */
export function getMailTemplateOptionMeta(templateId: string): { label: string; description: string } | null {
  return GM_MAIL_TEMPLATE_OPTIONS.find((entry) => entry.templateId === templateId) ?? null;
}

/** 检查模板是否为服务端固定模板，影响编辑器是否允许编辑细节。 */
export function isServerManagedMailTemplate(templateId: string): boolean {
  return templateId === MAIL_TEMPLATE_BEGINNER_JOURNEY_ID
    || templateId === MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID
    || templateId === MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID;
}

/** 获取邮件附件项的行展示文本，模板找不到时输出提醒。 */
export function getMailAttachmentRowMeta(editorCatalog: EditorCatalog, itemId: string): string {
  const entry = findItemCatalogEntry(editorCatalog, itemId);
  if (!entry) {
    return itemId ? `未找到物品模板：${itemId}` : '请选择物品模板';
  }
  return getItemOptionLabel(entry);
}



