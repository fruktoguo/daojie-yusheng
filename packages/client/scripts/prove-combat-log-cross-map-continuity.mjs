/** 战斗记录在同角色跨图时保留、切换角色时清空的证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadScopeContinuityModule() {
  const sourcePath = path.join(clientRoot, 'src/ui/chat-scope-continuity.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('exports', 'module', 'require', output);
  execute(module.exports, module, require);
  return module.exports;
}

const {
  resolveChatScopePlayerId,
  shouldPreserveCombatLogSession,
} = loadScopeContinuityModule();

assert.equal(resolveChatScopePlayerId('player:one|map:a|instance:a'), 'player:one');
assert.equal(resolveChatScopePlayerId(null), null);
assert.equal(
  shouldPreserveCombatLogSession(
    'player:one|map:a|instance:a',
    'player:one|map:b|instance:b',
  ),
  true,
  '同一角色跨地图和实例必须保留会话内战斗记录',
);
assert.equal(
  shouldPreserveCombatLogSession(
    'player:one|map:a|instance:a',
    'player:two|map:a|instance:a',
  ),
  false,
  '切换角色必须清空上一角色战斗记录',
);
assert.equal(
  shouldPreserveCombatLogSession('player:one|map:a|instance:a', null),
  false,
  '退出世界必须清空战斗记录',
);

const chatSource = fs.readFileSync(path.join(clientRoot, 'src/ui/chat.ts'), 'utf8');
const methodStart = chatSource.indexOf('setPersistenceScope(scopeId: string | null): void {');
const methodEnd = chatSource.indexOf('/** 显示聊天面板。 */', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, '必须保留聊天作用域切换入口');
const methodSource = chatSource.slice(methodStart, methodEnd);
assert.match(
  methodSource,
  /shouldPreserveCombatLogSession\(this\.currentScopeId, normalizedScope\)/,
  '切换空间作用域前必须按角色身份判断战斗记录连续性',
);
assert.match(
  methodSource,
  /channel === 'combat' && preservedCombatState \? preservedCombatState : createChannelState\(\)/,
  '只有战斗频道允许跨图保留，其他实例频道必须重新初始化',
);
assert.match(
  chatSource,
  /function shouldPersistChatEntry\(entry: ChatStoredMessage\): boolean \{\s*return entry\.kind !== 'combat';\s*\}/,
  '高频战斗记录仍不得进入 IndexedDB 写入热路径',
);
assert.match(
  chatSource,
  /slice\(-CHAT_LOG_MAX_MEMORY_MESSAGES_PER_CHANNEL\)/,
  '会话内战斗记录必须继续受频道容量上限约束',
);

console.log('PROOF:COMBAT_LOG_CROSS_MAP_CONTINUITY:PASS');
