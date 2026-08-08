/**
 * 通用权限编辑器。
 *
 * 组件只编辑共享策略并提交保存意图，不在客户端执行权威权限裁定。
 */
import {
  ACCESS_POLICY_MAX_CONDITIONS,
  ACCESS_POLICY_MAX_SPECIFIED_PLAYERS,
  ATTR_KEY_LABELS,
  DEFAULT_ACCESS_POLICY,
  SECT_MEMBER_ROLE_HIERARCHY,
  SECT_MEMBER_ROLE_LABELS,
  cloneAccessPolicy,
  type AccessPolicy,
  type AccessPolicyCondition,
  type AccessPolicyMode,
  type AccessPolicyOperator,
  type AccessPolicyRelationKind,
  type AccessPolicySpecifiedPlayer,
  type AttrKey,
  validateAccessPolicy,
} from '@mud/shared';

import { accessPolicyPanelHost } from './access-policy-panel-host';

export type AccessPolicyEditorConditionType = AccessPolicyCondition['type'];

export interface AccessPolicyEditorRealmOption {
  realmLv: number;
  label: string;
}

export interface AccessPolicyEditorCapabilities {
  conditionTypes?: readonly AccessPolicyEditorConditionType[];
  relationKinds?: readonly AccessPolicyRelationKind[];
  realmOptions?: readonly AccessPolicyEditorRealmOption[];
  maxSpecifiedPlayers?: number;
}

export interface AccessPolicyEditorSaveResult {
  ok: boolean;
  policy?: AccessPolicy;
  currentPolicy?: AccessPolicy;
  reason?: string;
  unresolvedPlayerNos?: number[];
}

export interface AccessPolicyEditorOptions {
  root: HTMLElement;
  policy?: AccessPolicy;
  capabilities?: AccessPolicyEditorCapabilities;
  disabled?: boolean;
  /** selector 为固定三态入口；custom 仅供独立自定义策略面板使用。 */
  presentation?: 'selector' | 'custom';
  customPanelContext?: string;
  resolvePlayerNo(playerNo: number): Promise<AccessPolicySpecifiedPlayer | null>;
  save(policy: AccessPolicy, expectedRevision: number): Promise<AccessPolicyEditorSaveResult>;
  onDirtyChange?(dirty: boolean): void;
  onSaved?(policy: AccessPolicy): void;
  onConflict?(policy: AccessPolicy): void;
}

const CONDITION_TYPE_LABELS: Readonly<Record<AccessPolicyEditorConditionType, string>> = {
  relation: '好友关系',
  sect: '同宗门',
  players: '指定玩家',
  role_name: '角色名字',
  realm: '境界',
  attribute: '属性',
  party: '同队伍',
};

const RELATION_LABELS: Readonly<Record<AccessPolicyRelationKind, string>> = {
  dao_friend: '道友',
  close_friend: '至交',
  master: '师父',
  apprentice: '徒弟',
  enemy: '仇家',
};

const DEFAULT_CONDITION_TYPES: readonly AccessPolicyEditorConditionType[] = [
  'relation',
  'sect',
  'players',
  'role_name',
  'realm',
  'attribute',
];
const DEFAULT_RELATIONS: readonly AccessPolicyRelationKind[] = [
  'dao_friend',
  'close_friend',
  'master',
  'apprentice',
  'enemy',
];

let accessPolicyEditorSequence = 0;

export class AccessPolicyEditor {
  private readonly root: HTMLElement;
  private readonly options: AccessPolicyEditorOptions;
  private readonly conditionTypes: readonly AccessPolicyEditorConditionType[];
  private readonly relationKinds: readonly AccessPolicyRelationKind[];
  private readonly realmOptions: readonly AccessPolicyEditorRealmOption[];
  private readonly maxSpecifiedPlayers: number;
  private readonly presentation: 'selector' | 'custom';
  private readonly customPanelOwnerId: string;
  private authoritativePolicy: AccessPolicy;
  private draft: AccessPolicy;
  private lastConditionalPolicy: AccessPolicy;
  private disabled: boolean;
  private dirty = false;
  private customPanelDirty = false;
  private emittedDirty = false;
  private saving = false;
  private destroyed = false;
  private requestSerial = 0;
  private statusNode: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private customEditor: AccessPolicyEditor | null = null;

