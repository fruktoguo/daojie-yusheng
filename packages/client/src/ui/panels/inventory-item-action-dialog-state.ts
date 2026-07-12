/** 背包单物品操作弹窗的纯状态与渲染代际。 */
export type InventoryActionKind = 'use' | 'drop' | 'destroy';

export type InventoryActionDialogSnapshot = Readonly<{
  kind: InventoryActionKind;
  itemKey: string;
  countDraft: string;
  confirmDestroy: boolean;
}>;

export class InventoryItemActionDialogState {
  private dialog: InventoryActionDialogSnapshot | null = null;

  isOpen(): boolean {
    return this.dialog !== null;
  }

  matchesItem(itemKey: string | null | undefined): boolean {
    return this.dialog !== null && Boolean(itemKey) && this.dialog.itemKey === itemKey;
  }

  snapshot(): InventoryActionDialogSnapshot | null {
    return this.dialog;
  }

  open(kind: InventoryActionKind, itemKey: string, defaultCount: number): boolean {
    if (!itemKey) {
      this.reset();
      return false;
    }
    this.dialog = {
      kind,
      itemKey,
      countDraft: String(Math.max(1, Math.floor(Number(defaultCount) || 1))),
      confirmDestroy: false,
    };
    return true;
  }

  setCountDraft(countDraft: string): void {
    if (!this.dialog) {
      return;
    }
    this.dialog = { ...this.dialog, countDraft };
  }

  setDestroyConfirmation(confirmDestroy: boolean): void {
    if (!this.dialog) {
      return;
    }
    this.dialog = { ...this.dialog, confirmDestroy };
  }

  reset(): void {
    this.dialog = null;
  }

  buildRenderKey(input: {
    itemKey: string;
    itemCount: number;
    playerContextRevision: number;
    contextDependent: boolean;
  }): string | null {
    if (!this.dialog) {
      return null;
    }
    return [
      'action',
      input.itemKey,
      String(input.itemCount),
      this.dialog.kind,
      this.dialog.confirmDestroy ? '1' : '0',
      this.dialog.countDraft,
      input.contextDependent ? `context:${input.playerContextRevision}` : 'context:stable',
    ].join('|');
  }
}
