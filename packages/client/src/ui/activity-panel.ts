/**
 * 活动中心面板。
 *
 * 只展示服务端下发的活动状态并提交领取/使用意图，奖励与月卡权益由服务端裁定。
 */
import type { ActivityStatusView } from '@mud/shared';
import type { SocketSocialEconomySender } from '../network/socket-send-social-economy';
import { detailModalHost } from './detail-modal-host';
import { t } from './i18n';

type ActivityPanelSocket = Pick<
  SocketSocialEconomySender,
  'sendRequestActivityStatus' | 'sendClaimMeritMonthCard' | 'sendClaimDailySignIn'
>;

type ActivityPanelOptions = {
  socket: ActivityPanelSocket;
  isConnected: () => boolean;
};
type ActivityTab = 'month-card' | 'sign-in' | 'invitation';

export class ActivityPanel {
  private static readonly MODAL_OWNER = 'activity-panel';
  private status: ActivityStatusView | null = null;
  private activeTab: ActivityTab = 'sign-in';
  private bound = false;

  constructor(private readonly options: ActivityPanelOptions) {}

  bind(): void {
    if (this.bound) {
      return;
    }
    this.bound = true;
    document.getElementById('hud-open-activity')?.addEventListener('click', () => {
      this.open();
    });
  }

  open(requestStatus = true): void {
    if (requestStatus) {
      this.requestStatus();
    }
    detailModalHost.open({
      ownerId: ActivityPanel.MODAL_OWNER,
      title: t('activity.modal.title', undefined, '活动'),
      subtitle: this.buildSubtitle(),
      variantClass: 'detail-modal--activity',
      hint: t('activity.modal.close-hint', undefined, '点击空白处关闭'),
      renderBody: (body) => {
        this.render(body);
      },
    });
  }

  clear(): void {
    this.status = null;
    this.syncBadge();
    if (detailModalHost.isOpenFor(ActivityPanel.MODAL_OWNER)) {
      detailModalHost.close(ActivityPanel.MODAL_OWNER);
    }
  }

  handleStatus(status: ActivityStatusView): void {
    this.status = status;
    this.syncBadge();
    if (detailModalHost.isOpenFor(ActivityPanel.MODAL_OWNER)) {
      detailModalHost.patch({
        ownerId: ActivityPanel.MODAL_OWNER,
        subtitle: this.buildSubtitle(),
        renderBody: (body) => {
          this.render(body);
        },
      });
    }
  }

  handleOperationResult(): void {
    this.requestStatus();
  }

  init(): void {
    this.bind();
    this.requestStatus();
  }

  private requestStatus(): void {
    if (!this.options.isConnected()) {
      return;
    }
    this.options.socket.sendRequestActivityStatus();
  }

  private render(body: HTMLElement): void {
    body.replaceChildren();
    const root = document.createElement('div');
    root.className = 'activity-shell';

    const tabs = document.createElement('div');
    tabs.className = 'activity-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.append(
      this.createTabButton('sign-in', t('activity.tab.sign-in', undefined, '每日签到')),
      this.createTabButton('invitation', '邀请'),
      this.createTabButton('month-card', t('activity.tab.month-card', undefined, '功德月卡')),
    );
    root.append(tabs);

    if (!this.status) {
      const loading = document.createElement('div');
      loading.className = 'activity-empty';
      loading.textContent = t('activity.loading', undefined, '正在读取活动状态...');
      root.append(loading);
      body.append(root);
      return;
    }

