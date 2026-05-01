// @ts-nocheck
"use strict";
/** 观察构建工具：生成可见度、结论与实体观察详情。 */
Object.defineProperty(exports, "__esModule", { value: true });

const shared_1 = require("@mud/shared");
const combat_resolution_helpers_1 = require("../combat/combat-resolution.helpers");

/** 观察失真阈值：低于该比例时使用模糊文案。 */
const OBSERVATION_BLIND_RATIO = 0.2;

/** 观察完整阈值：到达该比例时显示完整信息。 */
const OBSERVATION_FULL_RATIO = 1.2;
/** 生成地块默认战斗属性快照。 */
function createTileCombatAttributes() {
    return {
        constitution: 0,
        spirit: 0,
        perception: 0,
        talent: 0,
        strength: 0,
        meridians: 0,
    };
}
/** 生成可用于战斗计算的地块数值面板。 */
function createTileCombatNumericStats(maxHp) {
    return {
        ...(0, shared_1.cloneNumericStats)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].stats),
        maxHp,
        maxQi: 0,
        physAtk: 0,
        spellAtk: 0,
        physDef: 0,
        spellDef: 0,
        hit: 0,
        dodge: 0,
        crit: 0,
        critDamage: 0,
        breakPower: 0,
        resolvePower: 0,
        maxQiOutputPerTick: 0,
        qiRegenRate: 0,
        hpRegenRate: 0,
        cooldownSpeed: 0,
        auraCostReduce: 0,
        auraPowerRate: 0,
        playerExpRate: 0,
        techniqueExpRate: 0,
        realmExpPerTick: 0,
        techniqueExpPerTick: 0,
        lootRate: 0,
        rareLootRate: 0,
        viewRange: 0,
        moveSpeed: 0,
        extraAggroRate: 0,
        elementDamageBonus: {
            metal: 0,
            wood: 0,
            water: 0,
            fire: 0,
            earth: 0,
        },
        elementDamageReduce: {
            metal: 0,
            wood: 0,
            water: 0,
            fire: 0,
            earth: 0,
        },
    };
}
/** 复用境界模板创建地块比率分母系数。 */
function createTileCombatRatioDivisors() {
    return (0, shared_1.cloneNumericRatioDivisors)(shared_1.PLAYER_REALM_NUMERIC_TEMPLATES[shared_1.DEFAULT_PLAYER_REALM_STAGE].ratioDivisors);
}
/** 按命中、闪避、暴击与减伤规则输出真实伤害值。 */
function computeResolvedDamage(baseDamage, damageKind, attackerStats, attackerRatios, targetStats, targetRatios) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return (0, combat_resolution_helpers_1.resolveCombatHit)({
        attackerStats,
        attackerRatios,
        attackerRealmLv: 1,
        attackerCombatExp: 0,
        targetStats,
        targetRatios,
        targetRealmLv: 1,
        targetCombatExp: 0,
        baseDamage,
        damageKind,
        damageMultiplier: 1,
    });
}
/** 生成中文的伤害明细字符串。 */
function formatCombatDamageBreakdown(rawDamage, actualDamage, damageKind, element) {
    return `原始 ${(0, shared_1.formatDisplayInteger)(Math.max(0, Math.round(rawDamage)))} - 实际 ${(0, shared_1.formatDisplayInteger)(Math.max(0, Math.round(actualDamage)))} - ${formatCombatDamageType(damageKind, element)}`;
}
/** 生成“攻击/施展技能”类的动作描述语句。 */
function formatCombatActionClause(casterLabel, targetLabel, actionLabel) {
    return actionLabel === '攻击'
        ? `${casterLabel}对${targetLabel}发起攻击`
        : `${casterLabel}对${targetLabel}施展${actionLabel}`;
}
/** 生成伤害类型文本（物理/法术+元素）。 */
function formatCombatDamageType(damageKind, element) {

    const elementLabel = element ? `${shared_1.ELEMENT_KEY_LABELS[element] ?? element}行` : '';
    return damageKind === 'physical' ? `${elementLabel}物理` : `${elementLabel}法术`;
}
/** 浅拷贝只读展示用 Buff，避免运行时引用污染。 */
function cloneVisibleBuff(source) {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
/** 观察展示数值归一化，缺失或非有限值按 0 展示。 */
function normalizeObservationNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}
/** 观察清晰度分母归一化，缺失或非有限值按 1 处理，避免 NaN 误判为完整洞察。 */
function normalizeObservationSpirit(value) {
    const numeric = normalizeObservationNumber(value);
    return Math.max(1, Math.round(numeric));
}
/** 输出整数展示文本，保持观察面板与主线口径一致。 */
function formatWholeObservation(value) {
    return `${Math.max(0, Math.round(normalizeObservationNumber(value)))}`;
}
/** 输出百分比展示文本，供回复/速率等属性复用。 */
function formatRateObservation(value) {
    const percent = normalizeObservationNumber(value) / 100;
    return `${percent.toFixed(percent % 1 === 0 ? 0 : percent % 0.1 === 0 ? 1 : 2)}%`;
}
/** 输出暴伤展示文本，沿用主线 200% 基底口径。 */
function formatCritDamageObservation(value) {
    const total = 200 + Math.max(0, normalizeObservationNumber(value)) / 10;
    return `${total.toFixed(total % 1 === 0 ? 0 : total % 0.1 === 0 ? 1 : 2)}%`;
}
/** 构建观察面板属性行，恢复与 main 一致的可见属性集合。 */
function buildObservationLineSpecs(snapshot, includeResources) {
    const lines = [];
    if (includeResources) {
        lines.push(
            { threshold: 0.18, label: '生命', value: formatCurrentMaxObservation(snapshot.hp, snapshot.maxHp) },
            { threshold: 0.24, label: '灵力', value: formatCurrentMaxObservation(snapshot.qi, snapshot.maxQi) },
        );
    }
    lines.push(
        { threshold: 0.32, label: '物理攻击', value: formatWholeObservation(snapshot.stats.physAtk) },
        { threshold: 0.36, label: '物理防御', value: formatWholeObservation(snapshot.stats.physDef) },
        { threshold: 0.4, label: '法术攻击', value: formatWholeObservation(snapshot.stats.spellAtk) },
        { threshold: 0.44, label: '法术防御', value: formatWholeObservation(snapshot.stats.spellDef) },
        { threshold: 0.52, label: '命中', value: formatWholeObservation(snapshot.stats.hit) },
        { threshold: 0.56, label: '闪避', value: formatWholeObservation(snapshot.stats.dodge) },
        { threshold: 0.62, label: '暴击', value: formatWholeObservation(snapshot.stats.crit) },
        { threshold: 0.66, label: '免爆', value: formatWholeObservation(snapshot.stats.antiCrit) },
        { threshold: 0.7, label: '暴击伤害', value: formatCritDamageObservation(snapshot.stats.critDamage) },
        { threshold: 0.76, label: '破招', value: formatWholeObservation(snapshot.stats.breakPower) },
        { threshold: 0.8, label: '化解', value: formatWholeObservation(snapshot.stats.resolvePower) },
        { threshold: 0.84, label: '最大灵力输出速率', value: `${formatWholeObservation(snapshot.stats.maxQiOutputPerTick)} / 息` },
        { threshold: 0.87, label: '灵力回复', value: `${formatRateObservation(snapshot.stats.qiRegenRate)} / 息` },
        { threshold: 0.89, label: '生命回复', value: `${formatRateObservation(snapshot.stats.hpRegenRate)} / 息` },
    );
    if (snapshot.realmLabel) {
        lines.push({ threshold: 0.9, label: '境界', value: snapshot.realmLabel });
    }
    if (snapshot.attrs) {
        lines.push(
            { threshold: 0.92, label: '体魄', value: formatWholeObservation(snapshot.attrs.constitution) },
            { threshold: 0.94, label: '神识', value: formatWholeObservation(snapshot.attrs.spirit) },
            { threshold: 0.96, label: '身法', value: formatWholeObservation(snapshot.attrs.perception) },
            { threshold: 0.98, label: '根骨', value: formatWholeObservation(snapshot.attrs.talent) },
            { threshold: 0.99, label: '力道', value: formatWholeObservation(snapshot.attrs.strength) },
            { threshold: 1, label: '经脉', value: formatWholeObservation(snapshot.attrs.meridians) },
        );
    }
    return lines;
}
/** 构建玩家观察面板的属性项与可见度信息。 */
function buildPlayerObservation(viewerSpirit, target, selfView = false) {
    return buildObservationInsight(viewerSpirit, target.attrs.finalAttrs.spirit, buildObservationLineSpecs({
        hp: target.hp,
        maxHp: target.maxHp,
        qi: target.qi,
        maxQi: target.maxQi,
        stats: target.attrs.numericStats,
        attrs: target.attrs.finalAttrs,
        realmLabel: target.realm?.displayName,
    }, true), selfView);
}
/** 构建妖兽观察面板的属性项与清晰度。 */
function buildMonsterObservation(viewerSpirit, monster) {
    return buildObservationInsight(viewerSpirit, monster.attrs.spirit, [
        ...buildObservationLineSpecs({
            hp: monster.hp,
            maxHp: monster.maxHp,
            qi: 0,
            maxQi: 0,
            stats: monster.numericStats,
            attrs: monster.attrs,
        }, false),
        { threshold: 0.28, label: '血脉层次', value: shared_1.MONSTER_TIER_LABELS[monster.tier] ?? '凡血' },
        { threshold: 0.9, label: '境界', value: `等级 ${monster.level}` },
    ]);
}
/** 生成妖兽战利品预览列表与命中概率。 */
function buildMonsterLootPreview(contentTemplateRepository, viewer, monster) {

    const dropTable = contentTemplateRepository?.monsterDropsByMonsterId?.get(monster.monsterId) ?? [];

    const lootRate = viewer?.attrs?.numericStats?.lootRate ?? 0;

    const rareLootRate = viewer?.attrs?.numericStats?.rareLootRate ?? 0;

    const entries = dropTable
        .map((drop) => ({
        itemId: drop.itemId,
        name: drop.name,
        type: drop.type,
        count: drop.count,
        chance: resolveObservedDropChance(drop.chance, lootRate, rareLootRate),
    }))
        .sort((left, right) => right.chance - left.chance || compareStableText(left.itemId, right.itemId));
    return {
        entries,
        emptyText: entries.length > 0 ? undefined : '此獠身上暂未看出稳定掉落。',
    };
}
/** 依据观看者掉率属性，调整可见掉落概率。 */
function resolveObservedDropChance(baseChanceInput, lootRateBonus, rareLootRateBonus) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const baseChance = typeof baseChanceInput === 'number' ? Math.max(0, Math.min(1, baseChanceInput)) : 1;
    if (baseChance <= 0) {
        return 0;
    }

    const totalRateBonus = (Number.isFinite(lootRateBonus) ? lootRateBonus : 0)
        + (baseChance <= 0.001 ? (Number.isFinite(rareLootRateBonus) ? rareLootRateBonus : 0) : 0);

    const killEquivalent = totalRateBonus >= 0
        ? 1 + totalRateBonus / 10000
        : 1 / (1 + Math.abs(totalRateBonus) / 10000);
    if (killEquivalent <= 0) {
        return 0;
    }
    return 1 - Math.pow(1 - baseChance, killEquivalent);
}
/** 稳定文本比较，给可复现的排序行为。 */
function compareStableText(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}
/** 生成 NPC 可见信息中的身份、商铺与任务指示。 */
function buildNpcObservation(npc) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const lines = [
        { label: '身份', value: npc.role ?? '寻常人物' },
        { label: '商号', value: npc.hasShop ? '经营货铺' : '暂无营生' },
    ];
    if (typeof npc.dialogue === 'string' && npc.dialogue.trim()) {
        lines.push({ label: '话语', value: npc.dialogue.trim() });
    }
    if (npc.quests.length > 0) {
        lines.push({ label: '委托', value: `可交互 ${npc.quests.length} 项` });
    }
    return {
        clarity: 'clear',
        verdict: npc.quests.length > 0
            ? '对方似乎正等着与来客交谈，身上带着几分未了的委托气息。'
            : npc.hasShop
                ? '对方神色沉稳，像是久经往来的买卖人。'
                : '对方气机平和，看不出明显敌意。',
        lines,
    };
}
/** 生成传送点实体详情：类型、触发方式、目标坐标。 */
function buildPortalTileEntityDetail(portal, targetMapName) {

    const destination = targetMapName
        ? `${targetMapName} (${portal.targetX}, ${portal.targetY})`
        : `${portal.targetMapId} (${portal.targetX}, ${portal.targetY})`;
    return {
        id: buildPortalId(portal),
        name: buildPortalDisplayName(portal, targetMapName),
        kind: 'portal',
        observation: {
            clarity: 'clear',

            verdict: portal.trigger === 'auto'
                ? '此地灵路与空间缝隙已经贯通，踏入其中便会立刻被牵引离去。'
                : '此地灵路稳定却未主动张开，需要你亲自触动才能穿行。',
            lines: [
                { label: '类型', value: buildPortalKindLabel(portal.kind) },
                { label: '方向', value: portal.direction === 'one_way' ? '单向' : '双向' },
                { label: '触发', value: portal.trigger === 'auto' ? '踏入即触发' : '需要主动使用' },
                { label: '去向', value: destination },
            ],
        },
    };
}
/** 生成地面堆叠物实体详情与摘要文案。 */
function buildGroundTileEntityDetail(groundPile) {

    const totalCount = groundPile.items.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.count ?? 0)), 0);

    const previews = groundPile.items
        .slice(0, 3)
        .map((entry) => `${entry.name ?? entry.itemId} x${Math.max(0, Math.round(entry.count ?? 0))}`);

    const remainingKinds = Math.max(0, groundPile.items.length - previews.length);

    const previewText = remainingKinds > 0
        ? `${previews.join('、')} 等 ${groundPile.items.length} 类`
        : previews.join('、');
    return {
        id: groundPile.sourceId,

        name: groundPile.items.length === 1
            ? (groundPile.items[0]?.name ?? groundPile.items[0]?.itemId ?? '地面物品')
            : `散落物品堆 (${groundPile.items.length})`,
        kind: 'ground',
        observation: {
            clarity: 'clear',

            verdict: groundPile.items.length === 1
                ? '地上静静躺着一件可拾取之物。'
                : '地上散落着几样可拾取之物，像是刚被人匆忙遗落。',
            lines: [
                { label: '种类', value: `${groundPile.items.length} 类` },
                { label: '总量', value: `${totalCount} 件` },
                { label: '可见', value: previewText || '暂无可辨之物' },
            ],
        },
    };
}
/** 生成容器实体详情与搜索状态。 */
function buildContainerTileEntityDetail(container) {
    return {
        id: `container:${container.id}`,
        name: container.name,
        kind: 'container',
        observation: {
            clarity: 'clear',
            verdict: container.desc?.trim() || `这处${container.name}可以搜索，翻找后或许会有收获。`,
            lines: [
                { label: '类别', value: '可搜索陈设' },
                { label: '名称', value: container.name },
                { label: '搜索阶次', value: String(container.grade) },
            ],
        },
    };
}
/** 构建可见度层级文本与详情条目。 */
function buildObservationInsight(viewerSpirit, targetSpirit, lines, selfView = false) {

    const progress = selfView ? 1 : computeObservationProgress(viewerSpirit, targetSpirit);
    return {
        clarity: resolveObservationClarity(progress),
        verdict: buildObservationVerdict(progress, selfView),
        lines: lines.map((line) => ({
            label: line.label,

            value: progress >= line.threshold ? line.value : '???',
        })),
    };
}
/** 计算观察进度百分比，用于盲/朦/清晰分级。 */
function computeObservationProgress(viewerSpirit, targetSpirit) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalizedViewer = normalizeObservationSpirit(viewerSpirit);

    const normalizedTarget = normalizeObservationSpirit(targetSpirit);

    const ratio = normalizedViewer / normalizedTarget;
    if (ratio <= OBSERVATION_BLIND_RATIO) {
        return 0;
    }
    if (ratio >= OBSERVATION_FULL_RATIO) {
        return 1;
    }
    return Math.max(0, Math.min(1, (ratio - OBSERVATION_BLIND_RATIO) / (OBSERVATION_FULL_RATIO - OBSERVATION_BLIND_RATIO)));
}
/** 根据进度返回 clarity 分层（veiled/blurred/partial/clear/complete）。 */
function resolveObservationClarity(progress) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (progress <= 0) {
        return 'veiled';
    }
    if (progress < 0.34) {
        return 'blurred';
    }
    if (progress < 0.68) {
        return 'partial';
    }
    if (progress < 1) {
        return 'clear';
    }
    return 'complete';
}
/** 按 clarity 生成结论文案。 */
function buildObservationVerdict(progress, selfView) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (selfView) {
        return '神识内照，经络与底蕴尽现。';
    }
    if (progress <= 0) {
        return '对方气机晦暗难明，暂时看不透。';
    }
    if (progress < 0.34) {
        return '只能勉强分辨出些许轮廓。';
    }
    if (progress < 0.68) {
        return '已能看出部分深浅，但仍有遮掩。';
    }
    if (progress < 1) {
        return '大致能辨明其底蕴与强弱。';
    }
    return '对方虚实已尽收眼底。';
}
/** 输出“当前值/最大值”数值文本。 */
function formatCurrentMaxObservation(current, max) {
    return `${Math.max(0, Math.round(normalizeObservationNumber(current)))} / ${Math.max(0, Math.round(normalizeObservationNumber(max)))}`;
}
/** 组合可读的传送点显示名。 */
function buildPortalDisplayName(portal, targetMapName) {

    const base = buildPortalKindLabel(portal.kind);
    return targetMapName ? `${base} · ${targetMapName}` : base;
}
/** 将传送点类型映射为界面标签。 */
function buildPortalKindLabel(kind) {
    switch (kind) {
        case 'stairs':
            return '楼梯';
        case 'door':
            return '门扉';
        case 'cave':
            return '洞口';
        case 'gate':
            return '关隘';
        default:
            return '传送阵';
    }
}
/** 读取显式传送点 ID，兼容旧坐标 ID。 */
function buildPortalId(portalOrX, y) {
    if (portalOrX && typeof portalOrX === 'object') {
        const explicit = typeof portalOrX.id === 'string' ? portalOrX.id.trim() : '';
        return explicit || `${portalOrX.x}:${portalOrX.y}`;
    }
    return `${portalOrX}:${y}`;
}
exports.createTileCombatAttributes = createTileCombatAttributes;
exports.createTileCombatNumericStats = createTileCombatNumericStats;
exports.createTileCombatRatioDivisors = createTileCombatRatioDivisors;
exports.computeResolvedDamage = computeResolvedDamage;
exports.formatCombatDamageBreakdown = formatCombatDamageBreakdown;
exports.formatCombatActionClause = formatCombatActionClause;
exports.formatCombatDamageType = formatCombatDamageType;
exports.cloneVisibleBuff = cloneVisibleBuff;
exports.buildPlayerObservation = buildPlayerObservation;
exports.buildMonsterObservation = buildMonsterObservation;
exports.buildMonsterLootPreview = buildMonsterLootPreview;
exports.resolveObservedDropChance = resolveObservedDropChance;
exports.compareStableText = compareStableText;
exports.buildNpcObservation = buildNpcObservation;
exports.buildPortalTileEntityDetail = buildPortalTileEntityDetail;
exports.buildGroundTileEntityDetail = buildGroundTileEntityDetail;
exports.buildContainerTileEntityDetail = buildContainerTileEntityDetail;
exports.buildObservationInsight = buildObservationInsight;
exports.computeObservationProgress = computeObservationProgress;
exports.resolveObservationClarity = resolveObservationClarity;
exports.buildObservationVerdict = buildObservationVerdict;
exports.formatCurrentMaxObservation = formatCurrentMaxObservation;
exports.buildPortalDisplayName = buildPortalDisplayName;
exports.buildPortalKindLabel = buildPortalKindLabel;
exports.buildPortalId = buildPortalId;
export {
    createTileCombatAttributes,
    createTileCombatNumericStats,
    createTileCombatRatioDivisors,
    computeResolvedDamage,
    formatCombatDamageBreakdown,
    formatCombatActionClause,
    formatCombatDamageType,
    cloneVisibleBuff,
    buildPlayerObservation,
    buildMonsterObservation,
    buildMonsterLootPreview,
    resolveObservedDropChance,
    compareStableText,
    buildNpcObservation,
    buildPortalTileEntityDetail,
    buildGroundTileEntityDetail,
    buildContainerTileEntityDetail,
    buildObservationInsight,
    computeObservationProgress,
    resolveObservationClarity,
    buildObservationVerdict,
    formatCurrentMaxObservation,
    buildPortalDisplayName,
    buildPortalKindLabel,
    buildPortalId,
};
