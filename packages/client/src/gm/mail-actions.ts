/**
 * gm/mail-actions.ts —— GM 邮件操作：草稿更新、附件增删、发送直邮/群邮。
 *
 * 从 gm.ts 抽取：updateMailDraftValue/updateRedeemDraftValue/
 * rerenderDirectMailComposer/addMailAttachment/removeMailAttachment/
 * sendDirectMail/sendShortcutMail。
 * 对 gm.ts 的依赖通过 MailActionsContext 显式注入。
 */

import {
  type GmBroadcastMailReq,
  type GmCreateMailReq,
} from '@mud/shared';
import { GmMailBroadcastIdempotencyState } from '../gm-mail-broadcast-idempotency';
import type { GmMailComposerDraft } from './mail-composer';
import type { RedeemGroupDraft as RedeemPanelRedeemGroupDraft } from './redeem-panel';

/** MailActionsContext：mail-actions 对 gm.ts 的依赖。 */
export interface MailActionsContext {
  getToken(): string | null;
  GM_API_BASE_PATH: string;
  request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  setStatus(message: string, isError?: boolean): void;
  t(key: string, params?: Record<string, string | number | boolean>): string;
  confirm(message: string): boolean;
  buildGmPlayerApiPath(playerId: string): string;
  getDirectMailDraft(): GmMailComposerDraft;
  setDirectMailDraft(draft: GmMailComposerDraft): void;
  getBroadcastMailDraft(): GmMailComposerDraft;
  setBroadcastMailDraft(draft: GmMailComposerDraft): void;
  getDirectMailDraftPlayerId(): string | null;
  setDirectMailDraftPlayerId(id: string | null): void;
  getRedeemDraft(): RedeemPanelRedeemGroupDraft;
  setRedeemDraft(draft: RedeemPanelRedeemGroupDraft): void;
  createDefaultMailAttachmentDraft(): GmMailComposerDraft['attachments'][number];
  createDefaultMailComposerDraft(): GmMailComposerDraft;
  resetMailAttachmentPageStore(scope: 'direct' | 'shortcut'): void;
  renderShortcutMailComposer(preserveActiveInteraction?: boolean): void;
  rerenderDirectMailComposer(): void;
  getMailComposerPayload(draft: GmMailComposerDraft): GmCreateMailReq;
  getSelectedPlayerDetail(): { id: string; roleName: string } | null;
  hasServerEditorCatalog(): boolean;
  assertTrustedEditorCatalog(actionLabel: string): void;
  renderEditor(data: unknown): void;
  getState(): { players: Array<{ id: string; roleName: string }> } | null;
  getBroadcastMailIdempotencyState(): GmMailBroadcastIdempotencyState;
  getLastEditorStructureKey(): string | null;
  setLastEditorStructureKey(key: string | null): void;
}
export function updateMailDraftValue(
  scope: 'direct' | 'shortcut',
  path: string,
  rawValue: string, ctx: MailActionsContext
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const draft = scope === 'direct' ? ctx.getDirectMailDraft() : ctx.getBroadcastMailDraft();
  if (path === 'templateId') {
    draft.templateId = rawValue;
    return;
  }
  if (path === 'targetPlayerId') {
    draft.targetPlayerId = rawValue;
    return;
  }
  if (path === 'senderLabel') {
    draft.senderLabel = rawValue;
    return;
  }
  if (path === 'title') {
    draft.title = rawValue;
    return;
  }
  if (path === 'body') {
    draft.body = rawValue;
    return;
  }
  if (path === 'expireHours') {
    draft.expireHours = rawValue;
    return;
  }
  const attachmentMatch = path.match(/^attachments\.(\d+)\.(itemId|count)$/);
  if (!attachmentMatch) {
    return;
  }
  const index = Number(attachmentMatch[1]);
  const field = attachmentMatch[2];
  const attachment = draft.attachments[index];
  if (!attachment) {
    return;
  }
  if (field === 'itemId') {
    attachment.itemId = rawValue;
    return;
  }
  attachment.count = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
}

/** updateRedeemDraftValue：更新兑换Draft值。 */
export function updateRedeemDraftValue(path: string, rawValue: string, ctx: MailActionsContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (path === 'name') {
    ctx.getRedeemDraft().name = rawValue;
    return;
  }
  if (path === 'createCount') {
    ctx.getRedeemDraft().createCount = rawValue;
    return;
  }
  if (path === 'appendCount') {
    ctx.getRedeemDraft().appendCount = rawValue;
    return;
  }
  const rewardMatch = path.match(/^rewards\.(\d+)\.(itemId|count)$/);
  if (!rewardMatch) {
    return;
  }
  const index = Number(rewardMatch[1]);
  const field = rewardMatch[2];
  const reward = ctx.getRedeemDraft().rewards[index];
  if (!reward) {
    return;
  }
  if (field === 'itemId') {
    reward.itemId = rawValue;
    return;
  }
  reward.count = Math.max(1, Math.floor(Number(rawValue || '1')) || 1);
}

/** rerenderDirectMailComposer：处理rerender Direct邮件Composer。 */
export function rerenderDirectMailComposer(ctx: MailActionsContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!ctx.getState()) {
    return;
  }
  /** ctx.getLastEditorStructureKey()：last编辑器Structure Key。 */
  ctx.setLastEditorStructureKey(null);
  ctx.renderEditor(ctx.getState());
}

