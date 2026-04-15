import { ROLE_NAME_MAX_ASCII_LENGTH, ROLE_NAME_MAX_LENGTH } from './constants/network/account';

/** isHalfWidthRoleNameChar：判断是否Half Width角色名称Char。 */
export function isHalfWidthRoleNameChar(char: string): boolean {
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0x7f;
}

/** getRoleNameLengthUnits：读取角色名称Length Units。 */
export function getRoleNameLengthUnits(roleName: string): number {
  let units = 0;
  for (const char of roleName) {
    units += isHalfWidthRoleNameChar(char) ? 1 : 2;
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

  for (const char of roleName) {
    const nextUnits = units + (isHalfWidthRoleNameChar(char) ? 1 : 2);
    if (nextUnits > ROLE_NAME_MAX_ASCII_LENGTH) {
      break;
    }
    result += char;
    /** units：units。 */
    units = nextUnits;
  }

  return result;
}

/** getRoleNameLimitText：读取角色名称Limit文本。 */
export function getRoleNameLimitText(): string {
  return `最多 ${ROLE_NAME_MAX_LENGTH} 个字，纯英文最多 ${ROLE_NAME_MAX_ASCII_LENGTH} 个字符`;
}







