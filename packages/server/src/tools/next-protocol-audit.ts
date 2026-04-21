// @ts-nocheck

/**
 * 用途：执行 server-next 协议审计。
 */

var fs = require("node:fs");
var path = require("node:path");
var pg = require("pg");
var shared = require("@mud/shared-next");
var envAlias = require("../config/env-alias");
var lib = require("./next-protocol-audit-lib");
/**
 * next 协议上行事件枚举快捷引用。
 */
var NEXT_C2S = shared.NEXT_C2S;
/**
 * next 协议下行事件枚举快捷引用。
 */
var NEXT_S2C = shared.NEXT_S2C;
/**
 * 记录direction。
 */
var Direction = shared.Direction;
/**
 * 用于快速校验事件名是否合法的 next 上行事件集合。
 */
var NEXT_C2S_SET = new Set(Object.values(NEXT_C2S));
/**
 * 用于快速校验事件名是否合法的 next 下行事件集合。
 */
var NEXT_S2C_SET = new Set(Object.values(NEXT_S2C));
/**
 * 用于审计 next 连接是否误混出 legacy 下行事件的黑名单集合。
 */
var LEGACY_S2C_SET = new Set([
  's:init',
  's:tick',
  's:mapStaticSync',
  's:realmUpdate',
  's:pong',
  's:gmState',
  's:enter',
  's:leave',
  's:kick',
  's:error',
  's:dead',
  's:respawn',
  's:attrUpdate',
  's:inventoryUpdate',
  's:equipmentUpdate',
  's:techniqueUpdate',
  's:actionsUpdate',
  's:lootWindowUpdate',
  's:tileRuntimeDetail',
  's:questUpdate',
  's:questNavigateResult',
  's:systemMsg',
  's:mailSummary',
  's:mailPage',
  's:mailDetail',
  's:redeemCodesResult',
  's:mailOpResult',
  's:suggestionUpdate',
  's:marketUpdate',
  's:marketListings',
  's:marketOrders',
  's:marketStorage',
  's:marketItemBook',
  's:marketTradeHistory',
  's:attrDetail',
  's:leaderboard',
  's:npcShop',
]);
/**
 * 协议审计 Markdown 报告的输出路径。
 */
var DOC_OUTPUT = path.resolve(__dirname, "../../../../docs/next-protocol-audit.md");
var SERVER_NEXT_DATABASE_URL = envAlias.resolveServerNextDatabaseUrl();
var HAS_DATABASE = Boolean(SERVER_NEXT_DATABASE_URL);
/**
 * 本次审计预期应该覆盖到的 next 上行事件清单。
 */
var EXPECTED_C2S = [
  NEXT_C2S.Hello,
  NEXT_C2S.Ping,
  NEXT_C2S.Move,
  NEXT_C2S.MoveTo,
  NEXT_C2S.NavigateQuest,
  NEXT_C2S.Heartbeat,
  NEXT_C2S.UseAction,
  NEXT_C2S.RequestDetail,
  NEXT_C2S.RequestTileDetail,
  NEXT_C2S.RequestAttrDetail,
  NEXT_C2S.RequestLeaderboard,
  NEXT_C2S.RequestWorldSummary,
  NEXT_C2S.RequestAlchemyPanel,
  NEXT_C2S.SaveAlchemyPreset,
  NEXT_C2S.DeleteAlchemyPreset,
  NEXT_C2S.StartAlchemy,
  NEXT_C2S.CancelAlchemy,
  NEXT_C2S.RequestEnhancementPanel,
  NEXT_C2S.StartEnhancement,
  NEXT_C2S.CancelEnhancement,
  NEXT_C2S.RequestQuests,
  NEXT_C2S.RequestNpcQuests,
  NEXT_C2S.AcceptNpcQuest,
  NEXT_C2S.SubmitNpcQuest,
  NEXT_C2S.UsePortal,
  NEXT_C2S.UseItem,
  NEXT_C2S.DropItem,
  NEXT_C2S.DestroyItem,
  NEXT_C2S.TakeGround,
  NEXT_C2S.SortInventory,
  NEXT_C2S.Equip,
  NEXT_C2S.Unequip,
  NEXT_C2S.Cultivate,
  NEXT_C2S.CastSkill,
  NEXT_C2S.RequestSuggestions,
  NEXT_C2S.CreateSuggestion,
  NEXT_C2S.VoteSuggestion,
  NEXT_C2S.ReplySuggestion,
  NEXT_C2S.MarkSuggestionRepliesRead,
  NEXT_C2S.RequestMailSummary,
  NEXT_C2S.RequestMailPage,
  NEXT_C2S.RequestMailDetail,
  NEXT_C2S.MarkMailRead,
  NEXT_C2S.ClaimMailAttachments,
  NEXT_C2S.DeleteMail,
  NEXT_C2S.RequestMarket,
  NEXT_C2S.RequestMarketListings,
  NEXT_C2S.RequestMarketItemBook,
  NEXT_C2S.RequestMarketTradeHistory,
  NEXT_C2S.CreateMarketSellOrder,
  NEXT_C2S.CreateMarketBuyOrder,
  NEXT_C2S.BuyMarketItem,
  NEXT_C2S.SellMarketItem,
  NEXT_C2S.CancelMarketOrder,
  NEXT_C2S.ClaimMarketStorage,
  NEXT_C2S.RequestNpcShop,
  NEXT_C2S.BuyNpcShopItem,
  NEXT_C2S.UpdateAutoBattleSkills,
  NEXT_C2S.UpdateAutoUsePills,
  NEXT_C2S.UpdateCombatTargetingRules,
  NEXT_C2S.UpdateAutoBattleTargetingMode,
  NEXT_C2S.UpdateTechniqueSkillAvailability,
  NEXT_C2S.DebugResetSpawn,
  NEXT_C2S.Chat,
  NEXT_C2S.AckSystemMessages,
  NEXT_C2S.HeavenGateAction,
];
/**
 * 本次审计预期应该覆盖到的 next 下行事件清单。
 */
var EXPECTED_S2C = [
  NEXT_S2C.Bootstrap,
  NEXT_S2C.InitSession,
  NEXT_S2C.MapEnter,
  NEXT_S2C.MapStatic,
  NEXT_S2C.Realm,
  NEXT_S2C.WorldDelta,
  NEXT_S2C.SelfDelta,
  NEXT_S2C.PanelDelta,
  NEXT_S2C.LootWindowUpdate,
  NEXT_S2C.QuestNavigateResult,
  NEXT_S2C.Notice,
  NEXT_S2C.AttrDetail,
  NEXT_S2C.Leaderboard,
  NEXT_S2C.WorldSummary,
  NEXT_S2C.AlchemyPanel,
  NEXT_S2C.EnhancementPanel,
  NEXT_S2C.Quests,
  NEXT_S2C.NpcQuests,
  NEXT_S2C.SuggestionUpdate,
  NEXT_S2C.MailSummary,
  NEXT_S2C.MailPage,
  NEXT_S2C.MailDetail,
  NEXT_S2C.MailOpResult,
  NEXT_S2C.MarketUpdate,
  NEXT_S2C.MarketItemBook,
  NEXT_S2C.MarketTradeHistory,
  NEXT_S2C.Detail,
  NEXT_S2C.TileDetail,
  NEXT_S2C.NpcShop,
  NEXT_S2C.Error,
  NEXT_S2C.Kick,
  NEXT_S2C.Pong,
];
if (HAS_DATABASE) {
  EXPECTED_C2S.push(NEXT_C2S.GmGetState);
  EXPECTED_C2S.push(NEXT_C2S.GmSpawnBots);
  EXPECTED_C2S.push(NEXT_C2S.GmRemoveBots);
  EXPECTED_C2S.push(NEXT_C2S.GmUpdatePlayer);
  EXPECTED_C2S.push(NEXT_C2S.GmResetPlayer);
  EXPECTED_C2S.push(NEXT_C2S.GmMarkSuggestionCompleted);
  EXPECTED_C2S.push(NEXT_C2S.GmRemoveSuggestion);
  EXPECTED_C2S.push(NEXT_C2S.RedeemCodes);
  EXPECTED_S2C.push(NEXT_S2C.GmState);
  EXPECTED_S2C.push(NEXT_S2C.RedeemCodesResult);
}
/**
 * 记录需要被协议审计静态钉住的 server next emit 面。
 */
var STATIC_S2C_SURFACE_CHECKS = [
  {
    label: 'world-sync-protocol service emits',
    relativePath: 'packages/server/src/network/world-sync-protocol.service.ts',
    qualifierName: 'NEXT_S2C',
    expectedMembers: ['Bootstrap', 'InitSession', 'LootWindowUpdate', 'MapEnter', 'MapStatic', 'Notice', 'PanelDelta', 'Quests', 'Realm', 'SelfDelta', 'WorldDelta'],
  },
  {
    label: 'world-client-event service emits',
    relativePath: 'packages/server/src/network/world-client-event.service.ts',
    qualifierName: 'NEXT_S2C',
    expectedMembers: [
      'Error',
      'LootWindowUpdate',
      'MailDetail',
      'MailOpResult',
      'MailPage',
      'MailSummary',
      'MarketItemBook',
      'MarketListings',
      'MarketOrders',
      'MarketStorage',
      'MarketTradeHistory',
      'MarketUpdate',
      'Notice',
      'NpcShop',
      'Pong',
      'QuestNavigateResult',
      'Quests',
      'RedeemCodesResult',
      'SuggestionUpdate',
    ],
  },
  {
    label: 'world-protocol-projection service emits',
    relativePath: 'packages/server/src/network/world-protocol-projection.service.ts',
    qualifierName: 'NEXT_S2C',
    expectedMembers: ['TileDetail'],
  },
];
/**
 * 为审计过程生成唯一玩家或实体标识。
 */
function pid(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
/**
 * 查找玩家背包中指定物品所在的槽位索引。
 */
function slot(player, itemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录索引。
 */
  var index = player.inventory.items.findIndex(function (entry) { return entry.itemId === itemId; });
  if (index < 0) {
    throw new Error("missing inventory slot for item: " + itemId);
  }
  return index;
}
/**
 * 统计玩家背包里指定物品的数量。
 */
function count(player, itemId) {
/**
 * 记录entry。
 */
  var entry = player.inventory.items.find(function (item) { return item.itemId === itemId; });
  return entry ? entry.count : 0;
}
/**
 * 从当前玩家状态里解析指定功法已解锁的真实技能 ID。
 */
function resolveTechniqueSkillId(player, techId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录technique。
 */
  var technique = player?.techniques?.techniques?.find(function (entry) { return entry.techId === techId; }) ?? null;
  if (!technique || !Array.isArray(technique.skills)) {
    throw new Error("missing technique skills for tech: " + techId);
  }
/**
 * 记录level。
 */
  var level = Number.isFinite(technique.level) ? technique.level : 1;
/**
 * 记录skill。
 */
  var skill = technique.skills.find(function (entry) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
      return false;
    }
    var unlockLevel = Number.isFinite(entry.unlockLevel) ? entry.unlockLevel : 1;
    return level >= unlockLevel;
  }) ?? null;
  if (!skill) {
    throw new Error("missing unlocked technique skill for tech: " + techId);
  }
  return skill.id;
}
/**
 * 发送一个上行事件并等待对应下行响应出现。
 */
