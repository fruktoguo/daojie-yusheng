/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 投影器增量 diff 工具。
 * 对比前后两帧投影状态，生成最小 patch（add/remove/update），用于增量同步。
 */

import type {
  Attributes,
  EquipmentSlotUpdateEntry,
  InventorySlotUpdateEntry,
  SyncedItemStack,
  TechniqueUpdateEntryView,
  VisibleBuffState,
  WorldBuildingPatchView,
  WorldContainerPatchView,
  WorldFormationPatchView,
  WorldGroundPatchView,
  WorldMonsterPatchView,
  WorldNpcPatchView,
  WorldPlayerPatchView,
  WorldPortalPatchView,
  NumericStats,
  NumericRatioDivisors,
  PartialNumericStats,
} from '@mud/shared';
import {
  ATTRIBUTE_KEYS,
  NUMERIC_STAT_KEYS,
  RATIO_DIVISOR_KEYS,
  ELEMENT_GROUP_KEYS,
  type ProjectedPlayerEntry,
  type ProjectedNpcEntry,
  type ProjectedMonsterEntry,
  type ProjectedPortalEntry,
  type ProjectedGroundPileEntry,
  type ProjectedContainerEntry,
  type ProjectedBuildingEntry,
  type ProjectedFormationEntry,
  type ProjectedActionEntry,
  type ProjectedElementGroup,
  type ProjectedPatchResult,
  type ProjectedAttrPatch,
  type ProjectedNumericStatsPatch,
  type ProjectedRatioDivisorsPatch,
  type ElementGroupKey,
} from './projector-types';
import {
  isSameItem,
  isSameGroundPile,
  isSameNpcQuestMarker,
  isSameTechniqueEntry,
  isSameTechniqueLayerList,
  isSameTechniqueSkillList,
  isSameActionEntry,
  isSameBuffEntry,
} from './projector-compare';

/** 对比前后帧玩家实体，生成 add/remove/update patch 列表。 */
export function diffPlayerEntries(previous: Map<string, ProjectedPlayerEntry>, current: Map<string, ProjectedPlayerEntry>): WorldPlayerPatchView[] {
    const result: WorldPlayerPatchView[] = [];
    for (const [playerId, entry] of current) {
        const prev = previous.get(playerId);
        if (!prev) {
            result.push({ id: playerId, n: entry.n, ch: entry.ch, x: entry.x, y: entry.y, f: entry.f, sc: entry.sc, sm: entry.sm });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldPlayerPatchView = { id: playerId };
        let changed = false;
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.ch !== entry.ch) { delta.ch = entry.ch; changed = true; }
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.f !== entry.f) { delta.f = entry.f; changed = true; }
        if (prev.sc !== entry.sc) { delta.sc = entry.sc ?? null; changed = true; }
        if (prev.sm !== entry.sm) { delta.sm = entry.sm ?? null; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const playerId of previous.keys()) {
        if (!current.has(playerId)) { result.push({ id: playerId, rm: 1 }); }
    }
    return result;
}