    root.append(this.renderActiveTab());
    body.append(root);
  }

  private renderActiveTab(): HTMLElement {
    if (this.activeTab === 'month-card') {
      return this.renderMonthCard();
    }
    if (this.activeTab === 'invitation') {
      return this.renderInvitation();
    }
    return this.renderSignIn();
  }

  private renderMonthCard(): HTMLElement {
    const card = document.createElement('section');
    card.className = 'activity-card activity-month-card';
    const status = this.status?.monthCard;
    if (!status) {
      return card;
    }
    const subtitle = status.eternal
      ? '永恒'
      : status.active
        ? `剩余 ${status.remainingDays} 天`
        : status.poolRemainingMerit > 0 ? '待激活' : '未激活';
    const offlineText = status.offlineMaxHours === null ? '永久' : `${status.offlineMaxHours} 小时`;
    const shopDiscountText = status.heavenlyDaoShopDiscountPercent > 0
      ? `${(100 - status.heavenlyDaoShopDiscountPercent) / 10}折`
      : '无';
    card.append(
      this.createHeader('功德月卡', subtitle),
      this.createMetricGrid([
        ['每日领取', `${status.dailyRewardMerit} 功德`],
        ['月卡总池', `${status.poolTotalMerit} 功德`],
        ['当前剩余', `${status.poolRemainingMerit} 功德`],
        ['离线时长', offlineText],
        ['商店折扣', shopDiscountText],
        ['签到固定池', `${status.dailySignInFixedMeritBonus} 功德`],
        ['月卡道具', `${status.itemCount} 个`],
        ['领取期限', status.eternal ? '永久' : status.expireAt && status.active ? formatTime(status.expireAt) : '未激活'],
      ]),
    );
    const actions = document.createElement('div');
    actions.className = 'activity-actions';
    const claimButton = this.createActionButton(
      status.canClaimToday ? '领取今日功德' : status.active ? '今日已领取' : '未激活',
      () => this.options.socket.sendClaimMeritMonthCard(),
      !status.canClaimToday,
    );
    actions.append(claimButton);
    card.append(actions);
    return card;
  }

  private renderSignIn(): HTMLElement {
    const card = document.createElement('section');
    card.className = 'activity-card activity-sign-in';
    const status = this.status?.dailySignIn;
    if (!status) {
      return card;
    }
    const rewardPreview = status.rewardPreview;
    const rewardText = rewardPreview.fixedMerit > 0
      ? `${rewardPreview.randomMinMerit}-${rewardPreview.randomMaxMerit} + ${rewardPreview.fixedMerit} 功德`
      : `${rewardPreview.randomMinMerit}-${rewardPreview.randomMaxMerit} 功德`;
    card.append(
      this.createHeader('每日签到', status.canClaimToday ? '今日可领' : '今日已领'),
      this.createMetricGrid([
        ['签到奖励', rewardText],
        ['上次获得', status.lastRewardMerit === null ? '无' : `${status.lastRewardMerit} 功德`],
        ['连续签到', `${status.streakDays} 天`],
        ['累计签到', `${status.totalDays} 天`],
        ['今日日期', status.today],
      ]),
    );
    const actions = document.createElement('div');
    actions.className = 'activity-actions';
    actions.append(this.createActionButton(
      status.canClaimToday ? '签到领取' : '今日已签到',
      () => this.options.socket.sendClaimDailySignIn(),
      !status.canClaimToday,
    ));
    card.append(actions);
    return card;
  }

  private renderInvitation(): HTMLElement {
    const card = document.createElement('section');
    card.className = 'activity-card activity-invitation';
    const status = this.status?.invitation;
    if (!status) {
      return card;
    }
    card.append(
      this.createHeader('邀请', `${status.totalInvitees} 人`),
      this.createMetricGrid([
        ['邀请码', status.inviteCode || '生成中'],
        ['邀请人数', `${status.totalInvitees} 人`],
        ['练气达成', `${status.qiReachedCount} 人`],
        ['筑基达成', `${status.foundationReachedCount} 人`],
        ['受邀奖励', `${status.inviteeReward.spiritStone} 灵石 / ${status.inviteeReward.merit} 功德`],
        ['注册奖励', `${status.stages.find((stage) => stage.key === 'registered')?.rewardMerit ?? 0} 功德`],
      ]),
      this.renderInvitationLink(status.invitePath),
      this.renderInvitationStages(status.stages),
    );
    return card;
  }

  private renderInvitationLink(invitePath: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'activity-invite-link-row';
    const value = document.createElement('input');
    value.type = 'text';
    value.readOnly = true;
    value.value = buildInvitationUrl(invitePath);
    const copyButton = this.createActionButton('复制邀请链接', () => {
      void copyText(value.value).then((ok) => {
        copyButton.textContent = ok ? '已复制' : '复制失败';
        window.setTimeout(() => {
          copyButton.textContent = '复制邀请链接';
        }, 1400);
      });
    }, !invitePath);
    wrapper.append(value, copyButton);
    return wrapper;
  }

  private renderInvitationStages(stages: NonNullable<ActivityStatusView['invitation']>['stages']): HTMLElement {
    const list = document.createElement('div');
    list.className = 'activity-invite-stage-list';
    for (const stage of stages) {
      const row = document.createElement('div');
      row.className = 'activity-invite-stage';
      const name = document.createElement('span');
      name.textContent = stage.label;
      const count = document.createElement('strong');
      count.textContent = `${stage.count} 人 · ${stage.rewardMerit} 功德`;
      row.append(name, count);
      list.append(row);
    }
    return list;
  }

  private createHeader(title: string, state: string): HTMLElement {
    const header = document.createElement('header');
    header.className = 'activity-card-header';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const badge = document.createElement('span');
    badge.className = 'activity-state-badge';
    badge.textContent = state;
    header.append(heading, badge);
    return header;
  }

  private createMetricGrid(entries: Array<[string, string]>): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'activity-metric-grid';
    for (const [label, value] of entries) {
      const item = document.createElement('div');
      item.className = 'activity-metric';
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const valueEl = document.createElement('strong');
      valueEl.textContent = value;
      item.append(labelEl, valueEl);
      grid.append(item);
    }
    return grid;
  }

  private createTabButton(tab: ActivityTab, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    const selected = this.activeTab === tab;
    button.className = `activity-tab${selected ? ' active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.textContent = label;
    button.addEventListener('click', () => {
      this.activeTab = tab;
      if (detailModalHost.isOpenFor(ActivityPanel.MODAL_OWNER)) {
        this.open(false);
      }
    });
    return button;
  }

  private createActionButton(label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'activity-action-btn';
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  private buildSubtitle(): string {
    if (!this.status) {
      return t('activity.modal.subtitle.loading', undefined, '功德月卡与每日签到');
    }
    const monthCard = this.status.monthCard.active
      ? `月卡剩余 ${this.status.monthCard.remainingDays} 天，池 ${this.status.monthCard.poolRemainingMerit} 功德`
      : '月卡未激活';
    const signIn = this.status.dailySignIn.canClaimToday ? '今日可签到' : '今日已签到';
    return `${signIn} · 邀请 ${this.status.invitation.totalInvitees} 人 · ${monthCard}`;
  }

  private syncBadge(): void {
    const button = document.getElementById('hud-open-activity');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const hasRedDot = this.status?.hasRedDot === true;
    button.classList.toggle('has-unread', hasRedDot);
    button.dataset.hasUnread = hasRedDot ? 'true' : 'false';
  }
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildInvitationUrl(invitePath: string): string {
  if (!invitePath) {
    return '';
  }
  return `${window.location.origin}${invitePath}`;
}

async function copyText(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to textarea fallback
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}
