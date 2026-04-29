/**
 * 客户端/服务端共用的四方向路径压缩编码。
 *
 * 规则：
 * - 每步方向占 2 bit
 * - 每 3 步打包为 1 个 6 bit 字符
 * - 步数单独传输，末尾不足 3 步时补 0
 */
import { Direction } from './world-core-types';

/** PATH_PACK_ALPHABET：路径PACK ALPHABET。 */
const PATH_PACK_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PATH_PACK_DECODE = new Map(PATH_PACK_ALPHABET.split('').map((char, index) => [char, index] as const));

/** directionToCode：处理方向To兑换码。 */
function directionToCode(direction: Direction): number {
  switch (direction) {
    case Direction.North:
      return 0;
    case Direction.South:
      return 1;
    case Direction.East:
      return 2;
    case Direction.West:
      return 3;
    default:
      return 0;
  }
}

/** codeToDirection：处理兑换码To方向。 */
function codeToDirection(code: number): Direction | null {
  switch (code) {
    case 0:
      return Direction.North;
    case 1:
      return Direction.South;
    case 2:
      return Direction.East;
    case 3:
      return Direction.West;
    default:
      return null;
  }
}

/** packDirections：处理pack方向。 */
export function packDirections(directions: Direction[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (directions.length === 0) {
    return '';
  }

  let packed = '';
  for (let index = 0; index < directions.length; index += 3) {
    const a = directionToCode(directions[index] ?? Direction.North);
    const b = directionToCode(directions[index + 1] ?? Direction.North);
    const c = directionToCode(directions[index + 2] ?? Direction.North);
    packed += PATH_PACK_ALPHABET[(a << 4) | (b << 2) | c] ?? '';
  }
  return packed;
}

/** unpackDirections：处理unpack方向。 */
export function unpackDirections(packed: string, stepCount: number): Direction[] | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isInteger(stepCount) || stepCount < 0) {
    return null;
  }
  if (stepCount === 0) {
    return packed.length === 0 ? [] : null;
  }

  const expectedLength = Math.ceil(stepCount / 3);
  if (packed.length !== expectedLength) {
    return null;
  }

  const directions: Direction[] = [];
  for (const char of packed) {
    const value = PATH_PACK_DECODE.get(char);
    if (value === undefined) {
      return null;
    }
    const decoded = [
      codeToDirection((value >> 4) & 0b11),
      codeToDirection((value >> 2) & 0b11),
      codeToDirection(value & 0b11),
    ];
    for (const direction of decoded) {
      if (directions.length >= stepCount) {
        break;
      }
      if (direction === null) {
        return null;
      }
      directions.push(direction);
    }
  }

  return directions.length === stepCount ? directions : null;
}