export function diffNpcEntries(previous: Map<string, ProjectedNpcEntry>, current: Map<string, ProjectedNpcEntry>): WorldNpcPatchView[] {
    const result: WorldNpcPatchView[] = [];
    for (const [npcId, entry] of current) {
        const prev = previous.get(npcId);
        if (!prev) {
            result.push({ id: npcId, x: entry.x, y: entry.y, n: entry.n, ch: entry.ch, c: entry.c, sh: entry.sh === 1 ? 1 : undefined, qm: entry.qm });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldNpcPatchView = { id: npcId };
        let changed = false;
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.ch !== entry.ch) { delta.ch = entry.ch; changed = true; }
        if (prev.c !== entry.c) { delta.c = entry.c; changed = true; }
        if (prev.sh !== entry.sh) { delta.sh = entry.sh === 1 ? 1 : undefined; changed = true; }
        if (!isSameNpcQuestMarker(prev.qm, entry.qm)) { delta.qm = entry.qm; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const npcId of previous.keys()) {
        if (!current.has(npcId)) { result.push({ id: npcId, rm: 1 }); }
    }
    return result;
}

export function diffPortalEntries(previous: Map<string, ProjectedPortalEntry>, current: Map<string, ProjectedPortalEntry>): WorldPortalPatchView[] {
    const result: WorldPortalPatchView[] = [];
    for (const [portalId, entry] of current) {
        const prev = previous.get(portalId);
        if (!prev) {
            result.push({ id: portalId, n: entry.n, ch: entry.ch, x: entry.x, y: entry.y, tm: entry.tm, tr: entry.tr, d: entry.d, k: entry.k, sid: entry.sid, c: entry.c });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldPortalPatchView = { id: portalId };
        let changed = false;
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.ch !== entry.ch) { delta.ch = entry.ch; changed = true; }
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.tm !== entry.tm) { delta.tm = entry.tm; changed = true; }
        if (prev.tr !== entry.tr) { delta.tr = entry.tr; changed = true; }
        if (prev.d !== entry.d) { delta.d = entry.d; changed = true; }
        if (prev.k !== entry.k) { delta.k = entry.k; changed = true; }
        if (prev.sid !== entry.sid) { delta.sid = entry.sid; changed = true; }
        if (prev.c !== entry.c) { delta.c = entry.c; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const portalId of previous.keys()) {
        if (!current.has(portalId)) { result.push({ id: portalId, rm: 1 }); }
    }
    return result;
}

/** 对比前后帧怪物实体，生成 add/remove/update patch 列表。 */
export function diffMonsterEntries(previous: Map<string, ProjectedMonsterEntry>, current: Map<string, ProjectedMonsterEntry>): WorldMonsterPatchView[] {
    const result: WorldMonsterPatchView[] = [];
    for (const [runtimeId, entry] of current) {
        const prev = previous.get(runtimeId);
        if (!prev) {
            result.push({ id: runtimeId, mid: entry.mid, x: entry.x, y: entry.y, f: entry.f, hp: entry.hp, maxHp: entry.maxHp, qi: entry.qi, maxQi: entry.maxQi, n: entry.n, c: entry.c, tr: entry.tr });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldMonsterPatchView = { id: runtimeId };
        let changed = false;
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.f !== entry.f) { delta.f = entry.f; changed = true; }
        if (prev.hp !== entry.hp) { delta.hp = entry.hp; changed = true; }
        if (prev.maxHp !== entry.maxHp) { delta.maxHp = entry.maxHp; changed = true; }
        if (prev.qi !== entry.qi) { delta.qi = entry.qi; changed = true; }
        if (prev.maxQi !== entry.maxQi) { delta.maxQi = entry.maxQi; changed = true; }
        if (prev.mid !== entry.mid) { delta.mid = entry.mid; changed = true; }
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.c !== entry.c) { delta.c = entry.c; changed = true; }
        if (prev.tr !== entry.tr) { delta.tr = entry.tr; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const runtimeId of previous.keys()) {
        if (!current.has(runtimeId)) { result.push({ id: runtimeId, rm: 1 }); }
    }
    return result;
}

export function diffGroundPiles(previous: Map<string, ProjectedGroundPileEntry>, current: Map<string, ProjectedGroundPileEntry>): WorldGroundPatchView[] {
    const result: WorldGroundPatchView[] = [];
    for (const [sourceId, entry] of current) {
        const prev = previous.get(sourceId);
        if (prev === entry) {
            continue;
        }
        if (!isSameGroundPile(prev ?? null, entry)) {
            result.push({ sourceId, x: entry.x, y: entry.y, items: entry.items });
        }
    }
    for (const [sourceId, entry] of previous) {
        if (!current.has(sourceId)) {
            result.push({ sourceId, items: null });
        }
    }
    return result;
}

export function diffContainerEntries(previous: Map<string, ProjectedContainerEntry>, current: Map<string, ProjectedContainerEntry>): WorldContainerPatchView[] {
    const result: WorldContainerPatchView[] = [];
    for (const [containerId, entry] of current) {
        const prev = previous.get(containerId);
        if (!prev) {
            result.push({ id: containerId, x: entry.x, y: entry.y, n: entry.n, ch: entry.ch, c: entry.c, rr: entry.rr });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldContainerPatchView = { id: containerId };
        let changed = false;
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.ch !== entry.ch) { delta.ch = entry.ch; changed = true; }
        if (prev.c !== entry.c) { delta.c = entry.c; changed = true; }
        if (prev.rr !== entry.rr) { delta.rr = entry.rr ?? null; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const containerId of previous.keys()) {
        if (!current.has(containerId)) { result.push({ id: containerId, rm: 1 }); }
    }
    return result;
}

export function diffBuildingEntries(previous: Map<string, ProjectedBuildingEntry>, current: Map<string, ProjectedBuildingEntry>): WorldBuildingPatchView[] {
    const result: WorldBuildingPatchView[] = [];
    for (const [buildingId, entry] of current) {
        const prev = previous.get(buildingId);
        if (!prev) {
            result.push({ id: buildingId, x: entry.x, y: entry.y, n: entry.n, ch: entry.ch, c: entry.c, rt: entry.rt, tt: entry.tt });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldBuildingPatchView = { id: buildingId };
        let changed = false;
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.ch !== entry.ch) { delta.ch = entry.ch; changed = true; }
        if (prev.c !== entry.c) { delta.c = entry.c; changed = true; }
        if (prev.rt !== entry.rt) { delta.rt = entry.rt ?? null; changed = true; }
        if (prev.tt !== entry.tt) { delta.tt = entry.tt ?? null; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const buildingId of previous.keys()) {
        if (!current.has(buildingId)) { result.push({ id: buildingId, rm: 1 }); }
    }
    return result;
}

export function diffFormationEntries(previous: Map<string, ProjectedFormationEntry>, current: Map<string, ProjectedFormationEntry>): WorldFormationPatchView[] {
    const result: WorldFormationPatchView[] = [];
    for (const [formationId, entry] of current) {
        const prev = previous.get(formationId);
        if (!prev) {
            result.push({ id: formationId, x: entry.x, y: entry.y, n: entry.n, ch: entry.ch, c: entry.c, ac: entry.ac, rs: entry.rs, sh: entry.sh, hl: entry.hl, bch: entry.bch, bc: entry.bc, bhl: entry.bhl, ev: entry.ev, rv: entry.rv, bv: entry.bv, tx: entry.tx, bd: entry.bd, os: entry.os, op: entry.op, lt: entry.lt });
            continue;
        }
        if (prev === entry) {
            continue;
        }
        const delta: WorldFormationPatchView = { id: formationId };
        let changed = false;
        if (prev.x !== entry.x) { delta.x = entry.x; changed = true; }
        if (prev.y !== entry.y) { delta.y = entry.y; changed = true; }
        if (prev.n !== entry.n) { delta.n = entry.n; changed = true; }
        if (prev.ch !== entry.ch) { delta.ch = entry.ch; changed = true; }
        if (prev.c !== entry.c) { delta.c = entry.c; changed = true; }
        if (prev.ac !== entry.ac) { delta.ac = entry.ac; changed = true; }
        if (prev.rs !== entry.rs) { delta.rs = entry.rs; changed = true; }
        if (prev.sh !== entry.sh) { delta.sh = entry.sh; changed = true; }
        if (prev.hl !== entry.hl) { delta.hl = entry.hl; changed = true; }
        if (prev.bch !== entry.bch) { delta.bch = entry.bch; changed = true; }
        if (prev.bc !== entry.bc) { delta.bc = entry.bc; changed = true; }
        if (prev.bhl !== entry.bhl) { delta.bhl = entry.bhl; changed = true; }
        if (prev.ev !== entry.ev) { delta.ev = entry.ev; changed = true; }
        if (prev.rv !== entry.rv) { delta.rv = entry.rv; changed = true; }
        if (prev.bv !== entry.bv) { delta.bv = entry.bv; changed = true; }
        if (prev.tx !== entry.tx) { delta.tx = entry.tx; changed = true; }
        if (prev.bd !== entry.bd) { delta.bd = entry.bd; changed = true; }
        if (prev.os !== entry.os) { delta.os = entry.os; changed = true; }
        if (prev.op !== entry.op) { delta.op = entry.op; changed = true; }
        if (prev.lt !== entry.lt) { delta.lt = entry.lt; changed = true; }
        if (changed) { result.push(delta); }
    }
    for (const formationId of previous.keys()) {
        if (!current.has(formationId)) { result.push({ id: formationId, rm: 1 }); }
    }
    return result;
}

/** 对比前后帧背包槽位，返回变化的槽位列表。 */
export function diffInventorySlots(previous: SyncedItemStack[], current: SyncedItemStack[]): InventorySlotUpdateEntry[] {
    const patch: InventorySlotUpdateEntry[] = [];
    const maxLength = Math.max(previous.length, current.length);
    for (let index = 0; index < maxLength; index += 1) {
        const prev = previous[index] ?? null;
        const next = current[index] ?? null;
        if (!isSameItem(prev, next)) {
            patch.push({ slotIndex: index, item: next });
        }
    }
    return patch;
}

export function diffEquipmentSlots(previous: EquipmentSlotUpdateEntry[], current: EquipmentSlotUpdateEntry[]): EquipmentSlotUpdateEntry[] {
    const patch: EquipmentSlotUpdateEntry[] = [];
    const previousBySlot = new Map(previous.map((entry) => [entry.slot, entry]));
    for (const entry of current) {
        const prev = previousBySlot.get(entry.slot);
        if (!prev || !isSameItem(prev.item ?? null, entry.item ?? null)) {
            patch.push(entry);
        }
    }
    return patch;
}

export function diffTechniqueEntries(previous: TechniqueUpdateEntryView[], current: TechniqueUpdateEntryView[]): TechniqueUpdateEntryView[] {
    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
    return current
        .filter((entry) => !isSameTechniqueEntry(previousById.get(entry.techId) ?? null, entry))
        .map((entry) => buildTechniqueEntryPatch(previousById.get(entry.techId) ?? null, entry));
}

function buildTechniqueEntryPatch(previous: TechniqueUpdateEntryView | null, current: TechniqueUpdateEntryView): TechniqueUpdateEntryView {
    if (!previous) {
        return current;
    }
    const patch: TechniqueUpdateEntryView = { techId: current.techId };
    if (previous.level !== current.level) { patch.level = current.level; }
    if (previous.exp !== current.exp) { patch.exp = current.exp; }
    if (previous.expToNext !== current.expToNext) { patch.expToNext = current.expToNext; }
    if (previous.realmLv !== current.realmLv) { patch.realmLv = current.realmLv; }
    if (previous.realm !== current.realm) { patch.realm = current.realm; }
    if ((previous.skillsEnabled !== false) !== (current.skillsEnabled !== false)) {
        patch.skillsEnabled = current.skillsEnabled !== false;
    }
    if (previous.name !== current.name) { patch.name = current.name; }
    if (previous.grade !== current.grade) { patch.grade = current.grade; }
    if (previous.category !== current.category) { patch.category = current.category; }
    if (!isSameTechniqueSkillList(previous.skills, current.skills)) { patch.skills = current.skills; }
    if (!isSameTechniqueLayerList(previous.layers, current.layers)) { patch.layers = current.layers; }
    return patch;
}

export function diffRemovedTechniqueIds(previous: TechniqueUpdateEntryView[], current: TechniqueUpdateEntryView[]): string[] {
    const currentIds = new Set(current.map((entry) => entry.techId));
    return previous.map((entry) => entry.techId).filter((techId) => !currentIds.has(techId));
}

export function diffActionEntries(previous: ProjectedActionEntry[], current: ProjectedActionEntry[]): ProjectedActionEntry[] {
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    return current
        .filter((entry) => !isSameActionEntry(previousById.get(entry.id) ?? null, entry))
        .map((entry) => entry);
}

export function diffRemovedActionIds(previous: ProjectedActionEntry[], current: ProjectedActionEntry[]): string[] {
    const currentIds = new Set(current.map((entry) => entry.id));
    return previous.map((entry) => entry.id).filter((actionId) => !currentIds.has(actionId));
}

export function diffBuffEntries(previous: VisibleBuffState[], current: VisibleBuffState[]): VisibleBuffState[] {
    const previousById = new Map(previous.map((entry) => [entry.buffId, entry]));
    return current
        .filter((entry) => !isSameBuffEntry(previousById.get(entry.buffId) ?? null, entry))
        .map((entry) => entry);
}

export function diffRemovedBuffIds(previous: VisibleBuffState[], current: VisibleBuffState[]): string[] {
    const currentIds = new Set(current.map((entry) => entry.buffId));
    return previous.map((entry) => entry.buffId).filter((buffId) => !currentIds.has(buffId));
}

export function diffAttributes(previous: Attributes, current: Attributes): ProjectedPatchResult<ProjectedAttrPatch> {
    const patch: ProjectedAttrPatch = {};
    let changes = 0;
    for (const key of ATTRIBUTE_KEYS) {
        if (previous[key] === current[key]) { continue; }
        patch[key] = current[key];
        changes += 1;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}

export function diffNumericStats(previous: NumericStats, current: NumericStats): ProjectedPatchResult<ProjectedNumericStatsPatch> {
    const patch: ProjectedNumericStatsPatch = {};
    let changes = 0;
    for (const key of NUMERIC_STAT_KEYS) {
        if (previous[key] === current[key]) { continue; }
        patch[key] = current[key];
        changes += 1;
    }
    const elementDamageBonusPatch = diffElementGroup(previous.elementDamageBonus, current.elementDamageBonus);
    if (elementDamageBonusPatch.changes > 0) {
        patch.elementDamageBonus = elementDamageBonusPatch.patch;
        changes += elementDamageBonusPatch.changes;
    }
    const elementDamageReducePatch = diffElementGroup(previous.elementDamageReduce, current.elementDamageReduce);
    if (elementDamageReducePatch.changes > 0) {
        patch.elementDamageReduce = elementDamageReducePatch.patch;
        changes += elementDamageReducePatch.changes;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}

export function diffRatioDivisors(previous: NumericRatioDivisors, current: NumericRatioDivisors): ProjectedPatchResult<ProjectedRatioDivisorsPatch> {
    const patch: ProjectedRatioDivisorsPatch = {};
    let changes = 0;
    for (const key of RATIO_DIVISOR_KEYS) {
        if (previous[key] === current[key]) { continue; }
        patch[key] = current[key];
        changes += 1;
    }
    const elementDamageReducePatch = diffElementGroup(previous.elementDamageReduce, current.elementDamageReduce);
    if (elementDamageReducePatch.changes > 0) {
        patch.elementDamageReduce = elementDamageReducePatch.patch;
        changes += elementDamageReducePatch.changes;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}

export function diffElementGroup(
    previous: ProjectedElementGroup,
    current: ProjectedElementGroup,
): ProjectedPatchResult<Partial<Pick<ProjectedElementGroup, ElementGroupKey>>> {
    const patch: Partial<Pick<ProjectedElementGroup, ElementGroupKey>> = {};
    let changes = 0;
    for (const key of ELEMENT_GROUP_KEYS) {
        if (previous[key] === current[key]) { continue; }
        patch[key] = current[key];
        changes += 1;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
