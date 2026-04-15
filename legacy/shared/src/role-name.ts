import { ROLE_NAME_MAX_ASCII_LENGTH, ROLE_NAME_MAX_LENGTH } from './constants/network/account';
import { splitGraphemes } from './grapheme';

export function isHalfWidthRoleNameChar(char: string): boolean {
  if (!char) {
    return false;
  }
  for (const unit of Array.from(char)) {
    const codePoint = unit.codePointAt(0);
    if (codePoint === undefined || codePoint > 0x7f) {
      return false;
    }
  }
  return true;
}

export function getRoleNameLengthUnits(roleName: string): number {
  let units = 0;
  for (const char of splitGraphemes(roleName)) {
    units += isHalfWidthRoleNameChar(char) ? 1 : 2;
  }
  return units;
}

export function isRoleNameWithinLimit(roleName: string): boolean {
  return getRoleNameLengthUnits(roleName) <= ROLE_NAME_MAX_ASCII_LENGTH;
}

export function truncateRoleName(roleName: string): string {
  let units = 0;
  let result = '';

  for (const char of splitGraphemes(roleName)) {
    const nextUnits = units + (isHalfWidthRoleNameChar(char) ? 1 : 2);
    if (nextUnits > ROLE_NAME_MAX_ASCII_LENGTH) {
      break;
    }
    result += char;
    units = nextUnits;
  }

  return result;
}

export function getRoleNameLimitText(): string {
  return `最多 ${ROLE_NAME_MAX_LENGTH} 个字，纯英文最多 ${ROLE_NAME_MAX_ASCII_LENGTH} 个字符`;
}