  constructor(options: AccessPolicyEditorOptions) {
    this.options = options;
    this.root = options.root;
    this.conditionTypes = normalizeConditionTypes(options.capabilities?.conditionTypes);
    this.relationKinds = normalizeRelationKinds(options.capabilities?.relationKinds);
    this.realmOptions = normalizeRealmOptions(options.capabilities?.realmOptions);
    this.maxSpecifiedPlayers = Math.max(
      1,
      Math.min(
        ACCESS_POLICY_MAX_SPECIFIED_PLAYERS,
        Math.trunc(Number(options.capabilities?.maxSpecifiedPlayers) || ACCESS_POLICY_MAX_SPECIFIED_PLAYERS),
      ),
    );
    this.presentation = options.presentation ?? 'selector';
    this.customPanelOwnerId = `access-policy-custom:${++accessPolicyEditorSequence}`;
    this.disabled = options.disabled === true;
    this.authoritativePolicy = cloneAccessPolicy(options.policy ?? DEFAULT_ACCESS_POLICY);
    this.draft = cloneAccessPolicy(this.authoritativePolicy);
    this.lastConditionalPolicy = this.resolveConditionalPolicy(this.draft);
    if (this.presentation === 'custom' && this.draft.mode !== 'conditional') {
      this.authoritativePolicy = cloneAccessPolicy(this.lastConditionalPolicy);
      this.draft = cloneAccessPolicy(this.lastConditionalPolicy);
    }
    this.render();
  }

  setPolicy(policy: AccessPolicy): void {
    this.closeCustomPanel();
    this.authoritativePolicy = cloneAccessPolicy(policy);
    this.draft = cloneAccessPolicy(policy);
    if (policy.mode === 'conditional') this.lastConditionalPolicy = cloneAccessPolicy(policy);
    this.setDirty(false);
    this.render();
  }

  /** 用业务默认策略替换当前草稿，但保留权威 revision，下一次保存仍走正常乐观锁。 */
  setDraft(policy: AccessPolicy): void {
    if (this.disabled || this.saving || this.destroyed) return;
    const next = cloneAccessPolicy(policy);
    next.revision = this.authoritativePolicy.revision;
    this.draft = next;
    if (next.mode === 'conditional') this.lastConditionalPolicy = cloneAccessPolicy(next);
    this.setDirty(true);
    this.render();
  }

  setDisabled(disabled: boolean): void {
    if (this.disabled === disabled) return;
    this.disabled = disabled;
    this.customEditor?.setDisabled(disabled);
    this.render();
  }

  getPolicy(): AccessPolicy {
    return this.customEditor?.getPolicy() ?? cloneAccessPolicy(this.draft);
  }

  hasUnsavedChanges(): boolean {
    return this.dirty || this.customPanelDirty;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.requestSerial += 1;
    this.closeCustomPanel();
    this.root.replaceChildren();
  }

  private render(): void {
    if (this.destroyed) return;
    this.requestSerial += 1;
    const fragment = document.createDocumentFragment();
    const shell = document.createElement('section');
    shell.className = `access-policy-editor access-policy-editor--${this.presentation}`;
    shell.dataset.accessPolicyEditor = 'true';

    const hint = document.createElement('div');
    hint.className = 'access-policy-hint';
    if (this.presentation === 'custom') {
      hint.textContent = '最多设置两种不同类别的条件；条件内部为任一匹配，两组之间可选择或/且。';
      shell.append(hint);
      shell.append(this.renderConditionalBody());
    } else {
      shell.append(this.renderModeSelector());
      hint.textContent = this.draft.mode === 'owner_only'
        ? '只有资源所有者可以使用。'
        : this.draft.mode === 'everyone'
          ? '任何玩家均可使用；业务系统仍会执行距离、状态和资产校验。'
          : `已启用自定义策略：${describeConditionalPolicy(this.draft)}。`;
      shell.append(hint);
      if (this.draft.mode === 'conditional') shell.append(this.renderCustomPolicyEntry());
    }

    shell.append(this.renderFooter());
    fragment.append(shell);
    this.root.replaceChildren(fragment);
  }

