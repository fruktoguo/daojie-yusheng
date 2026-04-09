"use strict";
/**
 * 玩家属性服务
 * 
 * 负责管理玩家的属性计算和更新，包括：
 * - 创建初始属性状态
 * - 重新计算玩家属性（基于装备、Buff、境界等）
 * - 属性变更检测
 * - 生命值和灵气值的调整
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerAttributesService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
/**
 * 玩家属性服务类
 * 
 * 负责管理玩家的属性计算和更新
 */
let PlayerAttributesService = class PlayerAttributesService {
    /**
     * 创建初始属性状态
     * 
     * 为新玩家创建初始的属性状态，包括：
     * - 基础属性
     * - 最终属性
     * - 数值属性
     * - 比率除数
     * 
     * @returns 初始属性状态
     */
    createInitialState() {
        // 获取默认玩家境界的数值模板
        const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE];
        
        // 返回初始属性状态
        return {
            revision: 1,                                              // 版本号
            stage: shared_1.DEFAULT_PLAYER_REALM_STAGE,           // 境界阶段
            baseAttrs: createBaseAttributes(),                      // 基础属性
            finalAttrs: createBaseAttributes(),                     // 最终属性
            numericStats: (0, shared_1.cloneNumericStats)(template.stats), // 数值属性
            ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(template.ratioDivisors), // 比率除数
        };
    }
    
    /**
     * 重新计算玩家属性
     * 
     * 基于玩家的当前状态（装备、Buff、境界等）重新计算所有属性，
     * 如果属性发生变化则更新玩家状态，包括调整生命值和灵气值
     * 
     * @param player 玩家对象
     * @returns 如果属性发生变化则返回true，否则返回false
     */
    recalculate(player) {
        // 保存当前最大生命值和灵气值
        const previousMaxHp = Math.max(1, Math.round(player.maxHp));
        const previousMaxQi = Math.max(0, Math.round(player.maxQi));
        
        // 构建新的属性状态
        const next = this.buildState(player);
        
        // 检查属性是否发生变化
        if (!hasAttrStateChanged(player.attrs, next)) {
            return false;
        }
        
        // 更新属性状态
        player.attrs.stage = next.stage;
        player.attrs.baseAttrs = next.baseAttrs;
        player.attrs.finalAttrs = next.finalAttrs;
        player.attrs.numericStats = next.numericStats;
        player.attrs.ratioDivisors = next.ratioDivisors;
        player.attrs.revision += 1;
        
        // 计算新的最大生命值和灵气值
        const nextMaxHp = Math.max(1, Math.round(next.numericStats.maxHp));
        const nextMaxQi = Math.max(0, Math.round(next.numericStats.maxQi));
        player.maxHp = nextMaxHp;
        player.maxQi = nextMaxQi;
        
        // 按比例调整当前生命值
        player.hp = previousMaxHp > 0
            ? clamp(Math.round(player.hp / previousMaxHp * nextMaxHp), 0, nextMaxHp)
            : nextMaxHp;
        
        // 按比例调整当前灵气值
        player.qi = previousMaxQi > 0
            ? clamp(Math.round(player.qi / previousMaxQi * nextMaxQi), 0, nextMaxQi)
            : nextMaxQi;
        
        // 更新自身版本号
        player.selfRevision += 1;
        
        return true;
    }
    /**
     * 标记面板为脏状态
     *
     * 当玩家的属性或状态发生变化时，需要标记面板为脏状态，
     * 以便在下次同步时通知客户端更新面板显示。
     *
     * @param player 玩家对象
     */
    markPanelDirty(player) {
        // 增加属性版本号，标记属性已变化
        player.attrs.revision += 1;
        // 增加自身版本号，标记玩家状态已变化
        player.selfRevision += 1;
    }
    /**
     * 构建玩家属性状态
     *
     * 基于玩家的当前状态（境界、装备、Buff、功法等）构建完整的属性状态，
     * 包括基础属性、最终属性、数值属性和比率除数。
     *
     * 计算顺序：
     * 1. 从默认模板创建基础属性
     * 2. 添加境界属性加成
     * 3. 添加功法属性加成
     * 4. 添加炼体属性加成
     * 5. 添加运行时属性加成
     * 6. 复制基础属性作为最终属性
     * 7. 添加装备属性加成到最终属性
     * 8. 添加Buff属性加成到最终属性
     * 9. 计算数值属性（基于属性权重）
     * 10. 应用百分比加成
     * 11. 应用灵根加成
     * 12. 应用生命值基线加成
     *
     * @param player 玩家对象
     * @returns 完整的属性状态
     */
    buildState(player) {
        // 获取玩家境界阶段，如果没有则使用默认境界
        const stage = player.realm?.stage ?? shared_1.DEFAULT_PLAYER_REALM_STAGE;
        // 获取境界对应的数值模板
        const template = shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[stage];
        // 获取运行时属性加成列表
        const runtimeBonuses = Array.isArray(player.runtimeBonuses) ? player.runtimeBonuses : [];
        // 收集需要投影的运行时属性加成
        const projectedRuntimeBonuses = collectProjectedRuntimeBonuses(runtimeBonuses);
        // 解析生命值基线加成
        const vitalBaselineBonus = resolveVitalBaselineBonus(runtimeBonuses);
        // 创建基础属性
        const baseAttrs = createBaseAttributes();
        // 解析功法属性加成
        const techniqueAttrBonus = resolveTechniqueAttrBonus(player.techniques.techniques, runtimeBonuses);
        // 计算炼体属性加成
        const bodyTrainingAttrBonus = (0, shared_1.calcBodyTrainingAttrBonus)(player.bodyTraining?.level ?? 0);
        // 添加境界属性加成
        addAttributes(baseAttrs, shared_1.PLAYER_REALM_CONFIG[stage].attrBonus);
        // 添加功法属性加成
        addAttributes(baseAttrs, techniqueAttrBonus);
        // 添加炼体属性加成
        addAttributes(baseAttrs, bodyTrainingAttrBonus);
        // 添加运行时属性加成
        for (const bonus of projectedRuntimeBonuses) {
            addAttributes(baseAttrs, bonus.attrs);
        }
        // 确保基础属性不小于0
        clampAttributes(baseAttrs);
        // 复制基础属性作为最终属性
        const finalAttrs = cloneAttributes(baseAttrs);
        // 添加装备属性加成到最终属性
        for (const entry of player.equipment.slots) {
            const item = entry.item;
            if (!item) {
                continue;
            }
            addAttributes(finalAttrs, item.equipAttrs);
        }
        // 添加Buff属性加成到最终属性
        for (const buff of player.buffs.buffs) {
            addAttributes(finalAttrs, buff.attrs);
        }
        // 确保最终属性不小于0
        clampAttributes(finalAttrs);
        // 从模板克隆数值属性
        const numericStats = (0, shared_1.cloneNumericStats)(template.stats);
        // 创建百分比加成累加器
        const percentBonuses = createPercentBonusAccumulator();
        // 遍历所有属性，应用属性权重和百分比加成
        for (const key of shared_1.ATTR_KEYS) {
            const value = finalAttrs[key];
            if (value === 0) {
                continue;
            }
            // 应用属性权重到数值属性
            applyAttrWeight(numericStats, key, value);
            // 累加百分比加成
            accumulateAttrPercentBonus(percentBonuses, key, value);
        }
        // 添加装备数值属性加成
        for (const entry of player.equipment.slots) {
            const item = entry.item;
            if (!item) {
                continue;
            }
            (0, shared_1.addPartialNumericStats)(numericStats, resolveItemStats(item.equipStats, item.equipValueStats));
        }
        // 添加Buff数值属性加成
        for (const buff of player.buffs.buffs) {
            (0, shared_1.addPartialNumericStats)(numericStats, buff.stats);
        }
        // 添加运行时数值属性加成
        for (const bonus of projectedRuntimeBonuses) {
            (0, shared_1.addPartialNumericStats)(numericStats, bonus.stats);
        }
        // 应用百分比加成
        applyPercentBonuses(numericStats, percentBonuses);
        // 应用灵根加成
        applySpiritualRoots(numericStats, player.spiritualRoots);
        // 应用生命值基线加成
        if (vitalBaselineBonus?.stats) {
            (0, shared_1.addPartialNumericStats)(numericStats, vitalBaselineBonus.stats);
        }
        // 返回完整的属性状态
        return {
            stage,
            baseAttrs,
            finalAttrs,
            numericStats,
            ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(template.ratioDivisors),
        };
    }
};
exports.PlayerAttributesService = PlayerAttributesService;
exports.PlayerAttributesService = PlayerAttributesService = __decorate([
    (0, common_1.Injectable)()
], PlayerAttributesService);
/**
 * 应用灵根加成
 *
 * 灵根是玩家的天赋属性，会影响玩家对五行元素伤害的加成和减伤。
 * 每种灵根（金、木、水、火、土）都会增加对应元素伤害和减伤。
 *
 * @param target 目标数值属性对象
 * @param roots 灵根属性对象
 */
