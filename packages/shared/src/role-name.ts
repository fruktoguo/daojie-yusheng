/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import { ROLE_NAME_MAX_ASCII_LENGTH, ROLE_NAME_MAX_LENGTH } from './constants/network/account';
import { splitGraphemes } from './grapheme';

/** isHalfWidthRoleNameChar：判断是否Half Width角色名称Char。 */
export function isHalfWidthRoleNameChar(char: string): boolean {
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0x7f;
}

/** getRoleNameLengthUnits：读取角色名称Length Units。 */
export function getRoleNameLengthUnits(roleName: string): number {
  let units = 0;
  for (const grapheme of splitGraphemes(roleName)) {
    units += isHalfWidthRoleNameGrapheme(grapheme) ? 1 : 2;
  }
  return units;
}

/** isRoleNameWithinLimit：判断是否角色名称Within Limit。 */
export function isRoleNameWithinLimit(roleName: string): boolean {
  return getRoleNameLengthUnits(roleName) <= ROLE_NAME_MAX_ASCII_LENGTH;
}

/** truncateRoleName：处理truncate角色名称。 */
export function truncateRoleName(roleName: string): string {
  let units = 0;
  let result = '';

  for (const grapheme of splitGraphemes(roleName)) {
    const nextUnits = units + (isHalfWidthRoleNameGrapheme(grapheme) ? 1 : 2);
    if (nextUnits > ROLE_NAME_MAX_ASCII_LENGTH) {
      break;
    }
    result += grapheme;
    /** units：units。 */
    units = nextUnits;
  }

  return result;
}

function isHalfWidthRoleNameGrapheme(grapheme: string): boolean {
  return Array.from(grapheme).every(isHalfWidthRoleNameChar);
}

/** getRoleNameLimitText：读取角色名称Limit文本。 */
export function getRoleNameLimitText(): string {
  return `最多 ${ROLE_NAME_MAX_LENGTH} 个字，纯英文最多 ${ROLE_NAME_MAX_ASCII_LENGTH} 个字符`;
}






