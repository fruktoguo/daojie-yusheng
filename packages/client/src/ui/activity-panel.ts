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
  sendUseItem: (itemInstanceId: string) => void;
};
type ActivityTab = 'month-card' | 'sign-in';

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

    root.append(this.activeTab === 'sign-in' ? this.renderSignIn() : this.renderMonthCard());
    body.append(root);
  }

  private renderMonthCard(): HTMLElement {
    const card = document.createElement('section');
    card.className = 'activity-card activity-month-card';
    const status = this.status?.monthCard;
    if (!status) {
      return card;
    }
    card.append(
      this.createHeader('功德月卡', status.active ? `剩余 ${status.remainingDays} 天` : '未激活'),
      this.createMetricGrid([
        ['每日领取', `${status.dailyRewardMerit} 功德`],
        ['离线时长', `${status.offlineMaxHours} 小时`],
        ['月卡道具', `${status.itemCount} 个`],
        ['到期时间', status.expireAt ? formatTime(status.expireAt) : '未激活'],
      ]),
    );
    const actions = document.createElement('div');
    actions.className = 'activity-actions';
    const claimButton = this.createActionButton(
      status.canClaimToday ? '领取今日功德' : status.active ? '今日已领取' : '未激活',
      () => this.options.socket.sendClaimMeritMonthCard(),
      !status.canClaimToday,
    );
    const useButton = this.createActionButton(
      status.itemCount > 0 ? '使用月卡' : '无月卡道具',
      () => {
        if (status.firstItemInstanceId) {
          this.options.sendUseItem(status.firstItemInstanceId);
          window.setTimeout(() => this.requestStatus(), 600);
        }
      },
      !status.firstItemInstanceId,
    );
    actions.append(claimButton, useButton);
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
    card.append(
      this.createHeader('每日签到', status.canClaimToday ? '今日可领' : '今日已领'),
      this.createMetricGrid([
        ['签到奖励', `${status.rewardMerit} 功德`],
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
    const monthCard = this.status.monthCard.active ? `月卡剩余 ${this.status.monthCard.remainingDays} 天` : '月卡未激活';
    const signIn = this.status.dailySignIn.canClaimToday ? '今日可签到' : '今日已签到';
    return `${monthCard} · ${signIn}`;
  }

  private syncBadge(): void {
    const button = document.getElementById('hud-open-activity');
    button?.classList.toggle('has-unread', this.status?.hasRedDot === true);
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