function applySpiritualRoots(target, roots) {
    // 如果没有灵根属性，直接返回
    if (!roots) {
        return;
    }
    // 金灵根：增加金属性伤害和减伤
    target.elementDamageBonus.metal += roots.metal;
    target.elementDamageReduce.metal += roots.metal;
    // 木灵根：增加木属性伤害和减伤
    target.elementDamageBonus.wood += roots.wood;
    target.elementDamageReduce.wood += roots.wood;
    // 水灵根：增加水属性伤害和减伤
    target.elementDamageBonus.water += roots.water;
    target.elementDamageReduce.water += roots.water;
    // 火灵根：增加火属性伤害和减伤
    target.elementDamageBonus.fire += roots.fire;
    target.elementDamageReduce.fire += roots.fire;
    // 土灵根：增加土属性伤害和减伤
    target.elementDamageBonus.earth += roots.earth;
    target.elementDamageReduce.earth += roots.earth;
}
/**
 * 创建基础属性
 *
 * 基础属性是玩家角色的核心属性，包括：
 * - constitution（体质）：影响生命值和物理防御
 * - spirit（精神）：影响灵气值和法术攻击
 * - perception（感知）：影响命中和闪避
 * - talent（天赋）：影响暴击和暴击伤害
 * - comprehension（悟性）：影响修炼速度和技能熟练度
 * - luck（幸运）：影响掉落率和稀有掉落率
 *
 * @returns 基础属性对象
 */
