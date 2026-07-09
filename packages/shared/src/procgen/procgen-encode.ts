/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：三层 id 网格 → format:2 字符行。
 *
 * 独立成文件，避免主管线与分区管线之间形成循环 import。
 */
import { requireProcgenTile, type ProcgenTileCatalog } from './procgen-catalog';
import { LAYER_EMPTY_CHAR } from '../constants/gameplay/map-layer-chars';

export function encodeRows(
  width: number,
  height: number,
  ids: readonly (string | null)[],
  layer: 'terrain' | 'surface' | 'structure',
  catalog: ProcgenTileCatalog,
): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      const id = ids[y * width + x];
      row += id === null ? LAYER_EMPTY_CHAR : requireProcgenTile(catalog, layer, id).char;
    }
    rows.push(row);
  }
  return rows;
}
