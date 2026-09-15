/**
 * gm/mail-composer.ts —— GM 邮件编辑器纯 HTML 生成。
 *
 * 从 gm.ts 抽取：getMailComposerMarkup。
 * 通过依赖注入接收所需函数，不依赖 gm.ts 模块级状态。
 */

import type { GmMailTemplateOption } from '@mud/shared';
import { escapeHtml } from './format';
import { optionsMarkup } from './fields';

/** GmMailAttachmentDraft：邮件附件草稿。 */
export interface GmMailAttachmentDraft {
  itemId: string;
  count: number;
}

/** GmMailComposerDraft：GM 发信草稿上下文。 */
export interface GmMailComposerDraft {
  templateId: string;
  targetPlayerId: string;
  senderLabel: string;
  title: string;
  body: string;
  expireHours: string;
  attachments: GmMailAttachmentDraft[];
}

/** MailTemplateOptionMeta：邮件模板选项元数据。 */
interface MailTemplateOptionMeta {
  label: string;
  description: string;
}

/** ShortcutMailTargetOption：快捷邮件目标选项。 */
interface ShortcutMailTargetOption {
  value: string;
  label: string;
}

/** MailComposerDeps：邮件编辑器依赖。 */
export interface MailComposerDeps {
  isServerManagedMailTemplate: (templateId: string) => boolean;
  getMailTemplateOptionMeta: (templateId: string) => MailTemplateOptionMeta | null;
  hasServerEditorCatalog: () => boolean;
  getEditorCatalogFallbackNote: () => string;
  getMailAttachmentTitle: (itemId: string, fallbackLabel: string) => string;
  getMailAttachmentRowMeta: (itemId: string) => string;
  searchableItemField: (
    label: string,
    value: string,
    filter: 'all' | 'inventory-add' | 'equipment-slot' | 'artifact-slot',
    attrs: Record<string, string | undefined>,
    extraClass?: string,
  ) => string;
  getShortcutMailTargetOptions: () => ShortcutMailTargetOption[];
  mailTemplateOptions: GmMailTemplateOption[];
}

