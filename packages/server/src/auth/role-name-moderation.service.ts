import { Injectable } from '@nestjs/common';
import { ROLE_NAME_SENSITIVE_WORDS } from '../constants/auth/role-name-sensitive-words';

const ROLE_NAME_SENSITIVE_MESSAGE = '角色名称包含敏感词，请重新输入';

/** RoleNameMatcher：定义该类型的结构与数据语义。 */
type RoleNameMatcher = {
  normalized: string;
  compacted: string;
};

/** normalizeForSensitiveCheck：执行对应的业务逻辑。 */
function normalizeForSensitiveCheck(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}

/** compactForSensitiveCheck：执行对应的业务逻辑。 */
function compactForSensitiveCheck(value: string): string {
  return normalizeForSensitiveCheck(value).replace(/[\s\p{P}\p{S}_]+/gu, '');
}

@Injectable()
/** RoleNameModerationService：封装相关状态与行为。 */
export class RoleNameModerationService {
  private readonly matchers: readonly RoleNameMatcher[] = ROLE_NAME_SENSITIVE_WORDS.reduce<RoleNameMatcher[]>(
    (result, word) => {
      const normalized = normalizeForSensitiveCheck(word);
      const compacted = compactForSensitiveCheck(word);
      if (!normalized || !compacted) {
        return result;
      }
      result.push({ normalized, compacted });
      return result;
    },
    [],
  );

  validateRoleName(roleName: string): string | null {
    const normalized = normalizeForSensitiveCheck(roleName);
    const compacted = compactForSensitiveCheck(roleName);
    if (!normalized || !compacted) {
      return null;
    }

    const hit = this.matchers.some((matcher) => (
      normalized.includes(matcher.normalized) || compacted.includes(matcher.compacted)
    ));
    return hit ? ROLE_NAME_SENSITIVE_MESSAGE : null;
  }
}

