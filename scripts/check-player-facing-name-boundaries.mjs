#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const requiredPatterns = [
  ['packages/shared/src/content-display-name.ts', /export function resolvePlayerFacingContentName\(/, '共享层必须提供统一名称兜底'],
  ['packages/shared/src/item-stack.ts', /resolvePlayerFacingContentName\(itemId,\s*ITEM_DISPLAY_UNKNOWN_NAME,\s*name\)/, '共享物品名称必须经过统一解析'],
  ['packages/shared/src/social-types.ts', /instanceName\?: string/, '道友关系协议必须携带地域名称'],
  ['packages/server/src/runtime/social/social-runtime.service.ts', /instanceName: resolveRuntimeInstanceName\(runtime, instanceId\)/, '服务端必须水合道友所在地域名称'],
  ['packages/client/src/ui/panels/social-panel.ts', /resolveSocialInstanceName\(entry\.instanceId, entry\.instanceName\)/, '道友面板必须过滤地域实例 ID'],
  ['packages/client/src/main-building-fengshui-state-source.ts', /resolveClientItemBaseName\(itemId, item\?\.name, template\?\.name\)/, '建造材料选择必须解析物品名称'],
  ['packages/server/src/network/world-sync-player-state.service.ts', /resolvePlayerRoleName\(player,/, '玩家自身同步的角色名必须过滤机器 ID 与自定义头像串'],
  ['packages/server/src/network/world-sync-player-state.service.ts', /resolvePlayerAvatarDisplayName\(player,/, '玩家自身同步必须独立保留自定义头像显示串'],
  ['packages/server/src/network/world-gateway-technique.helper.ts', /resolvePlayerFacingContentName\(entry\?\.techId, '未知功法'/, '功法分页必须过滤功法 ID 名称'],
  ['packages/server/src/runtime/world/world-runtime.normalization.helpers.ts', /resolvePlayerFacingContentName\(quest\.targetMonsterId, '未知妖兽'/, '任务目标必须使用名称兜底'],
  ['packages/server/src/runtime/craft/technique-activity-task-view.helpers.ts', /resolvePlayerFacingContentName\(job\.outputItemId, '未知物品', resolveItemName\?\.\(job\.outputItemId\)\)/, '技艺任务目标必须通过内容名称解析器过滤物品 ID'],
  ['packages/server/src/runtime/craft/craft-panel-runtime.service.ts', /\(itemId\) => this\.contentTemplateRepository\.getItemName\(itemId\)/, '技艺任务投影必须接入权威物品名称目录'],
  ['packages/server/src/runtime/world/world-runtime-sect.service.ts', /const sectName = resolvePlayerFacingContentName\(sect\?\.sectId, '未知宗门', sect\?\.name\)/, '宗门管理描述必须实时解析宗门名称'],
  ['packages/server/src/persistence/player-domain-persistence.service.ts', /name: resolvePlayerFacingContentName\(techId, '未知功法', name\)/, '待参悟功法恢复不得写入功法 ID 名称'],
];

const forbiddenPatterns = [
  ['packages/shared/src/mail.ts', /arg\.label\?\.trim\(\) \|\| arg\.itemId/, '邮件物品参数不得回退 itemId'],
  ['packages/shared/src/item-stack.ts', /return\s+(?:name\s*\|\|\s*)?itemId\b/, '共享物品名称不得回退 itemId'],
  ['packages/client/src/content/item-display-name.ts', /return normalizedItemId/, '客户端物品名称不得回退 itemId'],
  ['packages/client/src/ui/panels/social-panel.ts', /escapeHtml\(entry\.instanceId\)/, '道友面板不得显示实例 ID'],
  ['packages/server/src/network/world-sync-player-state.service.ts', /name:\s*player\.name/, '玩家自身同步不得直发运行时 ID 名称'],
  ['packages/server/src/network/world-gateway-technique.helper.ts', /name:\s*typeof entry\?\.name[^\n]*entry\?\.techId/, '功法分页不得回退 techId'],
  ['packages/server/src/runtime/player/leaderboard-runtime.service.ts', /summary\?\.name \?\? normalizedMapId/, '排行榜地图名称不得回退 mapId'],
  ['packages/server/src/runtime/world/world-runtime.normalization.helpers.ts', /return quest\.targetMonsterId/, '任务目标不得回退 monsterId'],
  ['packages/server/src/runtime/craft/technique-activity-task-view.helpers.ts', /normalizeText\(job\.outputItemId\)/, '技艺任务名称不得直接使用 outputItemId'],
  ['packages/server/src/persistence/player-domain-persistence.service.ts', /name:\s*name \?\? techId/, '待参悟功法恢复不得回退 techId'],
];

for (const [relativePath, pattern, message] of requiredPatterns) {
  assert.match(read(relativePath), pattern, message);
}

for (const [relativePath, pattern, message] of forbiddenPatterns) {
  assert.doesNotMatch(read(relativePath), pattern, message);
}

console.log(JSON.stringify({ ok: true, case: 'player-facing-name-boundaries' }, null, 2));
