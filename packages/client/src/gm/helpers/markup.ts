/**
 * 本文件属于客户端 GM 工具链，负责地图编辑、世界查看或管理端辅助展示。
 *
 * 维护时要把 GM 能力限定在受控入口，并避免普通玩家客户端路径依赖管理端状态。
 */
import {
  type GmManagedPlayerRecord,
  type GmManagedPlayerSummary,
  type PlayerState,
  type ItemStack,
  type AutoBattleSkillConfig,
  type QuestState,
  type TemporaryBuffState,
  type TechniqueState,
  type RedeemCodeCodeView,
} from '@mud/shared';
import { getInventoryRowMeta } from './catalog';
import { getQuestLineLabel, getQuestStatusLabel, getTechniqueRealmLabel } from '../../domain-labels';
import { escapeHtml, formatJson } from './pure';

/** PresenceMeta：玩家在线状态徽标的渲染元数据。 */
export interface PresenceMeta {
/**
 * className：class名称名称或显示文本。
 */

  className: 'online' | 'offline';  
  /**
 * label：label名称或显示文本。
 */

  label: '在线' | '离线挂机' | '离线';
}

/** getPlayerRowMarkup：读取玩家Row Markup。 */
export function getPlayerRowMarkup(player: GmManagedPlayerSummary): string {
  return `
    <button class="player-row" data-player-id="${escapeHtml(player.id)}" type="button">
      <div class="player-top">
        <div class="player-name" data-role="name"></div>
        <div class="pill" data-role="presence"></div>
      </div>
      <div class="player-meta" data-role="meta"></div>
      <div class="player-subline" data-role="identity"></div>
      <div class="player-subline" data-role="stats"></div>
    </button>
  `;
}

/** getPlayerIdentityLine：读取玩家身份Line。 */
export function getPlayerIdentityLine(player: GmManagedPlayerSummary): string {
  return `${formatPlayerNo(player.playerNo)} · 地图: ${player.mapName}`;
}

/** getPlayerStatsLine：读取玩家属性Line。 */
export function getPlayerStatsLine(player: GmManagedPlayerSummary): string {
  return `${player.meta.isBot ? '机器人' : '玩家'} · ${player.realmLabel}`;
}

function formatPlayerNo(playerNo: number | null | undefined): string {
  return typeof playerNo === 'number' && Number.isSafeInteger(playerNo) && playerNo > 0
    ? String(playerNo).padStart(3, '0')
    : '000';
}

/** getEditorMetaMarkup：读取编辑器元数据Markup。 */
export function getEditorMetaMarkup(
  detail: GmManagedPlayerRecord,
  presence: PresenceMeta,
  editorDirty: boolean,
): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const pills: string[] = [
    `<span class="pill ${presence.className}">${presence.label}</span>`,
    `<span class="pill ${detail.meta.isBot ? 'bot' : ''}">${detail.meta.isBot ? '机器人' : '玩家'}</span>`,
    `<span class="pill">${detail.dead ? '死亡' : '存活'}</span>`,
    `<span class="pill">${detail.autoBattle ? '自动战斗开' : '自动战斗关'}</span>`,
    `<span class="pill">${detail.autoRetaliate ? '自动反击开' : '自动反击关'}</span>`,
  ];
  if (detail.meta.dirtyFlags.length > 0) {
    pills.push(`<span class="pill">脏标记: ${escapeHtml(detail.meta.dirtyFlags.join(', '))}</span>`);
  }
  if (editorDirty) {
    pills.push('<span class="pill">编辑中</span>');
  }
  return pills.join('');
}

/** getEditorBodyChipMarkup：读取编辑器身体Chip Markup。 */
export function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState, editorDirty: boolean): string {
  return [
    `<span class="pill ${player.meta.online ? 'online' : 'offline'}">${player.meta.online ? '在线' : '离线'}</span>`,
    `<span class="pill ${player.meta.isBot ? 'bot' : ''}">${player.meta.isBot ? '机器人' : '玩家'}</span>`,
    editorDirty ? '<span class="pill">有未保存修改</span>' : '',
    draft.dead ? '<span class="pill">草稿标记为死亡</span>' : '',
  ].filter(Boolean).join('');
}

/** getEquipmentCardTitle：读取Equipment卡片标题。 */
export function getEquipmentCardTitle(item: ItemStack | null): string {
  return item ? item.name || '未命名装备' : '';
}

/** getEquipmentCardMeta：读取Equipment卡片元数据。 */
export function getEquipmentCardMeta(item: ItemStack | null): string {
  return item ? `${item.itemId || '空 ID'} · ${item.grade || '无品阶'} · Lv.${item.level ?? 1}` : '当前为空';
}

/** getBonusCardTitle：读取Bonus卡片标题。 */
export function getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string {
  return bonus?.label || bonus?.source || `加成 ${index + 1}`;
}

/** getBonusCardMeta：读取Bonus卡片元数据。 */
export function getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string {
  return bonus?.source || '未填写来源';
}

/** getBuffCardTitle：读取Buff卡片标题。 */
export function getBuffCardTitle(buff: TemporaryBuffState | undefined, index: number): string {
  return buff?.name || `临时效果 ${index + 1}`;
}

/** getBuffCardMeta：读取Buff卡片元数据。 */
export function getBuffCardMeta(buff: TemporaryBuffState | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!buff) return '';
  const categoryLabel = buff.category === 'debuff' ? '减益' : '增益';
  const visibilityLabel = buff.visibility === 'observe_only' ? '仅观察' : '公开';
  return `${categoryLabel} · ${visibilityLabel}`;
}

