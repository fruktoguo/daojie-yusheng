/** 道友子功能固定窗口：复用坊市/拍卖行的 detail modal 骨架。 */
import { WorkspaceModalPanel } from './workspace-modal-panel';

export type SocialWorkspacePanelKind = 'relations' | 'requests' | 'nearby' | 'messages';

type SocialWorkspacePanelMeta = {
  title: string;
  subtitle: string;
};

const PANEL_META: Record<SocialWorkspacePanelKind, SocialWorkspacePanelMeta> = {
  relations: { title: '道友名录', subtitle: '查看道友状态与发起互动' },
  requests: { title: '道友申请', subtitle: '处理收到与发出的道友申请' },
  nearby: { title: '附近修士', subtitle: '查看当前附近可互动的修士' },
  messages: { title: '私聊', subtitle: '与道友进行一对一传音' },
};

export class SocialWorkspacePanel {
  readonly root: HTMLElement;
  readonly body: HTMLElement;

  private readonly workspace: WorkspaceModalPanel;

  constructor(
    kind: SocialWorkspacePanelKind,
    onBeforeClose: () => void,
    onClose: () => void,
  ) {
    const meta = PANEL_META[kind];
    this.workspace = new WorkspaceModalPanel({
      ownerId: `social-workspace-${kind}`,
      contentId: `social-workspace-${kind}`,
      title: meta.title,
      subtitle: meta.subtitle,
      className: `social-workspace-content social-workspace-content--${kind}`,
      onBeforeClose,
      onClose,
    });
    this.root = this.workspace.root;
    this.body = this.workspace.body;
    this.root.dataset.socialWorkspacePanel = kind;
  }

  open(): void {
    this.workspace.open();
  }

  close(notify = true): void {
    this.workspace.close(notify);
  }

  hide(): void {
    this.workspace.close(false);
  }

  isOpen(): boolean {
    return this.workspace.isOpen();
  }

  updateContent(html: string): void {
    this.workspace.updateContent(html);
  }

  clearContent(): void {
    this.workspace.updateContent('');
  }

  setTitle(title: string): void {
    this.workspace.setTitle(title);
  }

  focusInitialControl(): void {
    this.workspace.focusInitialControl();
  }

  destroy(): void {
    this.workspace.destroy();
  }
}
