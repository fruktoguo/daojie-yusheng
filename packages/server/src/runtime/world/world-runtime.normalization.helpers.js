"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** normalizeRuntimeActionId：执行对应的业务逻辑。 */
function normalizeRuntimeActionId(actionIdInput) {
/** actionId：定义该变量以承载业务值。 */
    const actionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
    if (!actionId) {
        return '';
    }
    if (actionId.startsWith('npc:')) {
        return `npc_quests:${actionId.slice('npc:'.length)}`;
    }
    return actionId;
}
/** buildPublicInstanceId：执行对应的业务逻辑。 */
function buildPublicInstanceId(templateId) {
    return `public:${templateId}`;
}
/** formatItemStackLabel：执行对应的业务逻辑。 */
function formatItemStackLabel(item) {
/** label：定义该变量以承载业务值。 */
    const label = item.name ?? item.itemId;
    return item.count > 1 ? `${label} x${item.count}` : label;
}
/** formatItemListSummary：执行对应的业务逻辑。 */
function formatItemListSummary(items) {
/** preview：定义该变量以承载业务值。 */
    const preview = items.slice(0, 3).map((entry) => formatItemStackLabel(entry));
    if (items.length <= 3) {
        return preview.join('、');
    }
    return `${preview.join('、')} 等 ${items.length} 种物品`;
}
/** cloneCombatEffect：执行对应的业务逻辑。 */
function cloneCombatEffect(source) {
    return { ...source };
}
/** buildContainerSourceId：执行对应的业务逻辑。 */
function buildContainerSourceId(instanceId, containerId) {
    return `container:${instanceId}:${containerId}`;
}
/** isContainerSourceId：执行对应的业务逻辑。 */
function isContainerSourceId(sourceId) {
    return sourceId.startsWith('container:');
}
/** parseContainerSourceId：执行对应的业务逻辑。 */
function parseContainerSourceId(sourceId) {
    if (!isContainerSourceId(sourceId)) {
        return null;
    }
/** prefixLength：定义该变量以承载业务值。 */
    const prefixLength = 'container:'.length;
/** splitIndex：定义该变量以承载业务值。 */
    const splitIndex = sourceId.indexOf(':', prefixLength);
    if (splitIndex < 0) {
        return null;
    }
/** instanceId：定义该变量以承载业务值。 */
    const instanceId = sourceId.slice(prefixLength, splitIndex).trim();
/** containerId：定义该变量以承载业务值。 */
    const containerId = sourceId.slice(splitIndex + 1).trim();
    if (!instanceId || !containerId) {
        return null;
    }
    return {
        instanceId,
        containerId,
    };
}
/** createSyncedItemStackSignature：执行对应的业务逻辑。 */
function createSyncedItemStackSignature(item) {
/** comparableEntries：定义该变量以承载业务值。 */
    const comparableEntries = Object.entries(item)
        .filter(([key, value]) => key !== 'count' && value !== undefined)
        .sort(([leftKey], [rightKey]) => compareStableKeys(leftKey, rightKey));
/** signature：定义该变量以承载业务值。 */
    let signature = '';
    for (const [key, value] of comparableEntries) {
        signature += `${key}=`;
        signature += serializeStableComparableValue(value);
        signature += ';';
    }
    return signature;
}
/** compareStableKeys：执行对应的业务逻辑。 */
function compareStableKeys(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** serializeStableComparableValue：执行对应的业务逻辑。 */
function serializeStableComparableValue(value) {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return `s:${value.length}:${value}`;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? `n:${value}` : 'n:null';
    }
    if (typeof value === 'boolean') {
        return value ? 'b:1' : 'b:0';
    }
    if (Array.isArray(value)) {
/** serialized：定义该变量以承载业务值。 */
        let serialized = 'a[';
        for (let index = 0; index < value.length; index += 1) {
            if (index > 0) {
                serialized += ',';
            }
            serialized += serializeStableComparableValue(value[index]);
        }
        serialized += ']';
        return serialized;
    }
    if (typeof value === 'object') {
/** entries：定义该变量以承载业务值。 */
        const entries = Object.entries(value)
            .filter(([, nestedValue]) => nestedValue !== undefined)
            .sort(([leftKey], [rightKey]) => compareStableKeys(leftKey, rightKey));
/** serialized：定义该变量以承载业务值。 */
        let serialized = 'o{';
        for (let index = 0; index < entries.length; index += 1) {
            const [nestedKey, nestedValue] = entries[index];
            if (index > 0) {
                serialized += ',';
            }
            serialized += `${nestedKey}=`;
            serialized += serializeStableComparableValue(nestedValue);
        }
        serialized += '}';
        return serialized;
    }
    return `u:${typeof value}`;
}
/** groupContainerLootRows：执行对应的业务逻辑。 */
function groupContainerLootRows(entries) {
/** rows：定义该变量以承载业务值。 */
    const rows = [];
/** index：定义该变量以承载业务值。 */
    const index = new Map();
/** sorted：定义该变量以承载业务值。 */
    const sorted = entries.slice().sort((left, right) => left.createdTick - right.createdTick);
    for (const entry of sorted) {
        const itemKey = createSyncedItemStackSignature(entry.item);
        const existing = index.get(itemKey);
        if (existing) {
            existing.item.count += entry.item.count;
            existing.entries.push(entry);
            continue;
        }
/** created：定义该变量以承载业务值。 */
        const created = {
            itemKey,
            item: { ...entry.item },
            entries: [entry],
        };
        index.set(itemKey, created);
        rows.push(created);
    }
    return rows;
}
/** hasHiddenContainerEntries：执行对应的业务逻辑。 */
function hasHiddenContainerEntries(entries) {
    return entries.some((entry) => !entry.visible);
}
/** buildContainerWindowItems：执行对应的业务逻辑。 */
function buildContainerWindowItems(entries) {
    return groupContainerLootRows(entries.filter((entry) => entry.visible)).map((entry) => ({
        itemKey: entry.itemKey,
        item: { ...entry.item },
    }));
}
/** cloneInventorySimulation：执行对应的业务逻辑。 */
function cloneInventorySimulation(items) {
    return items.map((entry) => ({ ...entry }));
}
/** canReceiveContainerEntries：执行对应的业务逻辑。 */
function canReceiveContainerEntries(simulatedInventory, capacity, entries) {
/** simulated：定义该变量以承载业务值。 */
    const simulated = cloneInventorySimulation(simulatedInventory);
    applyContainerEntriesToInventorySimulation(simulated, entries);
    return simulated.length <= capacity;
}
/** applyContainerEntriesToInventorySimulation：执行对应的业务逻辑。 */
function applyContainerEntriesToInventorySimulation(simulatedInventory, entries) {
    for (const entry of entries) {
        const item = entry.item;
        const existing = simulatedInventory.find((candidate) => candidate.itemId === item.itemId);
        if (existing) {
            existing.count += item.count;
            continue;
        }
        simulatedInventory.push({ ...item });
    }
}
/** canReceiveContainerRow：执行对应的业务逻辑。 */
function canReceiveContainerRow(player, entries) {
    return canReceiveContainerEntries(cloneInventorySimulation(player.inventory.items), player.inventory.capacity, entries);
}
/** removeContainerRowEntries：执行对应的业务逻辑。 */
function removeContainerRowEntries(source, removed) {
    if (removed.length === 0) {
        return;
    }
/** removedSet：定义该变量以承载业务值。 */
    const removedSet = new Set(removed);
/** writeIndex：定义该变量以承载业务值。 */
    let writeIndex = 0;
    for (let index = 0; index < source.length; index += 1) {
        const entry = source[index];
        if (removedSet.has(entry)) {
            continue;
        }
        source[writeIndex++] = entry;
    }
    source.length = writeIndex;
}
/** buildLegacyNpcQuestProgressText：执行对应的业务逻辑。 */
function buildLegacyNpcQuestProgressText(quest) {
    switch (quest.objectiveType) {
        case 'kill':
            return `去猎杀 ${quest.targetName}（${quest.progress}/${quest.required}）。`;
        case 'submit_item':
            return `收集 ${quest.targetName}（${quest.progress}/${quest.required}）。`;
        case 'talk':
            return quest.targetNpcName
                ? `去找 ${quest.targetNpcName} 传话。`
                : `去找 ${quest.targetName} 传话。`;
        case 'learn_technique':
            return `修成 ${quest.targetName}。`;
        case 'realm_progress':
        case 'realm_stage':
            return `继续修炼至 ${quest.targetName}。`;
        default:
            return quest.desc || quest.title;
    }
}
/** canReceiveItemStack：执行对应的业务逻辑。 */
function canReceiveItemStack(player, item) {
    if (player.inventory.items.some((entry) => entry.itemId === item.itemId)) {
        return true;
    }
    return player.inventory.items.length < player.inventory.capacity;
}
/** toQuestRewardItem：执行对应的业务逻辑。 */
function toQuestRewardItem(item, fallback) {
    if (!item) {
        return fallback;
    }
    return {
        ...fallback,
        ...item,
        name: item.name ?? fallback.name,
        type: item.type ?? fallback.type,
        desc: item.desc ?? fallback.desc,
        count: item.count,
    };
}
/** roundDurationMs：执行对应的业务逻辑。 */
function roundDurationMs(value) {
    return Number(value.toFixed(3));
}
/** pushDurationMetric：执行对应的业务逻辑。 */
function pushDurationMetric(history, value) {
    history.push(value);
    if (history.length > 60) {
        history.shift();
    }
}
/** summarizeDurations：执行对应的业务逻辑。 */
function summarizeDurations(last, history) {
    if (history.length === 0) {
        return {
            last,
            avg60: last,
            max60: last,
        };
    }
/** total：定义该变量以承载业务值。 */
    let total = 0;
/** max：定义该变量以承载业务值。 */
    let max = 0;
    for (const value of history) {
        total += value;
        if (value > max) {
            max = value;
        }
    }
    return {
        last,
        avg60: roundDurationMs(total / history.length),
        max60: roundDurationMs(max),
    };
}
/** normalizeQuestLine：执行对应的业务逻辑。 */
function normalizeQuestLine(value) {
    return value === 'main' || value === 'daily' || value === 'encounter' ? value : 'side';
}
/** normalizeQuestObjectiveType：执行对应的业务逻辑。 */
function normalizeQuestObjectiveType(value) {
    return value === 'talk'
        || value === 'submit_item'
        || value === 'learn_technique'
        || value === 'realm_progress'
        || value === 'realm_stage'
        ? value
        : 'kill';
}
/** normalizeQuestRequired：执行对应的业务逻辑。 */
function normalizeQuestRequired(quest, objectiveType) {
    if (objectiveType === 'submit_item') {
        if (Number.isInteger(quest.requiredItemCount) && Number(quest.requiredItemCount) > 0) {
            return Number(quest.requiredItemCount);
        }
    }
    if (Number.isInteger(quest.required) && Number(quest.required) > 0) {
        return Number(quest.required);
    }
    if (Number.isInteger(quest.targetCount) && Number(quest.targetCount) > 0) {
        return Number(quest.targetCount);
    }
    return 1;
}
/** normalizeQuestRealmStage：执行对应的业务逻辑。 */
function normalizeQuestRealmStage(value) {
    if (typeof value === 'number' && shared_1.PlayerRealmStage[value] !== undefined) {
        return value;
    }
    if (typeof value === 'string' && shared_1.PlayerRealmStage[value] !== undefined) {
        return shared_1.PlayerRealmStage[value];
    }
    return undefined;
}
/** resolveQuestTargetLabel：执行对应的业务逻辑。 */
function resolveQuestTargetLabel(objectiveType, quest, targetRealmStage, targetNpcName, requiredItemName, techniqueName) {
    if (typeof quest.targetName === 'string' && quest.targetName.trim()) {
        return quest.targetName;
    }
    if (objectiveType === 'talk') {
        return typeof quest.targetNpcName === 'string' && quest.targetNpcName.trim()
            ? quest.targetNpcName
            : targetNpcName || (typeof quest.targetNpcId === 'string' ? quest.targetNpcId : quest.title);
    }
    if (objectiveType === 'submit_item') {
        return requiredItemName || (typeof quest.requiredItemId === 'string' ? quest.requiredItemId : quest.title);
    }
    if (objectiveType === 'learn_technique') {
        return techniqueName || (typeof quest.targetTechniqueId === 'string' ? quest.targetTechniqueId : quest.title);
    }
    if ((objectiveType === 'realm_progress' || objectiveType === 'realm_stage') && targetRealmStage !== undefined) {
        return shared_1.PLAYER_REALM_CONFIG[targetRealmStage]?.name ?? shared_1.PlayerRealmStage[targetRealmStage];
    }
    if (objectiveType === 'kill' && typeof quest.targetMonsterId === 'string' && quest.targetMonsterId.trim()) {
        return quest.targetMonsterId;
    }
    return quest.title;
}
/** buildQuestRewardText：执行对应的业务逻辑。 */
function buildQuestRewardText(quest, rewards) {
    if (typeof quest.rewardText === 'string' && quest.rewardText.trim()) {
        return quest.rewardText;
    }
    if (rewards.length === 0) {
        return '';
    }
    return rewards.map((entry) => formatItemStackLabel(entry)).join('、');
}
/** cloneQuestState：执行对应的业务逻辑。 */
function cloneQuestState(quest, status = quest.status) {
    return {
        ...quest,
        status,
        rewardItemIds: quest.rewardItemIds.slice(),
        rewards: quest.rewards.map((reward) => ({ ...reward })),
    };
}
/** compareQuestViews：执行对应的业务逻辑。 */
function compareQuestViews(left, right) {
/** statusOrder：定义该变量以承载业务值。 */
    const statusOrder = {
        ready: 0,
        active: 1,
        available: 2,
        completed: 3,
    };
    return statusOrder[left.status] - statusOrder[right.status]
        || compareStableStrings(left.line, right.line)
        || compareStableStrings(left.id, right.id);
}
/** compareStableStrings：执行对应的业务逻辑。 */
function compareStableStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** parseDirection：执行对应的业务逻辑。 */
function parseDirection(input) {
    if (typeof input === 'number' && shared_1.Direction[input] !== undefined) {
        return input;
    }
    if (typeof input === 'string') {
        switch (input.trim().toLowerCase()) {
            case '0':
            case 'north':
            case 'n':
                return shared_1.Direction.North;
            case '1':
            case 'south':
            case 's':
                return shared_1.Direction.South;
            case '2':
            case 'east':
            case 'e':
                return shared_1.Direction.East;
            case '3':
            case 'west':
            case 'w':
                return shared_1.Direction.West;
            default:
                break;
        }
    }
    throw new common_1.BadRequestException(`Unsupported direction: ${String(input)}`);
}
/** normalizeSlotIndex：执行对应的业务逻辑。 */
function normalizeSlotIndex(input) {
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid slotIndex: ${String(input)}`);
    }
    return Math.max(0, Math.trunc(Number(input)));
}
/** normalizeEquipSlot：执行对应的业务逻辑。 */
function normalizeEquipSlot(input) {
/** slot：定义该变量以承载业务值。 */
    const slot = typeof input === 'string' ? input.trim() : '';
    if (!shared_1.EQUIP_SLOTS.includes(slot)) {
        throw new common_1.BadRequestException(`Invalid equip slot: ${String(input)}`);
    }
    return slot;
}
/** normalizeTechniqueId：执行对应的业务逻辑。 */
function normalizeTechniqueId(input) {
    return typeof input === 'string' && input.trim() ? input.trim() : null;
}
/** normalizeShopQuantity：执行对应的业务逻辑。 */
function normalizeShopQuantity(input) {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
        throw new common_1.BadRequestException('购买数量无效');
    }
    return Math.trunc(input);
}
/** normalizePositiveCount：执行对应的业务逻辑。 */
function normalizePositiveCount(input) {
    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid count: ${String(input)}`);
    }
    return Math.max(1, Math.trunc(Number(input)));
}
/** normalizeCoordinate：执行对应的业务逻辑。 */
function normalizeCoordinate(input, label) {
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid ${label}: ${String(input)}`);
    }
    return Math.trunc(Number(input));
}
/** normalizeRollCount：执行对应的业务逻辑。 */
function normalizeRollCount(input) {
    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid rolls: ${String(input)}`);
    }
    return Math.max(1, Math.min(1000, Math.trunc(Number(input))));
}
/** findPlayerSkill：执行对应的业务逻辑。 */
function findPlayerSkill(player, skillId) {
    for (const technique of player.techniques.techniques) {
        for (const skill of technique.skills ?? []) {
            if (skill.id === skillId) {
                return skill;
            }
        }
    }
    return null;
}
/** isHostileSkill：执行对应的业务逻辑。 */
function isHostileSkill(skill) {
    return skill.effects.some((effect) => effect.type === 'damage' || (effect.type === 'buff' && effect.target === 'target'));
}
/** getSkillEffectColor：执行对应的业务逻辑。 */
function getSkillEffectColor(skill) {
    for (const effect of skill.effects) {
        if (effect.type === 'damage') {
            return (0, shared_1.getDamageTrailColor)(effect.damageKind ?? 'spell', effect.element);
        }
    }
    return (0, shared_1.getDamageTrailColor)('spell');
}
/** resolveRuntimeSkillRange：执行对应的业务逻辑。 */
function resolveRuntimeSkillRange(skill) {
/** targetingRange：定义该变量以承载业务值。 */
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range ?? 1));
}
/** resolveAutoBattleSkillQiCost：执行对应的业务逻辑。 */
function resolveAutoBattleSkillQiCost(baseCost, maxQiOutputPerTick) {
/** normalizedBaseCost：定义该变量以承载业务值。 */
    const normalizedBaseCost = Number.isFinite(baseCost) ? Math.max(0, Math.round(baseCost ?? 0)) : 0;
    if (normalizedBaseCost <= 0) {
        return 0;
    }
/** outputCap：定义该变量以承载业务值。 */
    const outputCap = Number.isFinite(maxQiOutputPerTick) ? Math.max(0, Math.round(maxQiOutputPerTick)) : 0;
    if (outputCap <= 0) {
        return normalizedBaseCost;
    }
    return Math.min(normalizedBaseCost, outputCap);
}
exports.normalizeRuntimeActionId = normalizeRuntimeActionId;
exports.buildPublicInstanceId = buildPublicInstanceId;
exports.formatItemStackLabel = formatItemStackLabel;
exports.formatItemListSummary = formatItemListSummary;
exports.cloneCombatEffect = cloneCombatEffect;
exports.buildContainerSourceId = buildContainerSourceId;
exports.isContainerSourceId = isContainerSourceId;
exports.parseContainerSourceId = parseContainerSourceId;
exports.createSyncedItemStackSignature = createSyncedItemStackSignature;
exports.compareStableKeys = compareStableKeys;
exports.serializeStableComparableValue = serializeStableComparableValue;
exports.groupContainerLootRows = groupContainerLootRows;
exports.hasHiddenContainerEntries = hasHiddenContainerEntries;
exports.buildContainerWindowItems = buildContainerWindowItems;
exports.cloneInventorySimulation = cloneInventorySimulation;
exports.canReceiveContainerEntries = canReceiveContainerEntries;
exports.applyContainerEntriesToInventorySimulation = applyContainerEntriesToInventorySimulation;
exports.canReceiveContainerRow = canReceiveContainerRow;
exports.removeContainerRowEntries = removeContainerRowEntries;
exports.buildLegacyNpcQuestProgressText = buildLegacyNpcQuestProgressText;
exports.canReceiveItemStack = canReceiveItemStack;
exports.toQuestRewardItem = toQuestRewardItem;
exports.roundDurationMs = roundDurationMs;
exports.pushDurationMetric = pushDurationMetric;
exports.summarizeDurations = summarizeDurations;
exports.normalizeQuestLine = normalizeQuestLine;
exports.normalizeQuestObjectiveType = normalizeQuestObjectiveType;
exports.normalizeQuestRequired = normalizeQuestRequired;
exports.normalizeQuestRealmStage = normalizeQuestRealmStage;
exports.resolveQuestTargetLabel = resolveQuestTargetLabel;
exports.buildQuestRewardText = buildQuestRewardText;
exports.cloneQuestState = cloneQuestState;
exports.compareQuestViews = compareQuestViews;
exports.compareStableStrings = compareStableStrings;
exports.parseDirection = parseDirection;
exports.normalizeSlotIndex = normalizeSlotIndex;
exports.normalizeEquipSlot = normalizeEquipSlot;
exports.normalizeTechniqueId = normalizeTechniqueId;
exports.normalizeShopQuantity = normalizeShopQuantity;
exports.normalizePositiveCount = normalizePositiveCount;
exports.normalizeCoordinate = normalizeCoordinate;
exports.normalizeRollCount = normalizeRollCount;
exports.findPlayerSkill = findPlayerSkill;
exports.isHostileSkill = isHostileSkill;
exports.getSkillEffectColor = getSkillEffectColor;
exports.resolveRuntimeSkillRange = resolveRuntimeSkillRange;
exports.resolveAutoBattleSkillQiCost = resolveAutoBattleSkillQiCost;
