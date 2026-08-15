/** 坊市/拍卖行同款的固定功能窗口宿主；同一时间由 detailModalHost 只展示一个。 */
import { detailModalHost } from './detail-modal-host';

export type WorkspaceModalPanelOptions = {
  ownerId: string;
  contentId: string;
  title: string;
  subtitle: string;
  className?: string;
  onBeforeClose?: () => void;
  onClose?: () => void;
};

export class WorkspaceModalPanel {
  readonly root: HTMLElement;
  readonly body: HTMLElement;

  private title: string;
  private closePrepared = false;

  constructor(private readonly options: WorkspaceModalPanelOptions) {
    this.title = options.title;
    this.root = document.createElement('div');
    this.root.id = options.contentId;
    this.root.className = `feature-workspace-content ${options.className ?? ''}`.trim();
    this.root.dataset.featureWorkspace = options.ownerId;
    this.root.tabIndex = -1;
    this.body = this.root;
  }

  open(): void {
    detailModalHost.open({
      ownerId: this.options.ownerId,
      title: this.title,
      subtitle: this.options.subtitle,
      hint: '点击空白处或按 Esc 关闭',
      size: 'lg',
      variantClass: 'detail-modal--feature-workspace',
      renderBody: (body) => body.appendChild(this.root),
      onRequestClose: () => {
        this.prepareClose();
        return true;
      },
      onClose: () => this.finishClose(),
    });
  }

  close(notify = true): void {
    if (!this.isOpen()) return;
    if (notify) this.prepareClose();
    detailModalHost.close(this.options.ownerId);
    if (notify) this.finishClose();
    else this.closePrepared = false;
  }

  isOpen(): boolean {
    return detailModalHost.isOpenFor(this.options.ownerId);
  }

  setTitle(title: string): void {
    this.title = title.trim() || this.options.title;
    if (this.isOpen()) detailModalHost.patch({ ownerId: this.options.ownerId, title: this.title });
  }

  updateContent(html: string): void {
    this.body.innerHTML = html.trim();
  }

  focusInitialControl(): void {
    if (!this.isOpen()) return;
    const target = this.root.querySelector<HTMLElement>([
      '[data-workspace-initial-focus]:not(:disabled)',
      '[role="tab"][aria-selected="true"]:not(:disabled)',
      'button:not(:disabled)',
      'input:not(:disabled)',
      'select:not(:disabled)',
      'textarea:not(:disabled)',
      'a[href]',
    ].join(',')) ?? this.root;
    target.focus({ preventScroll: true });
  }

  destroy(): void {
    this.close(false);
    this.root.remove();
  }

  private prepareClose(): void {
    if (this.closePrepared) return;
    this.closePrepared = true;
    this.options.onBeforeClose?.();
  }

  private finishClose(): void {
    if (!this.closePrepared) this.options.onBeforeClose?.();
    this.closePrepared = false;
    this.options.onClose?.();
  }
}