async function emitAndWait(socket, emitEvent, payload, responseEvent, predicate, timeoutMs) {
/**
 * 记录after数量。
 */
  var afterCount = socket.getEventCount(responseEvent);
  socket.emit(emitEvent, payload);
  return socket.waitForEventAfter(responseEvent, afterCount, predicate, timeoutMs);
}
/**
 * 轮询市场成交历史，直到查询结果出现有效记录。
 */
async function requestMarketTradeHistoryUntilVisible(socket, timeoutMs) {
  return lib.waitForValue(async function () {
/**
 * 记录after数量。
 */
    var afterCount = socket.getEventCount(NEXT_S2C.MarketTradeHistory);
    socket.emit(NEXT_C2S.RequestMarketTradeHistory, { page: 1 });
    try {
/**
 * 记录payload。
 */
      var payload = await socket.waitForEventAfter(NEXT_S2C.MarketTradeHistory, afterCount, function (entry) {
        return entry && Array.isArray(entry.records);
      }, Math.min(timeoutMs, 1000));
      return payload.records.length > 0 ? payload : null;
    }
    catch (_error) {
      return null;
    }
  }, timeoutMs, 'marketTradeHistoryVisible');
}
/**
 * 轮询运行时市场状态，直到满足指定断言。
 */
async function waitForMarket(runtime, playerId, predicate, timeoutMs, label) {
  return lib.waitForValue(async function () {
/**
 * 记录market。
 */
    var market = await runtime.api.fetchMarket(playerId);
    return predicate(market) ? market : null;
  }, timeoutMs, label);
}
/**
 * 封装审计用 HTTP JSON 请求并统一处理错误。
 */
async function requestJson(baseUrl, pathname, init) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录请求体。
 */
  var body = init?.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录response。
 */
  var response = await fetch(baseUrl + pathname, {
    method: init?.method ?? 'GET',
    headers: body === undefined ? undefined : {
      'content-type': 'application/json',
      ...(init?.token ? { authorization: 'Bearer ' + init.token } : {}),
    },
    body,
  });
  if (!response.ok) {
    throw new Error('request failed: ' + pathname + ': ' + response.status + ' ' + await response.text());
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}
/**
 * 解析 JWT 的 payload 以提取审计所需身份字段。
 */
function parseJwtPayload(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof token !== 'string') {
    return null;
  }
/**
 * 记录parts。
 */
  var parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  }
  catch (_error) {
    return null;
  }
}
/**
 * 在令牌缺少玩家编号时推导兜底玩家 ID。
 */
function buildFallbackPlayerId(userId) {
/**
 * 记录normalized。
 */
  var normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized ? 'p_' + normalized : 'p_guest';
}
/**
 * 根据种子稳定生成唯一显示名，避免注册冲突。
 */
function buildUniqueDisplayName(seed) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录hash。
 */
  var hash = 0;
  for (var index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
/**
 * 计算审计命名辅助的稳定 hash 文本。
 */
function buildAuditHash(seed) {
  var hash = 2166136261;
  for (var index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}
/**
 * 把审计 seed 规整成 ASCII token，供账号名和角色名复用。
 */
function buildAuditToken(seed, maxLength, attempt) {
  var normalized = typeof seed === 'string' ? seed.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
  var suffix = attempt > 0 ? attempt.toString(36) : '';
  var token = normalized + buildAuditHash(seed + ":" + attempt) + suffix;
  if (!token) {
    token = "audit" + buildAuditHash(String(seed));
  }
  return token.slice(-maxLength);
}
/**
 * 为审计注册生成稳定唯一的账号名。
 */
function buildUniqueAuditAccountName(seed, attempt) {
  return "acct_" + buildAuditToken(seed, 15, attempt);
}
/**
 * 为审计注册生成稳定唯一的角色名。
 */
function buildUniqueAuditRoleName(seed, attempt) {
  return "审" + buildAuditToken(seed, 12, attempt);
}
/**
 * 判断注册失败是否属于可重试的命名冲突。
 */
function isRegisterConflictError(error) {
  var message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("称号已存在")
    || message.includes("显示名称已存在")
    || message.includes("账号已存在");
}
/**
 * 注册并登录审计账号，返回访问令牌与玩家标识。
 */
async function registerAndLoginPlayer(baseUrl, suffix) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录login。
 */
  var login = null;
/**
 * 记录最终账号。
 */
  var accountName = "";
/**
 * 记录最终密码。
 */
  var password = "";
  for (var attempt = 0; attempt < 12; attempt += 1) {
    accountName = buildUniqueAuditAccountName(suffix, attempt);
    password = "Pass_" + buildAuditToken(suffix, 10, attempt);
    try {
      await requestJson(baseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
          accountName: accountName,
          password: password,
          displayName: buildUniqueDisplayName('next-protocol-audit:' + suffix + ":" + attempt),
          roleName: buildUniqueAuditRoleName(suffix, attempt),
        },
      });
      login = await requestJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
          loginName: accountName,
          password: password,
        },
      });
      break;
    }
    catch (error) {
      if (!isRegisterConflictError(error) || attempt >= 11) {
        throw error;
      }
    }
  }
/**
 * 记录payload。
 */
  var payload = parseJwtPayload(login?.accessToken);
  if (!payload?.sub || typeof login?.accessToken !== 'string') {
    throw new Error('unexpected login payload: ' + JSON.stringify(login));
  }
  await ensureNativeDocsForAccessToken(login.accessToken);
/**
 * 记录玩家ID。
 */
  var playerId = normalizeNextPlayerId(typeof payload?.playerId === 'string' ? payload.playerId.trim() : '')
    || buildFallbackPlayerId(payload.sub);
  return {
    accessToken: login.accessToken,
    playerId: playerId,
  };
}
/**
 * 在带库审计中，确保 access token 对应账号已有 next identity/snapshot 真源文档。
 */
async function ensureNativeDocsForAccessToken(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!HAS_DATABASE || typeof token !== 'string' || !token.trim()) {
    return;
  }
/**
 * 记录payload。
 */
  var payload = parseJwtPayload(token);
/**
 * 记录用户ID。
 */
  var tokenUserId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
/**
 * 记录玩家ID。
 */
  var tokenPlayerId = normalizeNextPlayerId(typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
/**
 * 记录用户名。
 */
  var tokenUsername = typeof payload?.username === 'string' ? payload.username.trim() : '';
/**
 * 记录显示名。
 */
  var tokenDisplayName = typeof payload?.displayName === 'string' ? payload.displayName.trim() : '';
/**
 * 记录角色名。
 */
  var tokenPlayerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : tokenDisplayName;
  if (!tokenUserId) {
    return;
  }
  var pool = new pg.Pool({
    connectionString: SERVER_NEXT_DATABASE_URL,
  });
  try {
    if (!tokenPlayerId) {
      var playerResult = await pool.query('SELECT id, name FROM players WHERE "userId" = $1::uuid LIMIT 1', [tokenUserId]);
      var playerRow = Array.isArray(playerResult?.rows) ? playerResult.rows[0] : null;
      tokenPlayerId = normalizeNextPlayerId(typeof playerRow?.id === 'string' ? playerRow.id.trim() : tokenPlayerId);
      if (!tokenPlayerName) {
        tokenPlayerName = typeof playerRow?.name === 'string' ? playerRow.name.trim() : tokenPlayerName;
      }
    }
    if (!tokenUsername || !tokenDisplayName) {
      var userResult = await pool.query('SELECT username, "displayName" FROM users WHERE id = $1::uuid LIMIT 1', [tokenUserId]);
      var userRow = Array.isArray(userResult?.rows) ? userResult.rows[0] : null;
      if (!tokenUsername) {
        tokenUsername = typeof userRow?.username === 'string' ? userRow.username.trim() : tokenUsername;
      }
      if (!tokenDisplayName) {
        tokenDisplayName = typeof userRow?.displayName === 'string' ? userRow.displayName.trim() : tokenDisplayName;
      }
    }
    if (!tokenPlayerName) {
      tokenPlayerName = tokenDisplayName;
    }
    if (!tokenPlayerId || !tokenUsername || !tokenDisplayName || !tokenPlayerName) {
      return;
    }
    await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_identities_v1', tokenUserId, JSON.stringify({
      version: 1,
      userId: tokenUserId,
      username: tokenUsername,
      displayName: tokenDisplayName,
      playerId: tokenPlayerId,
      playerName: tokenPlayerName,
      persistedSource: 'token_seed',
      updatedAt: Date.now(),
    })]);
    await pool.query(`
      INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (scope, key)
      DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
    `, ['server_next_player_snapshots_v1', tokenPlayerId, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      placement: {
        templateId: 'yunlai_town',
        x: 32,
        y: 5,
        facing: 1,
      },
      vitals: {
        hp: 100,
        maxHp: 100,
        qi: 0,
        maxQi: 100,
      },
      progression: {
        foundation: 0,
        combatExp: 0,
        bodyTraining: null,
        boneAgeBaseYears: 18,
        lifeElapsedTicks: 0,
        lifespanYears: null,
        realm: null,
        heavenGate: null,
        spiritualRoots: null,
      },
      unlockedMapIds: ['yunlai_town'],
      inventory: {
        revision: 1,
        capacity: 24,
        items: [],
      },
      equipment: {
        revision: 1,
        slots: [],
      },
      techniques: {
        revision: 1,
        techniques: [],
        cultivatingTechId: null,
      },
      buffs: {
        revision: 1,
        buffs: [],
      },
      quests: {
        revision: 1,
        entries: [],
      },
      combat: {
        autoBattle: false,
        autoRetaliate: true,
        autoBattleStationary: false,
        combatTargetId: null,
        combatTargetLocked: false,
        allowAoePlayerHit: false,
        autoIdleCultivation: true,
        autoSwitchCultivation: false,
        senseQiActive: false,
        autoBattleSkills: [],
      },
      pendingLogbookMessages: [],
      runtimeBonuses: [],
      __snapshotMeta: {
        persistedSource: 'token_seed',
        seededAt: Date.now(),
      },
    })]);
  } finally {
    await pool.end().catch(function () { return undefined; });
  }
}
/**
 * 规范化 next 玩家ID，统一为 p_<uuid> 形态。
 */
function normalizeNextPlayerId(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof value !== 'string') {
    return '';
  }
/**
 * 记录trimmed。
 */
  var trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('p_')) {
    return trimmed;
  }
  return /^[0-9a-fA-F-]{36}$/.test(trimmed) ? ('p_' + trimmed) : trimmed;
}
/**
 * 处理loginGM。
 */
async function loginGm(baseUrl) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录password。
 */
  var password = envAlias.resolveServerNextGmPassword('admin123');