function createBaseAttributes() {
    return {
        // 体质：影响生命值和物理防御
        constitution: shared_1.DEFAULT_BASE_ATTRS.constitution,
        // 精神：影响灵气值和法术攻击
        spirit: shared_1.DEFAULT_BASE_ATTRS.spirit,
        // 感知：影响命中和闪避
        perception: shared_1.DEFAULT_BASE_ATTRS.perception,
        // 天赋：影响暴击和暴击伤害
        talent: shared_1.DEFAULT_BASE_ATTRS.talent,
        // 悟性：影响修炼速度和技能熟练度
        comprehension: shared_1.DEFAULT_BASE_ATTRS.comprehension,
        // 幸运：影响掉落率和稀有掉落率
        luck: shared_1.DEFAULT_BASE_ATTRS.luck,
    };
}
/**
 * 创建百分比加成累加器
 *
 * 百分比加成累加器用于收集所有属性对数值属性的百分比加成，
 * 包括：
 * - maxHp：最大生命值百分比加成
 * - maxQi：最大灵气值百分比加成
 * - physAtk：物理攻击百分比加成
 * - spellAtk：法术攻击百分比加成
 *
 * @returns 百分比加成累加器对象
 */
function createPercentBonusAccumulator() {
    return {
        // 最大生命值百分比加成
        maxHp: 0,
        // 最大灵气值百分比加成
        maxQi: 0,
        // 物理攻击百分比加成
        physAtk: 0,
        // 法术攻击百分比加成
        spellAtk: 0,
    };
}
/**
 * 克隆属性对象
 *
 * 创建属性对象的深拷贝，避免修改原始对象。
 * 这在计算最终属性时非常重要，因为基础属性需要保持不变，
 * 而最终属性需要在基础属性的基础上添加装备和Buff加成。
 *
 * @param source 源属性对象
 * @returns 克隆的属性对象
 */
