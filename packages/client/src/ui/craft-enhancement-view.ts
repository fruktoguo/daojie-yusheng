import type { CraftWorkbenchModal } from './craft-workbench-modal';

export class CraftEnhancementView {
  constructor(private readonly parent: CraftWorkbenchModal) {}

  render(): string {
    // TODO: migrate from craft-workbench-modal.ts
    return '';
  }

  tryPatch(container: HTMLElement): boolean {
    // TODO: migrate from craft-workbench-modal.ts
    return false;
  }

  bindEvents(container: HTMLElement): void {
    // TODO: migrate from craft-workbench-modal.ts
  }

  update(): void {
    // TODO: migrate from craft-workbench-modal.ts
  }

  renderEnhancementBody(): string {
    // TODO: migrate from craft-workbench-modal.ts
    return '';
  }

  renderEnhancementWorkbench(): string {
    // TODO: migrate from craft-workbench-modal.ts
    return '';
  }

  renderEnhancementTargetSlot(): string {
    // TODO: migrate from craft-workbench-modal.ts
    return '';
  }
}
