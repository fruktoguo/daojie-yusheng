/**
 * gm/player-editor.render.ts —— GM 玩家可视化编辑器整体渲染。
 *
 * 从 gm.ts 抽取：renderVisualEditor。
 * 该函数是编辑器各标签页的可视化拼装入口，依赖大量字段/卡片/目录辅助函数，
 * 这些辅助函数通过 PlayerEditorRenderDeps 显式注入，避免依赖 gm.ts 模块级状态。
 * 共享状态（当前背包搜索词、新增物品类型、直发邮件草稿）通过同结构的 state 参数传入。
 */

import {
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  ITEM_TYPE_LABELS,
  type ArtifactSlot,
  type AutoBattleSkillConfig,
  type EquipSlot,
  type EquipmentSlots,
  type GmManagedPlayerRecord,
  type ItemStack,
  type ItemType,
  type PlayerState,
  type QuestState,
  type TechniqueState,
} from '@mud/shared';
import {
  GM_FACING_OPTIONS,
  GM_QUEST_LINE_OPTIONS,
  GM_QUEST_OBJECTIVE_TYPE_OPTIONS,
  GM_QUEST_STATUS_OPTIONS,
} from '../constants/world/gm';
import type { GmEditorTab } from './editor-helpers';
import type { GmMailComposerDraft } from './mail-composer';

/** SearchableItemScope：物品搜索下拉的作用域。 */
export type SearchableItemScope = 'all' | 'inventory-add' | 'equipment-slot' | 'artifact-slot';

/** PlayerEditorRenderState：renderVisualEditor 依赖的共享可变状态快照。 */
export interface PlayerEditorRenderState {
  currentInventorySearchQuery: string;
  currentInventoryAddType: ItemType;
  directMailDraft: GmMailComposerDraft;
}

