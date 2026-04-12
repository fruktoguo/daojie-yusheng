import { ROLE_NAME_MAX_ASCII_LENGTH, ROLE_NAME_MAX_LENGTH } from './constants/network/account';

/** isHalfWidthRoleNameChar：执行对应的业务逻辑。 */
export function isHalfWidthRoleNameChar(char: string): boolean {
/** codePoint：定义该变量以承载业务值。 */
  const codePoint = char.codePointAt(0);
  return codePoint !== undefined && codePoint <= 0x7f;
}

/** getRoleNameLengthUnits：执行对应的业务逻辑。 */
export function getRoleNameLengthUnits(roleName: string): number {
/** units：定义该变量以承载业务值。 */
  let units = 0;
  for (const char of roleName) {
    units += isHalfWidthRoleNameChar(char) ? 1 : 2;
  }
  return units;
}

/** isRoleNameWithinLimit：执行对应的业务逻辑。 */
export function isRoleNameWithinLimit(roleName: string): boolean {
  return getRoleNameLengthUnits(roleName) <= ROLE_NAME_MAX_ASCII_LENGTH;
}

/** truncateRoleName：执行对应的业务逻辑。 */
export function truncateRoleName(roleName: string): string {
/** units：定义该变量以承载业务值。 */
  let units = 0;
/** result：定义该变量以承载业务值。 */
  let result = '';

  for (const char of roleName) {
    const nextUnits = units + (isHalfWidthRoleNameChar(char) ? 1 : 2);
    if (nextUnits > ROLE_NAME_MAX_ASCII_LENGTH) {
      break;
    }
    result += char;
    units = nextUnits;
  }

  return result;
}

/** getRoleNameLimitText：执行对应的业务逻辑。 */
export function getRoleNameLimitText(): string {
  return `最多 ${ROLE_NAME_MAX_LENGTH} 个字，纯英文最多 ${ROLE_NAME_MAX_ASCII_LENGTH} 个字符`;
}

