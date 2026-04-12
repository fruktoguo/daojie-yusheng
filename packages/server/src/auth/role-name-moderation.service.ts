import { Injectable } from '@nestjs/common';
import { ROLE_NAME_SENSITIVE_WORDS } from '../constants/auth/role-name-sensitive-words';

/** ROLE_NAME_SENSITIVE_MESSAGE：定义该变量以承载业务值。 */
const ROLE_NAME_SENSITIVE_MESSAGE = '角色名称包含敏感词，请重新输入';

/** RoleNameMatcher：定义该类型的结构与数据语义。 */
type RoleNameMatcher = {
/** normalized：定义该变量以承载业务值。 */
  normalized: string;
/** compacted：定义该变量以承载业务值。 */
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
/** matchers：定义该变量以承载业务值。 */
  private readonly matchers: readonly RoleNameMatcher[] = ROLE_NAME_SENSITIVE_WORDS.reduce<RoleNameMatcher[]>(
    (result, word) => {
/** normalized：定义该变量以承载业务值。 */
      const normalized = normalizeForSensitiveCheck(word);
/** compacted：定义该变量以承载业务值。 */
      const compacted = compactForSensitiveCheck(word);
      if (!normalized || !compacted) {
        return result;
      }
      result.push({ normalized, compacted });
      return result;
    },
    [],
  );

/** validateRoleName：执行对应的业务逻辑。 */
  validateRoleName(roleName: string): string | null {
/** normalized：定义该变量以承载业务值。 */
    const normalized = normalizeForSensitiveCheck(roleName);
/** compacted：定义该变量以承载业务值。 */
    const compacted = compactForSensitiveCheck(roleName);
    if (!normalized || !compacted) {
      return null;
    }

/** hit：定义该变量以承载业务值。 */
    const hit = this.matchers.some((matcher) => (
      normalized.includes(matcher.normalized) || compacted.includes(matcher.compacted)
    ));
    return hit ? ROLE_NAME_SENSITIVE_MESSAGE : null;
  }
}

