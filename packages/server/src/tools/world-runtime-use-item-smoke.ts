import assert from 'node:assert/strict';

import { WorldRuntimeUseItemService } from '../runtime/world/world-runtime-use-item.service';

type SmokeLog = unknown[][];

interface UseItemDepsOverrides {
    location?: { instanceId: string };
    instance?: Record<string, unknown>;
}

interface TechniqueRefiningOverrides {
    building?: {
        id: string;
        defId: string;
        state: string;
        x: number;
        y: number;
    };
}

interface ServiceOverrides {
    log: SmokeLog;
    playerX?: number;
    playerY?: number;
    playerSectId?: string | null;
    consumeItemByItemIdResult?: boolean;
}
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log: SmokeLog, overrides: UseItemDepsOverrides = {}) {
    return {    
    /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) { log.push(['refreshQuestStates', playerId]); },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone, _castId, _combat, structured) {
            log.push(structured?.key === 'notice.item.open-panel'
                ? ['queuePlayerNotice', playerId, message, tone, structured]
                : ['queuePlayerNotice', playerId, message, tone]);
        },
        /**
 * advanceLearnTechniqueQuest：执行advanceLearn功法任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新advanceLearn功法任务相关状态。
 */

        advanceLearnTechniqueQuest(playerId, techniqueId) { log.push(['advanceLearnTechniqueQuest', playerId, techniqueId]); },        
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() { return overrides.location ?? { instanceId: 'instance:1' }; },
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return overrides.instance ?? this.getInstanceRuntimeOrThrow(instanceId);
        },
        getInstanceRuntimeOrThrow() {
            return overrides.instance ?? {
            meta: {
                instanceId: 'public:wildlands',
            },
            template: {
                id: 'wildlands',
                name: '荒原',
                spawnX: 99,
                spawnY: 99,
                portals: [],
                npcs: [],
            },
            isPointInSafeZone() { return false; },
            isSafeZoneTile() { return false; },
            listAllPortals() { return []; },
            /**
	 * addTileResource：处理TileResource并更新相关状态。
	 * @param resourceKey 资源键。
	 * @param x X 坐标。
 * @param y Y 坐标。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新TileResource相关状态。
 */

                addTileResource(resourceKey, x, y, amount) {
                    log.push(['addTileResource', resourceKey, x, y, amount]);
                    return 7;
                },
            };
        },
    };
}