/** getMailComposerMarkupHtml：生成邮件编辑器 HTML。 */
export function getMailComposerMarkupHtml(
  draft: GmMailComposerDraft,
  options: {
    scope: 'direct' | 'shortcut';
    submitLabel: string;
    note: string;
    showTargetPlayer?: boolean;
  },
  deps: MailComposerDeps,
): string {
  const usesServerManagedTemplate = deps.isServerManagedMailTemplate(draft.templateId);
  const templateMeta = deps.getMailTemplateOptionMeta(draft.templateId);
  const catalogActionDisabled = deps.hasServerEditorCatalog() ? '' : ' disabled';
  const catalogFallbackNote = deps.getEditorCatalogFallbackNote();
  const attachmentRows = usesServerManagedTemplate
    ? `<div class="editor-note">${escapeHtml(templateMeta?.description || '该模板的附件由服务端固定生成。')}</div>`
    : draft.attachments.length > 0
      ? draft.attachments.map((entry, index) => {
        return `
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <div class="editor-card-title">${escapeHtml(deps.getMailAttachmentTitle(entry.itemId, `附件 ${index + 1}`))}</div>
              <div class="editor-card-meta">${escapeHtml(deps.getMailAttachmentRowMeta(entry.itemId))}</div>
            </div>
            <button class="small-btn danger" type="button" data-action="${options.scope === 'direct' ? 'remove-direct-mail-attachment' : 'remove-shortcut-mail-attachment'}" data-mail-attachment-index="${index}">删除附件</button>
          </div>
          <div class="editor-grid compact">
            ${deps.searchableItemField(
              '物品模板',
              entry.itemId,
              'all',
              { 'data-mail-bind': `${options.scope}.attachments.${index}.itemId` },
              'wide',
            )}
            <label class="editor-field">
              <span>数量</span>
              <input type="number" min="1" data-mail-bind="${options.scope}.attachments.${index}.count" value="${Math.max(1, Math.floor(entry.count || 1))}"${catalogActionDisabled} />
            </label>
          </div>
        </div>
      `;
      }).join('')
      : '<div class="editor-note">当前没有附件。</div>';
  const targetPlayerField = options.showTargetPlayer
    ? `
      <label class="editor-field wide">
        <span>发送目标</span>
        <select data-mail-bind="${options.scope}.targetPlayerId">
          ${optionsMarkup(deps.getShortcutMailTargetOptions(), draft.targetPlayerId)}
        </select>
      </label>
    `
    : '';
  const templateField = `
    <label class="editor-field wide">
      <span>邮件模板</span>
      <select data-mail-bind="${options.scope}.templateId">
        ${optionsMarkup(
          deps.mailTemplateOptions.map((entry) => ({ value: entry.templateId, label: `${entry.label} · ${entry.description}` })),
          draft.templateId,
        )}
      </select>
    </label>
  `;
  const customContentFields = usesServerManagedTemplate
    ? `
      <div class="editor-note" style="margin-top: 10px;">
        当前使用模板"${escapeHtml(templateMeta?.label || '未知模板')}"，标题、正文和附件由服务端统一生成。
      </div>
    `
    : `
      <label class="editor-field wide">
        <span>标题</span>
        <input type="text" autocomplete="off" spellcheck="false" data-mail-bind="${options.scope}.title" value="${escapeHtml(draft.title)}" placeholder="不填则由服务端显示为未命名邮件" />
      </label>
      <label class="editor-field wide">
        <span>正文</span>
        <textarea class="editor-textarea" style="min-height: 120px;" spellcheck="false" data-mail-bind="${options.scope}.body" placeholder="可留空，仅发送附件">${escapeHtml(draft.body)}</textarea>
      </label>
    `;
  const attachmentSection = usesServerManagedTemplate
    ? `
      <div class="editor-section" style="margin-top: 10px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">模板附件</div>
            <div class="editor-section-note">当前模板会附带指定常用装备一套、全部非神通功法书各一本到，以及五枚苦修丹。</div>
          </div>
        </div>
        <div class="editor-card-list">${attachmentRows}</div>
      </div>
    `
    : `
      <div class="editor-section" style="margin-top: 10px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">邮件附件</div>
            <div class="editor-section-note">附件由服务端在领取时校验并发放到背包。</div>
          </div>
          <button class="small-btn" type="button" data-action="${options.scope === 'direct' ? 'add-direct-mail-attachment' : 'add-shortcut-mail-attachment'}"${catalogActionDisabled}>新增附件</button>
        </div>
        <div class="editor-card-list">${attachmentRows}</div>
      </div>
    `;

  return `
    <div class="editor-grid compact">
      ${targetPlayerField}
      ${templateField}
      <label class="editor-field">
        <span>发件人</span>
        <input type="text" autocomplete="off" spellcheck="false" data-mail-bind="${options.scope}.senderLabel" value="${escapeHtml(draft.senderLabel)}" placeholder="司命台" />
      </label>
      <label class="editor-field">
        <span>过期小时</span>
        <input type="number" min="0" data-mail-bind="${options.scope}.expireHours" value="${escapeHtml(draft.expireHours)}" placeholder="72" />
      </label>
      ${customContentFields}
    </div>
    ${attachmentSection}
    <div class="button-row" style="margin-top: 10px;">
      <button class="small-btn primary" type="button" data-action="${options.scope === 'direct' ? 'send-direct-mail' : 'send-shortcut-mail'}">${escapeHtml(options.submitLabel)}</button>
    </div>
    <div class="editor-note" style="margin-top: 8px;">${escapeHtml(options.note)}</div>
    ${catalogFallbackNote ? `<div class="editor-note" style="margin-top: 8px; color: var(--stamp-red);">${escapeHtml(catalogFallbackNote)}</div>` : ''}
  `;
}