/** PlayerEditorRenderDeps：renderVisualEditor 依赖的辅助函数集合。 */
export interface PlayerEditorRenderDeps {
  normalizeGmArtifactState(source: PlayerState['artifacts'] | null | undefined): PlayerState['artifacts'];
  ensureArray<T>(value: T[] | undefined | null): T[];
  getManagedAccountActivityMeta(player: GmManagedPlayerRecord): { label: string; value: string; note?: string };
  getManagedAccountStatusLabel(player: Pick<GmManagedPlayerRecord, 'meta'>): string;
  getManagedAccountRestrictionLabel(account: NonNullable<GmManagedPlayerRecord['account']>): string;
  getManagedAccountRestrictionPillClass(account: NonNullable<GmManagedPlayerRecord['account']>): string;
  getEditorCatalogFallbackNote(): string;
  hasServerEditorCatalog(): boolean;
  getEquipmentCardTitle(item: ItemStack | null): string;
  getEquipmentCardMeta(item: ItemStack | null): string;
  getArtifactSlotLabel(slot: ArtifactSlot): string;
  getItemEditorControls(basePath: string, item: ItemStack, mode: 'inventory' | 'equipment' | 'artifact'): string;
  searchableItemField(
    label: string,
    value: string,
    scope: SearchableItemScope,
    hiddenFieldAttrs: Record<string, string | undefined>,
    extraClass?: string,
    slot?: EquipSlot,
    placeholder?: string,
    wrapperAttrs?: Record<string, string | undefined>,
  ): string;
  checkboxField(label: string, path: string, checked: boolean | undefined): string;
  numberField(label: string, path: string, value: number | undefined, extraClass?: string): string;
  textField(label: string, path: string, value: string | undefined, extraClass?: string): string;
  nullableTextField(
    label: string,
    path: string,
    value: string | undefined,
    emptyMode?: 'undefined' | 'null',
    extraClass?: string,
  ): string;
  jsonField(label: string, path: string, value: unknown, emptyValue?: 'null' | 'object' | 'array', extraClass?: string): string;
  selectField(
    label: string,
    path: string,
    value: string | number | undefined,
    options: Array<{ value: string | number; label: string }>,
    extraClass?: string,
  ): string;
  stringArrayField(label: string, path: string, value: string[] | undefined, extraClass?: string): string;
  readonlyCodeBlock(title: string, path: string, value: unknown): string;
  optionsMarkup<T extends string | number>(options: Array<{ value: T; label: string }>, selected: T | undefined): string;
  getBonusCardTitle(bonus: PlayerState['bonuses'][number] | undefined, index: number): string;
  getBonusCardMeta(bonus: PlayerState['bonuses'][number] | undefined): string;
  getBuffCatalogOptions(selectedBuffId?: string): Array<{ value: string; label: string }>;
  getQuestCardTitle(quest: QuestState | undefined, index: number): string;
  getQuestCardMeta(quest: QuestState | undefined): string;
  getInventoryListMarkup(items: ItemStack[]): string;
  getVisibleInventoryItems(items: ItemStack[]): Array<{ item: ItemStack; index: number }>;
  renderEditorTabSection(tab: GmEditorTab, content: string): string;
  formatPlayerNo(playerNo: number | null | undefined): string;
  formatDateTime(value?: string): string;
  formatDurationSeconds(seconds: number): string;
  formatTradeTimestamp(ms: number): string;
  getEditorBodyChipMarkup(player: GmManagedPlayerRecord, draft: PlayerState): string;
  renderPositionMapPicker(player: GmManagedPlayerRecord, draft: PlayerState): string;
  getRealmCatalogOptions(): Array<{ value: number; label: string }>;
  renderAttributeSummaryGrid(draft: PlayerState): string;
  renderTechniqueManager(techniques: TechniqueState[], autoBattleSkills: AutoBattleSkillConfig[], cultivatingTechId: string | undefined): string;
  renderCraftSkillEditorCards(draft: PlayerState): string;
  getTechniqueCatalogOptions(): Array<{ value: string; label: string }>;
  getInventoryAddTypeOptions(): Array<{ value: string; label: string }>;
  getMailComposerMarkup(
    draft: GmMailComposerDraft,
    options: { scope: 'direct' | 'shortcut'; submitLabel: string; note: string; showTargetPlayer?: boolean },
  ): string;
  renderPlayerRiskSection(player: GmManagedPlayerRecord): string;
  escapeHtml(input: string): string;
}
export function renderVisualEditor(player: GmManagedPlayerRecord, draft: PlayerState, deps: PlayerEditorRenderDeps, state: PlayerEditorRenderState): string {
  const equipment = draft.equipment as EquipmentSlots;
  const artifacts = deps.normalizeGmArtifactState(draft.artifacts);
  const bonuses = deps.ensureArray(draft.bonuses);
  const buffs = deps.ensureArray(draft.temporaryBuffs);
  const autoBattleSkills = deps.ensureArray(draft.autoBattleSkills);
  const techniques = deps.ensureArray(draft.techniques);
  const quests = deps.ensureArray(draft.quests);
  const inventoryItems = deps.ensureArray(draft.inventory.items);
  const account = player.account;
  const activity = deps.getManagedAccountActivityMeta(player);
  const monthCardTotalPoolMerit = Math.max(0, Math.trunc(Number(player.monthCard?.totalPoolMerit) || 0));
  const monthCardRemainingPoolMerit = Math.max(0, Math.trunc(Number(player.monthCard?.remainingPoolMerit) || 0));
  const monthCardEternalEnabled = player.monthCard?.eternalEnabled === true;
  const monthCardDailySignInFixedMeritBonus = Math.max(0, Math.trunc(Number(player.monthCard?.dailySignInFixedMeritBonus) || 0));
  const monthCardStartAt = Number(player.monthCard?.startAt ?? 0);
  const monthCardExpireAt = Number(player.monthCard?.expireAt ?? 0);
  const monthCardLastClaimDate = player.monthCard?.lastClaimDate ?? null;
  const catalogFallbackNote = deps.getEditorCatalogFallbackNote();
  const catalogActionDisabled = deps.hasServerEditorCatalog() ? '' : ' disabled';

  const equipmentMarkup = EQUIP_SLOTS.map((slot) => {
    const item = equipment[slot];
    return `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${deps.escapeHtml(EQUIP_SLOT_LABELS[slot])}</div>
            <div class="editor-card-meta" data-preview="equipment-title" data-slot="${slot}">${deps.escapeHtml(deps.getEquipmentCardTitle(item))}</div>
            <div class="editor-card-meta" data-preview="equipment-meta" data-slot="${slot}">${deps.escapeHtml(deps.getEquipmentCardMeta(item))}</div>
          </div>
          <div class="button-row">
            ${item
              ? `<button class="small-btn danger" type="button" data-action="clear-equip" data-slot="${slot}">清空槽位</button>`
              : `<button class="small-btn" type="button" data-action="create-equip-from-catalog" data-slot="${slot}"${catalogActionDisabled}>加入槽位</button>`}
          </div>
        </div>
        ${item ? deps.getItemEditorControls(`equipment.${slot}`, item, 'equipment') : `
          <div class="editor-note">从下方选择装备模板后即可快速塞入这个槽位。</div>
          <div class="editor-grid compact">
            ${deps.searchableItemField(
              '装备模板',
              '',
              'equipment-slot',
              { 'data-catalog-select': 'equipment', 'data-slot': slot },
              'wide',
              slot,
              '点击后输入名称或 ID 搜索装备模板',
            )}
          </div>
        `}
      </div>
    `;
  }).join('');

  const artifactMarkup = artifacts.slots.map((entry, index) => {
    const item = entry.item;
    const stateLabel = entry.unlocked ? (entry.enabled ? '启用' : '停用') : '未解锁';
    const qiLabel = `灵力 ${Math.max(0, Math.trunc(Number(entry.qi) || 0))} / ${Math.max(0, Math.trunc(Number(entry.maxQi) || 0))}`;
    return `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title">${deps.escapeHtml(deps.getArtifactSlotLabel(entry.slot))}</div>
            <div class="editor-card-meta" data-preview="artifact-title" data-slot="${entry.slot}">${deps.escapeHtml(deps.getEquipmentCardTitle(item))}</div>
            <div class="editor-card-meta" data-preview="artifact-meta" data-slot="${entry.slot}">${deps.escapeHtml(`${stateLabel} · ${deps.getEquipmentCardMeta(item)} · ${qiLabel}`)}</div>
          </div>
          <div class="button-row">
            ${item
              ? `<button class="small-btn danger" type="button" data-action="clear-artifact" data-index="${index}">清空槽位</button>`
              : `<button class="small-btn" type="button" data-action="create-artifact-from-catalog" data-index="${index}"${catalogActionDisabled}>加入槽位</button>`}
          </div>
        </div>
        <div class="editor-grid compact">
          ${deps.checkboxField('已解锁', `artifacts.slots.${index}.unlocked`, entry.unlocked)}
          ${deps.checkboxField('启用', `artifacts.slots.${index}.enabled`, entry.enabled)}
          ${deps.numberField('当前灵力', `artifacts.slots.${index}.qi`, entry.qi)}
          ${deps.numberField('最大灵力', `artifacts.slots.${index}.maxQi`, entry.maxQi)}
        </div>
        ${item ? deps.getItemEditorControls(`artifacts.slots.${index}.item`, item, 'artifact') : `
          <div class="editor-note">从下方选择法宝模板后即可快速塞入这个槽位。</div>
          <div class="editor-grid compact">
            ${deps.searchableItemField(
              '法宝模板',
              '',
              'artifact-slot',
              { 'data-catalog-select': 'artifact', 'data-index': String(index) },
              'wide',
              undefined,
              '点击后输入名称或 ID 搜索法宝模板',
            )}
          </div>
        `}
      </div>
    `;
  }).join('');

  const bonusMarkup = bonuses.length > 0
    ? bonuses.map((bonus, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="bonus-title" data-index="${index}">${deps.escapeHtml(deps.getBonusCardTitle(bonus, index))}</div>
            <div class="editor-card-meta" data-preview="bonus-meta" data-index="${index}">${deps.escapeHtml(deps.getBonusCardMeta(bonus))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-bonus" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${deps.textField('来源', `bonuses.${index}.source`, bonus.source)}
          ${deps.nullableTextField('标签', `bonuses.${index}.label`, bonus.label, 'undefined')}
          ${deps.jsonField('属性加成', `bonuses.${index}.attrs`, bonus.attrs ?? {}, 'object', 'wide')}
          ${deps.jsonField('数值加成', `bonuses.${index}.stats`, bonus.stats ?? {}, 'object')}
          ${deps.jsonField('附加元数据', `bonuses.${index}.meta`, bonus.meta ?? {}, 'object')}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有额外属性加成。</div>';

  const buffMarkup = buffs.length > 0
    ? buffs.map((buff, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div class="editor-card-title">增益 ${index + 1}</div>
          <button class="small-btn danger" type="button" data-action="remove-buff" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${deps.selectField('增益', `temporaryBuffs.${index}.buffId`, buff.buffId, deps.getBuffCatalogOptions(buff.buffId), 'wide')}
          ${deps.numberField('层数', `temporaryBuffs.${index}.stacks`, buff.stacks)}
          ${deps.numberField('剩余时间', `temporaryBuffs.${index}.remainingTicks`, buff.remainingTicks)}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有临时效果。</div>';

  const inventoryMarkup = deps.getInventoryListMarkup(inventoryItems);
  const visibleInventoryCount = deps.getVisibleInventoryItems(inventoryItems).length;

  const questMarkup = quests.length > 0
    ? quests.map((quest, index) => `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <div class="editor-card-title" data-preview="quest-title" data-index="${index}">${deps.escapeHtml(deps.getQuestCardTitle(quest, index))}</div>
            <div class="editor-card-meta" data-preview="quest-meta" data-index="${index}">${deps.escapeHtml(deps.getQuestCardMeta(quest))}</div>
          </div>
          <button class="small-btn danger" type="button" data-action="remove-quest" data-index="${index}">删除</button>
        </div>
        <div class="editor-grid compact">
          ${deps.textField('任务 ID', `quests.${index}.id`, quest.id)}
          ${deps.textField('标题', `quests.${index}.title`, quest.title)}
          ${deps.selectField('任务线', `quests.${index}.line`, quest.line, GM_QUEST_LINE_OPTIONS)}
          ${deps.selectField('状态', `quests.${index}.status`, quest.status, GM_QUEST_STATUS_OPTIONS)}
          ${deps.selectField('目标类型', `quests.${index}.objectiveType`, quest.objectiveType, GM_QUEST_OBJECTIVE_TYPE_OPTIONS)}
          ${deps.nullableTextField('章节', `quests.${index}.chapter`, quest.chapter, 'undefined')}
          ${deps.nullableTextField('剧情段落', `quests.${index}.story`, quest.story, 'undefined')}
          ${deps.numberField('当前进度', `quests.${index}.progress`, quest.progress)}
          ${deps.numberField('需求进度', `quests.${index}.required`, quest.required)}
          ${deps.textField('目标名称', `quests.${index}.targetName`, quest.targetName)}
          ${deps.nullableTextField('目标地图 ID', `quests.${index}.targetMapId`, quest.targetMapId, 'undefined')}
          ${deps.numberField('目标 X', `quests.${index}.targetX`, typeof quest.targetX === 'number' ? quest.targetX : 0)}
          ${deps.numberField('目标 Y', `quests.${index}.targetY`, typeof quest.targetY === 'number' ? quest.targetY : 0)}
          ${deps.nullableTextField('目标场景人物 ID', `quests.${index}.targetNpcId`, quest.targetNpcId, 'undefined')}
          ${deps.nullableTextField('目标场景人物名称', `quests.${index}.targetNpcName`, quest.targetNpcName, 'undefined')}
          ${deps.nullableTextField('目标文本', `quests.${index}.objectiveText`, quest.objectiveText, 'undefined', 'wide')}
          ${deps.nullableTextField('传话内容', `quests.${index}.relayMessage`, quest.relayMessage, 'undefined', 'wide')}
          ${deps.textField('奖励文本', `quests.${index}.rewardText`, quest.rewardText, 'wide')}
          ${deps.textField('目标怪物 ID', `quests.${index}.targetMonsterId`, quest.targetMonsterId)}
          ${deps.nullableTextField('目标功法 ID', `quests.${index}.targetTechniqueId`, quest.targetTechniqueId, 'undefined')}
          ${deps.numberField('目标境界等级', `quests.${index}.targetRealmLv`, typeof quest.targetRealmLv === 'number' ? quest.targetRealmLv : 0)}
          ${deps.textField('发放者 ID', `quests.${index}.giverId`, quest.giverId)}
          ${deps.textField('发放者名称', `quests.${index}.giverName`, quest.giverName)}
          ${deps.nullableTextField('发放地图 ID', `quests.${index}.giverMapId`, quest.giverMapId, 'undefined')}
          ${deps.nullableTextField('发放地图名', `quests.${index}.giverMapName`, quest.giverMapName, 'undefined')}
          ${deps.numberField('发放者 X', `quests.${index}.giverX`, typeof quest.giverX === 'number' ? quest.giverX : 0)}
          ${deps.numberField('发放者 Y', `quests.${index}.giverY`, typeof quest.giverY === 'number' ? quest.giverY : 0)}
          ${deps.nullableTextField('提交场景人物 ID', `quests.${index}.submitNpcId`, quest.submitNpcId, 'undefined')}
          ${deps.nullableTextField('提交场景人物名称', `quests.${index}.submitNpcName`, quest.submitNpcName, 'undefined')}
          ${deps.nullableTextField('提交地图 ID', `quests.${index}.submitMapId`, quest.submitMapId, 'undefined')}
          ${deps.nullableTextField('提交地图名', `quests.${index}.submitMapName`, quest.submitMapName, 'undefined')}
          ${deps.numberField('提交 X', `quests.${index}.submitX`, typeof quest.submitX === 'number' ? quest.submitX : 0)}
          ${deps.numberField('提交 Y', `quests.${index}.submitY`, typeof quest.submitY === 'number' ? quest.submitY : 0)}
          ${deps.nullableTextField('提交物品 ID', `quests.${index}.requiredItemId`, quest.requiredItemId, 'undefined')}
          ${deps.numberField('提交物品数量', `quests.${index}.requiredItemCount`, typeof quest.requiredItemCount === 'number' ? quest.requiredItemCount : 1)}
          ${deps.nullableTextField('下一任务 ID', `quests.${index}.nextQuestId`, quest.nextQuestId, 'undefined')}
          ${deps.textField('奖励物品 ID（旧字段）', `quests.${index}.rewardItemId`, quest.rewardItemId)}
          ${deps.stringArrayField('奖励物品 ID 列表', `quests.${index}.rewardItemIds`, quest.rewardItemIds, 'wide')}
          ${deps.jsonField('奖励物品详情', `quests.${index}.rewards`, quest.rewards ?? [], 'array', 'wide')}
          ${deps.textField('任务描述', `quests.${index}.desc`, quest.desc, 'wide')}
        </div>
      </div>
    `).join('')
    : '<div class="editor-note">当前没有任务数据。</div>';

  return `
    ${deps.renderEditorTabSection('basic', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">账号信息</div>
          <div class="editor-section-note">这里展示账号主键、注册时间、在线状态、最近活动和累计在线时长，密码修改也统一在这里做。</div>
        </div>
      </div>
      ${account ? `
      <div class="editor-grid compact">
        <div class="editor-field">
          <span>玩家编号</span>
          <div class="editor-code">${deps.escapeHtml(deps.formatPlayerNo(player.playerNo))}</div>
        </div>
        <label class="editor-field">
          <span>账号</span>
          <input
            id="player-account-username"
            type="text"
            autocomplete="off"
            spellcheck="false"
            value="${deps.escapeHtml(account.username)}"
            placeholder="输入登录账号"
          />
        </label>
        <div class="editor-field">
          <span>账号 ID</span>
          <div class="editor-code">${deps.escapeHtml(account.userId)}</div>
        </div>
        <div class="editor-field">
          <span>注册时间</span>
          <div class="editor-code">${deps.escapeHtml(deps.formatDateTime(account.createdAt))}</div>
        </div>
        <div class="editor-field">
          <span>是否在线</span>
          <div class="editor-code">${deps.escapeHtml(deps.getManagedAccountStatusLabel(player))}</div>
        </div>
        <div class="editor-field">
          <span>账号状态</span>
          <div class="editor-code"><span class="pill ${deps.getManagedAccountRestrictionPillClass(account)}">${deps.escapeHtml(deps.getManagedAccountRestrictionLabel(account))}</span></div>
        </div>
        <div class="editor-field">
          <span>${deps.escapeHtml(activity.label)}</span>
          <div class="editor-code">${deps.escapeHtml(activity.value)}</div>
        </div>
        <div class="editor-field">
          <span>最近登录</span>
          <div class="editor-code">${deps.escapeHtml(deps.formatDateTime(account.lastLoginAt))}</div>
        </div>
        <div class="editor-field">
          <span>最近 IP</span>
          <div class="editor-code">${deps.escapeHtml(account.lastLoginIp ?? '无')}</div>
        </div>
        <div class="editor-field">
          <span>最近设备</span>
          <div class="editor-code">${deps.escapeHtml(account.lastLoginDeviceId ?? '无')}</div>
        </div>
        <div class="editor-field">
          <span>累计在线时间</span>
          <div class="editor-code">${deps.escapeHtml(deps.formatDurationSeconds(account.totalOnlineSeconds))}</div>
        </div>
        <div class="editor-field">
          <span>封禁时间</span>
          <div class="editor-code">${deps.escapeHtml(deps.formatDateTime(account.bannedAt))}</div>
        </div>
        <div class="editor-field wide">
          <span>封禁原因</span>
          <div class="editor-code">${deps.escapeHtml(account.banReason?.trim() || '无')}</div>
        </div>
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        <label class="editor-field">
          <span>新密码</span>
          <input id="player-password-input" type="text" autocomplete="off" spellcheck="false" placeholder="输入新的账号密码" />
        </label>
        <label class="editor-field wide">
          <span>封禁原因</span>
          <div class="button-row" style="margin-bottom: 8px;">
            ${[
              '同设备批量起号',
              '工作室批量养号',
              '资源转移/小号输血',
              '自动化脚本',
              '规避处罚复开号',
            ].map((reason) => (
              `<button class="small-btn" type="button" data-ban-reason-preset="${deps.escapeHtml(reason)}">${deps.escapeHtml(reason)}</button>`
            )).join('')}
          </div>
          <input id="player-account-ban-reason" type="text" autocomplete="off" spellcheck="false" placeholder="可点快速原因，也可以自定义输入" />
        </label>
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-action="save-player-account">修改账号</button>
        <button class="small-btn" type="button" data-action="save-player-password">修改账号密码</button>
        <button class="small-btn" type="button" data-action="reset-player-password-default">重置密码为 123456789</button>
        <button class="small-btn danger" type="button" data-action="ban-player-account" ${account.status === 'banned' ? 'disabled' : ''}>快捷封号</button>
        <button class="small-btn" type="button" data-action="unban-player-account" ${account.status !== 'banned' ? 'disabled' : ''}>快捷解封</button>
      </div>
      <div class="editor-note">密码只会提交到服务端，并由服务端写入哈希，不会以明文落库。封号状态会写入账号表并阻止后续登录、刷新和重连。</div>
      ${activity.note ? `<div class="editor-note">${deps.escapeHtml(activity.note)}</div>` : ''}
      ${catalogFallbackNote ? `<div class="editor-note">${deps.escapeHtml(catalogFallbackNote)}</div>` : ''}
      ` : '<div class="editor-note">当前目标没有可编辑的账号信息，通常是机器人或异常存档。</div>'}
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">基础资料</div>
          <div class="editor-section-note">人物本体、资源数值与运行时开关。</div>
        </div>
        <div class="editor-chip-list" data-preview="base-chips">
          ${deps.getEditorBodyChipMarkup(player, draft)}
        </div>
      </div>
      <div class="editor-grid">
        ${deps.textField('角色名', 'name', draft.name)}
        ${deps.numberField('HP', 'hp', draft.hp)}
        ${deps.numberField('QI', 'qi', draft.qi)}
        <div class="editor-field wide">
          <span>角色标识</span>
          <div class="editor-code">${deps.escapeHtml(deps.formatPlayerNo(player.playerNo))} · ID: ${deps.escapeHtml(draft.id)}</div>
        </div>
      </div>
      <div class="editor-toggle-row" style="margin-top: 10px;">
        ${deps.checkboxField('死亡', 'dead', draft.dead)}
        ${deps.checkboxField('自动战斗', 'autoBattle', draft.autoBattle)}
        ${deps.checkboxField('自动反击', 'autoRetaliate', draft.autoRetaliate !== false)}
        ${deps.checkboxField('锁定战斗目标', 'combatTargetLocked', draft.combatTargetLocked)}
      </div>
    </section>

    `)}

    ${deps.renderEditorTabSection('position', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">位置与朝向</div>
          <div class="editor-section-note">地图传送、坐标修正与视野范围。</div>
        </div>
      </div>
      <div class="editor-grid">
        ${deps.renderPositionMapPicker(player, draft)}
        ${deps.numberField('X', 'x', draft.x)}
        ${deps.numberField('Y', 'y', draft.y)}
        ${deps.selectField('朝向', 'facing', draft.facing, GM_FACING_OPTIONS)}
        ${deps.numberField('视野', 'viewRange', draft.viewRange)}
      </div>
    </section>
    `)}

    ${deps.renderEditorTabSection('realm', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">境界与属性</div>
          <div class="editor-section-note">当前境界、基础属性与额外加成。</div>
        </div>
      </div>
      <div class="editor-grid">
        ${deps.selectField('当前境界', 'realmLv', typeof draft.realmLv === 'number' ? draft.realmLv : 1, deps.getRealmCatalogOptions())}
        ${deps.numberField('当前境界修为', 'realm.progress', draft.realm?.progress)}
        ${deps.numberField('底蕴', 'foundation', draft.foundation)}
        ${deps.numberField('根基', 'rootFoundation', draft.rootFoundation)}
        ${deps.numberField('悟性', 'comprehension', draft.comprehension)}
        ${deps.numberField('幸运', 'luck', draft.luck)}
      </div>
      <div class="editor-stat-grid" style="margin-top: 10px;">
        ${ATTR_KEYS.map((key) => deps.numberField(ATTR_KEY_LABELS[key], `baseAttrs.${key}`, draft.baseAttrs[key])).join('')}
      </div>
      <div style="margin-top: 10px;">
        ${deps.renderAttributeSummaryGrid(draft)}
      </div>
      <div class="editor-grid compact" style="margin-top: 10px;">
        ${deps.stringArrayField('已揭示突破条件 ID', 'revealedBreakthroughRequirementIds', draft.revealedBreakthroughRequirementIds, 'wide')}
        ${deps.readonlyCodeBlock('境界状态', 'realm', draft.realm ?? {})}
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">属性加成</div>
          <div class="editor-section-note">适合直接调试被动、装备外加成等常驻附加效果。</div>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-action="add-bonus">新增加成</button>
        </div>
      </div>
      <div class="editor-card-list">${bonusMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">派生只读快照</div>
          <div class="editor-section-note">这些通常由服务端重算，不建议直接改。若确实需要，去高级 JSON 区导入。</div>
        </div>
      </div>
      <div class="editor-grid compact">
        ${deps.readonlyCodeBlock('总属性（最终属性）', 'finalAttrs', draft.finalAttrs ?? {})}
        ${deps.readonlyCodeBlock('数值属性', 'numericStats', draft.numericStats ?? {})}
        ${deps.readonlyCodeBlock('比率分母', 'ratioDivisors', draft.ratioDivisors ?? {})}
        ${deps.readonlyCodeBlock('动作列表', 'actions', draft.actions ?? [])}
      </div>
    </section>
    `)}

    ${deps.renderEditorTabSection('buffs', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">增益编辑</div>
          <div class="editor-section-note">这里只保留增益选择、层数和剩余时间，其他静态字段按模板自动带出。</div>
        </div>
        <div class="button-row">
          <button class="small-btn" type="button" data-action="add-buff"${catalogActionDisabled}>新增增益</button>
        </div>
      </div>
      <div class="editor-card-list">${buffMarkup}</div>
    </section>
    `)}

    ${deps.renderEditorTabSection('techniques', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">功法管理</div>
          <div class="editor-section-note">按总览、批量添加/移除、已学详情分页管理，避免功法数量增长后一次性渲染全部卡片。</div>
        </div>
      </div>
      ${deps.renderTechniqueManager(techniques, autoBattleSkills, draft.cultivatingTechId)}
    </section>
    `)}

    ${deps.renderEditorTabSection('craftSkills', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">技艺等级与经验</div>
          <div class="editor-section-note">统一管理炼丹、炼器、采集、挖矿、阵法和强化技艺；保存后服务端会按等级重算升级所需经验并同步强化等级。</div>
        </div>
      </div>
      <div class="editor-card-list">${deps.renderCraftSkillEditorCards(draft)}</div>
    </section>
    `)}

    ${deps.renderEditorTabSection('benefits', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">权益</div>
          <div class="editor-section-note">这里编辑活动权益真源，不走整份玩家快照覆盖；保存后会直接刷新玩家详情。</div>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom: 12px;">
        <div class="stats-card">
          <div class="stats-card-label">月卡总池</div>
          <div class="stats-card-value">${monthCardTotalPoolMerit}</div>
          <div class="stats-card-note">功德月卡累计领取池</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-label">月卡剩余</div>
          <div class="stats-card-value">${monthCardRemainingPoolMerit}</div>
          <div class="stats-card-note">每日领取会从这里扣除</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-label">永恒权益</div>
          <div class="stats-card-value">${monthCardEternalEnabled ? '已开启' : '未开启'}</div>
          <div class="stats-card-note">开启后拥有永久月卡权益</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-label">签到固定池</div>
          <div class="stats-card-value">${monthCardDailySignInFixedMeritBonus}</div>
          <div class="stats-card-note">每日签到随机池之外的固定功德</div>
        </div>
      </div>
      <div class="editor-card-list">
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">功德月卡权益</div>
              <div class="editor-card-meta">当前窗口：${monthCardStartAt > 0 ? deps.formatTradeTimestamp(monthCardStartAt) : '无'} 至 ${monthCardExpireAt > 0 ? deps.formatTradeTimestamp(monthCardExpireAt) : '无'}；上次领取：${monthCardLastClaimDate ?? '无'}。</div>
            </div>
            <button class="small-btn primary" type="button" data-action="set-month-card-benefits">保存权益</button>
          </div>
          <div class="editor-grid compact">
            <label class="editor-field">
              <span>月卡功德总池</span>
              <input id="benefit-month-card-total-pool" type="number" min="0" step="1" value="${monthCardTotalPoolMerit}" />
            </label>
            <label class="editor-field">
              <span>剩余功德</span>
              <input id="benefit-month-card-remaining-pool" type="number" min="0" step="1" value="${monthCardRemainingPoolMerit}" />
            </label>
            <label class="editor-field">
              <span>签到固定池</span>
              <input id="benefit-daily-sign-in-fixed-merit" type="number" min="0" step="1" value="${monthCardDailySignInFixedMeritBonus}" />
            </label>
            <label class="editor-toggle" style="align-self: end;">
              <input id="benefit-eternal-enabled" type="checkbox" ${monthCardEternalEnabled ? 'checked' : ''} />
              <span>开启永恒权益</span>
            </label>
          </div>
          <div class="editor-note">保存会同时写入月卡总池、剩余池、永恒开关和签到固定池。若原本没有领取窗口且仍有权益数据，会自动创建 30 天窗口。</div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">永恒</div>
              <div class="editor-card-meta">按消耗品效果直接为该玩家激活：月卡总池 +90000、重置月卡时间、开启永久权益、每日签到固定池 +1000。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 140px;">
                <span>使用次数</span>
                <input id="benefit-eternal-use-count" type="number" min="1" step="1" value="1" />
              </label>
              <button class="small-btn primary" type="button" data-action="activate-eternal-benefit">使用永恒</button>
            </div>
          </div>
          <div class="editor-note">这个操作不消耗玩家背包物品，属于 GM 直接授予同等权益；执行后刷新详情即可看到新总池和固定池。</div>
        </div>
      </div>
    </section>
    `)}

    ${deps.renderEditorTabSection('shortcuts', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">功法快捷操作</div>
          <div class="editor-section-note">按钮会直接修改草稿并自动提交对应标签，无需再切回功法或物品页手动保存。</div>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom: 12px;">
        <div class="stats-card">
          <div class="stats-card-label">已学功法</div>
          <div class="stats-card-value">${deps.ensureArray(draft.techniques).length}</div>
          <div class="stats-card-note">当前角色已写入运行态的功法数量</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-label">未学功法</div>
          <div class="stats-card-value">${Math.max(0, deps.getTechniqueCatalogOptions().length - deps.ensureArray(draft.techniques).length)}</div>
          <div class="stats-card-note">基于当前编辑目录推算的剩余可学功法</div>
        </div>
      </div>
      <div class="editor-card-list">
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">获取全部未学习功法书</div>
              <div class="editor-card-meta">把尚未学习且背包里也没有的功法书补进背包。</div>
            </div>
            <button class="small-btn" type="button" data-action="grant-all-unlearned-technique-books"${catalogActionDisabled}>加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">添加全部消耗品</div>
              <div class="editor-card-meta">把目录内全部消耗品补进背包；已有堆叠会补到 999 个。</div>
            </div>
            <button class="small-btn" type="button" data-action="grant-all-consumables"${catalogActionDisabled}>加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">添加全部装备</div>
              <div class="editor-card-meta">把目录内全部装备补进背包，每件 1 个；已有同 ID 物品不会重复添加。</div>
            </div>
            <button class="small-btn" type="button" data-action="grant-all-equipment"${catalogActionDisabled}>加入背包</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">当前全部功法满级</div>
              <div class="editor-card-meta">按编辑目录模板把当前已学功法统一拉到最高层级。</div>
            </div>
            <button class="small-btn" type="button" data-action="max-all-techniques"${catalogActionDisabled}>立即满级</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">学习全部功法</div>
              <div class="editor-card-meta">把当前目录里尚未学会的功法全部写入角色。</div>
            </div>
            <button class="small-btn primary" type="button" data-action="learn-all-techniques"${catalogActionDisabled}>全部学习</button>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">移除所有功法</div>
              <div class="editor-card-meta">清空当前角色已学功法，并移除主修功法与自动战斗技能引用。</div>
            </div>
            <button class="small-btn danger" type="button" data-action="remove-all-techniques"${catalogActionDisabled}>全部移除</button>
          </div>
        </div>
      </div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">属性快速设置</div>
          <div class="editor-section-note">这里直接请求服务端修改角色存档，不走整份角色快照覆盖。炼体等级默认保留现有炼体经验；如果经验超出目标等级上限，会自动截到升级前一档。底蕴和战斗经验则按输入值直接增加。</div>
        </div>
      </div>
      <div class="editor-card-list">
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">炼体等级</div>
              <div class="editor-card-meta">当前为 ${Math.max(0, Math.floor(draft.bodyTraining?.level ?? 0))} 层。修改后会立即重算炼体带来的属性加成。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 160px;">
                <span>目标等级</span>
                <input id="shortcut-body-training-level" type="number" min="0" step="1" value="${Math.max(0, Math.floor(draft.bodyTraining?.level ?? 0))}" />
              </label>
              <button class="small-btn primary" type="button" data-action="set-body-training-level">确认修改</button>
            </div>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">增加底蕴</div>
              <div class="editor-card-meta">当前为 ${Math.max(0, Math.floor(draft.foundation ?? 0))}。支持正负整数，负数会扣除到底蕴最低为 0。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 160px;">
                <span>调整数值</span>
                <input id="shortcut-foundation-amount" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="例如 -100 / 100" value="0" />
              </label>
              <button class="small-btn primary" type="button" data-action="add-foundation">确认调整</button>
            </div>
          </div>
        </div>
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">增加战斗经验</div>
              <div class="editor-card-meta">当前为 ${Math.max(0, Math.floor(draft.combatExp ?? 0))}。支持正负整数，负数会扣除到最低为 0。</div>
            </div>
            <div class="button-row">
              <label class="editor-field" style="min-width: 160px;">
                <span>调整数值</span>
                <input id="shortcut-combat-exp-amount" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="例如 -100 / 100" value="0" />
              </label>
              <button class="small-btn primary" type="button" data-action="add-combat-exp">确认调整</button>
            </div>
          </div>
        </div>
      </div>
      ${catalogFallbackNote ? `<div class="editor-note" style="margin-top: 12px; color: var(--stamp-red);">${deps.escapeHtml(catalogFallbackNote)}</div>` : ''}
    </section>
    `)}

    ${deps.renderEditorTabSection('items', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">背包</div>
          <div class="editor-section-note">容量、物品堆叠与实例态强化等级；名称从物品目录按 ID 解析，存档仍保持只存实例字段。</div>
        </div>
        <div class="button-row">
          ${deps.numberField('容量', 'inventory.capacity', draft.inventory.capacity)}
          <label class="editor-field" style="min-width: 220px;">
            <span>搜索当前背包</span>
            <input
              type="search"
              data-inventory-search
              autocomplete="off"
              spellcheck="false"
              value="${deps.escapeHtml(state.currentInventorySearchQuery)}"
              placeholder="输入中文名、ID、类型或部位"
            />
          </label>
          <div class="editor-field" style="min-width: 110px;">
            <span>筛选结果</span>
            <div class="editor-code" data-inventory-search-count>${deps.escapeHtml(state.currentInventorySearchQuery.trim() ? `显示 ${visibleInventoryCount} / ${inventoryItems.length} 项` : `共 ${inventoryItems.length} 项`)}</div>
          </div>
          <label class="editor-field" style="min-width: 220px;">
            <span>物品类别</span>
            <select data-catalog-select="inventory-type"${catalogActionDisabled}>
              ${deps.optionsMarkup(deps.getInventoryAddTypeOptions(), state.currentInventoryAddType)}
            </select>
          </label>
          ${deps.searchableItemField(
            '新增物品',
            '',
            'inventory-add',
            { 'data-catalog-select': 'inventory-item' },
            '',
            undefined,
            `点击后输入名称或 ID 搜索${ITEM_TYPE_LABELS[state.currentInventoryAddType]}模板`,
            { style: 'min-width: 260px;' },
          )}
          <button class="small-btn" type="button" data-action="add-inventory-item-from-catalog"${catalogActionDisabled}>加入背包</button>
        </div>
      </div>
      <div class="inventory-compact-list" data-inventory-compact-list>${inventoryMarkup}</div>
    </section>

    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">已装备</div>
          <div class="editor-section-note">战斗装备、技艺工具与法宝槽独立编辑；法宝仍写入独立法宝真源。</div>
        </div>
      </div>
      <div class="editor-card-list">${equipmentMarkup}</div>
      <div class="editor-card-list">${artifactMarkup}</div>
    </section>
    `)}

    ${deps.renderEditorTabSection('quests', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">任务</div>
          <div class="editor-section-note">任务链、奖励和发放者数据。</div>
        </div>
        <button class="small-btn" type="button" data-action="add-quest">新增任务</button>
      </div>
      <div class="editor-card-list">${questMarkup}</div>
    </section>
    `)}

    ${deps.renderEditorTabSection('mail', `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">角色邮件</div>
          <div class="editor-section-note">给当前选中的角色发送邮件。在线角色会收到收件箱摘要更新，正文仍按需打开。</div>
        </div>
      </div>
      ${deps.getMailComposerMarkup(state.directMailDraft, {
        scope: 'direct',
        submitLabel: `发送给 ${player.name || '当前角色'}`,
        note: '这里直接走 GM HTTP 接口写入邮件持久化表，不依赖客户端本地缓存。',
      })}
    </section>
    `)}

    ${deps.renderEditorTabSection('risk', deps.renderPlayerRiskSection(player))}
  `;
}

/** renderSummary：渲染摘要。 */
