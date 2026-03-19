import { Direction } from '@mud/shared';

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: Direction.North,
  ArrowDown: Direction.South,
  ArrowRight: Direction.East,
  ArrowLeft: Direction.West,
};

export class KeyboardInput {
  constructor(private onPath: (dirs: Direction[]) => void) {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  private onKeyDown(e: KeyboardEvent) {
    // 忽略输入框内的按键
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const dir = KEY_MAP[e.key];
    if (dir === undefined) return;
    this.onPath([dir]);
  }
}
