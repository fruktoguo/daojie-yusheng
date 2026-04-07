"use strict";
var fs = require("node:fs");
var path = require("node:path");
var shared = require("@mud/shared-next");
var envAlias = require("../config/env-alias");
var lib = require("./next-protocol-audit-lib");
var NEXT_C2S = shared.NEXT_C2S;
var NEXT_S2C = shared.NEXT_S2C;
var Direction = shared.Direction;
var NEXT_C2S_SET = new Set(Object.values(NEXT_C2S));
var NEXT_S2C_SET = new Set(Object.values(NEXT_S2C));
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
var DOC_OUTPUT = path.join(lib.repoRoot, "docs", "next-protocol-audit.md");
var HAS_DATABASE = Boolean(envAlias.resolveServerNextDatabaseUrl());
var EXPECTED_C2S = [
  NEXT_C2S.Hello,
  NEXT_C2S.Ping,
  NEXT_C2S.Move,
  NEXT_C2S.MoveTo,
  NEXT_C2S.NavigateQuest,
  NEXT_C2S.UseAction,
  NEXT_C2S.RequestDetail,
  NEXT_C2S.RequestTileDetail,
  NEXT_C2S.GmGetState,
  NEXT_C2S.GmSpawnBots,
  NEXT_C2S.GmRemoveBots,
  NEXT_C2S.GmUpdatePlayer,
  NEXT_C2S.GmResetPlayer,
  NEXT_C2S.RequestQuests,
  NEXT_C2S.RequestNpcQuests,
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
  NEXT_C2S.UpdateTechniqueSkillAvailability,
  NEXT_C2S.DebugResetSpawn,
  NEXT_C2S.Chat,
  NEXT_C2S.AckSystemMessages,
  NEXT_C2S.HeavenGateAction,
];
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
  NEXT_S2C.GmState,
  NEXT_S2C.Error,
  NEXT_S2C.Kick,
  NEXT_S2C.Pong,
];
if (HAS_DATABASE) {
  EXPECTED_C2S.push(NEXT_C2S.RedeemCodes);
  EXPECTED_S2C.push(NEXT_S2C.RedeemCodesResult);
}
function pid(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}
function slot(player, itemId) {
  var index = player.inventory.items.findIndex(function (entry) { return entry.itemId === itemId; });
  if (index < 0) {
    throw new Error("missing inventory slot for item: " + itemId);
  }
  return index;
}
function count(player, itemId) {
  var entry = player.inventory.items.find(function (item) { return item.itemId === itemId; });
  return entry ? entry.count : 0;
}
async function emitAndWait(socket, emitEvent, payload, responseEvent, predicate, timeoutMs) {
  var afterCount = socket.getEventCount(responseEvent);
  socket.emit(emitEvent, payload);
  return socket.waitForEventAfter(responseEvent, afterCount, predicate, timeoutMs);
}
async function requestMarketTradeHistoryUntilVisible(socket, timeoutMs) {
  return lib.waitForValue(async function () {
    var afterCount = socket.getEventCount(NEXT_S2C.MarketTradeHistory);
    socket.emit(NEXT_C2S.RequestMarketTradeHistory, { page: 1 });
    try {
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
async function waitForMarket(runtime, playerId, predicate, timeoutMs, label) {
  return lib.waitForValue(async function () {
    var market = await runtime.api.fetchMarket(playerId);
    return predicate(market) ? market : null;
  }, timeoutMs, label);
}
async function requestJson(baseUrl, pathname, init) {
  var body = init?.body === undefined ? undefined : JSON.stringify(init.body);
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
function parseJwtPayload(token) {
  if (typeof token !== 'string') {
    return null;
  }
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
function buildFallbackPlayerId(userId) {
  var normalized = typeof userId === 'string' ? userId.trim() : '';
  return normalized ? 'p_' + normalized : 'p_guest';
}
function buildUniqueDisplayName(seed) {
  var hash = 0;
  for (var index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  return String.fromCodePoint(0x4E00 + (hash % (0x9FFF - 0x4E00 + 1)));
}
async function registerAndLoginPlayer(baseUrl, suffix) {
  var short = suffix.slice(-8);
  var accountName = 'acct_' + short;
  var password = 'Pass_' + short;
  await requestJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      accountName: accountName,
      password: password,
      displayName: buildUniqueDisplayName('next-protocol-audit:' + suffix),
      roleName: '审角' + short.slice(-4),
    },
  });
  var login = await requestJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: {
      loginName: accountName,
      password: password,
    },
  });
  var payload = parseJwtPayload(login?.accessToken);
  if (!payload?.sub || typeof login?.accessToken !== 'string') {
    throw new Error('unexpected login payload: ' + JSON.stringify(login));
  }
  var playerId = typeof payload?.playerId === 'string' && payload.playerId.trim()
    ? payload.playerId.trim()
    : buildFallbackPlayerId(payload.sub);
  return {
    accessToken: login.accessToken,
    playerId: playerId,
  };
}
async function loginGm(baseUrl) {
  var password = envAlias.resolveServerNextGmPassword('admin123');
  var payload = await requestJson(baseUrl, '/auth/gm/login', {
    method: 'POST',
    body: { password: password },
  });
  if (typeof payload?.accessToken !== 'string' || !payload.accessToken) {
    throw new Error('unexpected GM login payload: ' + JSON.stringify(payload));
  }
  return payload.accessToken;
}
async function hello(runtime, socket, payload) {
  await socket.onceConnected();
  socket.emit(NEXT_C2S.Hello, payload);
  var initSession = await socket.waitForEvent(NEXT_S2C.InitSession);
  var playerId = typeof initSession?.pid === 'string' && initSession.pid.trim()
    ? initSession.pid.trim()
    : (typeof payload?.playerId === 'string' ? payload.playerId.trim() : '');
  if (playerId) {
    runtime.trackPlayer(playerId);
  }
  await socket.waitForEvent(NEXT_S2C.MapEnter);
  await socket.waitForEvent(NEXT_S2C.WorldDelta);
  await socket.waitForEvent(NEXT_S2C.SelfDelta);
  await socket.waitForEvent(NEXT_S2C.PanelDelta);
  await socket.waitForEvent(NEXT_S2C.Bootstrap);
  await socket.waitForEvent(NEXT_S2C.MapStatic);
  await socket.waitForEvent(NEXT_S2C.Realm);
  await socket.waitForEvent(NEXT_S2C.LootWindowUpdate);
  await socket.waitForEvent(NEXT_S2C.Quests);
  return {
    playerId: playerId,
    sessionId: typeof initSession?.sid === 'string' ? initSession.sid : '',
    initSession: initSession,
  };
}
function collectLegacyS2CEvents(runtime) {
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
function assertNoLegacyS2CEvents(runtime, caseName) {
  var legacyEvents = collectLegacyS2CEvents(runtime);
  if (legacyEvents.length === 0) {
    return;
  }
  var detail = legacyEvents
    .map(function (entry) { return caseName + ":" + entry.socket + ":" + entry.event; })
    .join(", ");
  throw new Error("next socket received legacy S2C events: " + detail);
}
async function bootstrapCase(runtime) {
  var socket = runtime.createSocket("runtime");
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  var playerId = session.playerId;
  await socket.waitForEvent(NEXT_S2C.PanelDelta, function (payload) {
    return !!(payload?.attr
      && Array.isArray(payload.attr.bonuses)
      && payload.attr.specialStats
      && Object.prototype.hasOwnProperty.call(payload.attr, 'boneAgeBaseYears')
      && Object.prototype.hasOwnProperty.call(payload.attr, 'lifeElapsedTicks')
      && Object.prototype.hasOwnProperty.call(payload.attr, 'realmProgressToNext'));
  }, 5000);
  var before = (await runtime.api.fetchState(playerId)).player;
  await emitAndWait(socket, NEXT_C2S.Ping, { clientAt: 1001 }, NEXT_S2C.Pong, function (payload) {
    return payload && payload.clientAt === 1001;
  }, 5000);
  socket.emit(NEXT_C2S.Move, { d: Direction.North });
  await lib.waitForState(runtime.api, playerId, function (player) { return player.x !== before.x || player.y !== before.y; }, 4000, "move");
  var moved = (await runtime.api.fetchState(playerId)).player;
  await emitAndWait(socket, NEXT_C2S.RequestTileDetail, { x: moved.x, y: moved.y }, NEXT_S2C.TileDetail, function (payload) {
    return payload && payload.x === moved.x && payload.y === moved.y;
  }, 5000);
}
async function heartbeatChatCase(runtime) {
  var sender = runtime.createSocket("chat:sender");
  var receiver = runtime.createSocket("chat:receiver");
  var senderSession = await hello(runtime, sender, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  var receiverSession = await hello(runtime, receiver, { mapId: "yunlai_town", preferredX: 33, preferredY: 5 });
  var senderId = senderSession.playerId;
  var receiverId = receiverSession.playerId;
  sender.emit(NEXT_C2S.Heartbeat, { clientAt: 2002 });
  await emitAndWait(sender, NEXT_C2S.Ping, { clientAt: 2003 }, NEXT_S2C.Pong, function (payload) {
    return payload && payload.clientAt === 2003;
  }, 5000);
  var noticeAfter = receiver.getEventCount(NEXT_S2C.Notice);
  var message = "协议审计聊天 " + senderId;
  sender.emit(NEXT_C2S.Chat, { message: message });
  await receiver.waitForEventAfter(NEXT_S2C.Notice, noticeAfter, function (payload) {
    return Array.isArray(payload?.items) && payload.items.some(function (item) {
      return item?.kind === 'chat' && item.text === message && item.from === senderId;
    });
  }, 5000);
}
async function navigateCase(runtime) {
  var socket = runtime.createSocket("navigate");
  var questId = "__audit_missing_quest__";
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  await emitAndWait(socket, NEXT_C2S.NavigateQuest, { questId: questId }, NEXT_S2C.QuestNavigateResult, function (payload) {
    return payload && payload.questId === questId;
  }, 5000);
}
async function portalCase(runtime) {
  var socket = runtime.createSocket("portal");
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 31, preferredY: 54 });
  await emitAndWait(socket, NEXT_C2S.UsePortal, {}, NEXT_S2C.MapEnter, function (payload) {
    return payload && payload.mid === "wildlands";
  }, 5000);
}
async function kickCase(runtime) {
  var auth = await registerAndLoginPlayer(runtime.baseUrl, pid("audit_kick"));
  var socket = runtime.createSocket("kick", { token: auth.accessToken, protocol: 'next' });
  var session = await hello(runtime, socket, {});
  var playerId = session.playerId;
  var kickAfter = socket.getEventCount(NEXT_S2C.Kick);
  await runtime.api.deletePlayer(playerId);
  await socket.waitForEventAfter(NEXT_S2C.Kick, kickAfter, function (payload) {
    return payload && typeof payload.reason === 'string' && payload.reason.length > 0;
  }, 5000);
}
async function errorCase(runtime) {
  var socket = runtime.createSocket("error");
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  await emitAndWait(socket, NEXT_C2S.RequestNpcShop, { npcId: "" }, NEXT_S2C.Error, function (payload) {
    return !!(payload && payload.message);
  }, 5000);
}
async function shopCase(runtime) {
  var socket = runtime.createSocket("shop");
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  var playerId = session.playerId;
  await runtime.api.grantItem(playerId, "spirit_stone", 30);
  var shop = await emitAndWait(socket, NEXT_C2S.RequestNpcShop, { npcId: "npc_herbalist_lan" }, NEXT_S2C.NpcShop, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && payload.shop && Array.isArray(payload.shop.items) && payload.shop.items.length > 0;
  }, 5000);
  var itemId = shop.shop.items[0].itemId;
  await emitAndWait(socket, NEXT_C2S.UseAction, { actionId: "npc_shop:npc_herbalist_lan" }, NEXT_S2C.NpcShop, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && payload.shop && Array.isArray(payload.shop.items) && payload.shop.items.length > 0;
  }, 5000);
  var before = count((await runtime.api.fetchState(playerId)).player, itemId);
  var noticeAfter = socket.getEventCount(NEXT_S2C.Notice);
  socket.emit(NEXT_C2S.BuyNpcShopItem, { npcId: "npc_herbalist_lan", itemId: itemId, quantity: 1 });
  await lib.waitForState(runtime.api, playerId, function (player) { return count(player, itemId) >= before + 1; }, 5000, "npcBuy");
  await socket.waitForEventAfter(NEXT_S2C.Notice, noticeAfter, function (payload) {
    return Array.isArray(payload && payload.items) && payload.items.length > 0;
  }, 5000);
}
async function detailQuestCase(runtime) {
  var socket = runtime.createSocket("detail");
  await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  await emitAndWait(socket, NEXT_C2S.RequestDetail, { kind: "npc", id: "npc_herbalist_lan" }, NEXT_S2C.Detail, function (payload) {
    return payload && payload.kind === "npc" && payload.id === "npc_herbalist_lan" && payload.npc && payload.npc.id === "npc_herbalist_lan";
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.RequestQuests, {}, NEXT_S2C.Quests, function (payload) {
    return payload && Array.isArray(payload.quests);
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.RequestNpcQuests, { npcId: "npc_herbalist_lan" }, NEXT_S2C.NpcQuests, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && Array.isArray(payload.quests);
  }, 5000);
  var npcQuestAfter = socket.getEventCount(NEXT_S2C.NpcQuests);
  var questRefreshAfter = socket.getEventCount(NEXT_S2C.Quests);
  socket.emit(NEXT_C2S.UseAction, { actionId: "npc_quests:npc_herbalist_lan" });
  await socket.waitForEventAfter(NEXT_S2C.NpcQuests, npcQuestAfter, function (payload) {
    return payload && payload.npcId === "npc_herbalist_lan" && Array.isArray(payload.quests);
  }, 5000);
  await socket.waitForEventAfter(NEXT_S2C.Quests, questRefreshAfter, function (payload) {
    return Array.isArray(payload && payload.quests);
  }, 5000);
}
async function pendingLogbookAckCase(runtime) {
  var auth = await registerAndLoginPlayer(runtime.baseUrl, pid("audit_logbook"));
  var playerId = auth.playerId;
  var messageId = "logbook_" + playerId;
  runtime.trackPlayer(playerId);
  await runtime.api.connectPlayer({
    playerId: playerId,
    mapId: "yunlai_town",
    preferredX: 32,
    preferredY: 5,
  });
  await runtime.api.queuePendingLogbookMessage(playerId, {
    id: messageId,
    kind: "grudge",
    text: "协议审计待确认 " + playerId,
    from: "系统审计",
      at: 1711929600000,
  });
  var socket = runtime.createSocket("logbook", { token: auth.accessToken, protocol: 'next' });
  await socket.onceConnected();
  await socket.waitForEvent(NEXT_S2C.InitSession, function (payload) {
    return payload && payload.pid === playerId;
  }, 5000);
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
async function inventoryOpsCase(runtime) {
  var socket = runtime.createSocket("inventory");
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  var playerId = session.playerId;
  await runtime.api.grantItem(playerId, "spirit_stone", 2);
  await runtime.api.grantItem(playerId, "rat_tail", 1);
  var state = (await runtime.api.fetchState(playerId)).player;
  var spiritBeforeIndex = slot(state, "spirit_stone");
  var ratBeforeIndex = slot(state, "rat_tail");
  socket.emit(NEXT_C2S.SortInventory, {});
  await lib.waitForState(runtime.api, playerId, function (player) {
    return slot(player, "rat_tail") < slot(player, "spirit_stone") && slot(player, "spirit_stone") !== spiritBeforeIndex && slot(player, "rat_tail") !== ratBeforeIndex;
  }, 5000, "sortInventory");
  state = (await runtime.api.fetchState(playerId)).player;
  var beforeCount = count(state, "spirit_stone");
  socket.emit(NEXT_C2S.DestroyItem, { slotIndex: slot(state, "spirit_stone"), count: 1 });
  await lib.waitForState(runtime.api, playerId, function (player) {
    return count(player, "spirit_stone") === Math.max(0, beforeCount - 1);
  }, 5000, "destroyItem");
}
async function playerControlCase(runtime) {
  var socket = runtime.createSocket("controls");
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 31, preferredY: 54 });
  var playerId = session.playerId;
  var player = (await runtime.api.fetchState(playerId)).player;
  socket.emit(NEXT_C2S.UseItem, { slotIndex: slot(player, "book.qingmu_sword") });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current.techniques.techniques.some(function (entry) { return entry.techId === "qingmu_sword"; });
  }, 5000, "unlockSkillForAutoBattle");
  socket.emit(NEXT_C2S.UpdateAutoBattleSkills, {
    skills: [{ skillId: "skill.qingmu_slash", enabled: true }],
  });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return Array.isArray(current.combat.autoBattleSkills)
      && current.combat.autoBattleSkills.some(function (entry) { return entry.skillId === "skill.qingmu_slash" && entry.enabled === true; });
  }, 5000, "updateAutoBattleSkills");
  var panelDeltaAfter = socket.getEventCount(NEXT_S2C.PanelDelta);
  socket.emit(NEXT_C2S.UpdateTechniqueSkillAvailability, {
    techId: "qingmu_sword",
    enabled: false,
  });
  await lib.waitForState(runtime.api, playerId, function (current) {
    return Array.isArray(current.combat.autoBattleSkills)
      && current.combat.autoBattleSkills.some(function (entry) { return entry.skillId === "skill.qingmu_slash" && entry.skillEnabled === false; });
  }, 5000, "updateTechniqueSkillAvailability");
  await socket.waitForEventAfter(NEXT_S2C.PanelDelta, panelDeltaAfter, function (payload) {
    var techniquePatched = payload?.tech?.techniques?.some(function (entry) { return entry.techId === "qingmu_sword" && entry.skillsEnabled === false; });
    var actionPatched = payload?.act?.actions?.some(function (entry) { return entry.id === "skill.qingmu_slash" && entry.skillEnabled === false; });
    return techniquePatched === true && actionPatched === true;
  }, 5000);
  await emitAndWait(socket, NEXT_C2S.UsePortal, {}, NEXT_S2C.MapEnter, function (payload) {
    return payload && payload.mid === "wildlands";
  }, 5000);
  socket.emit(NEXT_C2S.DebugResetSpawn, {});
  await lib.waitForState(runtime.api, playerId, function (current) {
    return current.templateId === "yunlai_town";
  }, 5000, "debugResetSpawn");
  var noticeAfter = socket.getEventCount(NEXT_S2C.Notice);
  socket.emit(NEXT_C2S.HeavenGateAction, { action: "open" });
  await socket.waitForEventAfter(NEXT_S2C.Notice, noticeAfter, function (payload) {
    return Array.isArray(payload?.items) && payload.items.some(function (item) {
      return item?.text === "当前境界不可开天门";
    });
  }, 5000);
}
async function redeemCodesCase(runtime) {
  var gmToken = await loginGm(runtime.baseUrl);
  var created = await requestJson(runtime.baseUrl, '/gm/redeem-code-groups', {
    method: 'POST',
    token: gmToken,
    body: {
      name: '协议审计兑换码',
      rewards: [{ itemId: 'spirit_stone', count: 4 }],
      count: 1,
    },
  });
  var code = Array.isArray(created?.codes) ? created.codes[0] : '';
  if (!code) {
    throw new Error('unexpected redeem create payload: ' + JSON.stringify(created));
  }
  var socket = runtime.createSocket('redeem');
  var session = await hello(runtime, socket, { mapId: 'yunlai_town', preferredX: 32, preferredY: 5 });
  var playerId = session.playerId;
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
async function gmCase(runtime) {
  var auth = await registerAndLoginPlayer(runtime.baseUrl, pid('audit_gm_auth'));
  var gmToken = await loginGm(runtime.baseUrl);
  var socket = runtime.createSocket('gm', { token: auth.accessToken, gmToken: gmToken, protocol: 'next' });
  var session = await hello(runtime, socket, { mapId: 'yunlai_town', preferredX: 32, preferredY: 5 });
  var playerId = session.playerId;
  var gmState = await emitAndWait(socket, NEXT_C2S.GmGetState, {}, NEXT_S2C.GmState, function (payload) {
    return Array.isArray(payload?.players) && Array.isArray(payload?.mapIds);
  }, 5000);
  var botCount = Number(gmState?.botCount ?? 0);
  gmState = await emitAndWait(socket, NEXT_C2S.GmSpawnBots, { count: 1 }, NEXT_S2C.GmState, function (payload) {
    return Number(payload?.botCount ?? 0) >= botCount + 1;
  }, 8000);
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
    return Number(payload?.botCount ?? 0) === 0;
  }, 8000);
}
async function suggestionCase(runtime) {
  var socket = runtime.createSocket("suggestion");
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  var playerId = session.playerId;
  await emitAndWait(socket, NEXT_C2S.RequestSuggestions, {}, NEXT_S2C.SuggestionUpdate, function () { return true; }, 5000);
  var title = "协议审计 " + playerId;
  var created = await emitAndWait(socket, NEXT_C2S.CreateSuggestion, { title: title, description: "protocol audit" }, NEXT_S2C.SuggestionUpdate, function (payload) {
    return payload && payload.suggestions && payload.suggestions.some(function (entry) { return entry.title === title; });
  }, 5000);
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
}
async function mailCase(runtime) {
  var socket = runtime.createSocket("mail");
  var session = await hello(runtime, socket, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  var playerId = session.playerId;
  await runtime.api.createDirectMail(playerId, { fallbackTitle: "审计邮件", fallbackBody: "next protocol audit", senderLabel: "system", attachments: [{ itemId: "rat_tail", count: 2 }] });
  await emitAndWait(socket, NEXT_C2S.RequestMailSummary, {}, NEXT_S2C.MailSummary, function (payload) {
    return payload && payload.summary && (payload.summary.unreadCount >= 1 || payload.summary.claimableCount >= 1 || payload.summary.revision >= 1);
  }, 5000);
  var page = await emitAndWait(socket, NEXT_C2S.RequestMailPage, { page: 1, pageSize: 20 }, NEXT_S2C.MailPage, function (payload) {
    return payload && payload.page && payload.page.items && payload.page.items.length > 0;
  }, 5000);
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
async function progressionCase(runtime) {
  var attacker = runtime.createSocket("combat:attacker");
  var defender = runtime.createSocket("combat:defender");
  var attackerSession = await hello(runtime, attacker, { mapId: "yunlai_town", preferredX: 24, preferredY: 5 });
  var defenderSession = await hello(runtime, defender, { mapId: "yunlai_town", preferredX: 25, preferredY: 5 });
  var attackerId = attackerSession.playerId;
  var defenderId = defenderSession.playerId;
  var player = (await runtime.api.fetchState(attackerId)).player;
  attacker.emit(NEXT_C2S.UseItem, { slotIndex: slot(player, "book.qingmu_sword") });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.techniques.techniques.some(function (entry) { return entry.techId === "qingmu_sword"; }); }, 5000, "learn");
  await runtime.api.grantItem(attackerId, "equip.road_cleaver", 1);
  player = (await runtime.api.fetchState(attackerId)).player;
  attacker.emit(NEXT_C2S.Equip, { slotIndex: slot(player, "equip.road_cleaver") });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.equipment.slots.some(function (entry) { return entry.slot === "weapon" && entry.item && entry.item.itemId === "equip.road_cleaver"; }); }, 5000, "equip");
  attacker.emit(NEXT_C2S.Cultivate, { techId: "qingmu_sword" });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.techniques.cultivatingTechId === "qingmu_sword"; }, 5000, "cultivate");
  attacker.emit(NEXT_C2S.Unequip, { slot: "weapon" });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.equipment.slots.some(function (entry) { return entry.slot === "weapon" && entry.item === null; }); }, 5000, "unequip");
  await runtime.api.setVitals(attackerId, { hp: 50, qi: 60 });
  player = (await runtime.api.fetchState(attackerId)).player;
  attacker.emit(NEXT_C2S.UseItem, { slotIndex: slot(player, "pill.minor_heal") });
  await lib.waitForState(runtime.api, attackerId, function (current) { return current.hp > 50; }, 5000, "heal");
  attacker.emit(NEXT_C2S.CastSkill, { skillId: "skill.qingmu_slash", targetPlayerId: defenderId });
  await lib.waitForState(runtime.api, defenderId, function (current) { return current.hp < 120; }, 8000, "cast");
}
async function lootCase(runtime) {
  var dropper = runtime.createSocket("loot:dropper");
  var looter = runtime.createSocket("loot:looter");
  var dropperSession = await hello(runtime, dropper, { mapId: "yunlai_town", preferredX: 32, preferredY: 5 });
  var looterSession = await hello(runtime, looter, { mapId: "yunlai_town", preferredX: 33, preferredY: 5 });
  var dropperId = dropperSession.playerId;
  var looterId = looterSession.playerId;
  await runtime.api.grantItem(dropperId, "rat_tail", 2);
  var dropperState = (await runtime.api.fetchState(dropperId)).player;
  var looterState = (await runtime.api.fetchState(looterId)).player;
  var worldDeltaAfter = looter.getEventCount(NEXT_S2C.WorldDelta);
  dropper.emit(NEXT_C2S.DropItem, { slotIndex: slot(dropperState, "rat_tail"), count: 2 });
  var pileEvent = await looter.waitForEventAfter(NEXT_S2C.WorldDelta, worldDeltaAfter, function (payload) {
    return Array.isArray(payload && payload.g) && payload.g.some(function (entry) { return entry.x === dropperState.x && entry.y === dropperState.y; });
  }, 5000);
  var pile = pileEvent.g.find(function (entry) { return entry.x === dropperState.x && entry.y === dropperState.y && Array.isArray(entry.items); });
  dropper.emit(NEXT_C2S.Move, { d: Direction.North });
  await lib.waitForState(runtime.api, dropperId, function (player) { return player.x !== dropperState.x || player.y !== dropperState.y; }, 5000, "lootDropperMoveAway");
  looter.emit(NEXT_C2S.MoveTo, { x: dropperState.x, y: dropperState.y, allowNearestReachable: false });
  await lib.waitForState(runtime.api, looterId, function (player) { return player.x === dropperState.x && player.y === dropperState.y; }, 5000, "lootMoveTo");
  looter.emit(NEXT_C2S.TakeGround, { sourceId: pile.sourceId, itemKey: "rat_tail" });
  await lib.waitForState(runtime.api, looterId, function (player) { return count(player, "rat_tail") >= count(looterState, "rat_tail") + 2; }, 5000, "takeGround");
}
async function marketCase(runtime) {
  var seller = runtime.createSocket("market:seller");
  var buyer = runtime.createSocket("market:buyer");
  var storageSeller = runtime.createSocket("market:storage-seller");
  var storageBuyer = runtime.createSocket("market:storage-buyer");
  var storageItemId = "serpent_gall";
  var sellerSession = await hello(runtime, seller, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  var buyerSession = await hello(runtime, buyer, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  var storageSellerSession = await hello(runtime, storageSeller, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  var storageBuyerSession = await hello(runtime, storageBuyer, { mapId: "yunlai_town", preferredX: 39, preferredY: 33 });
  var sellerId = sellerSession.playerId;
  var buyerId = buyerSession.playerId;
  var storageSellerId = storageSellerSession.playerId;
  var storageBuyerId = storageBuyerSession.playerId;
  await emitAndWait(seller, NEXT_C2S.RequestMarket, {}, NEXT_S2C.MarketUpdate, function () { return true; }, 5000);
  await emitAndWait(buyer, NEXT_C2S.RequestMarket, {}, NEXT_S2C.MarketUpdate, function () { return true; }, 5000);
  await emitAndWait(storageBuyer, NEXT_C2S.RequestMarket, {}, NEXT_S2C.MarketUpdate, function () { return true; }, 5000);
  await runtime.api.grantItem(sellerId, "rat_tail", 4);
  await runtime.api.grantItem(buyerId, "spirit_stone", 40);
  var sellerState = (await runtime.api.fetchState(sellerId)).player;
  var listed = await emitAndWait(seller, NEXT_C2S.CreateMarketSellOrder, { slotIndex: slot(sellerState, "rat_tail"), quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; });
  }, 5000);
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
  var buyFulfilledAt = count((await runtime.api.fetchState(buyerId)).player, "rat_tail");
  seller.emit(NEXT_C2S.SellMarketItem, { slotIndex: slot(sellerState, "rat_tail"), quantity: 1 });
  await lib.waitForState(runtime.api, buyerId, function (player) { return count(player, "rat_tail") >= buyFulfilledAt + 1; }, 5000, "sellNow");
  sellerState = (await runtime.api.fetchState(sellerId)).player;
  var own = await emitAndWait(seller, NEXT_C2S.CreateMarketSellOrder, { slotIndex: slot(sellerState, "rat_tail"), quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; });
  }, 5000);
  var orderId = own.myOrders.find(function (entry) { return entry.side === "sell" && entry.item && entry.item.itemId === "rat_tail"; }).id;
  await emitAndWait(seller, NEXT_C2S.CancelMarketOrder, { orderId: orderId }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.every(function (entry) { return entry.id !== orderId; });
  }, 5000);
  await runtime.api.grantItem(storageBuyerId, "spirit_stone", 20);
  var storageBuyerState = (await runtime.api.fetchState(storageBuyerId)).player;
  var storageBuyerCapacity = Math.max(1, Math.trunc(storageBuyerState.inventory.capacity || 0));
  var fillCount = storageBuyerCapacity - storageBuyerState.inventory.items.length;
  if (fillCount <= 0) {
    throw new Error("expected storage buyer inventory to have free slots before fill");
  }
  var blockedIds = new Set(storageBuyerState.inventory.items.map(function (entry) { return entry.itemId; }));
  blockedIds.add(storageItemId);
  var fillerIds = lib.loadUniqueItemIds().filter(function (itemId) { return !blockedIds.has(itemId); }).slice(0, fillCount);
  if (fillerIds.length !== fillCount) {
    throw new Error("not enough unique filler items to fill storage buyer inventory");
  }
  for (var i = 0; i < fillerIds.length; i += 1) {
    await runtime.api.grantItem(storageBuyerId, fillerIds[i], 1);
  }
  var fillerIdSet = new Set(fillerIds);
  await lib.waitForState(runtime.api, storageBuyerId, function (player) { return player.inventory.items.length >= storageBuyerCapacity; }, 10000, "fillInventory");
  await emitAndWait(storageBuyer, NEXT_C2S.CreateMarketBuyOrder, { itemId: storageItemId, quantity: 1, unitPrice: 1 }, NEXT_S2C.MarketUpdate, function (payload) {
    return payload && payload.myOrders && payload.myOrders.some(function (entry) { return entry.side === "buy" && entry.item && entry.item.itemId === storageItemId; });
  }, 5000);
  await runtime.api.grantItem(storageSellerId, storageItemId, 1);
  var storageSellerState = (await runtime.api.fetchState(storageSellerId)).player;
  var storageUpdateAfter = storageBuyer.getEventCount(NEXT_S2C.MarketUpdate);
  storageSeller.emit(NEXT_C2S.SellMarketItem, { slotIndex: slot(storageSellerState, storageItemId), quantity: 1 });
  await storageBuyer.waitForEventAfter(NEXT_S2C.MarketUpdate, storageUpdateAfter, function (payload) {
    return payload && payload.storage && Array.isArray(payload.storage.items) && payload.storage.items.some(function (entry) { return entry.itemId === storageItemId; });
  }, 8000);
  await waitForMarket(runtime, storageBuyerId, function (market) {
    return market && market.storage && Array.isArray(market.storage.items) && market.storage.items.some(function (entry) { return entry.itemId === storageItemId; });
  }, 8000, "marketStorageDeliver");
  storageBuyerState = (await runtime.api.fetchState(storageBuyerId)).player;
  var fillerSlot = storageBuyerState.inventory.items.findIndex(function (entry) { return fillerIdSet.has(entry.itemId); });
  if (fillerSlot < 0) {
    throw new Error("failed to find filler slot for market storage claim");
  }
  storageBuyer.emit(NEXT_C2S.DropItem, { slotIndex: fillerSlot, count: 1 });
  await lib.waitForState(runtime.api, storageBuyerId, function (player) { return player.inventory.items.length <= storageBuyerCapacity - 1; }, 5000, "freeSlot");
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
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return bytes + " B";
  }
  return (bytes / 1024).toFixed(2) + " KB";
}
function render(report) {
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
  lines.push("", "## 备注", "", "- 报告由 `packages/server-next/src/tools/next-protocol-audit.js` 自动生成。", "- 本次审计主要是黑盒协议回归，不覆盖浏览器 UI、深色模式、手机布局。", "");
  return lines.join("\n");
}
async function main() {
  var externalBaseUrl = envAlias.resolveServerNextShadowUrl();
  var requestedPort = externalBaseUrl ? null : await lib.allocateFreePort();
  var baseUrl = externalBaseUrl || '';
  var auditor = lib.createAuditor({ c2s: NEXT_C2S, s2c: NEXT_S2C, expectedC2S: EXPECTED_C2S, expectedS2C: EXPECTED_S2C });
  var api = null;
  var cases = [
    { name: "bootstrap-runtime", run: bootstrapCase },
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
    { name: "gm-next", run: gmCase },
    { name: "suggestions", run: suggestionCase },
    { name: "mail", run: mailCase },
    { name: "progression-combat", run: progressionCase },
    { name: "loot", run: lootCase },
    { name: "market", run: marketCase },
  ];
  var caseResults = [];
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
    for (var i = 0; i < cases.length; i += 1) {
      var entry = cases[i];
      process.stdout.write("[next audit] running " + entry.name + "\n");
      var startedAt = Date.now();
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
  var c2sRows = auditor.buildCoverageRows("c2s");
  var s2cRows = auditor.buildCoverageRows("s2c");
  var missing = auditor.buildMissing("c2s").map(function (entry) { return Object.assign({ direction: "c2s" }, entry); })
    .concat(auditor.buildMissing("s2c").map(function (entry) { return Object.assign({ direction: "s2c" }, entry); }));
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
