import { splitGraphemes } from './grapheme';

export const DEFAULT_VISIBLE_DISPLAY_NAME = '人';
export const DEFAULT_INVISIBLE_ROLE_NAME_BASE = '隐身';

const INVISIBLE_NAME_GRAPHEME_PATTERN = /^(?:[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]|\uD804[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDD00-\uDDEF])+$/u;

/** trimNameGrapheme：执行对应的业务逻辑。 */
function trimNameGrapheme(grapheme: string): string {
  return typeof grapheme === 'string' ? grapheme.trim() : '';
}

/** isInvisibleOnlyNameGrapheme：执行对应的业务逻辑。 */
export function isInvisibleOnlyNameGrapheme(grapheme: string): boolean {
  const trimmed = trimNameGrapheme(grapheme);
  return trimmed.length > 0 && INVISIBLE_NAME_GRAPHEME_PATTERN.test(trimmed);
}

/** hasVisibleNameGrapheme：执行对应的业务逻辑。 */
export function hasVisibleNameGrapheme(value: string): boolean {
  return splitGraphemes(value).some((grapheme) => {
    const trimmed = trimNameGrapheme(grapheme);
    return trimmed.length > 0 && !isInvisibleOnlyNameGrapheme(trimmed);
  });
}

/** containsInvisibleOnlyNameGrapheme：执行对应的业务逻辑。 */
export function containsInvisibleOnlyNameGrapheme(value: string): boolean {
  return splitGraphemes(value).some((grapheme) => isInvisibleOnlyNameGrapheme(grapheme));
}

/** resolveDefaultVisibleDisplayName：执行对应的业务逻辑。 */
export function resolveDefaultVisibleDisplayName(username: string): string {
  for (const grapheme of splitGraphemes(username)) {
    const trimmed = trimNameGrapheme(grapheme);
    if (trimmed.length === 0 || isInvisibleOnlyNameGrapheme(trimmed)) {
      continue;
    }
    return grapheme;
  }
  return DEFAULT_VISIBLE_DISPLAY_NAME;
}

/** isDuplicateFriendlyDisplayName：执行对应的业务逻辑。 */
export function isDuplicateFriendlyDisplayName(displayName: string): boolean {
  return displayName.normalize('NFC') === DEFAULT_VISIBLE_DISPLAY_NAME;
}