/**
 * 记录payload。
 */
  var payload = await requestJson(baseUrl, '/api/auth/gm/login', {
    method: 'POST',
    body: { password: password },
  });
  if (typeof payload?.accessToken !== 'string' || !payload.accessToken) {
    throw new Error('unexpected GM login payload: ' + JSON.stringify(payload));
  }
  return payload.accessToken;
}
/**
 * 处理hello。
 */
async function hello(runtime, socket, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  await socket.onceConnected();
  socket.emit(NEXT_C2S.Hello, payload);
/**
 * 记录init会话。
 */
  var initSession = await socket.waitForEvent(NEXT_S2C.InitSession);
/**
 * 记录玩家ID。
 */
  var playerId = typeof initSession?.pid === 'string' && initSession.pid.trim()
    ? initSession.pid.trim()
    : (typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
  if (playerId) {
    runtime.trackPlayer(playerId);
  }
  await socket.waitForEvent(NEXT_S2C.MapEnter);
  await socket.waitForEvent(NEXT_S2C.WorldDelta);
  await socket.waitForEvent(NEXT_S2C.SelfDelta);
  var panelDelta = await socket.waitForEvent(NEXT_S2C.PanelDelta);
  assertInitialPanelDeltaIsRevisionOnly(panelDelta);
  var bootstrap = await socket.waitForEvent(NEXT_S2C.Bootstrap);
  await socket.waitForEvent(NEXT_S2C.MapStatic);
  await socket.waitForEvent(NEXT_S2C.Realm);
  await socket.waitForEvent(NEXT_S2C.LootWindowUpdate);
  await socket.waitForEvent(NEXT_S2C.Quests);
  return {
    playerId: playerId,
    sessionId: typeof initSession?.sid === 'string' ? initSession.sid : '',
    initSession: initSession,
    bootstrap: bootstrap,
  };
}
/**
 * 等待鉴权型 next socket 在 connect 阶段完成 bootstrap。
 */
async function awaitAuthenticatedBootstrap(runtime, socket, timeoutMs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  await socket.onceConnected();
/**
 * 记录init会话。
 */
  var initSession = await socket.waitForEvent(NEXT_S2C.InitSession, function () { return true; }, timeoutMs);
/**
 * 记录玩家ID。
 */
  var playerId = typeof initSession?.pid === 'string' && initSession.pid.trim()
    ? initSession.pid.trim()
    : '';
  if (playerId) {
    runtime.trackPlayer(playerId);
  }
  await socket.waitForEvent(NEXT_S2C.MapEnter, function () { return true; }, timeoutMs);
  await socket.waitForEvent(NEXT_S2C.WorldDelta, function () { return true; }, timeoutMs);
  await socket.waitForEvent(NEXT_S2C.SelfDelta, function () { return true; }, timeoutMs);
  var panelDelta = await socket.waitForEvent(NEXT_S2C.PanelDelta, function () { return true; }, timeoutMs);
  assertInitialPanelDeltaIsRevisionOnly(panelDelta);
  await socket.waitForEvent(NEXT_S2C.Bootstrap, function () { return true; }, timeoutMs);
  await socket.waitForEvent(NEXT_S2C.MapStatic, function () { return true; }, timeoutMs);
  await socket.waitForEvent(NEXT_S2C.Realm, function () { return true; }, timeoutMs);
  await socket.waitForEvent(NEXT_S2C.LootWindowUpdate, function () { return true; }, timeoutMs);
  await socket.waitForEvent(NEXT_S2C.Quests, function () { return true; }, timeoutMs);
  return {
    playerId: playerId,
    sessionId: typeof initSession?.sid === 'string' ? initSession.sid : '',
    initSession: initSession,
  };
}
/**
 * 断言首连 panel delta 只承担 revision 占位，而不再重复整包面板快照。
 */
function assertInitialPanelDeltaIsRevisionOnly(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!payload || typeof payload !== 'object') {
    throw new Error('expected initial PanelDelta payload to be an object');
  }
  assertPanelSectionRevisionOnly('inv', payload.inv, ['r']);
  assertPanelSectionRevisionOnly('eq', payload.eq, ['r', 'slots'], function (value) {
    return Array.isArray(value) && value.length === 0;
  });
  assertPanelSectionRevisionOnly('tech', payload.tech, ['r', 'techniques'], function (value) {
    return Array.isArray(value) && value.length === 0;
  });
  assertPanelSectionRevisionOnly('attr', payload.attr, ['r']);
  assertPanelSectionRevisionOnly('act', payload.act, ['r', 'actions'], function (value) {
    return Array.isArray(value) && value.length === 0;
  });
  assertPanelSectionRevisionOnly('buff', payload.buff, ['r']);
}
/**
 * 断言单个 panel section 只带允许的轻量字段。
 */
function assertPanelSectionRevisionOnly(label, payload, allowedKeys, validateOptional) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!payload || typeof payload !== 'object' || typeof payload.r !== 'number') {
    throw new Error('expected initial PanelDelta.' + label + ' to include numeric revision');
  }
  var allowedKeySet = new Set(allowedKeys);
  for (const key of Object.keys(payload)) {
    if (!allowedKeySet.has(key)) {
      throw new Error('expected initial PanelDelta.' + label + ' to avoid duplicate bootstrap field "' + key + '"');
    }
  }
  if (!validateOptional) {
    return;
  }
  for (const key of allowedKeys) {
    if (key === 'r' || payload[key] === undefined) {
      continue;
    }
    if (!validateOptional(payload[key], key)) {
      throw new Error('expected initial PanelDelta.' + label + '.' + key + ' to stay empty during bootstrap');
    }
  }
}
/**
 * 收集legacys2cevents。
 */
function collectLegacyS2CEvents(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 汇总执行结果。
 */
  var results = [];
  for (const socket of runtime.getSockets()) {
    for (const entry of socket.history) {
      if (!LEGACY_S2C_SET.has(entry.event)) {
        continue;
      }
      results.push({
        socket: socket.label,
        event: entry.event,
      });
    }
  }
  return results;
}
/**
 * 断言nolegacys2cevents。
 */
function assertNoLegacyS2CEvents(runtime, caseName) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录legacyevents。
 */
  var legacyEvents = collectLegacyS2CEvents(runtime);
  if (legacyEvents.length === 0) {
    return;
  }
/**
 * 记录detail。
 */
  var detail = legacyEvents
    .map(function (entry) { return caseName + ":" + entry.socket + ":" + entry.event; })
    .join(", ");
  throw new Error("next socket received legacy S2C events: " + detail);
}
/**
 * 处理bootstrapcase。
 */
async function bootstrapCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("runtime");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
  assertBootstrapSelfCarriesAttrSurface(session.bootstrap);
/**
 * 记录before。
 */
  var before = (await runtime.api.fetchState(playerId)).player;
  await emitAndWait(socket, NEXT_C2S.Ping, { clientAt: 1001 }, NEXT_S2C.Pong, function (payload) {
    return payload && payload.clientAt === 1001;
  }, 5000);
  socket.emit(NEXT_C2S.Move, { d: Direction.North });
  await lib.waitForState(runtime.api, playerId, function (player) { return player.x !== before.x || player.y !== before.y; }, 4000, "move");
/**
 * 记录moved。
 */
  var moved = (await runtime.api.fetchState(playerId)).player;
  await emitAndWait(socket, NEXT_C2S.RequestTileDetail, { x: moved.x, y: moved.y }, NEXT_S2C.TileDetail, function (payload) {
    return payload && payload.x === moved.x && payload.y === moved.y;
  }, 5000);
}
/**
 * 处理属性榜单与世界摘要case。
 */
async function statPanelCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("stat-panels");
/**
 * 记录会话。
 */
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  await emitAndWait(socket, NEXT_C2S.RequestAttrDetail, {}, NEXT_S2C.AttrDetail, function (payload) {
    return payload
      && typeof payload.baseAttrs === 'object'
      && typeof payload.finalAttrs === 'object'
      && typeof payload.numericStats === 'object'
      && Array.isArray(payload.bonuses)
      && typeof payload.numericStatBreakdowns === 'object'
      && payload.numericStatBreakdowns !== null
      && typeof payload.numericStatBreakdowns.maxHp === 'object';
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.RequestLeaderboard, { limit: 5 }, NEXT_S2C.Leaderboard, function (payload) {
    return payload && typeof payload.generatedAt === 'number' && payload.boards !== undefined;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.RequestWorldSummary, {}, NEXT_S2C.WorldSummary, function (payload) {
    return payload && typeof payload.generatedAt === 'number' && payload.summary !== undefined;
  }, 5000);
}

function assertBootstrapSelfCarriesAttrSurface(payload) {
  if (!payload || typeof payload !== 'object' || !payload.self || typeof payload.self !== 'object') {
    throw new Error('expected Bootstrap.self payload to exist');
  }
  if (!Array.isArray(payload.self.bonuses)) {
    throw new Error('expected Bootstrap.self.bonuses to be present');
  }
  if (payload.self.specialStats !== undefined && typeof payload.self.specialStats !== 'object') {
    throw new Error('expected Bootstrap.self.specialStats to stay object-shaped when present');
  }
  if (!Object.prototype.hasOwnProperty.call(payload.self, 'boneAgeBaseYears')) {
    throw new Error('expected Bootstrap.self.boneAgeBaseYears to be present');
  }
  if (!Object.prototype.hasOwnProperty.call(payload.self, 'lifeElapsedTicks')) {
    throw new Error('expected Bootstrap.self.lifeElapsedTicks to be present');
  }
}
/**
 * 处理炼丹与强化面板 case。
 */
async function craftPanelCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
  var socket = runtime.createSocket("craft-panels");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
  await runtime.api.grantItem(playerId, "equip.copper_pill_furnace", 1);
  await runtime.api.grantItem(playerId, "equip.copper_enhancement_hammer", 1);
  await runtime.api.grantItem(playerId, "equip.geng_gate_blade", 1);
/**
 * 记录玩家。
 */
  var player = (await runtime.api.fetchState(playerId)).player;
  socket.emit(NEXT_C2S.Equip, { slotIndex: slot(player, "equip.copper_pill_furnace") });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current.equipment.slots.some(function (entry) {
      return entry.slot === "weapon" && entry.item && entry.item.itemId === "equip.copper_pill_furnace";
    });
  }, 5000, "equipFurnace");
/**
 * 记录炼丹面板。
 */
  var alchemyPanel = await emitAndWait(socket, NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion: 0 }, NEXT_S2C.AlchemyPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.furnaceItemId === "equip.copper_pill_furnace"
      && Array.isArray(payload.catalog)
      && payload.catalog.length > 0;
  }, 5000);
/**
 * 记录炼丹目录项。
 */
  var alchemyEntry = alchemyPanel.catalog[0];
  for (var ingredientIndex = 0; ingredientIndex < alchemyEntry.ingredients.length; ingredientIndex += 1) {
/**
 * 记录ingredient。
 */
    var ingredient = alchemyEntry.ingredients[ingredientIndex];
    await runtime.api.grantItem(playerId, ingredient.itemId, ingredient.count);
  }
  if (alchemyEntry.category === "buff") {
    await runtime.api.grantItem(playerId, "spirit_stone", alchemyEntry.outputLevel);
  }