function createTechniqueRefiningDeps(log: SmokeLog, overrides: TechniqueRefiningOverrides = {}) {
    const building = overrides.building ?? {
        id: 'building:technique-refining',
        defId: 'technique_refining_table',
        state: 'active',
        x: 3,
        y: 4,
    };
    return createDeps(log, {
        location: { instanceId: 'instance:technique-refining' },
        instance: {
            buildingById: new Map([[building.id, building]]),
        },
    });
}
/**
 * createService：构建并返回目标对象。
 * @param overrides 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(overrides: ServiceOverrides) {
    const playerRuntimeService = {    
    /**
 * peekInventoryItem：执行peek背包道具相关逻辑。
 * @returns 无返回值，直接更新peek背包道具相关状态。
 */

        peekInventoryItem() { return null; },        
        peekInventoryItemByInstanceId(playerId, itemInstanceId) { return this.peekInventoryItem(playerId, itemInstanceId); },
        /**
 * hasUnlockedMap：判断Unlocked地图是否满足条件。
 * @returns 无返回值，完成Unlocked地图的条件判断。
 */

        hasUnlockedMap() { return false; },        
        /**
 * unlockMap：执行unlock地图相关逻辑。
 * @param playerId 玩家 ID。
 * @param mapId 地图 ID。
 * @returns 无返回值，直接更新unlock地图相关状态。
 */

        unlockMap(playerId, mapId) { overrides.log.push(['unlockMap', playerId, mapId]); },        
        /**
 * bindRespawnPoint：绑定玩家复活点。
 * @param playerId 玩家 ID。
 * @param mapId 地图 ID。
 * @returns 返回是否发生变化。
 */

        bindRespawnPoint(playerId, mapId) { overrides.log.push(['bindRespawnPoint', playerId, mapId]); return true; },        
        bindRespawnPointToPlacement(playerId, placement) { overrides.log.push(['bindRespawnPointToPlacement', playerId, placement.templateId, placement.instanceId, placement.x, placement.y]); return true; },
        /**
 * consumeInventoryItem：执行consume背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具相关状态。
 */

        consumeInventoryItem(playerId, slotIndex, count) { overrides.log.push(['consumeInventoryItem', playerId, slotIndex, count]); },        
        consumeInventoryItemByInstanceId(playerId, itemInstanceId, count) { this.consumeInventoryItem(playerId, itemInstanceId, count); },
        /**
 * useItem：执行use道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新use道具相关状态。
 */

        useItem(playerId, slotIndex) { overrides.log.push(['useItem', playerId, slotIndex]); },        
        useItemByInstanceId(playerId, itemInstanceId) { this.useItem(playerId, itemInstanceId); },
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() {
            return {
                x: overrides.playerX ?? 3,
                y: overrides.playerY ?? 4,
                sectId: overrides.playerSectId ?? null,
                techniques: { techniques: [] },
            };
        },
        addPendingTechniqueComprehensionById(playerId, techniqueId, sourceKind, creatorPlayerId, options) {
            overrides.log.push([
                'addPendingTechniqueComprehensionById',
                playerId,
                techniqueId,
                sourceKind,
                creatorPlayerId,
                options,
            ]);
            return true;
        },
        consumeItemByItemId(playerId, itemId, count) {
            overrides.log.push(['consumeItemByItemId', playerId, itemId, count]);
            return overrides.consumeItemByItemIdResult ?? true;
        },
        receiveInventoryItem(playerId, item) {
            overrides.log.push(['receiveInventoryItem', playerId, item]);
        },
    };
    const contentTemplateRepository = {    
    /**
 * getLearnTechniqueId：读取Learn功法ID。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成Learn功法ID的读取/组装。
 */

        getLearnTechniqueId(itemId) {
            return itemId === 'manual_scroll' ? 'technique.scroll' : null;
        },
        createTechniqueState(techniqueId) {
            if (techniqueId === 'gen_refining_smoke') {
                return {
                    techId: techniqueId,
                    name: '炼法烟测诀',
                    category: 'arts',
                    realmLv: 4,
                    grade: 'yellow',
                    level: 1,
                    layers: [{ level: 1 }, { level: 2 }, { level: 3 }, { level: 4 }],
                };
            }
            if (techniqueId === 'technique.refining.smoke') {
                return {
                    techId: techniqueId,
                    name: '系统炼法烟测诀',
                    category: 'arts',
                    realmLv: 4,
                    grade: 'yellow',
                    level: 1,
                    layers: [{ level: 1 }, { level: 2 }, { level: 3 }, { level: 4 }],
                };
            }
            if (techniqueId === 'technique.scroll') {
                return {
                    techId: techniqueId,
                    name: '功法玉简',
                    realmLv: 1,
                    grade: 'mortal',
                    level: 1,
                    layers: [{ level: 1 }],
                };
            }
            return null;
        },
    };
    const templateRepository = {    
    /**
 * has：判断ha是否满足条件。
 * @param mapId 地图 ID。
 * @returns 无返回值，完成地图、标识的条件判断。
 */

        has(mapId) { return ['wildlands', 'yunlai_town', 'yunlai_town_ore_basement'].includes(mapId); },
        resolveMapGroupMembers(mapRef) {
            if (mapRef === '云来镇' || mapRef === 'yunlai_town') {
                return ['yunlai_town', 'yunlai_town_ore_basement'];
            }
            return this.has(mapRef) ? [mapRef] : [];
        },
        resolveMapGroupLabel(mapRef) {
            return mapRef === '云来镇' || mapRef === 'yunlai_town' ? '云来镇' : '';
        },
        /**
 * getOrThrow：读取OrThrow。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow(mapId) { return { name: mapId === 'wildlands' ? '荒原' : '云来镇' }; },
    };
    return new WorldRuntimeUseItemService(contentTemplateRepository, templateRepository, playerRuntimeService);
}
/**
 * testMapUnlockBranch：执行test地图UnlockBranch相关逻辑。
 * @returns 无返回值，直接更新test地图UnlockBranch相关状态。
 */


async function testMapUnlockBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'map_scroll', name: '荒原图志', mapUnlockIds: ['wildlands'] });
    await service.dispatchUseItem('player:1', 2, createDeps(log));
    assert.deepEqual(log, [
        ['unlockMap', 'player:1', 'wildlands'],
        ['consumeInventoryItem', 'player:1', 2, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '已解锁地图：荒原', 'success'],
    ]);
}
async function testMapGroupUnlockBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'map_scroll', name: '云来图志', mapUnlockId: '云来镇' });
    await service.dispatchUseItem('player:1', 2, createDeps(log));
    assert.deepEqual(log, [
        ['unlockMap', 'player:1', 'yunlai_town'],
        ['unlockMap', 'player:1', 'yunlai_town_ore_basement'],
        ['consumeInventoryItem', 'player:1', 2, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '已解锁地图：云来镇', 'success'],
    ]);
}
/**
 * testTileAuraBranch：执行testTileAuraBranch相关逻辑。
 * @returns 无返回值，直接更新testTileAuraBranch相关状态。
 */


function testTileAuraBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'spirit_dust',
        name: '灵尘',
        tileResourceGains: [{ resourceKey: 'aura.refined.neutral', amount: 3 }],
    });
    service.dispatchUseItem('player:1', 1, createDeps(log));
    assert.deepEqual(log, [
        ['addTileResource', 'aura.refined.neutral', 3, 4, 3],
        ['consumeInventoryItem', 'player:1', 1, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 灵尘，当前地块灵气提升至 7', 'success'],
    ]);
}
/**
 * testBloodEssenceBatchBranch：执行test血精石BatchBranch相关逻辑。
 * @returns 无返回值，直接更新test血精石BatchBranch相关状态。
 */


function testBloodEssenceBatchBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'stone.blood_essence',
        name: '血精石',
        count: 4,
        allowBatchUse: true,
        tileResourceGains: [{ resourceKey: 'sha.refined.neutral', amount: 10 }],
    });
    service.dispatchUseItem('player:1', 1, createDeps(log), { count: 3 });
    assert.deepEqual(log, [
        ['addTileResource', 'sha.refined.neutral', 3, 4, 30],
        ['consumeInventoryItem', 'player:1', 1, 3],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 血精石 x3，当前地块煞气提升至 7', 'success'],
    ]);
}
async function testTileResourceProtectedTileRejectsUse() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'spirit_stone',
        name: '灵石',
        count: 2,
        allowBatchUse: true,
        tileAuraGainAmount: 100,
    });
    const deps = createDeps(log);
    deps.getInstanceRuntimeOrThrow = () => ({
        template: {
            id: 'wildlands',
            spawnX: 3,
            spawnY: 4,
            portals: [],
            npcs: [],
        },
        isPointInSafeZone() { return false; },
        isSafeZoneTile() { return false; },
        listAllPortals() { return []; },
        addTileResource(resourceKey, x, y, amount) {
            log.push(['addTileResource', resourceKey, x, y, amount]);
            return 7;
        },
    });
    await assert.rejects(
        () => service.dispatchUseItem('player:1', 1, deps, { count: 2 }),
        /无法使用地块资源道具/,
    );
    assert.deepEqual(log, []);
}
/**
 * testRespawnBindBranch：执行test复活绑定Branch相关逻辑。
 * @returns 无返回值，直接更新test复活绑定Branch相关状态。
 */


