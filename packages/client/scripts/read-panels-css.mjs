/**
 * 读取原 panels.css 拆分后的全部面板样式，按 main.ts 中的 import 顺序拼接。
 * 供各静态校验脚本对整体面板样式做内容断言时使用。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 与 packages/client/src/main.ts 中 styles/panels/* 的 import 顺序保持一致。 */
export const PANELS_CSS_ORDER = [
  'panel-common.css',
  'chat.css',
  'mobile-shell.css',
  'action-panel.css',
  'attributes.css',
  'inventory.css',
  'equipment.css',
  'technique.css',
  'loot.css',
  'heaven-gate.css',
  'market.css',
  'auction.css',
  'skill.css',
  'sect.css',
  'social.css',
  'party.css',
  'world.css',
  'tutorial.css',
  'activity.css',
  'settings.css',
  'quest.css',
  'craft.css',
  'gm.css',
  'alchemy.css',
  'enhancement.css',
];

export function readPanelsCss(clientRoot) {
  const dir = path.join(clientRoot, 'src/styles/panels');
  const onDisk = fs.readdirSync(dir).filter((name) => name.endsWith('.css')).sort();
  const expected = [...PANELS_CSS_ORDER].sort();
  if (onDisk.join('\n') !== expected.join('\n')) {
    throw new Error(`styles/panels 目录与 PANELS_CSS_ORDER 不一致：磁盘=${onDisk.join(',')} 期望=${expected.join(',')}`);
  }
  return PANELS_CSS_ORDER.map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
}