/** addMailAttachment：处理add邮件Attachment。 */
export function addMailAttachment(scope: 'direct' | 'shortcut', ctx: MailActionsContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!ctx.hasServerEditorCatalog()) {
    ctx.setStatus(ctx.t('gm.editor.catalog.mail-attachment-unavailable'), true);
    return;
  }
  const draft = scope === 'direct' ? ctx.getDirectMailDraft() : ctx.getBroadcastMailDraft();
  draft.attachments.push(ctx.createDefaultMailAttachmentDraft());
  ctx.resetMailAttachmentPageStore(scope);
  if (scope === 'direct') {
    rerenderDirectMailComposer(ctx);
    return;
  }
  ctx.renderShortcutMailComposer();
}

/** removeMailAttachment：处理remove邮件Attachment。 */
export function removeMailAttachment(scope: 'direct' | 'shortcut', index: number, ctx: MailActionsContext): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const draft = scope === 'direct' ? ctx.getDirectMailDraft() : ctx.getBroadcastMailDraft();
  if (index < 0 || index >= draft.attachments.length) {
    return;
  }
  draft.attachments.splice(index, 1);
  ctx.resetMailAttachmentPageStore(scope);
  if (scope === 'direct') {
    rerenderDirectMailComposer(ctx);
    return;
  }
  ctx.renderShortcutMailComposer();
}

/** sendDirectMail：处理send Direct邮件。 */
export async function sendDirectMail(ctx: MailActionsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const detail = ctx.getSelectedPlayerDetail();
  if (!detail) {
    throw new Error(ctx.t('gm.mail.no-target'));
  }
  if (ctx.getDirectMailDraft().attachments.some((entry) => entry.itemId.trim().length > 0)) {
    ctx.assertTrustedEditorCatalog('带附件邮件发送');
  }
  const payload = ctx.getMailComposerPayload(ctx.getDirectMailDraft());
  const result = await ctx.request<{  
  /**
 * ok：ok相关字段。
 */
 ok: true;  
/**
 * mailId：邮件ID标识。
 */
 mailId: string }>(`${ctx.buildGmPlayerApiPath(detail.id)}/mail`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  /** ctx.getDirectMailDraft()：direct邮件Draft。 */
  ctx.setDirectMailDraft(ctx.createDefaultMailComposerDraft());
  /** ctx.getDirectMailDraftPlayerId()：direct邮件Draft玩家ID。 */
  ctx.setDirectMailDraftPlayerId(detail.id);
  ctx.resetMailAttachmentPageStore('direct');
  rerenderDirectMailComposer(ctx);
  ctx.setStatus(ctx.t('gm.mail.sent', { roleName: detail.roleName, mailId: result.mailId }));
}

/** sendShortcutMail：处理send Shortcut邮件。 */
export async function sendShortcutMail(ctx: MailActionsContext): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (ctx.getBroadcastMailDraft().attachments.some((entry: { itemId: string }) => entry.itemId.trim().length > 0)) {
    ctx.assertTrustedEditorCatalog('带附件邮件发送');
  }
  const payload = ctx.getMailComposerPayload(ctx.getBroadcastMailDraft());
  const targetPlayerId = ctx.getBroadcastMailDraft().targetPlayerId.trim();
  const broadcastBatchId = targetPlayerId ? null : ctx.getBroadcastMailIdempotencyState().resolve(payload);
  const requestPayload: GmCreateMailReq | GmBroadcastMailReq = targetPlayerId
    ? payload
    : {
        ...payload,
        batchId: broadcastBatchId!,
      };
  const path = targetPlayerId
    ? `${ctx.GM_API_BASE_PATH}/players/${encodeURIComponent(targetPlayerId)}/mail`
    : `${ctx.GM_API_BASE_PATH}/mail/broadcast`;
  const result = await ctx.request<{  
  /**
 * ok：ok相关字段。
 */
 ok: true;  
 /**
 * mailId：邮件ID标识。
 */
 mailId: string;  
 /**
 * batchId：batchID标识。
 */
 batchId?: string;  
 /**
 * recipientCount：数量或计量字段。
 */
  recipientCount?: number }>(path, {
    method: 'POST',
    body: JSON.stringify(requestPayload),
  });
  const shouldResetBroadcastDraft = broadcastBatchId
    ? ctx.getBroadcastMailDraft().targetPlayerId.trim().length === 0
      && ctx.getBroadcastMailIdempotencyState().matches(
        broadcastBatchId,
        ctx.getMailComposerPayload(ctx.getBroadcastMailDraft()),
      )
    : true;
  if (broadcastBatchId) {
    ctx.getBroadcastMailIdempotencyState().complete(broadcastBatchId);
  }
  const targetPlayer = targetPlayerId
    ? (ctx.getState()?.players.find((player) => player.id === targetPlayerId) ?? null)
    : null;
  if (shouldResetBroadcastDraft) {
    /** ctx.getBroadcastMailDraft()：broadcast邮件Draft。 */
    ctx.setBroadcastMailDraft(ctx.createDefaultMailComposerDraft());
    ctx.resetMailAttachmentPageStore('shortcut');
    ctx.renderShortcutMailComposer();
  }
  ctx.setStatus(targetPlayer
    ? ctx.t('gm.mail.sent', { roleName: targetPlayer.roleName, mailId: result.mailId })
    : ctx.t('gm.mail.broadcast.sent', { batchId: result.batchId ?? result.mailId, recipientCount: result.recipientCount ?? 0 }));
}

/** getSelectedPlayer：读取Selected玩家。 */
