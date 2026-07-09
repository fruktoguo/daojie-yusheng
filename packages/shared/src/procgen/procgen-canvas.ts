/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：区域画布。
 *
 * 每个 BSP 叶在自己的 w×h 小数组上生成，再整体 blit 到全局三层数组。三重收益：
 * 1. smoothTerrain 的 3×3 邻域天然 clamp 到小数组边界 = 区边界，函数体一行不改；
 * 2. 每区种子独立、与兄弟区生成顺序解耦，可并行、可单区重算；
 * 3. 各生成器只用区内局部坐标，不必到处穿 offset。
 */
import type { ProcgenRect } from './procgen-types';

export class RegionCanvas {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly terrainIds: string[];
  readonly surfaceIds: (string | null)[];
  readonly structureIds: (string | null)[];

  constructor(rect: ProcgenRect, baseTerrain: string) {
    this.width = rect.w;
    this.height = rect.h;
    this.offsetX = rect.x;
    this.offsetY = rect.y;
    const size = rect.w * rect.h;
    this.terrainIds = new Array<string>(size).fill(baseTerrain);
    this.surfaceIds = new Array<string | null>(size).fill(null);
    this.structureIds = new Array<string | null>(size).fill(null);
  }

  /** 区内局部坐标 → 局部下标。调用方需先自行 inBounds。 */
  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** 局部 → 全局坐标。 */
  toGlobalX(x: number): number {
    return x + this.offsetX;
  }

  toGlobalY(y: number): number {
    return y + this.offsetY;
  }

  /** 全局 → 局部坐标（可能越界，调用方需 inBounds）。 */
  toLocalX(globalX: number): number {
    return globalX - this.offsetX;
  }

  toLocalY(globalY: number): number {
    return globalY - this.offsetY;
  }

  setTerrain(x: number, y: number, tile: string): void {
    if (this.inBounds(x, y)) this.terrainIds[this.index(x, y)] = tile;
  }

  setSurface(x: number, y: number, tile: string | null): void {
    if (this.inBounds(x, y)) this.surfaceIds[this.index(x, y)] = tile;
  }

  setStructure(x: number, y: number, tile: string | null): void {
    if (this.inBounds(x, y)) this.structureIds[this.index(x, y)] = tile;
  }

  getStructure(x: number, y: number): string | null {
    return this.inBounds(x, y) ? this.structureIds[this.index(x, y)] : null;
  }

  /** 把本区三层整体写入全局数组。区矩形由分区保证落在全局范围内。 */
  blitTo(
    globalTerrain: string[],
    globalSurface: (string | null)[],
    globalStructure: (string | null)[],
    globalWidth: number,
  ): void {
    for (let y = 0; y < this.height; y += 1) {
      const globalRow = (y + this.offsetY) * globalWidth + this.offsetX;
      const localRow = y * this.width;
      for (let x = 0; x < this.width; x += 1) {
        globalTerrain[globalRow + x] = this.terrainIds[localRow + x];
        globalSurface[globalRow + x] = this.surfaceIds[localRow + x];
        globalStructure[globalRow + x] = this.structureIds[localRow + x];
      }
    }
  }
}