/**
 * 记录预设名。
 */
  var presetName = "协议审计预设 " + playerId;
  socket.emit(NEXT_C2S.SaveAlchemyPreset, {
    recipeId: alchemyEntry.recipeId,
    name: presetName,
    ingredients: alchemyEntry.ingredients.map(function (entry) {
      return { itemId: entry.itemId, count: entry.count };
    }),
  });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return Array.isArray(current?.alchemyPresets)
      && current.alchemyPresets.some(function (entry) { return entry.name === presetName && entry.recipeId === alchemyEntry.recipeId; });
  }, 5000, "saveAlchemyPreset");
/**
 * 记录已保存玩家。
 */
  var savedPlayer = (await runtime.api.fetchState(playerId)).player;
/**
 * 记录已保存预设。
 */
  var savedPreset = Array.isArray(savedPlayer?.alchemyPresets)
    ? savedPlayer.alchemyPresets.find(function (entry) { return entry.name === presetName && entry.recipeId === alchemyEntry.recipeId; })
    : null;
  if (!savedPreset?.presetId) {
    throw new Error("missing saved alchemy preset for protocol audit");
  }
  socket.emit(NEXT_C2S.DeleteAlchemyPreset, { presetId: savedPreset.presetId });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return !Array.isArray(current?.alchemyPresets)
      || current.alchemyPresets.every(function (entry) { return entry.presetId !== savedPreset.presetId; });
  }, 5000, "deleteAlchemyPreset");
  await emitAndWait(socket, NEXT_C2S.RequestAlchemyPanel, { knownCatalogVersion: alchemyPanel.catalogVersion }, NEXT_S2C.AlchemyPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.furnaceItemId === "equip.copper_pill_furnace"
      && (!Array.isArray(payload.catalog) || payload.catalog.length === 0);
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.StartAlchemy, {
    recipeId: alchemyEntry.recipeId,
    ingredients: alchemyEntry.ingredients.map(function (entry) {
      return { itemId: entry.itemId, count: entry.count };
    }),
    quantity: 1,
  }, NEXT_S2C.AlchemyPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.job
      && payload.state.job.recipeId === alchemyEntry.recipeId;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.Move, { d: Direction.North }, NEXT_S2C.AlchemyPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.job
      && payload.state.job.recipeId === alchemyEntry.recipeId
      && payload.state.job.phase === "paused"
      && payload.state.job.pausedTicks > 0;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.CancelAlchemy, {}, NEXT_S2C.AlchemyPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.furnaceItemId === "equip.copper_pill_furnace"
      && payload.state.job === null;
  }, 5000);
  player = (await runtime.api.fetchState(playerId)).player;
  socket.emit(NEXT_C2S.Equip, { slotIndex: slot(player, "equip.copper_enhancement_hammer") });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current.equipment.slots.some(function (entry) {
      return entry.slot === "weapon" && entry.item && entry.item.itemId === "equip.copper_enhancement_hammer";
    });
  }, 5000, "equipHammer");
/**
 * 记录强化面板。
 */
  var enhancementPanel = await emitAndWait(socket, NEXT_C2S.RequestEnhancementPanel, {}, NEXT_S2C.EnhancementPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.hammerItemId === "equip.copper_enhancement_hammer"
      && Array.isArray(payload.state.candidates)
      && payload.state.candidates.some(function (entry) { return entry.item && entry.item.itemId === "equip.geng_gate_blade"; });
  }, 5000);
/**
 * 记录强化候选。
 */
  var enhancementCandidate = enhancementPanel.state.candidates.find(function (entry) {
    return entry.item && entry.item.itemId === "equip.geng_gate_blade";
  });
  for (var materialIndex = 0; materialIndex < enhancementCandidate.materials.length; materialIndex += 1) {
/**
 * 记录material。
 */
    var material = enhancementCandidate.materials[materialIndex];
    await runtime.api.grantItem(playerId, material.itemId, Math.max(0, material.count - material.ownedCount));
  }
  await runtime.api.grantItem(playerId, "spirit_stone", enhancementCandidate.spiritStoneCost);
/**
 * 记录保护候选。
 */
  var protectionCandidate = enhancementCandidate.protectionCandidates.find(function (entry) {
    return entry.ref && entry.ref.source === "inventory";
  }) || null;
  if (!protectionCandidate && enhancementCandidate.allowSelfProtection) {
    await runtime.api.grantItem(playerId, enhancementCandidate.item.itemId, 1);
    enhancementPanel = await emitAndWait(socket, NEXT_C2S.RequestEnhancementPanel, {}, NEXT_S2C.EnhancementPanel, function (payload) {
      return payload
        && payload.state
        && Array.isArray(payload.state.candidates)
        && payload.state.candidates.some(function (entry) { return entry.item && entry.item.itemId === "equip.geng_gate_blade"; });
    }, 5000);
    enhancementCandidate = enhancementPanel.state.candidates.find(function (entry) {
      return entry.item && entry.item.itemId === "equip.geng_gate_blade";
    });
    protectionCandidate = enhancementCandidate.protectionCandidates.find(function (entry) {
      return entry.ref && entry.ref.source === "inventory";
    }) || null;
  }
  var desiredTargetLevel = Math.min(20, (enhancementCandidate.nextLevel || 1) + 1);
  await emitAndWait(socket, NEXT_C2S.StartEnhancement, {
    target: enhancementCandidate.ref,
    targetLevel: desiredTargetLevel,
    protection: protectionCandidate ? protectionCandidate.ref : undefined,
    protectionStartLevel: protectionCandidate ? enhancementCandidate.nextLevel : undefined,
  }, NEXT_S2C.EnhancementPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.job
      && payload.state.job.targetItemId === "equip.geng_gate_blade"
      && payload.state.job.desiredTargetLevel === desiredTargetLevel
      && payload.state.job.protectionUsed === Boolean(protectionCandidate);
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.Move, { d: Direction.South }, NEXT_S2C.EnhancementPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.job
      && payload.state.job.targetItemId === "equip.geng_gate_blade"
      && payload.state.job.phase === "paused"
      && payload.state.job.pausedTicks > 0;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.CancelEnhancement, {}, NEXT_S2C.EnhancementPanel, function (payload) {
    return payload
      && payload.state
      && payload.state.hammerItemId === "equip.copper_enhancement_hammer"
      && payload.state.job === null;
  }, 5000);
}
/**
 * 处理心跳chatcase。
 */
async function heartbeatChatCase(runtime) {
/**
 * 记录sender。
 */
  var sender = runtime.createSocket("chat:sender");
/**
 * 记录receiver。
 */
  var receiver = runtime.createSocket("chat:receiver");
/**
 * 记录sender会话。
 */
  var senderSession = await hello(runtime, sender, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录receiver会话。
 */
  var receiverSession = await hello(runtime, receiver, { mapId: "yunlai_town", preferredX: 33, preferredY: 5 });
/**
 * 记录senderID。
 */
  var senderId = senderSession.playerId;
/**
 * 记录receiverID。
 */
  var receiverId = receiverSession.playerId;
  sender.emit(NEXT_C2S.Heartbeat, { clientAt: 2002 });
  await emitAndWait(sender, NEXT_C2S.Ping, { clientAt: 2003 }, NEXT_S2C.Pong, function (payload) {
    return payload && payload.clientAt === 2003;
  }, 5000);
/**
 * 记录noticeafter。
 */
  var noticeAfter = receiver.getEventCount(NEXT_S2C.Notice);
/**
 * 记录message。
 */
  var message = "协议审计聊天 " + senderId;
  sender.emit(NEXT_C2S.Chat, { message: message });
  await receiver.waitForEventAfter(NEXT_S2C.Notice, noticeAfter, function (payload) {
    return Array.isArray(payload?.items) && payload.items.some(function (item) {
      return item?.kind === 'chat' && item.text === message && item.from === senderId;
    });
  }, 5000);
}
/**
 * 处理navigatecase。
 */
async function navigateCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("navigate");
/**
 * 记录任务ID。
 */
  var questId = "__audit_missing_quest__";
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  await emitAndWait(socket, NEXT_C2S.NavigateQuest, { questId: questId }, NEXT_S2C.QuestNavigateResult, function (payload) {
    return payload && payload.questId === questId;
  }, 5000);
}
/**
 * 处理传送点case。
 */
async function portalCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("portal");
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 31, preferredY: 54 });
  await emitAndWait(socket, NEXT_C2S.UsePortal, {}, NEXT_S2C.MapEnter, function (payload) {
    return payload && payload.mid === "wildlands";
  }, 5000);
}
/**
 * 处理kickcase。
 */
async function kickCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("kick");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
/**
 * 记录kickafter。
 */
  var kickAfter = socket.getEventCount(NEXT_S2C.Kick);
  await runtime.api.deletePlayer(playerId);
  await socket.waitForEventAfter(NEXT_S2C.Kick, kickAfter, function (payload) {
    return payload && typeof payload.reason === 'string' && payload.reason.length > 0;
  }, 5000);
}
/**
 * 处理errorcase。
 */
async function errorCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("error");
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  await emitAndWait(socket, NEXT_C2S.RequestNpcShop, { npcId: "" }, NEXT_S2C.Error, function (payload) {
    return !!(payload && payload.message);
  }, 5000);
}
/**
 * 处理shopcase。
 */
async function shopCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("shop");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
  await runtime.api.grantItem(playerId, "spirit_stone", 30);
/**
 * 记录shop。
 */
  var shop = await emitAndWait(socket, NEXT_C2S.RequestNpcShop, { npcId: "npc_herbalist_lan" }, NEXT_S2C.NpcShop, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && payload.shop && Array.isArray(payload.shop.items) && payload.shop.items.length > 0;
  }, 5000);
/**
 * 记录物品ID。
 */
  var itemId = shop.shop.items[0].itemId;
  await emitAndWait(socket, NEXT_C2S.UseAction, { actionId: "npc_shop:npc_herbalist_lan" }, NEXT_S2C.NpcShop, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && payload.shop && Array.isArray(payload.shop.items) && payload.shop.items.length > 0;
  }, 5000);
/**
 * 记录before。
 */
  var before = count((await runtime.api.fetchState(playerId)).player, itemId);
/**
 * 记录noticeafter。
 */
  var noticeAfter = socket.getEventCount(NEXT_S2C.Notice);
  socket.emit(NEXT_C2S.BuyNpcShopItem, { npcId: "npc_herbalist_lan", itemId: itemId, quantity: 1 });
  await lib.waitForState(runtime.api, playerId, function (player) { return count(player, itemId) >= before + 1; }, 5000, "npcBuy");
  await socket.waitForEventAfter(NEXT_S2C.Notice, noticeAfter, function (payload) {
    return Array.isArray(payload && payload.items) && payload.items.length > 0;
  }, 5000);
}
/**
 * 处理detail任务case。
 */