async function testRespawnBindBranch() {
    const log = [];
    const service = createService({ log });
    service.templateRepository.has = (mapId) => mapId === 'yunlai_town';
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'legacy_respawn_scroll', name: '旧复活符', respawnBindMapId: 'yunlai_town' });
    await service.dispatchUseItem('player:1', 4, createDeps(log));
    assert.deepEqual(log, [
        ['bindRespawnPoint', 'player:1', 'yunlai_town'],
        ['consumeInventoryItem', 'player:1', 4, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '复活点与遁返落点已绑定：云来镇', 'success'],
    ]);
}
async function testCurrentRespawnBindBranchUsesCurrentAllowedMap() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'fate_stone', name: '命石', useBehavior: 'bind_current_respawn' });
    const deps = createDeps(log);
    deps.getPlayerLocationOrThrow = () => ({ instanceId: 'public:qizhen_crossing' });
    deps.getInstanceRuntimeOrThrow = () => ({
        meta: { instanceId: 'public:qizhen_crossing' },
        template: { id: 'qizhen_crossing', name: '栖真渡', spawnX: 29, spawnY: 15 },
    });
    await service.dispatchUseItem('player:1', 5, deps);
    assert.deepEqual(log, [
        ['bindRespawnPointToPlacement', 'player:1', 'qizhen_crossing', 'public:qizhen_crossing', 29, 15],
        ['consumeInventoryItem', 'player:1', 5, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '复活点与遁返落点已绑定：栖真渡', 'success'],
    ]);
}
async function testCurrentRespawnBindRejectsDisallowedMapWithoutConsume() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'fate_stone', name: '命石', useBehavior: 'bind_current_respawn' });
    await assert.rejects(
        () => service.dispatchUseItem('player:1', 5, createDeps(log)),
        /命石只能在云来镇、栖真渡、云墟台或自己所属宗门使用/,
    );
    assert.deepEqual(log, []);
}
async function testCurrentRespawnBindAllowsOwnSectMap() {
    const log = [];
    const service = createService({ log, playerSectId: 'sect:alpha' });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'fate_stone', name: '命石', useBehavior: 'bind_current_respawn' });
    const deps = createDeps(log);
    deps.getPlayerLocationOrThrow = () => ({ instanceId: 'sect:alpha:main' });
    deps.getInstanceRuntimeOrThrow = () => ({
        meta: { instanceId: 'sect:alpha:main', ownerSectId: 'sect:alpha' },
        template: { id: 'sect_domain:sect:alpha:x-1_1:y-1_1', name: '青岚宗', spawnX: 1, spawnY: 1 },
    });
    await service.dispatchUseItem('player:1', 6, deps);
    assert.deepEqual(log, [
        ['bindRespawnPointToPlacement', 'player:1', 'sect_domain:sect:alpha', 'sect:alpha:main', 0, 0],
        ['consumeInventoryItem', 'player:1', 6, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '复活点与遁返落点已绑定：青岚宗', 'success'],
    ]);
}
/**
 * testLegacyTileAuraBranch：执行test旧TileAuraBranch相关逻辑。
 * @returns 无返回值，直接更新test旧TileAuraBranch相关状态。
 */


function testLegacyTileAuraBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'old_spirit_dust', name: '旧灵尘', tileAuraGainAmount: 2 });
    service.dispatchUseItem('player:1', 3, createDeps(log));
    assert.deepEqual(log, [
        ['addTileResource', 'aura.refined.neutral', 3, 4, 2],
        ['consumeInventoryItem', 'player:1', 3, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 旧灵尘，当前地块灵气提升至 7', 'success'],
    ]);
}
/**
 * testNormalUseBranch：执行testNormalUseBranch相关逻辑。
 * @returns 无返回值，直接更新testNormalUseBranch相关状态。
 */


function testNormalUseBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'manual_scroll', name: '功法玉简' });
    service.dispatchUseItem('player:1', 0, createDeps(log));
    assert.deepEqual(log, [
        ['useItem', 'player:1', 0],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '参悟 功法玉简', 'success'],
    ]);
}

function testTechniqueGenerationOpenPanelBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'wudao_yujian',
        name: '悟道玉简',
        useBehavior: 'open_technique_generation',
    });
    service.dispatchUseItem('player:1', 0, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '打开功法领悟', 'info', {
            key: 'notice.item.open-panel',
            vars: { panel: 'technique_generation' },
        }],
    ]);
}

