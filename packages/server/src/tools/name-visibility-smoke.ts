import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  containsInvisibleOnlyNameGrapheme,
  DISPLAY_NAME_MAX_CODE_POINTS,
  getGraphemeCount,
  hasVisibleNameGrapheme,
} from '@mud/shared';
import { validateDisplayName } from '../auth/account-validation';

function testFallbackWithoutIntlSegmenter(): void {
  const script = `
Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
const shared = await import('@mud/shared');
const values = [
  '😀',
  '❤️',
  '👨‍👩‍👧',
  '👍🏽',
  '🇨🇳',
  '\\u{1F3F4}\\u{E0067}\\u{E0062}\\u{E0065}\\u{E006E}\\u{E0067}\\u{E007F}',
];
for (const value of values) {
  if (shared.getGraphemeCount(value) !== 1) {
    throw new Error(JSON.stringify({ value, segments: shared.splitGraphemes(value) }));
  }
  if (!shared.hasVisibleNameGrapheme(value) || shared.containsInvisibleOnlyNameGrapheme(value)) {
    throw new Error(JSON.stringify({ value, visibility: 'invalid' }));
  }
}
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: resolve(__dirname, '../..'),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || 'fallback 子进程执行失败');
}

function main(): void {
  const englandFlag = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
  const emojiNames = ['😀', '❤️', '👨‍👩‍👧', '👍🏽', '🇨🇳', englandFlag];
  for (const displayName of emojiNames) {
    assert.equal(getGraphemeCount(displayName), 1, `${displayName} 应按单个显示字符计数`);
    assert.equal(hasVisibleNameGrapheme(displayName), true, `${displayName} 应被视为可见显示名`);
    assert.equal(containsInvisibleOnlyNameGrapheme(displayName), false, `${displayName} 不应因组合符被判为空名`);
    assert.equal(validateDisplayName(displayName), null, `${displayName} 应通过服务端显示名校验`);
  }
  assert.equal(getGraphemeCount('🇨🇳🇺🇸'), 2, '连续区域旗帜应按两组 grapheme 计数');
  const overlongSingleGrapheme = `a${'\u0300'.repeat(DISPLAY_NAME_MAX_CODE_POINTS + 1)}`;
  assert.equal(getGraphemeCount(overlongSingleGrapheme), 1, '超长组合序列仍应是单个 grapheme');
  assert.equal(
    validateDisplayName(overlongSingleGrapheme),
    '显示名称组合序列不能超过 32 个 Unicode 码点',
  );
  assert.equal(validateDisplayName('\uFE0F'), '显示名称必须为可见字符');
  testFallbackWithoutIntlSegmenter();
  console.log(JSON.stringify({
    ok: true,
    answers: 'emoji 显示名按 grapheme 计数；无 Intl.Segmenter 时区域旗帜与 tag flag 仍保持完整；超过 varchar(32) 边界的单 grapheme 会在写库前被拒绝。',
  }, null, 2));
}

main();