async function detailQuestCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
  var socket = runtime.createSocket("detail");
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  await emitAndWait(socket, NEXT_C2S.RequestDetail, { kind: "npc", id: "npc_herbalist_lan" }, NEXT_S2C.Detail, function (payload) {
    return payload && payload.kind === "npc" && payload.id === "npc_herbalist_lan" && payload.npc && payload.npc.id === "npc_herbalist_lan";
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.RequestQuests, {}, NEXT_S2C.Quests, function (payload) {
    return payload && Array.isArray(payload.quests);
  }, 5000);
/**
 * 记录NPC任务。
 */
  var npcQuests = await emitAndWait(socket, NEXT_C2S.RequestNpcQuests, { npcId: "npc_herbalist_lan" }, NEXT_S2C.NpcQuests, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && Array.isArray(payload.quests);
  }, 5000);
/**
 * 记录首个任务。
 */
  var firstNpcQuest = Array.isArray(npcQuests?.quests) ? npcQuests.quests[0] : null;
/**
 * 记录任务ID。
 */
  var auditedQuestId = firstNpcQuest?.id || "__audit_missing_quest__";
/**
 * 记录接取后任务刷新。
 */
  var acceptQuestAfter = socket.getEventCount(NEXT_S2C.Quests);
  socket.emit(NEXT_C2S.AcceptNpcQuest, { npcId: "npc_herbalist_lan", questId: auditedQuestId });
  if (firstNpcQuest?.id) {
    await socket.waitForEventAfter(NEXT_S2C.Quests, acceptQuestAfter, function (payload) {
      return Array.isArray(payload?.quests) && payload.quests.some(function (entry) { return entry.id === auditedQuestId; });
    }, 5000);
  }
  else {
    await lib.delay(150);
  }
  socket.emit(NEXT_C2S.SubmitNpcQuest, { npcId: "npc_herbalist_lan", questId: auditedQuestId });
  await lib.delay(150);
/**
 * 记录npc任务after。
 */
  var npcQuestAfter = socket.getEventCount(NEXT_S2C.NpcQuests);
/**
 * 记录任务refreshafter。
 */
  var questRefreshAfter = socket.getEventCount(NEXT_S2C.Quests);
  socket.emit(NEXT_C2S.UseAction, { actionId: "npc_quests:npc_herbalist_lan" });
  await socket.waitForEventAfter(NEXT_S2C.NpcQuests, npcQuestAfter, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && Array.isArray(payload.quests);
  }, 5000);
  await socket.waitForEventAfter(NEXT_S2C.Quests, questRefreshAfter, function (payload) {
    return Array.isArray(payload && payload.quests);
  }, 5000);
}
/**
 * 处理pendinglogbookackcase。
 */
async function pendingLogbookAckCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录初始socket。
 */
  var first = runtime.createSocket("logbook:first");
/**
 * 记录初始会话。
 */
  var firstSession = await hello(runtime, first, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = firstSession.playerId;
/**
 * 记录恢复会话ID。
 */
  var resumeSessionId = firstSession.sessionId;
/**
 * 记录messageID。
 */
  var messageId = "logbook_" + playerId;
  first.close();
  await lib.delay(150);
  await runtime.api.queuePendingLogbookMessage(playerId, {
    id: messageId,
    kind: "grudge",
    text: "协议审计待确认 " + playerId,
    from: "系统审计",
    at: 1711929600000,
  });
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("logbook");
/**
 * 记录恢复会话。
 */
  var resumed = await hello(runtime, socket, { sessionId: resumeSessionId });
  if (resumed.playerId !== playerId) {
    throw new Error("unexpected resumed playerId for pending logbook ack: expected=" + playerId + " actual=" + resumed.playerId);
  }
  await socket.waitForEvent(NEXT_S2C.Notice, function (payload) {
    return Array.isArray(payload?.items) && payload.items.some(function (item) {
      return item?.messageId === messageId
        && item.kind === 'grudge'
        && item.persistUntilAck === true
        && item.from === '系统审计';
    });
  }, 5000);
  socket.emit(NEXT_C2S.AckSystemMessages, { ids: [messageId] });
  await lib.waitForState(runtime.api, playerId, function (player) {
    return !Array.isArray(player?.pendingLogbookMessages)
      || player.pendingLogbookMessages.every(function (entry) { return entry.id !== messageId; });
  }, 5000, "ackPendingLogbook");
}
/**
 * 处理inventoryopscase。
 */
async function inventoryOpsCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("inventory");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
  await runtime.api.grantItem(playerId, "spirit_stone", 2);
  await runtime.api.grantItem(playerId, "rat_tail", 1);
/**
 * 记录状态。
 */
  var state = (await runtime.api.fetchState(playerId)).player;
/**
 * 记录spiritbefore索引。
 */
  var spiritBeforeIndex = slot(state, "spirit_stone");
/**
 * 记录ratbefore索引。
 */
  var ratBeforeIndex = slot(state, "rat_tail");
  socket.emit(NEXT_C2S.SortInventory, {});
  await lib.waitForState(runtime.api, playerId, function (player) {
    return slot(player, "rat_tail") < slot(player, "spirit_stone") && slot(player, "spirit_stone") !== spiritBeforeIndex && slot(player, "rat_tail") !== ratBeforeIndex;
  }, 5000, "sortInventory");
  state = (await runtime.api.fetchState(playerId)).player;
/**
 * 记录before数量。
 */
  var beforeCount = count(state, "spirit_stone");
  socket.emit(NEXT_C2S.DestroyItem, { slotIndex: slot(state, "spirit_stone"), count: 1 });
  await lib.waitForState(runtime.api, playerId, function (player) {
    return count(player, "spirit_stone") === Math.max(0, beforeCount - 1);
  }, 5000, "destroyItem");
}
/**
 * 处理玩家controlcase。
 */
async function playerControlCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
  var socket = runtime.createSocket("controls");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 31, preferredY: 54 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
/**
 * 记录玩家。
 */
  var player = (await runtime.api.fetchState(playerId)).player;
  socket.emit(NEXT_C2S.UseItem, { slotIndex: slot(player, "book.qingmu_sword") });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current.techniques.techniques.some(function (entry) { return entry.techId === "qingmu_sword"; });
  }, 5000, "unlockSkillForAutoBattle");
/**
 * 记录learnedstate。
 */
  var learnedState = (await runtime.api.fetchState(playerId)).player;
/**
 * 记录真实技能ID。
 */
  var learnedSkillId = resolveTechniqueSkillId(learnedState, "qingmu_sword");
/**
 * 记录paneldeltaafter。
 */
  var autoBattlePanelDeltaAfter = socket.getEventCount(NEXT_S2C.PanelDelta);
  socket.emit(NEXT_C2S.UpdateAutoBattleSkills, {
    skills: [{ skillId: learnedSkillId, enabled: true }],
  });
  if (!(Array.isArray(learnedState?.actions?.actions)
    && learnedState.actions.actions.some(function (entry) {
      return entry?.id === learnedSkillId && entry.autoBattleEnabled === true;
    }))) {
    await socket.waitForEventAfter(NEXT_S2C.PanelDelta, autoBattlePanelDeltaAfter, function (payload) {
/**
 * 记录actionpatched。
 */
      return payload?.act?.actions?.some(function (entry) {
        return entry?.id === learnedSkillId && entry.autoBattleEnabled === true;
      }) === true;
    }, 5000);
  }
  socket.emit(NEXT_C2S.UpdateAutoUsePills, {
    pills: [{ itemId: "pill.minor_heal", conditions: [] }],
  });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return Array.isArray(current?.combat?.autoUsePills)
      && current.combat.autoUsePills.some(function (entry) { return entry.itemId === "pill.minor_heal"; });
  }, 5000, "updateAutoUsePills");
  socket.emit(NEXT_C2S.UpdateCombatTargetingRules, {
    combatTargetingRules: {
      hostile: ["demonized_players", "retaliators", "terrain"],
      friendly: ["non_hostile_players", "party"],
      includeNormalMonsters: false,
      includeEliteMonsters: false,
      includeBosses: false,
      includePlayers: false,
    },
  });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current?.combat?.combatTargetingRules?.includeNormalMonsters === false
      && current.combat.combatTargetingRules.includeEliteMonsters === false
      && current.combat.combatTargetingRules.includeBosses === false
      && Array.isArray(current.combat.combatTargetingRules.hostile)
      && current.combat.combatTargetingRules.hostile.includes("monster") === false
      && current.combat.combatTargetingRules.hostile.includes("all_players") === false
      && Array.isArray(current.combat.combatTargetingRules.friendly)
      && current.combat.combatTargetingRules.friendly.includes("party") === true
      && current.combat.combatTargetingRules.includePlayers === false;
  }, 5000, "updateCombatTargetingRules");
  socket.emit(NEXT_C2S.UpdateAutoBattleTargetingMode, { mode: "nearest" });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current?.combat?.autoBattleTargetingMode === "nearest";
  }, 5000, "updateAutoBattleTargetingMode");
/**
 * 记录paneldeltaafter。
 */
  var panelDeltaAfter = socket.getEventCount(NEXT_S2C.PanelDelta);
  socket.emit(NEXT_C2S.UpdateTechniqueSkillAvailability, {
    techId: "qingmu_sword",
    enabled: false,
  });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return Array.isArray(current.combat.autoBattleSkills)
      && current.combat.autoBattleSkills.some(function (entry) { return entry.skillId === learnedSkillId && entry.skillEnabled === false; });
  }, 5000, "updateTechniqueSkillAvailability");
  await socket.waitForEventAfter(NEXT_S2C.PanelDelta, panelDeltaAfter, function (payload) {
/**
 * 记录功法patched。
 */
    var techniquePatched = payload?.tech?.techniques?.some(function (entry) { return entry.techId === "qingmu_sword" && entry.skillsEnabled === false; });
/**
 * 记录actionpatched。
 */
    var actionPatched = payload?.act?.actions?.some(function (entry) { return entry.id === learnedSkillId && entry.skillEnabled === false; });
    return techniquePatched === true && actionPatched === true;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.UsePortal, {}, NEXT_S2C.MapEnter, function (payload) {
    return payload && payload.mid === "wildlands";
  }, 5000);
  socket.emit(NEXT_C2S.DebugResetSpawn, {});
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current.templateId === "yunlai_town";
  }, 5000, "debugResetSpawn");
/**
 * 记录noticeafter。
 */
  var noticeAfter = socket.getEventCount(NEXT_S2C.Notice);
  socket.emit(NEXT_C2S.HeavenGateAction, { action: "open" });
  await socket.waitForEventAfter(NEXT_S2C.Notice, noticeAfter, function (payload) {
    return Array.isArray(payload?.items) && payload.items.some(function (item) {
      return item?.text === "当前境界不可开天门";
    });
  }, 5000);
}
/**
 * 处理redeemcodescase。
 */
