import {
  type GmManagedPlayerRecord,
  type GmManagedPlayerSummary,
  type PlayerState,
  type ItemStack,
  type AutoBattleSkillConfig,
  type QuestState,
  type TemporaryBuffState,
  type TechniqueState,
  type Suggestion,
  type RedeemCodeCodeView,
} from '@mud/shared';
import { TECHNIQUE_REALM_LABELS, QUEST_LINE_LABELS, QUEST_STATUS_LABELS } from '@mud/shared';
import { getInventoryRowMeta } from './catalog';
import { escapeHtml, formatJson } from './pure';

/** PresenceMeta：定义该接口的能力与字段约束。 */
export interface PresenceMeta {
  className: 'online' | 'offline';
  label: '在线' | '离线挂机' | '离线';
}

/** getPlayerRowMarkup：执行对应的业务逻辑。 */
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

/** getPlayerIdentityLine：执行对应的业务逻辑。 */
export function getPlayerIdentityLine(player: GmManagedPlayerSummary): string {
  return `地图: ${player.mapName}`;
}

/** getPlayerStatsLine：执行对应的业务逻辑。 */
export function getPlayerStatsLine(player: GmManagedPlayerSummary): string {
  return `${player.meta.isBot ? '机器人' : '玩家'} · ${player.realmLabel}`;
}

/** getEditorMetaMarkup：执行对应的业务逻辑。 */
export function getEditorMetaMarkup(
  detail: GmManagedPlayerRecord,
  presence: PresenceMeta,
  editorDirty: boolean,
): string {
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

/** getEditorBodyChipMarkup：执行对应的业务逻辑。 */
export function getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState, editorDirty: boolean): string {
  return [
    `<span class="pill ${player.meta.online ? 'online' : 'offline'}">${player.meta.online ? '在线' : '离线'}</span>`,
    `<span class="pill ${player.meta.isBot ? 'bot' : ''}">${player.meta.isBot ? '机器人' : '玩家'}</span>`,
    editorDirty ? '<span class="pill">有未保存修改</span>' : '',
    draft.dead ? '<span class="pill">草稿标记为死亡</span>' : '',
  ].filter(Boolean).join('');
}

/** getEquipmentCardTitle：执行对应的业务逻辑。 */
export function getEquipmentCardTitle(item: ItemStack | null): string {
  return item ? item.name || '未命名装备' : '';
}

/** getEquipmentCardMeta：执行对应的业务逻辑。 */
export function getEquipmentCardMeta(item: ItemStack | null): string {
  return item ? `${item.itemId || '空 ID'} · ${item.grade || '无品阶'} · Lv.${item.level ?? 1}` : '当前为空';
}

/** getBonusCardTitle：执行对应的业务逻辑。 */
export function getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string {
  return bonus?.label || bonus?.source || `加成 ${index + 1}`;
}

/** getBonusCardMeta：执行对应的业务逻辑。 */
export function getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string {
  return bonus?.source || '未填写来源';
}

/** getBuffCardTitle：执行对应的业务逻辑。 */
export function getBuffCardTitle(buff: TemporaryBuffState | undefined, index: number): string {
  return buff?.name || buff?.buffId || `临时效果 ${index + 1}`;
}

/** getBuffCardMeta：执行对应的业务逻辑。 */
export function getBuffCardMeta(buff: TemporaryBuffState | undefined): string {
  if (!buff) return '';
  return `${buff.buffId || '未填写 buffId'} · ${buff.category} · ${buff.visibility}`;
}

/** getInventoryCardTitle：执行对应的业务逻辑。 */
export function getInventoryCardTitle(item: ItemStack | undefined, index: number): string {
  return item?.name || item?.itemId || `物品 ${index + 1}`;
}

/** getInventoryCardMeta：执行对应的业务逻辑。 */
export function getInventoryCardMeta(item: ItemStack | undefined): string {
  if (!item) return '';
  return getInventoryRowMeta(item);
}

/** getAutoSkillCardTitle：执行对应的业务逻辑。 */
export function getAutoSkillCardTitle(entry: AutoBattleSkillConfig | undefined, index: number): string {
  return entry?.skillId || `技能槽 ${index + 1}`;
}

/** getAutoSkillCardMeta：执行对应的业务逻辑。 */
export function getAutoSkillCardMeta(entry: AutoBattleSkillConfig | undefined): string {
  return entry?.enabled ? '启用' : '禁用';
}

/** getTechniqueCardTitle：执行对应的业务逻辑。 */
export function getTechniqueCardTitle(technique: TechniqueState | undefined, index: number): string {
  return technique?.name || technique?.techId || `功法 ${index + 1}`;
}

/** getTechniqueCardMeta：执行对应的业务逻辑。 */
export function getTechniqueCardMeta(technique: TechniqueState | undefined, getRealmLevelLabel: (realmLv: number) => string | undefined): string {
  if (!technique) return '';
  const realmLevelLabel = getRealmLevelLabel(technique.realmLv);
  return `${technique.techId || '未填写功法 ID'} · ${realmLevelLabel ?? `Lv.${technique.realmLv}`} · 等级 ${technique.level} · ${TECHNIQUE_REALM_LABELS[technique.realm] ?? technique.realm}`;
}

