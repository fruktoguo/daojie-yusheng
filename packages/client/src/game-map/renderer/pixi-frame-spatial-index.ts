/** Pixi 每帧复用的二维格点集合，避免为坐标键持续创建字符串和临时 Set。 */
export class PixiFrameGridPointSet {
  private readonly rows = new Map<number, Set<number>>();
  private readonly rowPool: Array<Set<number>> = [];

  reset(): void {
    for (const row of this.rows.values()) {
      row.clear();
      this.rowPool.push(row);
    }
    this.rows.clear();
  }

  add(x: number, y: number): void {
    let row = this.rows.get(x);
    if (!row) {
      row = this.rowPool.pop() ?? new Set<number>();
      this.rows.set(x, row);
    }
    row.add(y);
  }

  has(x: number, y: number): boolean {
    return this.rows.get(x)?.has(y) === true;
  }
}

/** 判断实体当前插值后的世界矩形是否进入扩展视口。 */
export function isPixiEntityInViewport(
  worldX: number,
  worldY: number,
  cellSize: number,
  viewportLeft: number,
  viewportTop: number,
  viewportRight: number,
  viewportBottom: number,
): boolean {
  return worldX + cellSize >= viewportLeft
    && worldX <= viewportRight
    && worldY + cellSize >= viewportTop
    && worldY <= viewportBottom;
}
