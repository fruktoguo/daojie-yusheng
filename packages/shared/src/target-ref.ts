/**
 * 目标引用编解码：将格子坐标编码为 "tile:x:y" 字符串，或从中解析回坐标。
 */
import type { GridPoint } from './targeting';

/** 将格子坐标编码为目标引用字符串 */
export function encodeTileTargetRef(point: GridPoint): string {
  return `tile:${point.x}:${point.y}`;
}

/** 判断目标引用是否为格子类型 */
export function isTileTargetRef(targetRef: string): boolean {
  return targetRef.startsWith('tile:');
}

/** 从目标引用字符串解析出格子坐标，格式不合法返回 null */
export function parseTileTargetRef(targetRef: string): GridPoint | null {
  if (!isTileTargetRef(targetRef)) {
    return null;
  }
  const [, sx, sy] = targetRef.split(':');
/** x：定义该变量以承载业务值。 */
  const x = Number(sx);
/** y：定义该变量以承载业务值。 */
  const y = Number(sy);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}