/** getQuestCardTitle：执行对应的业务逻辑。 */
export function getQuestCardTitle(quest: QuestState | undefined, index: number): string {
  return quest?.title || quest?.id || `任务 ${index + 1}`;
}

/** getQuestCardMeta：执行对应的业务逻辑。 */
export function getQuestCardMeta(quest: QuestState | undefined): string {
  if (!quest) return '';
  return `${quest.id || '未填写任务 ID'} · ${QUEST_LINE_LABELS[quest.line] ?? quest.line} · ${QUEST_STATUS_LABELS[quest.status] ?? quest.status}`;
}

/** getStatRowMarkup：执行对应的业务逻辑。 */
export function getStatRowMarkup(key: string): string {
  return `
    <div class="network-row" data-key="${escapeHtml(key)}">
      <div class="network-row-main">
        <div class="network-row-label" data-role="label"></div>
        <div class="network-row-meta" data-role="meta"></div>
      </div>
    </div>
  `;
}

/** getReadonlyPreviewValue：执行对应的业务逻辑。 */
export function getReadonlyPreviewValue(draft: PlayerState, path: string): string {
  switch (path) {
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

/** renderSuggestionReply：执行对应的业务逻辑。 */
export function renderSuggestionReply(reply: Suggestion['replies'][number]): string {
  return `
    <div class="gm-suggestion-reply ${reply.authorType === 'gm' ? 'gm' : ''}">
      <div class="gm-suggestion-reply-head">
        <div class="gm-suggestion-reply-author">${escapeHtml(reply.authorType === 'gm' ? '开发者' : '发起人')}</div>
        <div>${new Date(reply.createdAt).toLocaleString()}</div>
      </div>
      <div class="gm-suggestion-reply-content">${escapeHtml(reply.content)}</div>
    </div>
  `;
}

/** getSuggestionCardMarkup：执行对应的业务逻辑。 */
export function getSuggestionCardMarkup(suggestion: Suggestion): string {
  const completed = suggestion.status === 'completed';
  const score = suggestion.upvotes.length - suggestion.downvotes.length;
  return `
    <div class="gm-suggestion-card ${completed ? 'completed' : ''}" data-suggestion-id="${escapeHtml(suggestion.id)}">
      <div class="gm-suggestion-head">
        <div>
          <div class="gm-suggestion-title">${escapeHtml(suggestion.title)}</div>
          <div class="gm-suggestion-meta">
            发起人：${escapeHtml(suggestion.authorName)}<br />
            创建时间：${new Date(suggestion.createdAt).toLocaleString()}<br />
            状态：${completed ? '已完成' : '待处理'}
          </div>
        </div>
        <div class="gm-suggestion-side">
          <div class="pill" style="background:${completed ? '#2e7d32' : 'var(--ink-grey)'}; color:#fff;">${completed ? '已完成' : '待处理'}</div>
          <div class="gm-suggestion-meta">赞同 ${suggestion.upvotes.length} · 反对 ${suggestion.downvotes.length} · 分值 ${score > 0 ? '+' : ''}${score}</div>
        </div>
      </div>
      <div class="gm-suggestion-body">
        <div class="gm-suggestion-description-wrap">
          <div class="gm-suggestion-section-title">原始意见</div>
          <div class="gm-suggestion-description">${escapeHtml(suggestion.description)}</div>
        </div>
        <div class="gm-suggestion-replies">
          <div class="gm-suggestion-section-title">回复记录</div>
          ${suggestion.replies.length > 0
            ? suggestion.replies.map((reply) => renderSuggestionReply(reply)).join('')
            : '<div class="empty-hint">当前还没有回复记录</div>'}
        </div>
      </div>
      <div class="gm-suggestion-reply-composer">
        <div class="gm-suggestion-section-title">开发者回复</div>
        <textarea
          class="editor-textarea gm-suggestion-reply-input"
          rows="3"
          maxlength="500"
          data-role="reply-input"
          placeholder="输入给玩家的回复内容；回复后玩家端会出现未读红点。"
        ></textarea>
        <div class="button-row gm-suggestion-reply-actions">
          <button class="small-btn primary" type="button" data-action="reply-suggestion">发送回复</button>
        </div>
      </div>
      <div class="gm-suggestion-actions">
        <div class="gm-suggestion-page-meta">该条会话共 ${suggestion.replies.length} 条回复</div>
        <div class="button-row">
          ${completed ? '' : '<button class="primary small-btn" type="button" data-action="complete-suggestion">标记完成</button>'}
          <button class="danger small-btn" type="button" data-action="remove-suggestion">永久移除</button>
        </div>
      </div>
    </div>
  `;
}

/** getRedeemCodeStatusLabel：执行对应的业务逻辑。 */
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

/** getRedeemCodeMarkup：执行对应的业务逻辑。 */
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

/** getCompactInventoryItemMarkup：执行对应的业务逻辑。 */
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