/** getInventoryCardTitle：读取背包卡片标题。 */
export function getInventoryCardTitle(item: ItemStack | undefined, index: number): string {
  return item?.name || `物品 ${index + 1}`;
}

/** getInventoryCardMeta：读取背包卡片元数据。 */
export function getInventoryCardMeta(item: ItemStack | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!item) return '';
  return getInventoryRowMeta(item);
}

/** getAutoSkillCardTitle：读取自动技能卡片标题。 */
export function getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string {
  return entry?.skillId ? '未知技能' : `技能槽 ${index + 1}`;
}

/** getAutoSkillCardMeta：读取自动技能卡片元数据。 */
export function getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string {
  return entry?.enabled ? '启用' : '禁用';
}

/** getTechniqueCardTitle：读取Technique卡片标题。 */
export function getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string {
  return technique?.name || `功法 ${index + 1}`;
}

/** getTechniqueCardMeta：读取Technique卡片元数据。 */
export function getTechniqueCardMeta(technique: TechniqueState | undefined, getRealmLevelLabel: (realmLv: number) => string | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!technique) return '';
  const realmLevelLabel = getRealmLevelLabel(technique.realmLv);
  return `${realmLevelLabel ?? `Lv.${technique.realmLv}`} · 等级 ${technique.level} · ${getTechniqueRealmLabel(technique.realm)}`;
}

/** getQuestCardTitle：读取任务卡片标题。 */
export function getQuestCardTitle(quest: QuestState | undefined, index: number): string {
  return quest?.title || `任务 ${index + 1}`;
}

/** getQuestCardMeta：读取任务卡片元数据。 */
export function getQuestCardMeta(quest: QuestState | undefined): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!quest) return '';
  return `${getQuestLineLabel(quest.line)} · ${getQuestStatusLabel(quest.status)}`;
}

/** getStatRowMarkup：读取Stat Row Markup。 */
export function getStatRowMarkup(key: string): string {
  return `
    <div class="network-row" data-key="${escapeHtml(key)}">
      <div class="network-row-main">
        <div class="network-row-label" data-role="label"></div>
        <div class="network-row-meta" data-role="meta"></div>
      </div>
      <div class="network-row-actions" data-role="actions"></div>
    </div>
  `;
}

/** getReadonlyPreviewValue：读取Readonly Preview值。 */
export function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  switch (path) {
    case 'baseAttrs':
      return formatJson(draft.baseAttrs ?? {});
    case 'finalAttrs':
      return formatJson(draft.finalAttrs ?? {});
    case 'numericStats':
      return formatJson(draft.numericStats ?? {});
    case 'ratioDivisors':
      return formatJson(draft.ratioDivisors ?? {});
    case 'realm':
      return formatJson(draft.realm ?? {});
    case 'actions':
      return formatJson(draft.actions ?? []);
    default:
      return formatJson(null);
  }
}

/** getRedeemCodeStatusLabel：读取兑换兑换码状态标签。 */
export function getRedeemCodeStatusLabel(status: RedeemCodeCodeView['status']): string {
  switch (status) {
    case 'active':
      return '可用';
    case 'used':
      return '已使用';
    case 'destroyed':
      return '已销毁';
    default:
      return status;
  }
}

/** getRedeemCodeMarkup：读取兑换兑换码Markup。 */
export function getRedeemCodeMarkup(code: RedeemCodeCodeView, getDate: (value: string) => string): string {
  const meta = [
    `状态 ${getRedeemCodeStatusLabel(code.status)}`,
    code.usedByRoleName ? `使用者 ${code.usedByRoleName}` : null,
    code.usedAt ? `使用时间 ${getDate(code.usedAt)}` : null,
    code.destroyedAt ? `销毁时间 ${getDate(code.destroyedAt)}` : null,
  ].filter((entry): entry is string => typeof entry === 'string').join(' · ');
  return `
    <div class="network-row">
      <div class="network-row-label">${escapeHtml(code.code)}</div>
      <div class="network-row-meta">${escapeHtml(meta || `创建于 ${getDate(code.createdAt)}`)}</div>
      <div class="button-row" style="margin-top: 8px;">
        ${code.status === 'active'
            ? `<button class="small-btn danger" type="button" data-action="destroy-redeem-code" data-code-id="${code.id}">销毁</button>`
            : ''}
      </div>
    </div>
  `;
}

/** getCompactInventoryItemMarkup：读取Compact背包物品Markup。 */
export function getCompactInventoryItemMarkup(
  item: ItemStack,
  index: number,
  numberField: (
    label: string,
    path: string,
    value: number | undefined,
    extraClass?: string,
  ) => string,
): string {
  return `
    <div class="editor-card inventory-compact-row">
      <div class="editor-card-head">
        <div>
          <div class="editor-card-title" data-preview="inventory-title" data-index="${index}">${escapeHtml(getInventoryCardTitle(item, index))}</div>
          <div class="editor-card-meta" data-preview="inventory-meta" data-index="${index}">${escapeHtml(getInventoryRowMeta(item))}</div>
        </div>
        <button class="small-btn danger" type="button" data-action="remove-inventory-item" data-index="${index}">删除</button>
      </div>
      <div class="editor-grid compact">
        ${numberField('数量', `inventory.items.${index}.count`, item.count)}
      </div>
    </div>
  `;
}
