"use strict";
/** 运行时参数标准化工具：统一输入解析、比较稳定性与展示数据。 */
Object.defineProperty(exports, "__esModule", { value: true });

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");
/** 统一动作 ID。 */
function normalizeRuntimeActionId(actionIdInput) {

    const actionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
    if (!actionId) {
        return '';
    }
    return actionId;
}
/** 生成公开实例 ID，统一使用 public 前缀。 */
function buildPublicInstanceId(templateId) {
    return `public:${templateId}`;
}
/** 生成物品堆叠用于列表展示的标签文本。 */
function formatItemStackLabel(item) {

    const label = item.name ?? item.itemId;
    return item.count > 1 ? `${label} x${item.count}` : label;
}
/** 将物品列表压缩成前若干项的摘要文本。 */
function formatItemListSummary(items) {

    const preview = items.slice(0, 3).map((entry) => formatItemStackLabel(entry));
    if (items.length <= 3) {
        return preview.join('、');
    }
    return `${preview.join('、')} 等 ${items.length} 种物品`;
}
/** 浅拷贝战斗特效对象，避免共享引用。 */
function cloneCombatEffect(source) {
    return { ...source };
}
/** 按实例与容器 ID 拼接容器来源 key。 */
function buildContainerSourceId(instanceId, containerId) {
    return `container:${instanceId}:${containerId}`;
}
/** 判断字符串是否为容器来源 ID。 */
function isContainerSourceId(sourceId) {
    return sourceId.startsWith('container:');
}
/** 解析容器来源 ID，提取实例和容器组件。 */
function parseContainerSourceId(sourceId) {
    if (!isContainerSourceId(sourceId)) {
        return null;
    }

    const prefixLength = 'container:'.length;

    const splitIndex = sourceId.indexOf(':', prefixLength);
    if (splitIndex < 0) {
        return null;
    }

    const instanceId = sourceId.slice(prefixLength, splitIndex).trim();

    const containerId = sourceId.slice(splitIndex + 1).trim();
    if (!instanceId || !containerId) {
        return null;
    }
    return {
        instanceId,
        containerId,
    };
}
/** 生成可稳定比较的物品签名用于同步比对。 */
function createSyncedItemStackSignature(item) {

    const comparableEntries = Object.entries(item)
        .filter(([key, value]) => key !== 'count' && value !== undefined)
        .sort(([leftKey], [rightKey]) => compareStableKeys(leftKey, rightKey));

    let signature = '';
    for (const [key, value] of comparableEntries) {
        signature += `${key}=`;
        signature += serializeStableComparableValue(value);
        signature += ';';
    }
    return signature;
}
/** 稳定 key 比较器。 */
function compareStableKeys(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** 按类型序列化值，确保签名顺序稳定。 */
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

        const entries = Object.entries(value)
            .filter(([, nestedValue]) => nestedValue !== undefined)
            .sort(([leftKey], [rightKey]) => compareStableKeys(leftKey, rightKey));

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
/** 按物品签名将容器条目按时间归组并合并数量。 */
function groupContainerLootRows(entries) {

    const rows = [];

    const index = new Map();

    const sorted = entries.slice().sort((left, right) => left.createdTick - right.createdTick);
    for (const entry of sorted) {
        const itemKey = createSyncedItemStackSignature(entry.item);
        const existing = index.get(itemKey);
        if (existing) {
            existing.item.count += entry.item.count;
            existing.entries.push(entry);
            continue;
        }

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
/** 检测容器内是否存在未公开条目。 */
function hasHiddenContainerEntries(entries) {
    return entries.some((entry) => !entry.visible);
}
/** 构建容器窗口可见条目的展示列表。 */
function buildContainerWindowItems(entries) {
    return groupContainerLootRows(entries.filter((entry) => entry.visible)).map((entry) => ({
        itemKey: entry.itemKey,
        item: { ...entry.item },
    }));
}
/** 克隆背包快照用于容量模拟。 */
function cloneInventorySimulation(items) {
    return items.map((entry) => ({ ...entry }));
}
/** 验证在不提交真实背包下，容器条目是否可放入。 */
function canReceiveContainerEntries(simulatedInventory, capacity, entries) {

    const simulated = cloneInventorySimulation(simulatedInventory);
    applyContainerEntriesToInventorySimulation(simulated, entries);
    return simulated.length <= capacity;
}
/** 将容器条目应用到背包模拟状态。 */
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
/** 校验玩家背包是否可接收整行容器物品。 */
function canReceiveContainerRow(player, entries) {
    return canReceiveContainerEntries(cloneInventorySimulation(player.inventory.items), player.inventory.capacity, entries);
}
/** 从数组中移除指定容器条目。 */
function removeContainerRowEntries(source, removed) {
    if (removed.length === 0) {
        return;
    }

    const removedSet = new Set(removed);

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
/** 生成 NPC 任务进度的用户可读文本。 */
function buildNpcQuestProgressText(quest) {
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
/** 判断单个物品堆叠是否可放入背包。 */
function canReceiveItemStack(player, item) {
    if (player.inventory.items.some((entry) => entry.itemId === item.itemId)) {
        return true;
    }
    return player.inventory.items.length < player.inventory.capacity;
}
/** 将任务奖励条目规范化为标准展示对象。 */
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
/** 四舍五入到三位小数并返回毫秒数。 */
function roundDurationMs(value) {
    return Number(value.toFixed(3));
}
/** 维护固定窗口长度的耗时指标序列。 */
function pushDurationMetric(history, value) {
    history.push(value);
    if (history.length > 60) {
        history.shift();
    }
}
/** 汇总耗时序列，返回最近/平均/最大值。 */
function summarizeDurations(last, history) {
    if (history.length === 0) {
        return {
            last,
            avg60: last,
            max60: last,
        };
    }

    let total = 0;

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
/** 任务主线类型校验与兜底。 */
function normalizeQuestLine(value) {
    return value === 'main' || value === 'daily' || value === 'encounter' ? value : 'side';
}
/** 任务目标类型合法化，默认转为 kill。 */
function normalizeQuestObjectiveType(value) {
    return value === 'talk'
        || value === 'submit_item'
        || value === 'learn_technique'
        || value === 'realm_progress'
        || value === 'realm_stage'
        ? value
        : 'kill';
}
/** 任务目标数量归一化为正整数。 */
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
/** 任务境界目标归一为有效枚举值。 */
function normalizeQuestRealmStage(value) {
    if (typeof value === 'number' && shared_1.PlayerRealmStage[value] !== undefined) {
        return value;
    }
    if (typeof value === 'string' && shared_1.PlayerRealmStage[value] !== undefined) {
        return shared_1.PlayerRealmStage[value];
    }
    return undefined;
}
/** 按目标类型解析任务面板显示标签。 */
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
/** 生成任务奖励展示文本。 */
function buildQuestRewardText(quest, rewards) {
    if (typeof quest.rewardText === 'string' && quest.rewardText.trim()) {
        return quest.rewardText;
    }
    if (rewards.length === 0) {
        return '';
    }
    return rewards.map((entry) => formatItemStackLabel(entry)).join('、');
}
/** 深拷贝任务状态，避免运行时态被外部污染。 */
function cloneQuestState(quest, status = quest.status) {
    return {
        ...quest,
        status,
        rewardItemIds: quest.rewardItemIds.slice(),
        rewards: quest.rewards.map((reward) => ({ ...reward })),
    };
}
/** 任务列表稳定排序比较器。 */
function compareQuestViews(left, right) {

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
/** 稳定字符串比较函数。 */
function compareStableStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** 将外部输入解析为方向枚举。 */
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
/** 标准化物品槽位索引。 */
function normalizeSlotIndex(input) {
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid slotIndex: ${String(input)}`);
    }
    return Math.max(0, Math.trunc(Number(input)));
}
/** 验证并规范化装备槽位枚举。 */
function normalizeEquipSlot(input) {

    const slot = typeof input === 'string' ? input.trim() : '';
    if (!shared_1.EQUIP_SLOTS.includes(slot)) {
        throw new common_1.BadRequestException(`Invalid equip slot: ${String(input)}`);
    }
    return slot;
}
/** 标准化功法 ID，空值返回 null。 */
function normalizeTechniqueId(input) {
    return typeof input === 'string' && input.trim() ? input.trim() : null;
}
/** 标准化商店购买数量并确保合法。 */
function normalizeShopQuantity(input) {
    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
        throw new common_1.BadRequestException('购买数量无效');
    }
    return Math.trunc(input);
}
/** 标准化正整数计数值。 */
function normalizePositiveCount(input) {
    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid count: ${String(input)}`);
    }
    return Math.max(1, Math.trunc(Number(input)));
}
/** 标准化坐标输入并取整。 */
function normalizeCoordinate(input, label) {
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid ${label}: ${String(input)}`);
    }
    return Math.trunc(Number(input));
}
/** 标准化掉落 roll 次数，限制上限。 */
function normalizeRollCount(input) {
    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new common_1.BadRequestException(`Invalid rolls: ${String(input)}`);
    }
    return Math.max(1, Math.min(1000, Math.trunc(Number(input))));
}
/** 按 ID 在玩家已学习技能中查找条目。 */
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
/** 判断技能是否包含伤害/对目标生效效果。 */
function isHostileSkill(skill) {
    return skill.effects.some((effect) => effect.type === 'damage' || (effect.type === 'buff' && effect.target === 'target'));
}
/** 读取技能首个伤害特效颜色，用于战斗表现。 */
function getSkillEffectColor(skill) {
    for (const effect of skill.effects) {
        if (effect.type === 'damage') {
            return (0, shared_1.getDamageTrailColor)(effect.damageKind ?? 'spell', effect.element);
        }
    }
    return (0, shared_1.getDamageTrailColor)('spell');
}
/** 读取技能在运行时的实际攻击范围。 */
function resolveRuntimeSkillRange(skill) {

    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range ?? 1));
}
/** 计算自动战斗可允许的技能气耗上限。 */
function resolveAutoBattleSkillQiCost(baseCost, maxQiOutputPerTick) {

    const normalizedBaseCost = Number.isFinite(baseCost) ? Math.max(0, Math.round(baseCost ?? 0)) : 0;
    if (normalizedBaseCost <= 0) {
        return 0;
    }

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
exports.buildNpcQuestProgressText = buildNpcQuestProgressText;
exports.buildLegacyNpcQuestProgressText = buildNpcQuestProgressText;
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