function cloneAttributes(source) {
    return {
        // 克隆体质属性
        constitution: source.constitution,
        // 克隆精神属性
        spirit: source.spirit,
        // 克隆感知属性
        perception: source.perception,
        // 克隆天赋属性
        talent: source.talent,
        // 克隆悟性属性
        comprehension: source.comprehension,
        // 克隆幸运属性
        luck: source.luck,
    };
}
/**
 * 添加属性加成
 *
 * 将属性加成应用到目标属性对象上。
 * 遍历所有属性键，如果补丁对象中有对应的属性值，则将其加到目标对象上。
 *
 * @param target 目标属性对象
 * @param patch 属性加成补丁对象
 */
function addAttributes(target, patch) {
    // 如果补丁对象不存在，直接返回
    if (!patch) {
        return;
    }
    // 遍历所有属性键
    for (const key of shared_1.ATTR_KEYS) {
        // 获取补丁对象中的属性值
        const value = patch[key];
        // 如果属性值存在，则将其加到目标对象上
        if (value !== undefined) {
            target[key] += value;
        }
    }
}
/**
 * 限制属性值范围
 *
 * 确保所有属性值不小于0，防止属性值变为负数。
 * 属性值可以为0，但不能为负数。
 *
 * @param target 目标属性对象
 */
function clampAttributes(target) {
    // 遍历所有属性键
    for (const key of shared_1.ATTR_KEYS) {
        // 确保属性值不小于0
        target[key] = Math.max(0, target[key]);
    }
}
/**
 * 应用属性权重到数值属性
 *
 * 根据属性权重配置，将基础属性值转换为数值属性加成。
 * 例如，体质属性会影响最大生命值和物理防御，精神属性会影响最大灵气值和法术攻击等。
 *
 * @param target 目标数值属性对象
 * @param key 属性键
 * @param value 属性值
 */
function applyAttrWeight(target, key, value) {
    // 获取属性对应的权重配置
    const weight = shared_1.ATTR_TO_NUMERIC_WEIGHTS[key];
    // 如果权重配置不存在，直接返回
    if (!weight) {
        return;
    }
    // 根据属性值缩放权重配置，并添加到目标数值属性
    (0, shared_1.addPartialNumericStats)(target, scalePartialNumericStats(weight, value));
}
/**
 * 累加属性百分比加成
 *
 * 根据属性百分比权重配置，将基础属性值转换为百分比加成。
 * 例如，体质属性会增加最大生命值的百分比加成，精神属性会增加最大灵气值的百分比加成等。
 * 这些百分比加成会在最后统一应用到数值属性上。
 *
 * @param target 百分比加成累加器对象
 * @param key 属性键
 * @param value 属性值
 */
function accumulateAttrPercentBonus(target, key, value) {
    // 获取属性对应的百分比权重配置
    const weight = shared_1.ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    // 如果权重配置不存在，直接返回
    if (!weight) {
        return;
    }
    // 累加最大生命值百分比加成
    if (weight.maxHp !== undefined)
        target.maxHp += weight.maxHp * value;
    // 累加最大灵气值百分比加成
    if (weight.maxQi !== undefined)
        target.maxQi += weight.maxQi * value;
    // 累加物理攻击百分比加成
    if (weight.physAtk !== undefined)
        target.physAtk += weight.physAtk * value;
    // 累加法术攻击百分比加成
    if (weight.spellAtk !== undefined)
        target.spellAtk += weight.spellAtk * value;
}
/**
 * 应用百分比加成
 *
 * 将累加的百分比加成应用到数值属性上。
 * 百分比加成是乘法加成，会基于当前属性值进行乘法运算。
 * 例如，如果maxHp为100，bonuses.maxHp为10，则最终maxHp为100 * (1 + 10 / 100) = 110。
 *
 * @param target 目标数值属性对象
 * @param bonuses 百分比加成累加器对象
 */