async function redeemCodesCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录认证。
 */
  var auth = await registerAndLoginPlayer(runtime.baseUrl, pid('audit_redeem'));
/**
 * 记录GM令牌。
 */
  var gmToken = await loginGm(runtime.baseUrl);
/**
 * 记录created。
 */
  var created = await requestJson(runtime.baseUrl, '/api/gm/redeem-code-groups', {
    method: 'POST',
    token: gmToken,
    body: {
      name: '协议审计兑换码',
      rewards: [{ itemId: 'spirit_stone', count: 4 }],
      count: 1,
    },
  });
/**
 * 记录code。
 */
  var code = Array.isArray(created?.codes) ? created.codes[0] : '';
  if (!code) {
    throw new Error('unexpected redeem create payload: ' + JSON.stringify(created));
  }
/**
 * 记录socket。
 */
  var socket = runtime.createSocket('redeem', { token: auth.accessToken, protocol: 'next' });
/**
 * 记录会话。
 */
  var session = await awaitAuthenticatedBootstrap(runtime, socket, 12000);
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
/**
 * 记录before。
 */
  var before = count((await runtime.api.fetchState(playerId)).player, 'spirit_stone');
  socket.emit(NEXT_C2S.RedeemCodes, { codes: [code] });
  await socket.waitForEvent(NEXT_S2C.RedeemCodesResult, function (payload) {
    return Array.isArray(payload?.result?.results) && payload.result.results.some(function (entry) {
      return entry.code === code && entry.ok === true;
    });
  }, 5000);
  await lib.waitForState(runtime.api, playerId, function (current) {
    return count(current, 'spirit_stone') === before + 4;
  }, 5000, 'redeemCode');
}
/**
 * 处理GMcase。
 */
async function gmCase(runtime) {
/**
 * 记录认证。
 */
  var auth = await registerAndLoginPlayer(runtime.baseUrl, pid('audit_gm_auth'));
/**
 * 记录GM令牌。
 */
  var gmToken = await loginGm(runtime.baseUrl);
/**
 * 记录socket。
 */
  var socket = runtime.createSocket('gm', { token: auth.accessToken, gmToken: gmToken, protocol: 'next' });
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: 'yunlai_town', preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
/**
 * 记录GM状态。
 */
  var gmState = await emitAndWait(socket, NEXT_C2S.GmGetState, {}, NEXT_S2C.GmState, function (payload) {
    return Array.isArray(payload?.players) && Array.isArray(payload?.mapIds);
  }, 5000);
/**
 * 记录bot数量。
 */
  var botCount = Number(gmState?.botCount ?? 0);
  gmState = await emitAndWait(socket, NEXT_C2S.GmSpawnBots, { count: 1 }, NEXT_S2C.GmState, function (payload) {
    return Array.isArray(payload?.players) && Array.isArray(payload?.mapIds);
  }, 8000);
/**
 * 记录当前值。
 */
  var current = (await runtime.api.fetchState(playerId)).player;
  await emitAndWait(socket, NEXT_C2S.GmUpdatePlayer, {
    playerId: playerId,
    mapId: current.templateId,
    x: current.x,
    y: current.y,
    hp: current.hp,
    autoBattle: current.combat.autoBattle,
  }, NEXT_S2C.GmState, function (payload) {
    return Array.isArray(payload?.players) && payload.players.some(function (entry) { return entry.id === playerId; });
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.GmResetPlayer, { playerId: playerId }, NEXT_S2C.GmState, function (payload) {
    return Array.isArray(payload?.players) && payload.players.some(function (entry) { return entry.id === playerId; });
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.GmRemoveBots, { all: true }, NEXT_S2C.GmState, function (payload) {
    return Array.isArray(payload?.players) && Array.isArray(payload?.mapIds);
  }, 8000);
}
/**
 * 处理suggestioncase。
 */
async function suggestionCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录socket。
 */
  var socket = runtime.createSocket("suggestion");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
  await emitAndWait(socket, NEXT_C2S.RequestSuggestions, {}, NEXT_S2C.SuggestionUpdate, function () { return true; }, 5000);
/**
 * 记录title。
 */
  var title = "协议审计 " + playerId;
/**
 * 记录created。
 */
  var created = await emitAndWait(socket, NEXT_C2S.CreateSuggestion, { title: title, description: "protocol audit" }, NEXT_S2C.SuggestionUpdate, function (payload) {
    return payload && payload.suggestions && payload.suggestions.some(function (entry) { return entry.title === title; });
  }, 5000);
/**
 * 记录suggestionID。
 */
  var suggestionId = created.suggestions.find(function (entry) { return entry.title === title; }).id;
  await emitAndWait(socket, NEXT_C2S.VoteSuggestion, { suggestionId: suggestionId, vote: "up" }, NEXT_S2C.SuggestionUpdate, function (payload) {
    return payload && payload.suggestions && payload.suggestions.some(function (entry) { return entry.id === suggestionId; });
  }, 5000);
  await runtime.api.post("/runtime/suggestions/" + suggestionId + "/reply", { content: "GM 审计回复" });
  await emitAndWait(socket, NEXT_C2S.ReplySuggestion, { suggestionId: suggestionId, content: "审计回复" }, NEXT_S2C.SuggestionUpdate, function (payload) {
    return payload && payload.suggestions && payload.suggestions.some(function (entry) {
      return entry.id === suggestionId && Array.isArray(entry.replies) && entry.replies.length > 1 && entry.replies[entry.replies.length - 1].authorType === "author";
    });
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.MarkSuggestionRepliesRead, { suggestionId: suggestionId }, NEXT_S2C.SuggestionUpdate, function (payload) {
    return payload && payload.suggestions && payload.suggestions.some(function (entry) { return entry.id === suggestionId; });
  }, 5000);
  if (HAS_DATABASE) {
/**
 * 记录GM鉴权。
 */
    var gmAuth = await registerAndLoginPlayer(runtime.baseUrl, pid("audit_gm_suggestion"));
/**
 * 记录GM令牌。
 */
    var gmToken = await loginGm(runtime.baseUrl);
/**
 * 记录GM socket。
 */
    var gmSocket = runtime.createSocket("suggestion:gm", { token: gmAuth.accessToken, gmToken: gmToken, protocol: "next" });
    await awaitAuthenticatedBootstrap(runtime, gmSocket, 12000);
    await emitAndWait(gmSocket, NEXT_C2S.GmMarkSuggestionCompleted, { suggestionId: suggestionId }, NEXT_S2C.SuggestionUpdate, function (payload) {
      return payload && payload.suggestions && payload.suggestions.some(function (entry) { return entry.id === suggestionId && entry.status === "completed"; });
    }, 5000);
    await emitAndWait(gmSocket, NEXT_C2S.GmRemoveSuggestion, { suggestionId: suggestionId }, NEXT_S2C.SuggestionUpdate, function (payload) {
      return payload && Array.isArray(payload.suggestions) && payload.suggestions.every(function (entry) { return entry.id !== suggestionId; });
    }, 5000);
  }
}
/**
 * 处理mailcase。
 */
async function mailCase(runtime) {
/**
 * 记录socket。
 */
  var socket = runtime.createSocket("mail");
/**
 * 记录会话。
 */
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录玩家ID。
 */
  var playerId = session.playerId;
  await runtime.api.createDirectMail(playerId, { fallbackTitle: "审计邮件", fallbackBody: "next protocol audit", senderLabel: "system", attachments: [{ itemId: "rat_tail", count: 2 }] });
  await emitAndWait(socket, NEXT_C2S.RequestMailSummary, {}, NEXT_S2C.MailSummary, function (payload) {
    return payload && payload.summary && (payload.summary.unreadCount >= 1 || payload.summary.claimableCount >= 1 || payload.summary.revision >= 1);
  }, 5000);
/**
 * 记录page。
 */
  var page = await emitAndWait(socket, NEXT_C2S.RequestMailPage, { page: 1, pageSize: 20 }, NEXT_S2C.MailPage, function (payload) {
    return payload && payload.page && payload.page.items && payload.page.items.length > 0;
  }, 5000);
/**
 * 记录mailID。
 */
  var mailId = page.page.items[0].mailId;
  await emitAndWait(socket, NEXT_C2S.RequestMailDetail, { mailId: mailId }, NEXT_S2C.MailDetail, function (payload) {
    return payload && payload.detail && payload.detail.mailId === mailId;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.MarkMailRead, { mailIds: [mailId] }, NEXT_S2C.MailOpResult, function (payload) {
    return payload && payload.mailIds && payload.mailIds.indexOf(mailId) >= 0;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.ClaimMailAttachments, { mailIds: [mailId] }, NEXT_S2C.MailOpResult, function (payload) {
    return payload && payload.mailIds && payload.mailIds.indexOf(mailId) >= 0;
  }, 5000);
  await lib.waitForState(runtime.api, playerId, function (player) { return count(player, "rat_tail") >= 2; }, 5000, "mailClaim");
  await emitAndWait(socket, NEXT_C2S.DeleteMail, { mailIds: [mailId] }, NEXT_S2C.MailOpResult, function (payload) {
    return payload && payload.mailIds && payload.mailIds.indexOf(mailId) >= 0;
  }, 5000);
}
/**
 * 处理progressioncase。
 */
async function progressionCase(runtime) {
/**
 * 记录attacker。
 */
  var attacker = runtime.createSocket("combat:attacker");
/**
 * 记录defender。
 */
  var defender = runtime.createSocket("combat:defender");
/**
 * 记录attacker会话。
 */
  var attackerSession = await hello(runtime, attacker, { mapId: "wildlands", preferredX: 18, preferredY: 18 });
/**
 * 记录defender会话。
 */
  var defenderSession = await hello(runtime, defender, { mapId: "wildlands", preferredX: 19, preferredY: 18 });
/**
 * 记录attackerID。
 */
  var attackerId = attackerSession.playerId;
/**
 * 记录defenderID。
 */
  var defenderId = defenderSession.playerId;
/**
 * 记录玩家。
 */
  var player = (await runtime.api.fetchState(attackerId)).player;
  attacker.emit(NEXT_C2S.UseItem, { slotIndex: slot(player, "book.qingmu_sword") });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.techniques.techniques.some(function (entry) { return entry.techId === "qingmu_sword"; }); }, 5000, "learn");
  player = (await runtime.api.fetchState(attackerId)).player;
/**
 * 记录真实技能ID。
 */
  var learnedSkillId = resolveTechniqueSkillId(player, "qingmu_sword");
  await runtime.api.grantItem(attackerId, "equip.geng_gate_blade", 1);
  player = (await runtime.api.fetchState(attackerId)).player;
  attacker.emit(NEXT_C2S.Equip, { slotIndex: slot(player, "equip.geng_gate_blade") });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.equipment.slots.some(function (entry) { return entry.slot === "weapon" && entry.item && entry.item.itemId === "equip.geng_gate_blade"; }); }, 5000, "equip");
  attacker.emit(NEXT_C2S.Cultivate, { techId: "qingmu_sword" });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.techniques.cultivatingTechId === "qingmu_sword"; }, 5000, "cultivate");
  attacker.emit(NEXT_C2S.Unequip, { slot: "weapon" });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.equipment.slots.some(function (entry) { return entry.slot === "weapon" && entry.item === null; }); }, 5000, "unequip");
  await runtime.api.setVitals(attackerId, { hp: 50, qi: 120, maxQi: 120 });
  player = (await runtime.api.fetchState(attackerId)).player;
  attacker.emit(NEXT_C2S.UseItem, { slotIndex: slot(player, "pill.minor_heal") });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.hp > 50; }, 5000, "heal");
  attacker.emit(NEXT_C2S.UseAction, { actionId: "toggle:allow_aoe_player_hit" });
  await lib.waitForState(runtime.api, attackerId, function (current) {
    return current?.combat?.allowAoePlayerHit === true;
  }, 5000, "allowAoePlayerHit");
