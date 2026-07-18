/**
 * ISSUE-000015：通过正式邮件面板验证手机端存在连续的纵向滚动路径。
 */
import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:ISSUE-000015:PASS';
const VIEWPORT = { width: 390, height: 844 };

const fixtureExpression = String.raw`
  (async () => {
    const { MailPanel } = await import('/src/ui/mail-panel.ts');
    const socket = {
      sendRequestMailSummary() {},
      sendRequestMailPage() {},
      sendRequestMailDetail() {},
      sendMarkMailRead() {},
      sendClaimMailAttachments() {},
      sendDeleteMail() {},
    };
    const panel = new MailPanel(socket);
    const now = Date.now();
    const items = Array.from({ length: 12 }, (_, index) => ({
      mailId: 'mail-mobile-proof-' + index,
      title: '司命台长标题邮件 ' + (index + 1),
      summary: '用于验证手机端列表、详情和底部操作均可通过同一滚动路径到达。',
      senderLabel: '司命台',
      createdAt: now - index * 60_000,
      expireAt: null,
      hasAttachments: true,
      read: index > 0,
      claimed: false,
    }));
    panel.setPlayerId('p_mail_mobile_proof');
    panel.open();
    panel.updateSummary({ unreadCount: 1, claimableCount: 12, revision: 1 });
    panel.updatePage({ items, total: 12, page: 1, pageSize: 12, totalPages: 1, filter: 'all' });
    panel.updateDetail({
      mailId: items[0].mailId,
      senderLabel: '司命台',
      createdAt: now,
      expireAt: null,
      templateId: null,
      args: [],
      fallbackTitle: items[0].title,
      fallbackBody: Array.from({ length: 12 }, (_, index) => '邮件正文第 ' + (index + 1) + ' 行').join('\n'),
      attachments: Array.from({ length: 12 }, (_, index) => ({ itemId: 'black_iron_chunk', count: index + 1 })),
      read: false,
      claimed: false,
      deletable: true,
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__mailMobileProofPanel = panel;
    return {
      modalOpen: !document.getElementById('detail-modal')?.classList.contains('hidden'),
      modalClass: document.getElementById('detail-modal')?.className ?? '',
      title: document.getElementById('detail-modal-title')?.textContent?.trim() ?? '',
    };
  })()
`;

const measureExpression = String.raw`
  (() => {
    const card = document.getElementById('detail-modal-card');
    const body = document.getElementById('detail-modal-body');
    const shell = document.querySelector('.mail-shell');
    const listPane = document.querySelector('.mail-pane--list');
    const detailPane = document.querySelector('.mail-pane--detail');
    const list = document.querySelector('.mail-list');
    const lastAttachment = [...document.querySelectorAll('.mail-attachment-item')].at(-1);
    if (!(card instanceof HTMLElement)
      || !(body instanceof HTMLElement)
      || !(shell instanceof HTMLElement)
      || !(listPane instanceof HTMLElement)
      || !(detailPane instanceof HTMLElement)
      || !(list instanceof HTMLElement)
      || !(lastAttachment instanceof HTMLElement)) {
      throw new Error('邮件正式弹层结构不完整');
    }
    const cardRect = card.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const listRect = listPane.getBoundingClientRect();
    const detailRect = detailPane.getBoundingClientRect();
    const attachmentRect = lastAttachment.getBoundingClientRect();
    return {
      viewportHeight: innerHeight,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      bodyOverflowY: getComputedStyle(body).overflowY,
      shellHeight: shell.getBoundingClientRect().height,
      listOverflowY: getComputedStyle(list).overflowY,
      layoutColumns: getComputedStyle(document.querySelector('.mail-layout')).gridTemplateColumns,
      listCount: list.querySelectorAll('.mail-entry').length,
      verticalOrder: detailRect.top >= listRect.bottom,
      lastAttachmentTop: attachmentRect.top,
      lastAttachmentBottom: attachmentRect.bottom,
      lastAttachmentVisible: attachmentRect.top >= bodyRect.top && attachmentRect.bottom <= bodyRect.bottom,
      scrollPoint: { x: bodyRect.left + bodyRect.width / 2, y: bodyRect.top + Math.min(60, bodyRect.height / 2) },
    };
  })()
`;

await withClientBrowserProof({ viewport: VIEWPORT, profilePrefix: 'mail-mobile-proof-' }, async (cdp) => {
  const opened = await cdp.evaluate(fixtureExpression);
  assert.equal(opened.modalOpen, true, '邮件入口未打开正式详情弹层');
  assert.match(opened.modalClass, /\bdetail-modal--mail\b/, '未进入正式邮件弹层变体');
  assert.equal(opened.title, '飞书台', '邮件弹层标题不正确');

  const initial = await cdp.evaluate(measureExpression);
  assert(initial.cardTop >= 0 && initial.cardBottom <= initial.viewportHeight, '手机端邮件弹层超出安全视口');
  assert.equal(initial.bodyOverflowY, 'auto', '手机端邮件正文必须承担纵向滚动');
  assert(initial.bodyScrollHeight > initial.bodyClientHeight + 1, '邮件正文没有形成纵向滚动范围');
  assert(initial.shellHeight > initial.bodyClientHeight, '邮件内容仍被固定高度裁切');
  assert.equal(initial.listOverflowY, 'visible', '手机端邮件列表不应抢占外层滚动手势');
  assert.equal(initial.listCount, 12, '正式邮件列表未渲染完整分页');
  assert.equal(initial.verticalOrder, true, '手机端邮件列表与详情未纵向排列');

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: initial.scrollPoint.x,
    y: initial.scrollPoint.y,
    deltaX: 0,
    deltaY: 3_000,
  });
  await delay(150);
  const scrolled = await cdp.evaluate(measureExpression);
  assert(scrolled.bodyScrollTop > 0, '触控等价滚动未推进邮件正文');

  await cdp.evaluate(`document.getElementById('detail-modal-body').scrollTop = document.getElementById('detail-modal-body').scrollHeight`);
  await delay(50);
  const bottom = await cdp.evaluate(measureExpression);
  assert.equal(bottom.lastAttachmentVisible, true, '滚动到底后邮件底部附件仍不可达');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'dark'`);
  await delay(50);
  const dark = await cdp.evaluate(measureExpression);
  assert.equal(dark.listCount, 12, '深色模式切换后邮件内容丢失');

  await cdp.evaluate(`document.documentElement.dataset.colorMode = 'light'`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1280,
    screenHeight: 900,
  });
  await delay(100);
  const desktop = await cdp.evaluate(measureExpression);
  assert.equal(desktop.bodyOverflowY, 'hidden', '桌面邮件弹层必须继续使用双栏内部滚动');
  assert.equal(desktop.listOverflowY, 'auto', '桌面邮件列表独立滚动被破坏');
  assert.match(desktop.layoutColumns, /\S+\s+\S+/, '桌面邮件布局未保持双栏');
});

console.log(MARKER);
