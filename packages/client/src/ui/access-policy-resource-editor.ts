/**
 * 通用多权限资源编辑器。
 *
 * 同一资源的权限槽位只在打开管理界面时一次加载；每个槽位保留独立编辑器实例，切换页签
 * 不会丢失输入、指定玩家、焦点之外的草稿状态，也不会触发整组重新请求。
 */
import {
  cloneAccessPolicy,
  type AccessPolicy,
  type AccessPolicyResourceRef,
  type AccessPolicyResourceSetSnapshot,
  type AccessPolicySpecifiedPlayer,
} from '@mud/shared';

import {
  AccessPolicyEditor,
  type AccessPolicyEditorCapabilities,
  type AccessPolicyEditorSaveResult,
} from './access-policy-editor';

export interface AccessPolicyResourceEditorOptions {
  root: HTMLElement;
  snapshot: AccessPolicyResourceSetSnapshot;
  disabled?: boolean;
  capabilities?: AccessPolicyEditorCapabilities;
  capabilitiesBySlot?: Readonly<Record<string, AccessPolicyEditorCapabilities | undefined>>;
  resolvePlayerNo(playerNo: number): Promise<AccessPolicySpecifiedPlayer | null>;
  save(
    ref: AccessPolicyResourceRef,
    policy: AccessPolicy,
    expectedRevision: number,
  ): Promise<AccessPolicyEditorSaveResult>;
  onDirtyChange?(dirty: boolean): void;
}

export class AccessPolicyResourceEditor {
  private readonly root: HTMLElement;
  private readonly snapshot: AccessPolicyResourceSetSnapshot;
  private readonly options: AccessPolicyResourceEditorOptions;
  private readonly editors = new Map<string, AccessPolicyEditor>();
  private readonly panels = new Map<string, HTMLElement>();
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly dirtySlots = new Set<string>();
  private activeSlot: string;
  private disabled: boolean;
  private destroyed = false;

  constructor(options: AccessPolicyResourceEditorOptions) {
    if (options.snapshot.slots.length === 0) throw new Error('access_policy_resource_slots_empty');
    this.options = options;
    this.root = options.root;
    this.snapshot = options.snapshot;
    this.activeSlot = options.snapshot.slots[0].slot;
    this.disabled = options.disabled === true;
    this.render();
  }

  setActiveSlot(slot: string): void {
    if (this.destroyed || !this.panels.has(slot) || this.activeSlot === slot) return;
    this.activeSlot = slot;
    for (const [candidate, panel] of this.panels) {
      const active = candidate === slot;
      panel.hidden = !active;
      this.tabButtons.get(candidate)?.classList.toggle('active', active);
      this.tabButtons.get(candidate)?.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  setDisabled(disabled: boolean): void {
    if (this.disabled === disabled) return;
    this.disabled = disabled;
    for (const editor of this.editors.values()) editor.setDisabled(disabled);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-access-policy-reset]')) {
      button.disabled = disabled;
    }
  }

  getPolicy(slot: string): AccessPolicy | null {
    return this.editors.get(slot)?.getPolicy() ?? null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const editor of this.editors.values()) editor.destroy();
    this.editors.clear();
    this.panels.clear();
    this.tabButtons.clear();
    this.root.replaceChildren();
  }

  private render(): void {
    const shell = document.createElement('section');
    shell.className = 'access-policy-resource-editor';
    shell.dataset.accessPolicyResourceEditor = 'true';

    const header = document.createElement('header');
    header.className = 'access-policy-resource-header';
    const title = document.createElement('strong');
    title.textContent = this.snapshot.title;
    const hint = document.createElement('span');
    hint.textContent = '每项权限独立保存；未设置时使用该资源声明的默认策略。';
    header.append(title, hint);
    shell.append(header);

    const tabs = document.createElement('div');
    tabs.className = 'access-policy-resource-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', `${this.snapshot.title}权限`);

    const body = document.createElement('div');
    body.className = 'access-policy-resource-body';
    for (const slot of this.snapshot.slots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ui-filter-tab${slot.slot === this.activeSlot ? ' active' : ''}`;
      button.dataset.accessPolicySlot = slot.slot;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', slot.slot === this.activeSlot ? 'true' : 'false');
      button.textContent = slot.label;
      button.addEventListener('click', () => this.setActiveSlot(slot.slot));
      tabs.append(button);
      this.tabButtons.set(slot.slot, button);

      const panel = document.createElement('section');
      panel.className = 'access-policy-resource-panel';
      panel.dataset.accessPolicySlotPanel = slot.slot;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = slot.slot !== this.activeSlot;

      const intro = document.createElement('div');
      intro.className = 'access-policy-resource-slot-intro';
      const copy = document.createElement('div');
      const slotTitle = document.createElement('strong');
      slotTitle.textContent = slot.label;
      const description = document.createElement('span');
      description.textContent = slot.description || '控制该操作是否允许其他玩家使用。';
      const defaultSummary = document.createElement('small');
      defaultSummary.textContent = `默认策略：${describePolicy(slot.defaultPolicy)}`;
      copy.append(slotTitle, description, defaultSummary);
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'small-btn ghost';
      reset.dataset.accessPolicyReset = slot.slot;
      reset.textContent = '恢复默认策略';
      reset.disabled = this.disabled;
      intro.append(copy, reset);

      const editorRoot = document.createElement('div');
      editorRoot.className = 'access-policy-resource-slot-editor';
      panel.append(intro, editorRoot);
      body.append(panel);
      this.panels.set(slot.slot, panel);

      const ref: AccessPolicyResourceRef = {
        resourceType: this.snapshot.resourceType,
        resourceId: this.snapshot.resourceId,
        slot: slot.slot,
      };
      const editor = new AccessPolicyEditor({
        root: editorRoot,
        policy: slot.policy,
        capabilities: this.options.capabilitiesBySlot?.[slot.slot] ?? this.options.capabilities,
        disabled: this.disabled,
        resolvePlayerNo: (playerNo) => this.options.resolvePlayerNo(playerNo),
        save: (policy, expectedRevision) => this.options.save(ref, policy, expectedRevision),
        onDirtyChange: (dirty) => this.handleSlotDirtyChange(slot.slot, dirty),
      });
      reset.addEventListener('click', () => editor.setDraft(cloneAccessPolicy(slot.defaultPolicy)));
      this.editors.set(slot.slot, editor);
    }
    shell.append(tabs, body);
    this.root.replaceChildren(shell);
  }

  private handleSlotDirtyChange(slot: string, dirty: boolean): void {
    if (dirty) this.dirtySlots.add(slot);
    else this.dirtySlots.delete(slot);
    const button = this.tabButtons.get(slot);
    if (button) button.classList.toggle('dirty', dirty);
    this.options.onDirtyChange?.(this.dirtySlots.size > 0);
  }
}

function describePolicy(policy: AccessPolicy): string {
  if (policy.mode === 'everyone') return '无策略，任何人可用';
  if (policy.mode === 'owner_only') return '仅所有者';
  return policy.operator === 'all' ? '按条件，全部满足' : '按条件，满足任一';
}