/**
 * 记录守方施法前状态。
 */
  var defenderBeforeCast = (await runtime.api.fetchState(defenderId)).player;
  attacker.emit(NEXT_C2S.CastSkill, { skillId: learnedSkillId, targetPlayerId: defenderId });
  await lib.waitForState(runtime.api, defenderId, function (current) { return current.hp < defenderBeforeCast.hp; }, 8000, "cast");
}
/**
 * 处理掉落case。
 */
async function lootCase(runtime) {
/**
 * 记录dropper。
 */
  var dropper = runtime.createSocket("loot:dropper");
/**
 * 记录looter。
 */
  var looter = runtime.createSocket("loot:looter");
/**
 * 记录dropper会话。
 */
  var dropperSession = await hello(runtime, dropper, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
/**
 * 记录looter会话。
 */
  var looterSession = await hello(runtime, looter, { mapId: "yunlai_town", preferredX: 33, preferredY: 5 });
/**
 * 记录dropperID。
 */
  var dropperId = dropperSession.playerId;
/**
 * 记录looterID。
 */
  var looterId = looterSession.playerId;
  await runtime.api.grantItem(dropperId, "rat_tail", 2);
/**
 * 记录dropper状态。
 */
  var dropperState = (await runtime.api.fetchState(dropperId)).player;
/**
 * 记录looter状态。
 */
  var looterState = (await runtime.api.fetchState(looterId)).player;
/**
 * 记录worlddeltaafter。
 */
  var worldDeltaAfter = looter.getEventCount(NEXT_S2C.WorldDelta);
  dropper.emit(NEXT_C2S.DropItem, { slotIndex: slot(dropperState, "rat_tail"), count: 2 });
/**
 * 记录pileevent。
 */
  var pileEvent = await looter.waitForEventAfter(NEXT_S2C.WorldDelta, worldDeltaAfter, function (payload) {
    return Array.isArray(payload && payload.g) && payload.g.some(function (entry) { return entry.x === dropperState.x && entry.y === dropperState.y; });
  }, 5000);
/**
 * 记录pile。
 */
  var pile = pileEvent.g.find(function (entry) { return entry.x === dropperState.x && entry.y === dropperState.y && Array.isArray(entry.items); });
  dropper.emit(NEXT_C2S.Move, { d: Direction.North });
  await lib.waitForState(runtime.api, dropperId, function (player) { return player.x !== dropperState.x || player.y !== dropperState.y; }, 5000, "lootDropperMoveAway");
  looter.emit(NEXT_C2S.MoveTo, { x: dropperState.x, y: dropperState.y, allowNearestReachable: false });
  await lib.waitForState(runtime.api, looterId, function (player) { return player.x === dropperState.x && player.y === dropperState.y; }, 5000, "lootMoveTo");
  looter.emit(NEXT_C2S.TakeGround, { sourceId: pile.sourceId, itemKey: "rat_tail" });
  await lib.waitForState(runtime.api, looterId, function (player) { return count(player, "rat_tail") >= count(looterState, "rat_tail") + 2; }, 5000, "takeGround");
}
/**
 * 处理marketcase。
 */
async function marketCase(runtime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录seller。
 */
  var seller = runtime.createSocket("market:seller");
/**
 * 记录buyer。
 */
  var buyer = runtime.createSocket("market:buyer");
/**
 * 记录storageseller。
 */
  var storageSeller = runtime.createSocket("market:storage-seller");
/**
 * 记录storagebuyer。
 */
  var storageBuyer = runtime.createSocket("market:storage-buyer");
/**
 * 记录storage物品ID。
 */
  var storageItemId = "serpent_gall";
/**
 * 记录seller会话。
 */
  var sellerSession = await hello(runtime, seller, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
/**
 * 记录buyer会话。
 */
  var buyerSession = await hello(runtime, buyer, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
/**
 * 记录storageseller会话。
 */
  var storageSellerSession = await hello(runtime, storageSeller, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
/**
 * 记录storagebuyer会话。
 */
  var storageBuyerSession = await hello(runtime, storageBuyer, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
/**
 * 记录sellerID。
 */
  var sellerId = sellerSession.playerId;
/**
 * 记录buyerID。
 */
  var buyerId = buyerSession.playerId;
/**
 * 记录storagesellerID。
 */
  var storageSellerId = storageSellerSession.playerId;
/**
 * 记录storagebuyerID。
 */
  var storageBuyerId = storageBuyerSession.playerId;
  await emitAndWait(seller, NEXT_C2S.RequestMarket, {}, NEXT_S2C.MarketUpdate, function () { return true; }, 5000);
  await emitAndWait(buyer, NEXT_C2S.RequestMarket, {}, NEXT_S2C.MarketUpdate, function () { return true; }, 5000);
  await emitAndWait(storageBuyer, NEXT_C2S.RequestMarket, {}, NEXT_S2C.MarketUpdate, function () { return true; }, 5000);
  await emitAndWait(buyer, NEXT_C2S.RequestMarketListings, { page: 1, pageSize: 20, category: 'all', equipmentSlot: 'all', techniqueCategory: 'all' }, NEXT_S2C.MarketListings, function (payload) {
    return payload && payload.page === 1 && Array.isArray(payload.items);
  }, 5000);
  await runtime.api.grantItem(sellerId, "rat_tail", 4);
  await runtime.api.grantItem(buyerId, "spirit_stone", 40);
/**
 * 记录seller状态。
 */
  var sellerState = (await runtime.api.fetchState(sellerId)).player;
/**
 * 记录listed。
 */
  var listed = await emitAndWait(seller, NEXT_C2S.CreateMarketSellOrder, { slotIndex: slot(sellerState, "rat_tail"), quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; });
  }, 5000);
/**
 * 记录物品key。
 */
  var itemKey = listed.myOrders.find(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; }).itemKey;
  await emitAndWait(buyer, NEXT_C2S.RequestMarketItemBook, { itemKey: itemKey }, NEXT_S2C.MarketItemBook, function (payload) {
    return payload && payload.itemKey === itemKey;
  }, 5000);
  buyer.emit(NEXT_C2S.BuyMarketItem, { itemKey: itemKey, quantity: 1 });
  await lib.waitForState(runtime.api, buyerId, function (player) { return count(player, "rat_tail") >= 1; }, 5000, "buyNow");
  await requestMarketTradeHistoryUntilVisible(buyer, 5000);
  await emitAndWait(buyer, NEXT_C2S.CreateMarketBuyOrder, { itemId: "rat_tail", quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "buy" && entry.item && entry.item.itemId === "rat_tail"; });
  }, 5000);
  await runtime.api.grantItem(sellerId, "rat_tail", 1);
  sellerState = (await runtime.api.fetchState(sellerId)).player;
/**
 * 记录buyfulfilledat。
 */
  var buyFulfilledAt = count((await runtime.api.fetchState(buyerId)).player, "rat_tail");
/**
 * 记录historyupdateafter。
 */
  var historyUpdateAfter = buyer.getEventCount(NEXT_S2C.MarketTradeHistory);
  seller.emit(NEXT_C2S.SellMarketItem, { slotIndex: slot(sellerState, "rat_tail"), quantity: 1 });
  await lib.waitForState(runtime.api, buyerId, function (player) { return count(player, "rat_tail") >= buyFulfilledAt + 1; }, 5000, "sellNow");
  await buyer.waitForEventAfter(NEXT_S2C.MarketTradeHistory, historyUpdateAfter, function (payload) {
    return payload && Array.isArray(payload.records) && payload.records.some(function (entry) { return entry.itemId === "rat_tail"; });
  }, 5000);
  sellerState = (await runtime.api.fetchState(sellerId)).player;
/**
 * 记录own。
 */
  var own = await emitAndWait(seller, NEXT_C2S.CreateMarketSellOrder, { slotIndex: slot(sellerState, "rat_tail"), quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; });
  }, 5000);
/**
 * 记录orderID。
 */
  var orderId = own.myOrders.find(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; }).id;
  await emitAndWait(seller, NEXT_C2S.CancelMarketOrder, { orderId: orderId }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.every(function (entry) { return entry.id !== orderId; });
  }, 5000);
  await runtime.api.grantItem(storageBuyerId, "spirit_stone", 20);
/**
 * 记录storagebuyer状态。
 */
  var storageBuyerState = (await runtime.api.fetchState(storageBuyerId)).player;
/**
 * 记录storagebuyercapacity。
 */
  var storageBuyerCapacity = Math.max(1, Math.trunc(storageBuyerState.inventory.capacity || 0));
/**
 * 记录fill数量。
 */
  var fillCount = storageBuyerCapacity - storageBuyerState.inventory.items.length;
  if (fillCount <= 0) {
    throw new Error("expected storage buyer inventory to have free slots before fill");
  }
/**
 * 记录blockedids。
 */
  var blockedIds = new Set(storageBuyerState.inventory.items.map(function (entry) { return entry.itemId; }));
  blockedIds.add(storageItemId);
/**
 * 记录fillerids。
 */
  var fillerIds = lib.loadUniqueItemIds().filter(function (itemId) { return !blockedIds.has(itemId); }).slice(0, fillCount);
  if (fillerIds.length !== fillCount) {
    throw new Error("not enough unique filler items to fill storage buyer inventory");
  }
  for (var i = 0; i < fillerIds.length; i += 1) {
    await runtime.api.grantItem(storageBuyerId, fillerIds[i], 1);
  }
/**
 * 收集fillerID集合。
 */
  var fillerIdSet = new Set(fillerIds);
  await lib.waitForState(runtime.api, storageBuyerId, function (player) { return player.inventory.items.length >= storageBuyerCapacity; }, 10000, "fillInventory");
  await emitAndWait(storageBuyer, NEXT_C2S.CreateMarketBuyOrder, { itemId: storageItemId, quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "buy" && entry.item && entry.item.itemId === storageItemId; });
  }, 5000);
  await runtime.api.grantItem(storageSellerId, storageItemId, 1);
/**
 * 记录storageseller状态。
 */
  var storageSellerState = (await runtime.api.fetchState(storageSellerId)).player;