  private renderModeSelector(): HTMLElement {
    const modeGroup = document.createElement('div');
    modeGroup.className = 'access-policy-mode-group';
    modeGroup.setAttribute('role', 'group');
    modeGroup.setAttribute('aria-label', '权限模式');
    for (const entry of [
      { value: 'everyone' as const, label: '所有人' },
      { value: 'owner_only' as const, label: '仅所有者' },
      { value: 'conditional' as const, label: '自定义策略' },
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ui-filter-tab${this.draft.mode === entry.value ? ' active' : ''}`;
      button.dataset.accessPolicyMode = entry.value;
      button.textContent = entry.label;
      button.disabled = this.disabled || this.saving;
      button.setAttribute('aria-pressed', this.draft.mode === entry.value ? 'true' : 'false');
      if (entry.value === 'conditional') button.setAttribute('aria-haspopup', 'dialog');
      button.addEventListener('click', () => {
        if (entry.value === 'conditional') this.openCustomPanel();
        else this.changeMode(entry.value);
      });
      modeGroup.append(button);
    }
    return modeGroup;
  }

  private renderCustomPolicyEntry(): HTMLElement {
    const entry = document.createElement('div');
    entry.className = 'access-policy-custom-entry';
    const summary = document.createElement('span');
    summary.textContent = describeConditionalPolicy(this.draft);
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'small-btn ghost';
    edit.textContent = '编辑自定义策略';
    edit.disabled = this.disabled || this.saving;
    edit.addEventListener('click', () => this.openCustomPanel());
    entry.append(summary, edit);
    return entry;
  }

  private renderFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'access-policy-footer';
    this.statusNode = document.createElement('div');
    this.statusNode.className = 'access-policy-status';
    this.statusNode.setAttribute('aria-live', 'polite');
    footer.append(this.statusNode);
    this.saveButton = document.createElement('button');
    this.saveButton.type = 'button';
    this.saveButton.className = 'small-btn';
    this.saveButton.textContent = this.saving ? '保存中...' : '保存权限';
    this.saveButton.disabled = this.disabled || this.saving || !this.dirty;
    this.saveButton.addEventListener('click', () => void this.save());
    footer.append(this.saveButton);
    return footer;
  }

  private renderConditionalBody(): HTMLElement {
    const body = document.createElement('div');
    body.className = 'access-policy-conditional';
    if (this.draft.conditions.length === 2) {
      const operator = document.createElement('div');
      operator.className = 'access-policy-operator';
      operator.append(this.createOperatorButton('any', '满足任一'), this.createOperatorButton('all', '必须同时满足'));
      body.append(operator);
    }
    const list = document.createElement('div');
    list.className = 'access-policy-condition-list';
    this.draft.conditions.forEach((condition, index) => list.append(this.renderCondition(condition, index)));
    body.append(list);
    if (this.draft.conditions.length < ACCESS_POLICY_MAX_CONDITIONS) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'small-btn ghost access-policy-add-condition';
      add.textContent = this.draft.conditions.length === 0 ? '添加权限条件' : '添加第二组条件';
      add.disabled = this.disabled || this.saving || this.getAvailableConditionTypes(-1).length === 0;
      add.addEventListener('click', () => this.addCondition());
      body.append(add);
    }
    return body;
  }

  private createOperatorButton(operator: AccessPolicyOperator, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ui-filter-tab${this.draft.operator === operator ? ' active' : ''}`;
    button.textContent = label;
    button.disabled = this.disabled || this.saving;
    button.addEventListener('click', () => {
      if (this.draft.operator === operator) return;
      this.draft.operator = operator;
      this.markChanged();
      this.render();
    });
    return button;
  }

  private renderCondition(condition: AccessPolicyCondition, index: number): HTMLElement {
    const card = document.createElement('section');
    card.className = 'access-policy-condition';
    card.dataset.accessPolicyConditionIndex = String(index);
    const head = document.createElement('div');
    head.className = 'access-policy-condition-head';
    const title = document.createElement('strong');
    title.textContent = `权限条件 ${index + 1}`;
    head.append(title);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'small-btn ghost';
    remove.textContent = '移除';
    remove.disabled = this.disabled || this.saving;
    remove.addEventListener('click', () => this.removeCondition(index));
    head.append(remove);
    card.append(head);

    const typeRow = document.createElement('label');
    typeRow.className = 'access-policy-field';
    typeRow.append(createFieldLabel('条件类别'));
    const typeSelect = document.createElement('select');
    typeSelect.className = 'ui-select';
    const availableTypes = this.getAvailableConditionTypes(index);
    const visibleTypes = availableTypes.includes(condition.type)
      ? availableTypes
      : [condition.type, ...availableTypes];
    for (const type of visibleTypes) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = CONDITION_TYPE_LABELS[type];
      option.selected = type === condition.type;
      typeSelect.append(option);
    }
    typeSelect.disabled = this.disabled || this.saving;
    typeSelect.addEventListener('change', () => this.changeConditionType(index, typeSelect.value as AccessPolicyEditorConditionType));
    typeRow.append(typeSelect);
    card.append(typeRow, this.renderConditionFields(condition, index));
    return card;
  }

  private renderConditionFields(condition: AccessPolicyCondition, index: number): HTMLElement {
    const fields = document.createElement('div');
    fields.className = 'access-policy-condition-fields';
    switch (condition.type) {
      case 'relation':
        fields.append(this.renderCheckboxGroup(
          '关系类别',
          this.relationKinds.map((value) => ({ value, label: RELATION_LABELS[value] })),
          new Set(condition.relations),
          (value, checked) => {
            condition.relations = updateOrderedSelection(condition.relations, value as AccessPolicyRelationKind, checked, this.relationKinds);
            this.markChanged();
            this.patchSaveButton();
          },
        ));
        break;
      case 'sect':
        fields.append(this.renderSectFields(condition, index));
        break;
      case 'players':
        fields.append(this.renderPlayersFields(condition, index));
        break;
      case 'role_name':
        fields.append(this.renderRoleNameFields(condition));
        break;
      case 'realm':
        fields.append(this.renderRealmFields(condition));
        break;
      case 'attribute':
        fields.append(this.renderAttributeFields(condition));
        break;
      case 'party': {
        const note = document.createElement('div');
        note.className = 'access-policy-inline-note';
        note.textContent = '访问者与资源所有者处于同一队伍时满足条件。';
        fields.append(note);
        break;
      }
    }
    return fields;
  }

  private renderSectFields(condition: Extract<AccessPolicyCondition, { type: 'sect' }>, index: number): HTMLElement {
    const wrapper = document.createElement('div');
    const anyMember = document.createElement('label');
    anyMember.className = 'inline-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = condition.roles.length === 0;
    checkbox.disabled = this.disabled || this.saving;
    checkbox.addEventListener('change', () => {
      condition.roles = checkbox.checked ? [] : ['leader'];
      this.markChanged();
      this.render();
    });
    anyMember.append(checkbox, document.createTextNode('同宗门全部成员'));
    wrapper.append(anyMember);
    if (condition.roles.length > 0) {
      wrapper.append(this.renderCheckboxGroup(
        '精确职位',
        SECT_MEMBER_ROLE_HIERARCHY.map((value) => ({ value, label: SECT_MEMBER_ROLE_LABELS[value] })),
        new Set(condition.roles),
        (value, checked) => {
          const nextRoles = updateOrderedSelection(condition.roles, value as any, checked, SECT_MEMBER_ROLE_HIERARCHY);
          if (!checked && nextRoles.length === 0) {
            this.render();
            this.setStatus('精确职位至少保留一项；如需全部成员，请勾选“同宗门全部成员”。', true);
            return;
          }
          condition.roles = nextRoles;
          this.markChanged();
          this.patchSaveButton();
        },
      ));
    }
    wrapper.dataset.conditionIndex = String(index);
    return wrapper;
  }

  private renderPlayersFields(condition: Extract<AccessPolicyCondition, { type: 'players' }>, index: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'access-policy-player-selector';
    const controls = document.createElement('div');
    controls.className = 'access-policy-player-controls';
    const input = document.createElement('input');
    input.className = 'ui-input';
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '1';
    input.step = '1';
    input.placeholder = '输入玩家序号';
    input.disabled = this.disabled || this.saving || condition.players.length >= this.maxSpecifiedPlayers;
    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'small-btn';
    resolve.textContent = '查询并添加';
    resolve.disabled = input.disabled;
    const result = document.createElement('div');
    result.className = 'access-policy-player-result';
    const submit = () => void this.resolveAndAddPlayer(index, input, resolve, result);
    resolve.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    controls.append(input, resolve);
    wrapper.append(controls, result);
    const chips = document.createElement('div');
    chips.className = 'access-policy-player-chips';
    for (const player of condition.players) {
      const chip = document.createElement('span');
      chip.className = 'access-policy-player-chip';
      const text = document.createElement('span');
      text.textContent = `#${player.playerNo} ${player.roleName}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `移除 ${player.roleName}`);
      remove.textContent = '×';
      remove.disabled = this.disabled || this.saving;
      remove.addEventListener('click', () => {
        condition.players = condition.players.filter((entry) => entry.playerNo !== player.playerNo);
        this.markChanged();
        this.render();
      });
      chip.append(text, remove);
      chips.append(chip);
    }
    wrapper.append(chips);
    const note = document.createElement('div');
    note.className = 'access-policy-inline-note';
    note.textContent = `只能通过数字序号添加，最多 ${this.maxSpecifiedPlayers} 人；保存时服务端会重新解析身份。`;
    wrapper.append(note);
    return wrapper;
  }

  private renderRoleNameFields(condition: Extract<AccessPolicyCondition, { type: 'role_name' }>): HTMLElement {
    const row = document.createElement('div');
    row.className = 'access-policy-two-column';
    const match = createSelectField('匹配方式', [
      ['exact', '完全匹配'],
      ['contains', '包含'],
      ['prefix', '前缀匹配'],
      ['suffix', '后缀匹配'],
    ], condition.match, this.disabled || this.saving);
    match.select.addEventListener('change', () => {
      condition.match = match.select.value as typeof condition.match;
      this.markChanged();
      this.patchSaveButton();
    });
    const pattern = document.createElement('label');
    pattern.className = 'access-policy-field';
    pattern.append(createFieldLabel('角色名字'));
    const input = document.createElement('input');
    input.className = 'ui-input';
    input.type = 'text';
    input.value = condition.pattern;
    input.placeholder = '输入角色名规则';
    input.disabled = this.disabled || this.saving;
    input.addEventListener('input', () => {
      condition.pattern = input.value.normalize('NFC').trim();
      this.markChanged();
      this.patchSaveButton();
    });
    pattern.append(input);
    row.append(match.root, pattern);
    return row;
  }

  private renderRealmFields(condition: Extract<AccessPolicyCondition, { type: 'realm' }>): HTMLElement {
    const row = document.createElement('div');
    row.className = 'access-policy-two-column';
    const comparison = createSelectField('比较方式', [
      ['gt', '大于'],
      ['lt', '小于'],
      ['eq', '等于'],
    ], condition.comparison, this.disabled || this.saving);
    comparison.select.addEventListener('change', () => {
      condition.comparison = comparison.select.value as typeof condition.comparison;
      this.markChanged();
      this.patchSaveButton();
    });
    const realmField = document.createElement('label');
    realmField.className = 'access-policy-field';
    realmField.append(createFieldLabel('指定境界'));
    if (this.realmOptions.length > 0) {
      const select = document.createElement('select');
      select.className = 'ui-select';
      for (const entry of this.realmOptions) {
        const option = document.createElement('option');
        option.value = String(entry.realmLv);
        option.textContent = entry.label;
        option.selected = entry.realmLv === condition.realmLv;
        select.append(option);
      }
      select.disabled = this.disabled || this.saving;
      select.addEventListener('change', () => {
        condition.realmLv = Math.max(1, Math.trunc(Number(select.value) || 1));
        this.markChanged();
        this.patchSaveButton();
      });
      realmField.append(select);
    } else {
      const input = createNumberInput(condition.realmLv, 1, this.disabled || this.saving);
      input.addEventListener('input', () => {
        condition.realmLv = Math.max(1, Math.trunc(Number(input.value) || 1));
        this.markChanged();
        this.patchSaveButton();
      });
      realmField.append(input);
    }
    row.append(comparison.root, realmField);
    return row;
  }

  private renderAttributeFields(condition: Extract<AccessPolicyCondition, { type: 'attribute' }>): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'access-policy-three-column';
    const attr = createSelectField(
      '属性',
      (Object.keys(ATTR_KEY_LABELS) as AttrKey[]).map((key) => [key, ATTR_KEY_LABELS[key]]),
      condition.attr,
      this.disabled || this.saving,
    );
    attr.select.addEventListener('change', () => {
      condition.attr = attr.select.value as AttrKey;
      this.markChanged();
      this.patchSaveButton();
    });
    const comparison = createSelectField('比较方式', [['gt', '大于'], ['lt', '小于']], condition.comparison, this.disabled || this.saving);
    comparison.select.addEventListener('change', () => {
      condition.comparison = comparison.select.value as typeof condition.comparison;
      this.markChanged();
      this.patchSaveButton();
    });
    const value = document.createElement('label');
    value.className = 'access-policy-field';
    value.append(createFieldLabel('数值'));
    const input = createNumberInput(condition.value, 0, this.disabled || this.saving);
    input.addEventListener('input', () => {
      condition.value = Math.max(0, Number(input.value) || 0);
      this.markChanged();
      this.patchSaveButton();
    });
    value.append(input);
    grid.append(attr.root, comparison.root, value);
    return grid;
  }

  private renderCheckboxGroup(
    label: string,
    entries: readonly { value: string; label: string }[],
    selected: ReadonlySet<string>,
    onChange: (value: string, checked: boolean) => void,
  ): HTMLElement {
    const field = document.createElement('fieldset');
    field.className = 'access-policy-checkbox-field';
    const legend = document.createElement('legend');
    legend.textContent = label;
    field.append(legend);
    const options = document.createElement('div');
    options.className = 'access-policy-checkbox-options';
    for (const entry of entries) {
      const option = document.createElement('label');
      option.className = 'inline-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected.has(entry.value);
      input.disabled = this.disabled || this.saving;
      input.addEventListener('change', () => onChange(entry.value, input.checked));
      option.append(input, document.createTextNode(entry.label));
      options.append(option);
    }
    field.append(options);
    return field;
  }

  private openCustomPanel(): void {
    if (this.presentation !== 'selector' || this.disabled || this.saving || this.destroyed) return;
    if (accessPolicyPanelHost.isOpenFor(this.customPanelOwnerId)) return;
    const policy = this.draft.mode === 'conditional'
      ? this.resolveConditionalPolicy(this.draft)
      : this.resolveConditionalPolicy(this.lastConditionalPolicy);
    policy.revision = this.authoritativePolicy.revision;
    const startsDirty = this.dirty || this.draft.mode !== 'conditional';
    const opened = accessPolicyPanelHost.open({
      ownerId: this.customPanelOwnerId,
      title: '自定义权限策略',
      subtitle: this.options.customPanelContext,
      onRequestClose: () => (
        !this.customEditor?.hasUnsavedChanges()
        || window.confirm('自定义权限策略尚未保存，确认放弃本次修改？')
      ),
      onClose: () => this.releaseCustomEditor(),
      renderBody: (body) => {
        const editor = new AccessPolicyEditor({
          root: body,
          policy,
          capabilities: this.options.capabilities,
          disabled: this.disabled,
          presentation: 'custom',
          resolvePlayerNo: (playerNo) => this.options.resolvePlayerNo(playerNo),
          save: (nextPolicy, expectedRevision) => this.options.save(nextPolicy, expectedRevision),
          onDirtyChange: (dirty) => this.setCustomPanelDirty(dirty),
          onSaved: (savedPolicy) => this.handleCustomPolicySaved(savedPolicy),
          onConflict: (currentPolicy) => this.handleCustomPolicyConflict(currentPolicy),
        });
        this.customEditor = editor;
        if (startsDirty) editor.setDraft(policy);
      },
    });
    if (!opened) this.releaseCustomEditor();
  }

  private handleCustomPolicySaved(policy: AccessPolicy): void {
    this.authoritativePolicy = cloneAccessPolicy(policy);
    this.draft = cloneAccessPolicy(policy);
    this.lastConditionalPolicy = cloneAccessPolicy(policy);
    this.dirty = false;
    this.releaseCustomEditor();
    accessPolicyPanelHost.close(this.customPanelOwnerId);
    this.render();
    this.setStatus('权限已保存。', false);
    this.focusActiveMode();
    this.emitDirtyChange();
    this.options.onSaved?.(cloneAccessPolicy(policy));
  }

  private handleCustomPolicyConflict(policy: AccessPolicy): void {
    this.authoritativePolicy = cloneAccessPolicy(policy);
    this.draft = cloneAccessPolicy(policy);
    if (policy.mode === 'conditional') this.lastConditionalPolicy = cloneAccessPolicy(policy);
    this.dirty = false;
    this.releaseCustomEditor();
    accessPolicyPanelHost.close(this.customPanelOwnerId);
    this.render();
    this.setStatus('权限已被其他操作修改，已加载最新配置，请重新修改。', true);
    this.focusActiveMode();
    this.emitDirtyChange();
    this.options.onConflict?.(cloneAccessPolicy(policy));
  }

  private closeCustomPanel(): void {
    this.releaseCustomEditor();
    accessPolicyPanelHost.close(this.customPanelOwnerId);
  }

  private focusActiveMode(): void {
    queueMicrotask(() => {
      if (!this.destroyed) {
        this.root.querySelector<HTMLButtonElement>('.access-policy-mode-group button.active')
          ?.focus({ preventScroll: true });
      }
    });
  }

  private releaseCustomEditor(): void {
    const editor = this.customEditor;
    this.customEditor = null;
    editor?.destroy();
    this.setCustomPanelDirty(false);
  }

  private resolveConditionalPolicy(policy: Readonly<AccessPolicy>): AccessPolicy {
    const next = cloneAccessPolicy(policy);
    next.mode = 'conditional';
    if (next.conditions.length === 0) {
      next.conditions = [createDefaultCondition(
        this.conditionTypes[0] ?? 'relation',
        this.relationKinds,
        this.realmOptions,
      )];
    }
    if (next.conditions.length < 2) next.operator = 'any';
    return next;
  }

  private changeMode(mode: AccessPolicyMode): void {
    if (mode === 'conditional') {
      this.openCustomPanel();
      return;
    }
    if (this.draft.mode === mode) return;
    if (this.draft.mode === 'conditional') this.lastConditionalPolicy = cloneAccessPolicy(this.draft);
    this.draft.mode = mode;
    this.draft.conditions = [];
    this.draft.operator = 'any';
    this.markChanged();
    this.render();
  }

  private addCondition(): void {
    if (this.draft.conditions.length >= ACCESS_POLICY_MAX_CONDITIONS) return;
    const type = this.getAvailableConditionTypes(-1)[0];
    if (!type) return;
    this.draft.conditions.push(createDefaultCondition(type, this.relationKinds, this.realmOptions));
    this.markChanged();
    this.render();
  }

  private removeCondition(index: number): void {
    this.draft.conditions.splice(index, 1);
    if (this.draft.conditions.length < 2) this.draft.operator = 'any';
    this.markChanged();
    this.render();
  }

  private changeConditionType(index: number, type: AccessPolicyEditorConditionType): void {
    if (!this.conditionTypes.includes(type)) return;
    if (this.draft.conditions.some((condition, candidateIndex) => candidateIndex !== index && condition.type === type)) return;
    this.draft.conditions[index] = createDefaultCondition(type, this.relationKinds, this.realmOptions);
    this.markChanged();
    this.render();
  }

  private getAvailableConditionTypes(index: number): AccessPolicyEditorConditionType[] {
    const used = new Set(this.draft.conditions.map((condition, candidateIndex) => candidateIndex === index ? '' : condition.type));
    return this.conditionTypes.filter((type) => !used.has(type));
  }

  private async resolveAndAddPlayer(
    conditionIndex: number,
    input: HTMLInputElement,
    button: HTMLButtonElement,
    result: HTMLElement,
  ): Promise<void> {
    const playerNo = Number(input.value);
    if (!Number.isSafeInteger(playerNo) || playerNo <= 0) {
      result.textContent = '请输入有效的玩家序号。';
      result.className = 'access-policy-player-result error';
      return;
    }
    const condition = this.draft.conditions[conditionIndex];
    if (!condition || condition.type !== 'players') return;
    if (condition.players.some((entry) => entry.playerNo === playerNo)) {
      result.textContent = '该玩家已经在列表中。';
      result.className = 'access-policy-player-result error';
      return;
    }
    const serial = ++this.requestSerial;
    button.disabled = true;
    input.disabled = true;
    result.textContent = '正在查询玩家...';
    result.className = 'access-policy-player-result';
    try {
      const player = await this.options.resolvePlayerNo(playerNo);
      if (this.destroyed || serial !== this.requestSerial) return;
      if (!player) {
        result.textContent = '未找到对应玩家。';
        result.className = 'access-policy-player-result error';
        return;
      }
      condition.players.push({ playerNo: player.playerNo, playerId: player.playerId, roleName: player.roleName });
      condition.players.sort((left, right) => left.playerNo - right.playerNo);
      this.markChanged();
      this.render();
    } catch (error) {
      if (this.destroyed || serial !== this.requestSerial) return;
      result.textContent = error instanceof Error ? error.message : '玩家查询失败。';
      result.className = 'access-policy-player-result error';
    } finally {
      if (!this.destroyed && serial === this.requestSerial) {
        button.disabled = this.disabled || this.saving;
        input.disabled = this.disabled || this.saving;
      }
    }
  }

  private async save(): Promise<void> {
    if (this.disabled || this.saving || !this.dirty) return;
    const validated = validateAccessPolicy(this.draft);
    if (!validated.ok || !validated.policy) {
      this.setStatus('权限配置不完整，请检查未选择的条件或空输入。', true);
      return;
    }
    this.saving = true;
    this.patchSaveButton();
    this.setStatus('正在保存权限...', false);
    try {
      const result = await this.options.save(cloneAccessPolicy(validated.policy), this.authoritativePolicy.revision);
      if (!result.ok || !result.policy) {
        if (result.reason === 'access_policy_revision_conflict' && result.currentPolicy) {
          this.authoritativePolicy = cloneAccessPolicy(result.currentPolicy);
          this.draft = cloneAccessPolicy(result.currentPolicy);
          if (result.currentPolicy.mode === 'conditional') {
            this.lastConditionalPolicy = cloneAccessPolicy(result.currentPolicy);
          }
          this.setDirty(false);
          this.render();
          this.setStatus('权限已被其他操作修改，已加载最新配置，请重新修改。', true);
          this.options.onConflict?.(cloneAccessPolicy(result.currentPolicy));
          return;
        }
        const unresolved = result.unresolvedPlayerNos?.length
          ? `：#${result.unresolvedPlayerNos.join('、#')}`
          : '';
        this.setStatus(resolveSaveError(result.reason) + unresolved, true);
        return;
      }
      this.authoritativePolicy = cloneAccessPolicy(result.policy);
      this.draft = cloneAccessPolicy(result.policy);
      if (result.policy.mode === 'conditional') this.lastConditionalPolicy = cloneAccessPolicy(result.policy);
      this.setDirty(false);
      this.render();
      this.setStatus('权限已保存。', false);
      this.options.onSaved?.(cloneAccessPolicy(result.policy));
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : '权限保存失败。', true);
    } finally {
      this.saving = false;
      this.patchSaveButton();
    }
  }

  private markChanged(): void {
    this.setDirty(true);
  }

  private setDirty(dirty: boolean): void {
    if (this.dirty === dirty) return;
    this.dirty = dirty;
    this.emitDirtyChange();
  }

  private setCustomPanelDirty(dirty: boolean): void {
    if (this.customPanelDirty === dirty) return;
    this.customPanelDirty = dirty;
    this.emitDirtyChange();
  }

  private emitDirtyChange(): void {
    const dirty = this.dirty || this.customPanelDirty;
    if (this.emittedDirty === dirty) return;
    this.emittedDirty = dirty;
    this.options.onDirtyChange?.(dirty);
  }

  private patchSaveButton(): void {
    if (!this.saveButton) return;
    this.saveButton.disabled = this.disabled || this.saving || !this.dirty;
    this.saveButton.textContent = this.saving ? '保存中...' : '保存权限';
  }

  private setStatus(message: string, error: boolean): void {
    if (!this.statusNode) return;
    this.statusNode.textContent = message;
    this.statusNode.classList.toggle('error', error);
  }
}