function applyPercentBonuses(target, bonuses) {
    // 应用最大生命值百分比加成
    if (bonuses.maxHp !== 0)
        target.maxHp *= 1 + bonuses.maxHp / 100;
    // 应用最大灵气值百分比加成
    if (bonuses.maxQi !== 0)
        target.maxQi *= 1 + bonuses.maxQi / 100;
    // 应用物理攻击百分比加成
    if (bonuses.physAtk !== 0)
        target.physAtk *= 1 + bonuses.physAtk / 100;
    // 应用法术攻击百分比加成
    if (bonuses.spellAtk !== 0)
        target.spellAtk *= 1 + bonuses.spellAtk / 100;
}
/**
 * 解析物品属性
 *
 * 根据物品的属性类型，返回最终的数值属性。
 * 如果物品有数值属性（equipValueStats），则将其编译为实际属性；
 * 否则直接返回装备属性（equipStats）。
 *
 * @param equipStats 装备属性对象
 * @param equipValueStats 装备数值属性对象
 * @returns 解析后的数值属性对象
 */
function resolveItemStats(equipStats, equipValueStats) {
    // 如果物品有数值属性，则将其编译为实际属性；否则直接返回装备属性
    return equipValueStats ? (0, shared_1.compileValueStatsToActualStats)(equipValueStats) : equipStats;
}
/**
 * 缩放部分数值属性
 *
 * 将部分数值属性对象中的所有数值属性按给定的倍数进行缩放。
 * 支持嵌套对象结构，例如元素伤害加成和减伤。
 * 例如，如果multiplier为2，则所有数值属性都会乘以2。
 *
 * @param source 源数值属性对象
 * @param multiplier 缩放倍数
 * @returns 缩放后的数值属性对象
 */
function scalePartialNumericStats(source, multiplier) {
    // 创建缩放后的对象
    const scaled = {};
    // 遍历源对象的所有键值对
    for (const [key, value] of Object.entries(source)) {
        // 如果值未定义，跳过
        if (value === undefined) {
            continue;
        }
        // 如果值是数字，直接缩放
        if (typeof value === 'number') {
            scaled[key] = value * multiplier;
            continue;
        }
        // 如果值是对象，递归处理嵌套属性
        if (typeof value === 'object' && value) {
            // 创建嵌套对象
            const group = {};
            // 遍历嵌套对象的所有键值对
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
                // 如果嵌套值是数字，进行缩放
                if (typeof nestedValue === 'number') {
                    group[nestedKey] = nestedValue * multiplier;
                }
            }
            // 如果嵌套对象不为空，添加到缩放后的对象
            if (Object.keys(group).length > 0) {
                scaled[key] = group;
            }
        }
    }
    // 返回缩放后的对象
    return scaled;
}
/**
 * 转换为功法状态对象
 *
 * 将功法条目转换为功法状态对象，确保所有字段都有默认值。
 * 功法状态对象包含功法的所有信息，包括等级、经验、境界、技能等。
 *
 * @param entry 功法条目对象
 * @returns 功法状态对象
 */
function toTechniqueState(entry) {
    return {
        // 功法ID
        techId: entry.techId,
        // 功法名称，如果没有则使用功法ID
        name: entry.name ?? entry.techId,
        // 功法等级，默认为1
        level: entry.level ?? 1,
        // 功法经验，默认为0
        exp: entry.exp ?? 0,
        // 升级所需经验，默认为0
        expToNext: entry.expToNext ?? 0,
        // 功法境界等级，默认为1
        realmLv: entry.realmLv ?? 1,
        // 功法境界，默认为0
        realm: entry.realm ?? 0,
        // 功法技能列表，默认为空数组
        skills: entry.skills ?? [],
        // 功法品阶，默认为undefined
        grade: entry.grade ?? undefined,
        // 功法类别，默认为undefined
        category: entry.category ?? undefined,
        // 功法层数，默认为undefined
        layers: entry.layers ?? undefined,
        // 功法属性曲线，默认为undefined
        attrCurves: entry.attrCurves ?? undefined,
    };
}
/**
 * 收集需要投影的运行时属性加成
 *
 * 从运行时属性加成列表中筛选出需要投影的加成。
 * 排除以下类型的加成：
 * - 没有来源的加成
 * - 派生加成（如境界、功法、装备、Buff等）
 * - 没有属性或数值属性的加成
 *
 * @param bonuses 运行时属性加成列表
 * @returns 需要投影的运行时属性加成列表
 */