/**
 * 记录storageupdateafter。
 */
  var storageUpdateAfter = storageBuyer.getEventCount(NEXT_S2C.MarketUpdate);
  storageSeller.emit(NEXT_C2S.SellMarketItem, { slotIndex: slot(storageSellerState, storageItemId), quantity: 1 });
  await storageBuyer.waitForEventAfter(NEXT_S2C.MarketUpdate, storageUpdateAfter, function (payload) {
    return payload && payload.storage && Array.isArray(payload.storage.items) && payload.storage.items.some(function (entry) { return entry.itemId === storageItemId; });
  }, 8000);
  await waitForMarket(runtime, storageBuyerId, function (market) {
    return market && market.storage && Array.isArray(market.storage.items) && market.storage.items.some(function (entry) { return entry.itemId === storageItemId; });
  }, 8000, "marketStorageDeliver");
  storageBuyerState = (await runtime.api.fetchState(storageBuyerId)).player;
/**
 * 记录fillerslot。
 */
  var fillerSlot = storageBuyerState.inventory.items.findIndex(function (entry) { return fillerIdSet.has(entry.itemId); });
  if (fillerSlot < 0) {
    throw new Error("failed to find filler slot for market storage claim");
  }
  storageBuyer.emit(NEXT_C2S.DropItem, { slotIndex: fillerSlot, count: 1 });
  await lib.waitForState(runtime.api, storageBuyerId, function (player) { return player.inventory.items.length <= storageBuyerCapacity - 1; }, 5000, "freeSlot");
/**
 * 记录claimupdateafter。
 */
  var claimUpdateAfter = storageBuyer.getEventCount(NEXT_S2C.MarketUpdate);
  storageBuyer.emit(NEXT_C2S.ClaimMarketStorage, {});
  await storageBuyer.waitForEventAfter(NEXT_S2C.MarketUpdate, claimUpdateAfter, function (payload) {
    return !payload || !payload.storage || !payload.storage.items || !payload.storage.items.some(function (entry) { return entry.itemId === storageItemId; });
  }, 8000);
  await waitForMarket(runtime, storageBuyerId, function (market) {
    return !market || !market.storage || !market.storage.items || !market.storage.items.some(function (entry) { return entry.itemId === storageItemId; });
  }, 8000, "marketStorageClaimed");
  await lib.waitForState(runtime.api, storageBuyerId, function (player) { return count(player, storageItemId) >= 1; }, 5000, "claimStorage");
}
/**
 * 格式化bytes。
 */
function formatBytes(bytes) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return bytes + " B";
  }
  return (bytes / 1024).toFixed(2) + " KB";
}
/**
 * 处理render。
 */
function render(report) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 汇总输出行。
 */
  var lines = [
    "# Next 协议审计报告",
    "",
    "- 生成时间: " + report.generatedAt,
    "- 目标服务: " + report.baseUrl,
    "- 运行模式: " + report.serverMode,
    "- 统计口径: 应用层 payload bytes；对象载荷按 `JSON.stringify(payload)` 的 UTF-8 字节数计算，二进制载荷按 `byteLength` 计算。",
    "- 覆盖基线: 以 `server-next` 当前已声明并实际接线的 next socket 事件面为准；仍依赖 legacy 的 client-next 兼容流量不计入这份审计。",
    "",
    "## 用例结果",
    "",
    "| 用例 | 时长(ms) | C2S 观测 | S2C 观测 |",
    "| --- | ---: | --- | --- |"
  ];
  report.caseResults.forEach(function (entry) {
    lines.push("| " + entry.name + " | " + entry.durationMs + " | " + (entry.c2s.join("<br>") || "-") + " | " + (entry.s2c.join("<br>") || "-") + " |");
  });
  lines.push("", "## 客户端到服务端覆盖", "", "| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |", "| --- | --- | --- | ---: | ---: | ---: | --- |");
  report.c2sRows.forEach(function (row) {
    lines.push("| " + row.eventName + " | `" + row.event + "` | " + (row.covered ? "是" : "否") + " | " + row.count + " | " + formatBytes(row.totalBytes) + " | " + formatBytes(row.averageBytes) + " | " + (row.caseNames.join("<br>") || "-") + " |");
  });
  lines.push("", "## 服务端到客户端覆盖", "", "| 事件名 | Wire Event | 已覆盖 | 次数 | 总流量 | 平均流量 | 用例 |", "| --- | --- | --- | ---: | ---: | ---: | --- |");
  report.s2cRows.forEach(function (row) {
    lines.push("| " + row.eventName + " | `" + row.event + "` | " + (row.covered ? "是" : "否") + " | " + row.count + " | " + formatBytes(row.totalBytes) + " | " + formatBytes(row.averageBytes) + " | " + (row.caseNames.join("<br>") || "-") + " |");
  });
  lines.push("", "## 流量汇总", "", "| 方向 | 事件名 | Wire Event | 次数 | 总流量 | 平均流量 | 用例 |", "| --- | --- | --- | ---: | ---: | ---: | --- |");
  report.trafficRows.forEach(function (row) {
    lines.push("| " + row.direction + " | " + row.eventName + " | `" + row.event + "` | " + row.count + " | " + formatBytes(row.totalBytes) + " | " + formatBytes(row.averageBytes) + " | " + (row.caseNames.join("<br>") || "-") + " |");
  });
  lines.push("", "## 未覆盖项", "");
  if (report.missing.length === 0) {
    lines.push("- 无。");
  }
  else {
    report.missing.forEach(function (entry) {
      lines.push("- " + entry.direction + "." + entry.eventName + ": `" + entry.event + "`");
    });
  }
  lines.push("", "## 备注", "", "- 报告由 `packages/server/src/tools/next-protocol-audit.ts` 自动生成。", "- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。", "");
  return lines.join("\n");
}
/**
 * main：执行main相关逻辑。
 * @returns 无返回值，直接更新main相关状态。
 */

async function main() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  var externalBaseUrl = envAlias.resolveServerNextShadowUrl();
/**
 * 记录requested端口。
 */
  var requestedPort = externalBaseUrl ? null : await lib.allocateFreePort();
/**
 * 记录base地址。
 */
  var baseUrl = externalBaseUrl || '';
/**
 * 记录auditor。
 */
  var auditor = lib.createAuditor({ c2s: NEXT_C2S, s2c: NEXT_S2C, expectedC2S: EXPECTED_C2S, expectedS2C: EXPECTED_S2C });
/**
 * 记录API。
 */
  var api = null;
/**
 * 记录cases。
 */
  var cases = [
    { name: "bootstrap-runtime", run: bootstrapCase },
    { name: "stat-panels", run: statPanelCase },
    { name: "craft-panels", run: craftPanelCase },
    { name: "heartbeat-chat", run: heartbeatChatCase },
    { name: "quest-navigation", run: navigateCase },
    { name: "portal-transfer", run: portalCase },
    { name: "session-kick", run: kickCase },
    { name: "error-path", run: errorCase },
    { name: "inventory-ops", run: inventoryOpsCase },
    { name: "player-controls", run: playerControlCase },
    { name: "npc-shop", run: shopCase },
    { name: "npc-detail-quests", run: detailQuestCase },
    { name: "pending-logbook-ack", run: pendingLogbookAckCase },
    ...(HAS_DATABASE ? [{ name: "redeem-codes", run: redeemCodesCase }] : []),
    ...(HAS_DATABASE ? [{ name: "gm-next", run: gmCase }] : []),
    { name: "suggestions", run: suggestionCase },
    { name: "mail", run: mailCase },
    { name: "progression-combat", run: progressionCase },
    { name: "loot", run: lootCase },
    { name: "market", run: marketCase },
  ];
/**
 * 汇总caseresults。
 */
  var caseResults = [];
/**
 * 记录服务端。
 */
  var server = null;
  try {
    if (!externalBaseUrl) {
      server = await lib.startIsolatedServer(requestedPort);
      baseUrl = "http://127.0.0.1:" + (server.serverPort ?? requestedPort);
      api = lib.createRuntimeApi(baseUrl);
      await lib.waitForHealth(baseUrl, 20000);
    }
    else {
      api = lib.createRuntimeApi(baseUrl);
    }
    STATIC_S2C_SURFACE_CHECKS.forEach(function (entry) {
      var result = lib.assertStaticProtocolEventSurface(entry);
      process.stdout.write("[next audit] static surface ok: " + result.label + " => " + result.members.join(', ') + "\n");
    });
    for (var i = 0; i < cases.length; i += 1) {
/**
 * 记录entry。
 */
      var entry = cases[i];
      process.stdout.write("[next audit] running " + entry.name + "\n");
/**
 * 记录startedat。
 */
      var startedAt = Date.now();
/**
 * 记录运行态。
 */
      var runtime = lib.createCaseRuntime({ baseUrl: baseUrl, api: api, auditor: auditor, caseName: entry.name });
      try {
        await entry.run(runtime);
        assertNoLegacyS2CEvents(runtime, entry.name);
      }
      finally {
        await runtime.cleanup();
      }
      caseResults.push({
        name: entry.name,
        durationMs: Date.now() - startedAt,
        c2s: auditor.listCaseEvents(entry.name, "c2s").filter(function (event) { return NEXT_C2S_SET.has(event); }).map(function (event) { return auditor.eventNames.c2s.get(event) || event; }),
        s2c: auditor.listCaseEvents(entry.name, "s2c").filter(function (event) { return NEXT_S2C_SET.has(event); }).map(function (event) { return auditor.eventNames.s2c.get(event) || event; })
      });
    }
  }
  finally {
    await lib.stopServer(server);
  }
/**
 * 汇总c2s行数据。
 */
  var c2sRows = auditor.buildCoverageRows("c2s");
/**
 * 汇总s2c行数据。
 */
  var s2cRows = auditor.buildCoverageRows("s2c");
/**
 * 记录missing。
 */
  var missing = auditor.buildMissing("c2s").map(function (entry) { return Object.assign({ direction: "c2s" }, entry); })
    .concat(auditor.buildMissing("s2c").map(function (entry) { return Object.assign({ direction: "s2c" }, entry); }));
/**
 * 记录markdown。
 */
  var markdown = render({
    generatedAt: new Date().toISOString(),
    baseUrl: baseUrl,
    serverMode: externalBaseUrl ? "external-server" : "isolated-server",
    caseResults: caseResults,
    c2sRows: c2sRows,
    s2cRows: s2cRows,
    trafficRows: auditor.buildTrafficRows().filter(function (row) { return row.direction === "c2s" ? NEXT_C2S_SET.has(row.event) : NEXT_S2C_SET.has(row.event); }),
    missing: missing,
  });
  fs.mkdirSync(path.dirname(DOC_OUTPUT), { recursive: true });
  fs.writeFileSync(DOC_OUTPUT, markdown, "utf8");
  process.stdout.write("[next audit] report written to " + DOC_OUTPUT + "\n");
  if (missing.length > 0) {
    throw new Error("next protocol audit has uncovered events: " + missing.map(function (entry) { return entry.direction + "." + entry.eventName; }).join(", "));
  }
}
void main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