function createDefaultCondition(
  type: AccessPolicyEditorConditionType,
  relationKinds: readonly AccessPolicyRelationKind[],
  realmOptions: readonly AccessPolicyEditorRealmOption[],
): AccessPolicyCondition {
  switch (type) {
    case 'relation':
      return { type, relations: [relationKinds[0] ?? 'dao_friend'] };
    case 'sect':
      return { type, roles: [] };
    case 'players':
      return { type, players: [] };
    case 'role_name':
      return { type, match: 'exact', pattern: '' };
    case 'realm':
      return { type, comparison: 'gt', realmLv: realmOptions[0]?.realmLv ?? 1 };
    case 'attribute':
      return { type, attr: 'constitution', comparison: 'gt', value: 0 };
    case 'party':
      return { type };
  }
}

function createFieldLabel(text: string): HTMLElement {
  const label = document.createElement('span');
  label.className = 'access-policy-field-label';
  label.textContent = text;
  return label;
}

function createSelectField(
  label: string,
  options: readonly (readonly [string, string])[],
  value: string,
  disabled: boolean,
): { root: HTMLLabelElement; select: HTMLSelectElement } {
  const root = document.createElement('label');
  root.className = 'access-policy-field';
  root.append(createFieldLabel(label));
  const select = document.createElement('select');
  select.className = 'ui-select';
  select.disabled = disabled;
  for (const entry of options) {
    const option = document.createElement('option');
    option.value = entry[0];
    option.textContent = entry[1];
    option.selected = entry[0] === value;
    select.append(option);
  }
  root.append(select);
  return { root, select };
}