async function testCustomTechniqueBookRejectsLearnedTechniqueWithoutConsume() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'book.custom_technique',
        itemInstanceId: 'item:book:learned',
        name: '《炼法烟测诀》',
        learnTechniqueId: 'gen_refining_smoke',
    });
    service.playerRuntimeService.getPlayerOrThrow = () => ({
        techniques: { techniques: [{ techId: 'gen_refining_smoke' }] },
    });
    await assert.rejects(
        () => service.dispatchUseItem('player:1', 'item:book:learned', createDeps(log)),
        /已经掌握该功法/,
    );
    assert.deepEqual(log, []);
}

async function testCustomTechniqueBookRejectsMissingTemplateWithoutConsume() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'book.custom_technique',
        itemInstanceId: 'item:book:missing',
        name: '异常功法书',
        learnTechniqueId: 'technique.missing',
    });
    await assert.rejects(
        () => service.dispatchUseItem('player:1', 'item:book:missing', createDeps(log)),
        /功法书对应的功法不存在/,
    );
    assert.deepEqual(log, []);
}

async function testCustomTechniqueBookRejectsPlanWithoutConsume() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'book.custom_technique',
        itemInstanceId: 'item:book:rejected',
        name: '《炼法烟测诀》',
        learnTechniqueId: 'gen_refining_smoke',
    });
    service.playerRuntimeService.addPendingTechniqueComprehensionById = () => false;
    await assert.rejects(
        () => service.dispatchUseItem('player:1', 'item:book:rejected', createDeps(log)),
        /technique_comprehension_plan_rejected_after_validation/,
    );
    assert.deepEqual(log, []);
}

async function testCustomTechniqueBookAddsPlanBeforeConsume() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'book.custom_technique',
        itemInstanceId: 'item:book:valid',
        name: '《炼法烟测诀》残卷',
        learnTechniqueId: 'gen_refining_smoke',
        learnTechniqueMaxLevel: 2,
    });
    await service.dispatchUseItem('player:1', 'item:book:valid', createDeps(log));
    assert.deepEqual(log, [
        ['addPendingTechniqueComprehensionById', 'player:1', 'gen_refining_smoke', 'normal', null, { maxLevel: 2 }],
        ['consumeInventoryItem', 'player:1', 'item:book:valid', 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '参悟 《炼法烟测诀》残卷', 'success'],
    ]);
}

function testTechniqueRefiningCraftBookBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.getPlayerOrThrow = () => ({
        x: 3,
        y: 4,
        techniques: {
            techniques: [{ techId: 'gen_refining_smoke', level: 4 }],
        },
    });
    service.dispatchCraftTechniqueBook('player:1', 'gen_refining_smoke', 2, createTechniqueRefiningDeps(log));
    assert.deepEqual(log, [
        ['consumeItemByItemId', 'player:1', 'mat.technique_fragment', 20],
        ['receiveInventoryItem', 'player:1', {
            itemId: 'book.custom_technique',
            count: 1,
            learnTechniqueId: 'gen_refining_smoke',
            learnTechniqueMaxLevel: 2,
            name: '《炼法烟测诀》残卷',
            type: 'skill_book',
            desc: '记载炼法烟测诀前 2 层的残卷。',
            grade: 'yellow',
            level: 4,
        }],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '功法书已抄录', 'success'],
    ]);
}

function testTechniqueRefiningCraftRejectsUnmasteredTechnique() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.getPlayerOrThrow = () => ({
        x: 3,
        y: 4,
        techniques: {
            techniques: [{ techId: 'gen_refining_smoke', level: 2 }],
        },
    });
    assert.throws(
        () => service.dispatchCraftTechniqueBook('player:1', 'gen_refining_smoke', 2, createTechniqueRefiningDeps(log)),
        /只有修至原功法满层后才能抄录/,
    );
    assert.deepEqual(log, []);
}

function testTechniqueRefiningCraftRejectsOutOfRange() {
    const log = [];
    const service = createService({ log, playerX: 8, playerY: 8 });
    service.playerRuntimeService.getPlayerOrThrow = () => ({
        x: 8,
        y: 8,
        techniques: {
            techniques: [{ techId: 'gen_refining_smoke' }],
        },
    });
    assert.throws(
        () => service.dispatchCraftTechniqueBook('player:1', 'gen_refining_smoke', 2, createTechniqueRefiningDeps(log)),
        /需要在炼法台 1 格范围内操作/,
    );
    assert.deepEqual(log, []);
}

