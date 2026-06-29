/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 运行时参数标准化工具集
 * 提供输入校验、ID 构建、坐标/数值归一化和展示文本格式化
 */

/** 运行时参数标准化工具：统一输入解析、比较稳定性与展示数据。
 * 职责：输入校验、ID 构建、坐标/数值归一化。 */
import { BadRequestException } from '@nestjs/common';
import { ARTIFACT_SLOTS, Direction, EQUIP_SLOTS, applyCombatAttackIntensityQiCost, calcQiCostWithOutputLimit, createItemStackSignature, getDamageTrailColor, getItemStackDisplayLabel, mergeItemStackEntryInto, mergeItemStackInto, resolveSkillEffectiveRange } from '@mud/shared';

/** 统一动作 ID。 */
export function normalizeRuntimeActionId(actionIdInput) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const actionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
    if (!actionId) {
        return '';
    }
    return actionId;
}
/** 生成公开实例 ID，统一使用 public 前缀。 */
export function buildPublicInstanceId(templateId) {
    return `public:${templateId}`;
}
/** 判断分线预设是否有效。 */
export function isRuntimeInstanceLinePreset(value) {
    return value === 'peaceful' || value === 'real';
}
/** 归一化分线预设，非法值回退到和平线。 */
export function normalizeRuntimeInstanceLinePreset(value) {
    return isRuntimeInstanceLinePreset(value) ? value : 'peaceful';
}
/** 判断实例持久化策略是否有效。 */
function isRuntimeInstancePersistentPolicy(value) {
    return value === 'persistent' || value === 'long_lived' || value === 'session' || value === 'ephemeral';
}
/** 归一化实例持久化策略，非法值回退到 persistent。 */
export function normalizeRuntimeInstancePersistentPolicy(value) {
    return isRuntimeInstancePersistentPolicy(value) ? value : 'persistent';
}
/** 生成默认真实线实例 ID。 */
export function buildRealInstanceId(templateId) {
    return `real:${templateId}`;
}
/** 生成手动扩线实例 ID。 */
export function buildManualLineInstanceId(templateId, linePreset, index) {
    const normalizedIndex = Number.isFinite(index) ? Math.max(2, Math.trunc(index)) : 2;
    return `line:${templateId}:${normalizeRuntimeInstanceLinePreset(linePreset)}:${normalizedIndex}`;
}
/** 解析实例 ID，统一提取模板、预设、序号与默认入口语义。 */
export function parseRuntimeInstanceDescriptor(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (!normalized) {
        return null;
    }
    if (normalized.startsWith('public:')) {
        const templateId = normalized.slice('public:'.length).trim();
        if (!templateId) {
            return null;
        }
        return {
            templateId,
            linePreset: 'peaceful',
            lineIndex: 1,
            defaultEntry: true,
            instanceOrigin: 'bootstrap',
        };
    }
    if (normalized.startsWith('real:')) {
        const templateId = normalized.slice('real:'.length).trim();
        if (!templateId) {
            return null;
        }
        return {
            templateId,
            linePreset: 'real',
            lineIndex: 1,
            defaultEntry: true,
            instanceOrigin: 'bootstrap',
        };
    }
    if (!normalized.startsWith('line:')) {
        return null;
    }
    const segments = normalized.split(':');
    if (segments.length !== 4) {
        return null;
    }
    const [, templateId, presetInput, indexInput] = segments;
    const linePreset = isRuntimeInstanceLinePreset(presetInput) ? presetInput : '';
    const parsedIndex = Number(indexInput);
    if (!templateId || !linePreset || !Number.isFinite(parsedIndex) || Math.trunc(parsedIndex) < 2) {
        return null;
    }
    return {
        templateId,
        linePreset,
        lineIndex: Math.trunc(parsedIndex),
        defaultEntry: false,
        instanceOrigin: 'gm_manual',
    };
}
/** 按实例预设生成展示名称。 */
export function buildRuntimeInstanceDisplayName(templateName, linePreset, lineIndex = 1, defaultEntry = true) {
    const label = normalizeRuntimeInstanceLinePreset(linePreset) === 'real' ? '真实' : '和平';
    const resolvedTemplateName = typeof templateName === 'string' && templateName.trim()
        ? templateName.trim()
        : '未知地图';
    if (defaultEntry) {
        return `${resolvedTemplateName}·${label}`;
    }
    const normalizedIndex = Number.isFinite(lineIndex) ? Math.max(2, Math.trunc(lineIndex)) : 2;
    return `${resolvedTemplateName}·${label}-${normalizedIndex}`;
}
/** 将分线预设收口为运行时实例元数据。 */
export function buildRuntimeInstancePresetMeta(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const defaultEntry = input?.defaultEntry !== false;
    const linePreset = normalizeRuntimeInstanceLinePreset(input?.linePreset);
    const lineIndex = Number.isFinite(input?.lineIndex)
        ? Math.max(defaultEntry ? 1 : 2, Math.trunc(input.lineIndex))
        : defaultEntry ? 1 : 2;
    const displayName = typeof input?.displayName === 'string' && input.displayName.trim()
        ? input.displayName.trim()
        : buildRuntimeInstanceDisplayName(input?.templateName, linePreset, lineIndex, defaultEntry);
    const instanceId = typeof input?.instanceId === 'string' ? input.instanceId.trim() : '';
    const kind = typeof input?.kind === 'string' ? input.kind.trim() : '';
    const isPublicWorld = kind === 'public' || instanceId.startsWith('public:') || instanceId.startsWith('line:');
    const isVirtualPublicWorld = isPublicWorld
        && linePreset !== 'real'
        && !instanceId.startsWith('real:')
        && !instanceId.includes(':real:');
    return {
        displayName,
        linePreset,
        lineIndex,
        instanceOrigin: input?.instanceOrigin === 'gm_manual' ? 'gm_manual' : 'bootstrap',
        supportsPvp: typeof input?.supportsPvp === 'boolean' ? input.supportsPvp : !isVirtualPublicWorld,
        canDamageTile: typeof input?.canDamageTile === 'boolean' ? input.canDamageTile : true,
        defaultEntry,
    };
}
/** 生成物品堆叠用于列表展示的标签文本。 */
export function formatItemStackLabel(item) {

    return getItemStackDisplayLabel(item);
}
/** 将物品列表压缩成前若干项的摘要文本。 */
export function formatItemListSummary(items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const preview = items.slice(0, 3).map((entry) => formatItemStackLabel(entry));
    if (items.length <= 3) {
        return preview.join('、');
    }
    return `${preview.join('、')} 等 ${items.length} 种物品`;
}
/** 浅拷贝战斗特效对象，避免共享引用。 */
export function cloneCombatEffect(source) {
    return { ...source };
}
/** 按实例与容器 ID 拼接容器来源 key。 */
export function buildContainerSourceId(instanceId, containerId) {
    return `container:${instanceId}:${containerId}`;
}
/** 判断字符串是否为容器来源 ID。 */
export function isContainerSourceId(sourceId) {
    return sourceId.startsWith('container:');
}
/** 解析容器来源 ID，提取实例和容器组件。 */
export function parseContainerSourceId(sourceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!isContainerSourceId(sourceId)) {
        return null;
    }

    const prefixLength = 'container:'.length;

    const splitIndex = sourceId.lastIndexOf(':');
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
export function createSyncedItemStackSignature(item) {
    return createItemStackSignature(item);
}
/** 稳定 key 比较器。 */
export function compareStableKeys(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** 按类型序列化值，确保签名顺序稳定。 */
export function serializeStableComparableValue(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export function groupContainerLootRows(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const rows = [];
    const sorted = entries.slice().sort((left, right) => left.createdTick - right.createdTick);
    for (const entry of sorted) {
        mergeItemStackEntryInto(rows, { ...entry.item }, {
            getItem: (row) => row.item,
            createEntry: (item, itemKey) => ({
                itemKey,
                item,
                entries: [entry],
            }),
            onMerged: (row) => {
                row.entries.push(entry);
            },
        });
    }
    return rows;
}
/** 检测容器内是否存在未公开条目。 */
export function hasHiddenContainerEntries(entries) {
    return entries.some((entry) => !entry.visible);
}
/** 构建容器窗口可见条目的展示列表。 */
export function buildContainerWindowItems(entries) {
    return groupContainerLootRows(entries.filter((entry) => entry.visible)).map((entry) => ({
        itemKey: entry.itemKey,
        item: { ...entry.item },
    }));
}
/** 克隆背包快照用于容量模拟。 */
export function cloneInventorySimulation(items) {
    return items.map((entry) => ({ ...entry }));
}
/** 验证在不提交真实背包下，容器条目是否可放入。 */
export function canReceiveContainerEntries(simulatedInventory, capacity, entries) {

    const simulated = cloneInventorySimulation(simulatedInventory);
    applyContainerEntriesToInventorySimulation(simulated, entries);
    return simulated.length <= capacity;
}
/** 将容器条目应用到背包模拟状态。 */
export function applyContainerEntriesToInventorySimulation(simulatedInventory, entries) {
    for (const entry of entries) {
        mergeItemStackInto(simulatedInventory, { ...entry.item });
    }
}
/** 校验玩家背包是否可接收整行容器物品。 */
export function canReceiveContainerRow(player, entries) {
    return canReceiveContainerEntries(cloneInventorySimulation(player.inventory.items), player.inventory.capacity, entries);
}
/** 从数组中移除指定容器条目。 */
export function removeContainerRowEntries(source, removed) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export function buildNpcQuestProgressText(quest) {
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
export function canReceiveItemStack(player, item) {
    const simulated = cloneInventorySimulation(player.inventory.items);
    mergeItemStackInto(simulated, { ...item });
    return simulated.length <= player.inventory.capacity;
}
/** 将任务奖励条目规范化为标准展示对象。 */
export function toQuestRewardItem(item, fallback) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export function roundDurationMs(value) {
    return Number(value.toFixed(3));
}
/** 维护固定窗口长度的耗时指标序列。 */
export function pushDurationMetric(history, value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    history.push(value);
    if (history.length > 60) {
        history.shift();
    }
}
/** 汇总耗时序列，返回最近/平均/最大值。 */
export function summarizeDurations(last, history) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (history.length === 0) {
        return {
            last,
            avg60: last,
            max60: last,
            count: 0,
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
        count: history.length,
    };
}
/** 任务主线类型校验与兜底。 */
export function normalizeQuestLine(value) {
    return value === 'main' || value === 'daily' || value === 'encounter' ? value : 'side';
}
/** 任务目标类型合法化，默认转为 kill。 */
export function normalizeQuestObjectiveType(value) {
    return value === 'talk'
        || value === 'submit_item'
        || value === 'learn_technique'
        || value === 'realm_progress'
        || value === 'realm_stage'
        ? value
        : 'kill';
}
/** 任务目标数量归一化为正整数。 */
export function normalizeQuestRequired(quest, objectiveType) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/** 任务境界目标等级归一为正整数。 */
export function normalizeQuestRealmLv(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return undefined;
    }
    return Math.floor(numeric);
}
/** 按目标类型解析任务面板显示标签。 */
export function resolveQuestTargetLabel(objectiveType, quest, targetRealmLabel, targetNpcName, requiredItemName, techniqueName) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if ((objectiveType === 'realm_progress' || objectiveType === 'realm_stage') && typeof targetRealmLabel === 'string' && targetRealmLabel.trim()) {
        return targetRealmLabel.trim();
    }
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
    if (objectiveType === 'kill' && typeof quest.targetMonsterId === 'string' && quest.targetMonsterId.trim()) {
        return quest.targetMonsterId;
    }
    return quest.title;
}
/** 生成任务奖励展示文本。 */
export function buildQuestRewardText(quest, rewards) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof quest.rewardText === 'string' && quest.rewardText.trim()) {
        return quest.rewardText;
    }
    if (rewards.length === 0) {
        return '';
    }
    return rewards.map((entry) => formatItemStackLabel(entry)).join('、');
}
/** 克隆任务运行态，只保留进度、目标索引和提交校验所需字段。 */
export function cloneQuestState(quest, status = quest.status) {
    const cloned: any = {
        id: quest.id,
        line: normalizeQuestLine(quest.line),
        status,
        objectiveType: normalizeQuestObjectiveType(quest.objectiveType),
        progress: normalizeQuestProgressNumber(quest.progress),
        required: normalizeQuestRequired(quest, normalizeQuestObjectiveType(quest.objectiveType)),
        targetMonsterId: typeof quest.targetMonsterId === 'string' ? quest.targetMonsterId : '',
    };
    if (typeof quest.targetName === 'string' && quest.targetName.trim() && quest.targetName !== cloned.targetMonsterId) {
        cloned.targetName = quest.targetName.trim();
    }
    if (typeof quest.targetTechniqueId === 'string' && quest.targetTechniqueId.trim()) {
        cloned.targetTechniqueId = quest.targetTechniqueId.trim();
    }
    const targetRealmLv = normalizeQuestRealmLv(quest.targetRealmLv);
    if (targetRealmLv !== undefined) {
        cloned.targetRealmLv = targetRealmLv;
    }
    const acceptRealmLv = normalizeQuestRealmLv(quest.acceptRealmLv);
    if (acceptRealmLv !== undefined) {
        cloned.acceptRealmLv = acceptRealmLv;
    }
    if (typeof quest.nextQuestId === 'string' && quest.nextQuestId.trim()) {
        cloned.nextQuestId = quest.nextQuestId.trim();
    }
    if (typeof quest.requiredItemId === 'string' && quest.requiredItemId.trim()) {
        cloned.requiredItemId = quest.requiredItemId.trim();
    }
    if (Number.isInteger(quest.requiredItemCount)) {
        cloned.requiredItemCount = Number(quest.requiredItemCount);
    }
    if (typeof quest.targetMapId === 'string' && quest.targetMapId.trim()) {
        cloned.targetMapId = quest.targetMapId.trim();
    }
    if (typeof quest.targetNpcId === 'string' && quest.targetNpcId.trim()) {
        cloned.targetNpcId = quest.targetNpcId.trim();
    }
    if (typeof quest.submitNpcId === 'string' && quest.submitNpcId.trim()) {
        cloned.submitNpcId = quest.submitNpcId.trim();
    }
    if (typeof quest.submitMapId === 'string' && quest.submitMapId.trim()) {
        cloned.submitMapId = quest.submitMapId.trim();
    }
    if (typeof quest.giverId === 'string' && quest.giverId.trim()) {
        cloned.giverId = quest.giverId.trim();
    }
    if (typeof quest.guideFlowId === 'string' && quest.guideFlowId.trim()) {
        cloned.guideFlowId = quest.guideFlowId.trim();
    }
    return cloned;
}

function normalizeQuestProgressNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}
/** 任务列表稳定排序比较器。 */
export function compareQuestViews(left, right) {

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
export function compareStableStrings(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
/** 将外部输入解析为方向枚举。 */
export function parseDirection(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof input === 'number' && Direction[input] !== undefined) {
        return input;
    }
    if (typeof input === 'string') {
        switch (input.trim().toLowerCase()) {
            case '0':
            case 'north':
            case 'n':
                return Direction.North;
            case '1':
            case 'south':
            case 's':
                return Direction.South;
            case '2':
            case 'east':
            case 'e':
                return Direction.East;
            case '3':
            case 'west':
            case 'w':
                return Direction.West;
            default:
                break;
        }
    }
    throw new BadRequestException(`方向无效：${String(input)}`);
}
/** 标准化物品槽位索引。 */
export function normalizeSlotIndex(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isFinite(input)) {
        throw new BadRequestException(`背包槽位无效：${String(input)}`);
    }
    return Math.max(0, Math.trunc(Number(input)));
}
/** 验证并规范化装备槽位枚举。 */
export function normalizeEquipSlot(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const slot = typeof input === 'string' ? input.trim() : '';
    if (!(EQUIP_SLOTS as readonly string[]).includes(slot)) {
        throw new BadRequestException(`装备槽位无效：${String(input)}`);
    }
    return slot;
}
/** 验证并规范化法宝槽位枚举。 */
export function normalizeArtifactSlot(input) {
    const slot = typeof input === 'string' ? input.trim() : '';
    if (!(ARTIFACT_SLOTS as readonly string[]).includes(slot)) {
        throw new BadRequestException(`法宝槽位无效：${String(input)}`);
    }
    return slot;
}
/** 卸下入口允许装备槽与法宝槽，但不混淆两者规则。 */
export function normalizeEquipmentOrArtifactSlot(input) {
    const slot = typeof input === 'string' ? input.trim() : '';
    if ((EQUIP_SLOTS as readonly string[]).includes(slot) || (ARTIFACT_SLOTS as readonly string[]).includes(slot)) {
        return slot;
    }
    throw new BadRequestException(`装备槽位无效：${String(input)}`);
}
/** 标准化功法 ID，空值返回 null。 */
export function normalizeTechniqueId(input) {
    return typeof input === 'string' && input.trim() ? input.trim() : null;
}
/** 标准化商店购买数量并确保合法。 */
export function normalizeShopQuantity(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof input !== 'number' || !Number.isSafeInteger(input) || input <= 0) {
        throw new BadRequestException('购买数量无效');
    }
    return Math.trunc(input);
}
/** 标准化正整数计数值。 */
export function normalizePositiveCount(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new BadRequestException(`数量无效：${String(input)}`);
    }
    return Math.max(1, Math.trunc(Number(input)));
}
/** 标准化坐标输入并取整。 */
export function normalizeCoordinate(input, label) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isFinite(input)) {
        throw new BadRequestException(`${label} 坐标无效：${String(input)}`);
    }
    return Math.trunc(Number(input));
}
/** 标准化掉落 roll 次数，限制上限。 */
export function normalizeRollCount(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (input === undefined || input === null) {
        return 1;
    }
    if (!Number.isFinite(input)) {
        throw new BadRequestException(`掉落次数无效：${String(input)}`);
    }
    return Math.max(1, Math.min(1000, Math.trunc(Number(input))));
}
/** 按 ID 在玩家已学习技能中查找条目。 */
export function findPlayerSkill(player, skillId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export function isHostileSkill(skill) {
    return skill.effects.some((effect) => effect.type === 'damage' || (effect.type === 'buff' && effect.target === 'target'));
}
/** 读取技能首个伤害特效颜色，用于战斗表现。 */
export function getSkillEffectColor(skill) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const effect of skill.effects) {
        if (effect.type === 'damage') {
            return getDamageTrailColor(effect.damageKind ?? 'spell', effect.element);
        }
    }
    return getDamageTrailColor('spell');
}
/** 读取技能在运行时的实际攻击范围。 */
export function resolveRuntimeSkillRange(skill) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return resolveSkillEffectiveRange(skill);
}
/** 计算自动战斗可允许的技能气耗上限。 */
export function resolveAutoBattleSkillQiCost(baseCost, maxQiOutputPerTick, combatAttackIntensity = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedBaseCost = Number.isFinite(baseCost) ? Math.max(0, Math.round(baseCost ?? 0)) : 0;
    if (normalizedBaseCost <= 0) {
        return 0;
    }

    const outputCap = Number.isFinite(maxQiOutputPerTick) ? Math.max(0, Math.round(maxQiOutputPerTick)) : 0;
    return applyCombatAttackIntensityQiCost(Math.round(calcQiCostWithOutputLimit(normalizedBaseCost, outputCap)), combatAttackIntensity);
}
export const buildLegacyNpcQuestProgressText = buildNpcQuestProgressText;