function createNumberInput(value: number, min: number, disabled: boolean): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = String(min);
  input.step = '1';
  input.value = String(value);
  input.disabled = disabled;
  return input;
}

function updateOrderedSelection<T extends string>(
  current: readonly T[],
  value: T,
  checked: boolean,
  order: readonly T[],
): T[] {
  const next = new Set(current);
  if (checked) next.add(value);
  else next.delete(value);
  return order.filter((entry) => next.has(entry));
}

function normalizeConditionTypes(value: readonly AccessPolicyEditorConditionType[] | undefined): readonly AccessPolicyEditorConditionType[] {
  const source = value?.length ? value : DEFAULT_CONDITION_TYPES;
  return Array.from(new Set(source.filter((entry) => Object.hasOwn(CONDITION_TYPE_LABELS, entry))));
}

function normalizeRelationKinds(value: readonly AccessPolicyRelationKind[] | undefined): readonly AccessPolicyRelationKind[] {
  const source = value?.length ? value : DEFAULT_RELATIONS;
  return Array.from(new Set(source.filter((entry) => Object.hasOwn(RELATION_LABELS, entry))));
}

function normalizeRealmOptions(value: readonly AccessPolicyEditorRealmOption[] | undefined): readonly AccessPolicyEditorRealmOption[] {
  const byLevel = new Map<number, AccessPolicyEditorRealmOption>();
  for (const entry of value ?? []) {
    const realmLv = Math.trunc(Number(entry?.realmLv));
    const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
    if (realmLv > 0 && label) byLevel.set(realmLv, { realmLv, label });
  }
  return Array.from(byLevel.values()).sort((left, right) => left.realmLv - right.realmLv);
}

function resolveSaveError(reason: string | undefined): string {
  switch (reason) {
    case 'access_policy_revision_conflict':
      return '权限已被其他操作修改，请重新加载后再保存。';
    case 'access_policy_player_not_found':
      return '以下玩家序号无法解析';
    case 'access_policy_manage_denied':
      return '当前角色没有修改该权限的资格。';
    case 'access_policy_persistence_failed':
      return '权限落盘失败，原配置未确认生效。';
    default:
      return '权限保存失败。';
  }
}

function describeConditionalPolicy(policy: Readonly<AccessPolicy>): string {
  const count = Math.max(0, policy.conditions.length);
  if (count === 0) return '尚未设置条件';
  if (count === 1) return '1 类条件';
  return policy.operator === 'all' ? '2 类条件，必须同时满足' : '2 类条件，满足任一即可';
}
