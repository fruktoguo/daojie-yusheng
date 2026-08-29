/** 战斗记录跨图连续、100 条有界窗口与刷新恢复的证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const typescriptModuleCache = new Map();

function loadTypescriptModule(relativePath) {
  const sourcePath = path.join(clientRoot, relativePath);
  const cached = typescriptModuleCache.get(sourcePath);
  if (cached) {
    return cached.exports;
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  typescriptModuleCache.set(sourcePath, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) {
      return require(specifier);
    }
    const resolvedBase = path.resolve(path.dirname(sourcePath), specifier);
    const sourceCandidate = fs.existsSync(`${resolvedBase}.ts`)
      ? `${resolvedBase}.ts`
      : path.join(resolvedBase, 'index.ts');
    if (!fs.existsSync(sourceCandidate)) {
      return require(specifier);
    }
    return loadTypescriptModule(path.relative(clientRoot, sourceCandidate));
  };
  const execute = new Function('exports', 'module', 'require', output);
  execute(module.exports, module, localRequire);
  return module.exports;
}

const {
  resolveChatScopePlayerId,
  shouldPreserveCombatLogSession,
} = loadTypescriptModule('src/ui/chat-scope-continuity.ts');
const {
  loadCombatLogMessages,
  normalizeCombatLogMessages,
  saveCombatLogMessages,
} = loadTypescriptModule('src/ui/combat-log-storage.ts');

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key) {
    return this.data.get(key) ?? null;
  }

  key(index) {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key) {
    this.data.delete(key);
  }

  setItem(key, value) {
    this.data.set(key, String(value));
  }
}

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

const combatMessages = Array.from({ length: 150 }, (_, index) => ({
  id: `combat:${String(index).padStart(3, '0')}`,
  at: index,
  text: `第 ${index} 条战斗记录`,
  kind: 'combat',
  combat: { damage: index },
}));
const normalizedCombatMessages = normalizeCombatLogMessages([
  { id: 'invalid', at: 999, text: '非战斗消息', kind: 'system' },
  ...combatMessages,
]);
assert.equal(normalizedCombatMessages.length, 100, '战斗日志内存与本地快照必须只保留最近 100 条');
assert.equal(normalizedCombatMessages[0]?.id, 'combat:050');
assert.equal(normalizedCombatMessages.at(-1)?.id, 'combat:149');

const storage = new MemoryStorage();
assert.equal(saveCombatLogMessages('player:one', combatMessages, storage), true, '有界战斗快照必须可写入 localStorage');
assert.deepEqual(
  loadCombatLogMessages('player:one', storage).map((entry) => entry.id),
  normalizedCombatMessages.map((entry) => entry.id),
  '刷新后必须按角色恢复最近 100 条战斗记录',
);
assert.equal(saveCombatLogMessages('player:one', combatMessages.slice(0, 80), storage), true);
assert.equal(
  loadCombatLogMessages('player:one', storage).at(-1)?.id,
  'combat:149',
  '旧页面的晚到刷盘不得覆盖同一角色已经保存的更新记录',
);
assert.deepEqual(loadCombatLogMessages('player:two', storage), [], '不同角色的战斗快照不得串读');
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
  /const preservesPlayerSession = shouldPreserveCombatLogSession\(this\.currentScopeId, normalizedScope\);/,
  '切换空间作用域前必须按角色身份判断会话日志连续性',
);
assert.match(
  methodSource,
  /const preservedCombatState = preservesPlayerSession\s*\? this\.channelStates\.get\('combat'\)/,
  '同一角色跨图时必须保留战斗记录',
);
assert.match(
  methodSource,
  /const preservedPartyState = preservesPlayerSession && normalizedScope && this\.partyId\s*\? this\.channelStates\.get\('party'\)/,
  '只有同一角色且仍有当前队伍时才允许跨图保留队伍消息',
);
assert.match(
  methodSource,
  /if \(hadPreviousScope && !preservesPlayerSession\) this\.partyId = null;/,
  '切换角色或退出世界时必须立即清除旧队伍发送上下文',
);
assert.match(
  methodSource,
  /channel === 'combat' && preservedCombatState[\s\S]*channel === 'party' && preservedPartyState/,
  '战斗与当前队伍频道允许同角色跨图保留，其他实例频道必须重新初始化',
);
assert.match(
  chatSource,
  /function shouldPersistChatEntry\(entry: ChatStoredMessage\): boolean \{\s*return entry\.kind !== 'combat';\s*\}/,
  '高频战斗记录仍不得进入 IndexedDB 写入热路径',
);
assert.match(
  chatSource,
  /appendRealtimeMessage\(state, entry, resolveChannelMemoryLimit\(channel\)\)/,
  '实时追加必须按战斗频道专属容量裁切内存窗口',
);
assert.match(
  chatSource,
  /state\.loadedCount = Math\.min\(\s*entries\.length,\s*resolveChannelMemoryLimit\(channel\),/,
  '战斗频道 DOM 可见计数必须受 100 条硬上限约束',
);
assert.match(
  chatSource,
  /window\.setTimeout\([\s\S]*CHAT_COMBAT_LOG_PERSIST_DELAY_MS/,
  '战斗日志必须通过低频定时器合并写入 localStorage',
);
assert.match(
  chatSource,
  /window\.addEventListener\('pagehide'[\s\S]*flushCombatLogPersistence/,
  '刷新或离开页面前必须刷盘最新战斗日志快照',
);

console.log('PROOF:COMBAT_LOG_CROSS_MAP_CONTINUITY:PASS');