function collectProjectedRuntimeBonuses(bonuses) {
    // 如果加成列表不存在或为空，返回空数组
    if (!Array.isArray(bonuses) || bonuses.length === 0) {
        return [];
    }
    // 过滤出需要投影的加成
    return bonuses.filter((entry) => {
        // 获取加成来源
        const source = typeof entry?.source === 'string' ? entry.source : '';
        // 如果没有来源，排除
        if (!source) {
            return false;
        }
        // 如果是派生加成，排除
        if (isDerivedRuntimeBonusSource(source)) {
            return false;
        }
        // 必须有属性或数值属性
        return Boolean(entry.attrs || entry.stats);
    });
}
/**
 * 解析功法属性加成
 *
 * 从运行时属性加成列表中查找功法聚合加成，如果找到则直接返回；
 * 否则根据功法列表计算功法属性加成。
 *
 * 功法聚合加成是一个优化，可以避免重复计算功法属性加成。
 * 如果运行时属性加成列表中已经包含了功法聚合加成，则直接使用该加成；
 * 否则需要遍历所有功法，计算每个功法的属性加成，然后累加。
 *
 * @param techniques 功法列表
 * @param runtimeBonuses 运行时属性加成列表
 * @returns 功法属性加成
 */
function resolveTechniqueAttrBonus(techniques, runtimeBonuses) {
    // 查找功法聚合加成
    const aggregateBonus = Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:technique_aggregate' && entry.attrs && typeof entry.attrs === 'object')
        : null;
    // 如果找到功法聚合加成，直接返回
    if (aggregateBonus?.attrs) {
        return aggregateBonus.attrs;
    }
    // 否则根据功法列表计算功法属性加成
    return (0, shared_1.calcTechniqueFinalAttrBonus)(techniques.map(toTechniqueState));
}
/**
 * 解析生命值基线加成
 *
 * 从运行时属性加成列表中查找生命值基线加成。
 * 生命值基线加成用于确保玩家的生命值不低于某个基线值，
 * 防止玩家因为属性变化而导致生命值过低。
 *
 * @param runtimeBonuses 运行时属性加成列表
 * @returns 生命值基线加成对象，如果没有找到则返回null
 */
function resolveVitalBaselineBonus(runtimeBonuses) {
    // 从运行时属性加成列表中查找生命值基线加成
    return Array.isArray(runtimeBonuses)
        ? runtimeBonuses.find((entry) => entry?.source === 'runtime:vitals_baseline' && entry.stats && typeof entry.stats === 'object')
        : null;
}
/**
 * 判断是否为派生运行时加成来源
 *
 * 派生运行时加成来源是指那些由其他系统派生的加成，
 * 而不是直接添加的加成。这些加成会在属性计算时自动计算，
 * 不需要在投影时重复计算。
 *
 * 派生加成来源包括：
 * - runtime:realm_stage：境界阶段加成
 * - runtime:realm_state：境界状态加成
 * - runtime:heaven_gate_roots：开天门灵根加成
 * - runtime:vitals_baseline：生命值基线加成
 * - runtime:technique_aggregate：功法聚合加成
 * - technique:*：单个功法加成
 * - equipment:*：装备加成
 * - buff:*：Buff加成
 *
 * @param source 加成来源字符串
 * @returns 如果是派生加成来源则返回true，否则返回false
 */
function isDerivedRuntimeBonusSource(source) {
    // 检查是否为派生运行时加成来源
    return source === 'runtime:realm_stage'
        || source === 'runtime:realm_state'
        || source === 'runtime:heaven_gate_roots'
        || source === 'runtime:vitals_baseline'
        || source === 'runtime:technique_aggregate'
        || source.startsWith('technique:')
        || source.startsWith('equipment:')
        || source.startsWith('buff:');
}
/**
 * 检查属性状态是否发生变化
 *
 * 比较两个属性状态对象，判断是否有任何属性发生变化。
 * 检查以下内容：
 * - 境界阶段是否变化
 * - 基础属性是否变化
 * - 最终属性是否变化
 * - 数值属性是否变化
 * - 比率除数是否变化
 *
 * @param previous 之前的属性状态
 * @param next 当前的属性状态
 * @returns 如果有任何属性发生变化则返回true，否则返回false
 */