function testTechniqueRefiningCraftRejectsUnknownOrUnlearnedTechnique() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.getPlayerOrThrow = () => ({
        x: 3,
        y: 4,
        techniques: {
            techniques: [{ techId: 'gen_refining_smoke' }],
        },
    });
    assert.throws(
        () => service.dispatchCraftTechniqueBook('player:1', 'technique.unknown', 1, createTechniqueRefiningDeps(log)),
        /只能抄录自创功法/,
    );
    assert.deepEqual(log, []);
}

function testTechniqueRefiningCraftRejectsSystemTechnique() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.getPlayerOrThrow = () => ({
        x: 3,
        y: 4,
        techniques: {
            techniques: [{ techId: 'technique.refining.smoke' }],
        },
    });
    assert.throws(
        () => service.dispatchCraftTechniqueBook('player:1', 'technique.refining.smoke', 2, createTechniqueRefiningDeps(log)),
        /只能抄录自创功法/,
    );
    assert.deepEqual(log, []);
}

function testTechniqueRefiningDecomposeBookBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'book.custom_technique',
        itemInstanceId: 'item:book:1',
        name: '《炼法烟测诀》残卷',
        type: 'skill_book',
        count: 3,
        learnTechniqueId: 'technique.refining.smoke',
        learnTechniqueMaxLevel: 2,
    });
    service.dispatchDecomposeTechniqueBook('player:1', 'item:book:1', createTechniqueRefiningDeps(log), 2);
    assert.deepEqual(log, [
        ['consumeInventoryItem', 'player:1', 'item:book:1', 2],
        ['receiveInventoryItem', 'player:1', { itemId: 'mat.technique_fragment', count: 10 }],
        ['queuePlayerNotice', 'player:1', '功法书已分解', 'success'],
    ]);
}

function testTechniqueRefiningDecomposeRejectsMissingTemplate() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'book.custom_technique',
        itemInstanceId: 'item:book:missing-template',
        name: '异常功法书',
        type: 'skill_book',
        count: 1,
        learnTechniqueId: 'technique.missing',
        grade: 'heaven',
        level: 80,
    });
    assert.throws(
        () => service.dispatchDecomposeTechniqueBook('player:1', 'item:book:missing-template', createTechniqueRefiningDeps(log), 1),
        /功法书缺少有效功法模板/,
    );
    assert.deepEqual(log, []);
}

async function main() {
    await testMapUnlockBranch();
    await testMapGroupUnlockBranch();
    testTileAuraBranch();
    testBloodEssenceBatchBranch();
    await testTileResourceProtectedTileRejectsUse();
    await testRespawnBindBranch();
    await testCurrentRespawnBindBranchUsesCurrentAllowedMap();
    await testCurrentRespawnBindRejectsDisallowedMapWithoutConsume();
    await testCurrentRespawnBindAllowsOwnSectMap();
    testLegacyTileAuraBranch();
    testNormalUseBranch();
    testTechniqueGenerationOpenPanelBranch();
    await testCustomTechniqueBookRejectsLearnedTechniqueWithoutConsume();
    await testCustomTechniqueBookRejectsMissingTemplateWithoutConsume();
    await testCustomTechniqueBookRejectsPlanWithoutConsume();
    await testCustomTechniqueBookAddsPlanBeforeConsume();
    testTechniqueRefiningCraftBookBranch();
    testTechniqueRefiningCraftRejectsUnmasteredTechnique();
    testTechniqueRefiningCraftRejectsOutOfRange();
    testTechniqueRefiningCraftRejectsUnknownOrUnlearnedTechnique();
    testTechniqueRefiningCraftRejectsSystemTechnique();
    testTechniqueRefiningDecomposeBookBranch();
    testTechniqueRefiningDecomposeRejectsMissingTemplate();

    console.log(JSON.stringify({ ok: true, case: 'world-runtime-use-item' }, null, 2));
}

void main();