function hasAttrStateChanged(previous, next) {
    // 检查境界阶段是否变化
    return previous.stage !== next.stage
        // 检查基础属性是否变化
        || !isSameAttributes(previous.baseAttrs, next.baseAttrs)
        // 检查最终属性是否变化
        || !isSameAttributes(previous.finalAttrs, next.finalAttrs)
        // 检查数值属性是否变化
        || !isSameNumericStats(previous.numericStats, next.numericStats)
        // 检查比率除数是否变化
        || !isSameRatioDivisors(previous.ratioDivisors, next.ratioDivisors);
}
/**
 * 比较两个属性对象是否相同
 *
 * 遍历所有属性键，比较两个属性对象的对应属性值是否相同。
 * 如果有任何属性值不同，则返回false；否则返回true。
 *
 * @param left 左侧属性对象
 * @param right 右侧属性对象
 * @returns 如果两个属性对象相同则返回true，否则返回false
 */
function isSameAttributes(left, right) {
    // 遍历所有属性键
    for (const key of shared_1.ATTR_KEYS) {
        // 如果对应属性值不同，返回false
        if (left[key] !== right[key]) {
            return false;
        }
    }
    // 所有属性值都相同，返回true
    return true;
}
function isSameNumericStats(left, right) {
    return left.maxHp === right.maxHp
        && left.maxQi === right.maxQi
        && left.physAtk === right.physAtk
        && left.spellAtk === right.spellAtk
        && left.physDef === right.physDef
        && left.spellDef === right.spellDef
        && left.hit === right.hit
        && left.dodge === right.dodge
        && left.crit === right.crit
        && left.critDamage === right.critDamage
        && left.breakPower === right.breakPower
        && left.resolvePower === right.resolvePower
        && left.maxQiOutputPerTick === right.maxQiOutputPerTick
        && left.qiRegenRate === right.qiRegenRate
        && left.hpRegenRate === right.hpRegenRate
        && left.cooldownSpeed === right.cooldownSpeed
        && left.auraCostReduce === right.auraCostReduce
        && left.auraPowerRate === right.auraPowerRate
        && left.playerExpRate === right.playerExpRate
        && left.techniqueExpRate === right.techniqueExpRate
        && left.realmExpPerTick === right.realmExpPerTick
        && left.techniqueExpPerTick === right.techniqueExpPerTick
        && left.lootRate === right.lootRate
        && left.rareLootRate === right.rareLootRate
        && left.viewRange === right.viewRange
        && left.moveSpeed === right.moveSpeed
        && left.extraAggroRate === right.extraAggroRate
        && left.elementDamageBonus.metal === right.elementDamageBonus.metal
        && left.elementDamageBonus.wood === right.elementDamageBonus.wood
        && left.elementDamageBonus.water === right.elementDamageBonus.water
        && left.elementDamageBonus.fire === right.elementDamageBonus.fire
        && left.elementDamageBonus.earth === right.elementDamageBonus.earth
        && left.elementDamageReduce.metal === right.elementDamageReduce.metal
        && left.elementDamageReduce.wood === right.elementDamageReduce.wood
        && left.elementDamageReduce.water === right.elementDamageReduce.water
        && left.elementDamageReduce.fire === right.elementDamageReduce.fire
        && left.elementDamageReduce.earth === right.elementDamageReduce.earth;
}
function isSameRatioDivisors(left, right) {
    return left.dodge === right.dodge
        && left.crit === right.crit
        && left.breakPower === right.breakPower
        && left.resolvePower === right.resolvePower
        && left.cooldownSpeed === right.cooldownSpeed
        && left.moveSpeed === right.moveSpeed
        && left.elementDamageReduce.metal === right.elementDamageReduce.metal
        && left.elementDamageReduce.wood === right.elementDamageReduce.wood
        && left.elementDamageReduce.water === right.elementDamageReduce.water
        && left.elementDamageReduce.fire === right.elementDamageReduce.fire
        && left.elementDamageReduce.earth === right.elementDamageReduce.earth;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=player-attributes.service.js.map
