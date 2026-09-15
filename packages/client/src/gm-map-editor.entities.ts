/**
 * gm-map-editor.entities.ts —— GM 地图编辑器实体操作。
 *
 * 从 GmMapEditor 类抽取的实体增删移动逻辑：传送点、NPC、怪物、灵气、资源、
 * 安全区、地标、容器等实体的添加、移动、删除。
 * 通过 self: GmMapEditor 参数接收编辑器实例，不直接依赖类实例的私有字段。
 * 纯逻辑移动，不改变任何面板行为或协议字段。
 */

import {
  type GmMapDocument,
  isTileTypeWalkable,
} from '@mud/shared';
import { type GmMapEditor, type MapEntitySelection } from './gm-map-editor';
import {
  createDefaultContainerLootPool,
  createDefaultQuestRecord,
  getResourceRecordKey,
  removeArrayIndex,
} from './gm-map-editor-helpers';
export function addPortalAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    if (!self.ensureWalkableSelection('传送点')) return;
    self.captureUndoState();
    const targetMapId = self.mapList.find((map) => map.id !== self.draft!.id)?.id ?? self.draft!.id;
    self.draft!.portals.push({
      id: `${self.draft!.id}:${x},${y}`,
      x,
      y,
      targetPortalId: '',
      direction: 'two_way',
      targetMapId,
      targetX: 0,
      targetY: 0,
      kind: 'portal',
      trigger: 'manual',
      routeDomain: 'inherit',
      allowPlayerOverlap: false,
      hidden: false,
      observeTitle: '',
      observeDesc: '',
    });
    self.selectedEntity = { kind: 'portal', index: self.draft!.portals.length - 1 };
    self.markDirty();
  }

export function addNpcAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    if (!self.ensureWalkableSelection('场景人物')) return;
    self.captureUndoState();
    self.draft!.npcs.push({
      id: `npc_${self.draft!.id}_${self.draft!.npcs.length + 1}`,
      name: '新场景人物',
      x,
      y,
      char: '人',
      color: '#d6d0c4',
      dialogue: '',
      role: 'scene',
      quests: [],
    });
    self.selectedEntity = { kind: 'npc', index: self.draft!.npcs.length - 1 };
    self.markDirty();
  }

export function addQuestToSelectedNpcImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || self.selectedEntity?.kind !== 'npc') {
      return;
    }
    const npc = self.draft.npcs[self.selectedEntity.index];
    if (!npc) {
      return;
    }
    self.captureUndoState();
    npc.quests = npc.quests ?? [];
    npc.quests.push(createDefaultQuestRecord(npc, npc.quests.length));
    self.markDirty();
  }

export function removeQuestFromSelectedNpcImpl(self: GmMapEditor, index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || self.selectedEntity?.kind !== 'npc' || index < 0) {
      return;
    }
    const npc = self.draft.npcs[self.selectedEntity.index];
    if (!npc?.quests || index >= npc.quests.length) {
      return;
    }
    self.captureUndoState();
    npc.quests.splice(index, 1);
    self.markDirty();
  }

export function addMonsterAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    if (!self.ensureWalkableSelection('怪物刷新点')) return;
    self.captureUndoState();
    const fallbackId = self.selectedEntity?.kind === 'monster'
      ? self.draft!.monsterSpawns[self.selectedEntity.index]?.id
      : self.draft!.monsterSpawns[0]?.id;
    self.draft!.monsterSpawns.push({
      id: fallbackId ?? '',
      x,
      y,
    });
    self.selectedEntity = { kind: 'monster', index: self.draft!.monsterSpawns.length - 1 };
    if (!fallbackId) {
      self.setStatus('新怪物点已创建，请先填写一个已存在的怪物 ID', true);
    }
    self.markDirty();
  }

export function addAuraAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    const changed = self.applyAuraPaint([{ x, y }], true, 1);
    if (!changed) return;
    const index = self.draft!.auras?.findIndex((point) => point.x === x && point.y === y) ?? -1;
    if (index >= 0) {
      self.selectedEntity = { kind: 'aura', index };
    }
    self.markDirty();
  }

export function applyResourceBrushKeyImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = self.resourcePaintKey.trim();
    if (!normalized) {
      self.setStatus('资源键不能为空', true);
      return;
    }
    self.resourcePaintKey = normalized;
    self.setStatus(`已设置气机画笔资源键：${normalized}`);
    self.renderInspector();
  }

export function addResourceAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    const normalizedKey = self.resourcePaintKey.trim();
    if (!normalizedKey) {
      self.setStatus('请先填写气机资源键', true);
      return;
    }
    const changed = self.applyResourcePaint([{ x, y }], true, self.resourcePaintValue, normalizedKey);
    if (!changed) return;
    const index = self.findResourceIndex(x, y, normalizedKey);
    if (index >= 0) {
      self.selectedEntity = { kind: 'resource', index };
    }
    self.markDirty();
  }

export function addSafeZoneAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    self.captureUndoState();
    self.draft!.safeZones = self.draft!.safeZones ?? [];
    self.draft!.safeZones.push({
      x,
      y,
      radius: 4,
    });
    self.selectedEntity = { kind: 'safeZone', index: self.draft!.safeZones.length - 1 };
    self.markDirty();
  }

export function addLandmarkAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    self.captureUndoState();
    self.draft!.landmarks = self.draft!.landmarks ?? [];
    self.draft!.landmarks.push({
      id: `landmark_${self.draft!.id}_${self.draft!.landmarks.length + 1}`,
      name: '新区标识',
      x,
      y,
      desc: '',
    });
    self.selectedEntity = { kind: 'landmark', index: self.draft!.landmarks.length - 1 };
    self.markDirty();
  }

export function addContainerAtCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.ensureSelectedCell()) return;
    const { x, y } = self.selectedCell!;
    if (self.hasLandmarkAt(x, y)) {
      self.setStatus('目标格已有地标或容器，请先移动或删除原对象', true);
      return;
    }
    if (self.hasBlockingMapObjectAt(x, y)) {
      self.setStatus('目标格已有出生点、传送点、场景人物或怪物点，不能放置容器', true);
      return;
    }
    self.captureUndoState();
    self.draft!.landmarks = self.draft!.landmarks ?? [];
    self.draft!.landmarks.push({
      id: `container_${self.draft!.id}_${self.draft!.landmarks.length + 1}`,
      name: '新容器',
      x,
      y,
      desc: '',
      container: {
        grade: 'mortal',
        refreshTicks: 1800,
        char: '柜',
        color: '#8a6a4c',
        lootPools: [createDefaultContainerLootPool()],
      },
    });
    self.selectedEntity = { kind: 'container', index: self.draft!.landmarks.length - 1 };
    self.markDirty();
  }

export function addLootPoolToSelectedContainerImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const landmark = self.selectedEntity?.kind === 'container'
      ? self.getContainerLandmark(self.selectedEntity.index)
      : null;
    if (!landmark?.container) {
      return;
    }
    self.captureUndoState();
    landmark.container.lootPools = landmark.container.lootPools ?? [];
    landmark.container.lootPools.push(createDefaultContainerLootPool());
    self.markDirty();
  }

export function removeLootPoolFromSelectedContainerImpl(self: GmMapEditor, index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const landmark = self.selectedEntity?.kind === 'container'
      ? self.getContainerLandmark(self.selectedEntity.index)
      : null;
    if (!landmark?.container?.lootPools || index < 0 || index >= landmark.container.lootPools.length) {
      return;
    }
    self.captureUndoState();
    landmark.container.lootPools.splice(index, 1);
    self.markDirty();
  }

export function moveSelectedEntityToCurrentCellImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || !self.selectedEntity || !self.selectedCell) {
      self.setStatus('请先选中对象和目标格', true);
      return;
    }
    const moved = self.moveSelectedEntityToPoint(self.selectedCell.x, self.selectedCell.y, true, false);
    if (moved) {
      self.markDirty();
    }
  }

export function moveSelectedEntityToPointImpl(self: GmMapEditor, x: number, y: number, recordUndo: boolean, silent: boolean): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || !self.selectedEntity) return false;
    const selection = self.selectedEntity;
    const currentPoint = self.getSelectedEntityPoint();
    if (!currentPoint) return false;
    if (currentPoint.x === x && currentPoint.y === y) {
      return false;
    }

    if (selection.kind === 'aura') {
      const aura = self.draft.auras?.[selection.index];
      if (!aura) return false;
      if (self.hasAuraAt(x, y, selection.index)) {
        if (!silent) self.setStatus('目标格已有灵气点', true);
        return false;
      }
      if (recordUndo) self.captureUndoState();
      aura.x = x;
      aura.y = y;
      self.selectedCell = { x, y };
      self.markDirty(false);
      return true;
    }

    if (selection.kind === 'resource') {
      const resource = self.draft.resources?.[selection.index];
      if (!resource) return false;
      const resourceKey = getResourceRecordKey(resource);
      if (self.hasResourceAt(x, y, resourceKey, selection.index)) {
        if (!silent) self.setStatus('目标格已有同资源键气机点', true);
        return false;
      }
      if (recordUndo) self.captureUndoState();
      resource.x = x;
      resource.y = y;
      self.selectedCell = { x, y };
      self.markDirty(false);
      return true;
    }

    if (selection.kind === 'safeZone') {
      const zone = self.draft.safeZones?.[selection.index];
      if (!zone) return false;
      if (recordUndo) self.captureUndoState();
      zone.x = x;
      zone.y = y;
      self.selectedCell = { x, y };
      self.markDirty(false);
      return true;
    }

    if (selection.kind === 'landmark') {
      const landmark = self.draft.landmarks?.[selection.index];
      if (!landmark) return false;
      if (self.hasLandmarkAt(x, y, selection.index)) {
        if (!silent) self.setStatus('目标格已有地标', true);
        return false;
      }
      if (recordUndo) self.captureUndoState();
      landmark.x = x;
      landmark.y = y;
      self.selectedCell = { x, y };
      self.markDirty(false);
      return true;
    }

    if (selection.kind === 'container') {
      const landmark = self.draft.landmarks?.[selection.index];
      if (!landmark?.container) return false;
      if (self.hasLandmarkAt(x, y, selection.index)) {
        if (!silent) self.setStatus('目标格已有地标', true);
        return false;
      }
      if (self.hasBlockingMapObjectAt(x, y)) {
        if (!silent) self.setStatus('目标格已有出生点或阻挡对象', true);
        return false;
      }
      if (recordUndo) self.captureUndoState();
      landmark.x = x;
      landmark.y = y;
      self.selectedCell = { x, y };
      self.markDirty(false);
      return true;
    }

    if (!isTileTypeWalkable(self.getTileTypeAt(x, y))) {
      if (!silent) self.setStatus('目标格不是可通行地块，无法放置对象', true);
      return false;
    }
    if (self.hasBlockingMapObjectAt(x, y, selection)) {
      if (!silent) self.setStatus('目标格已有出生点或阻挡对象', true);
      return false;
    }

    if (recordUndo) self.captureUndoState();
    if (selection.kind === 'portal') {
      const portal = self.draft.portals[selection.index];
      if (!portal) return false;
      portal.x = x;
      portal.y = y;
    } else if (selection.kind === 'npc') {
      const npc = self.draft.npcs[selection.index];
      if (!npc) return false;
      npc.x = x;
      npc.y = y;
    } else if (selection.kind === 'monster') {
      const spawn = self.draft.monsterSpawns[selection.index];
      if (!spawn) return false;
      spawn.x = x;
      spawn.y = y;
    }
    self.selectedCell = { x, y };
    self.markDirty(false);
    return true;
  }

export function removeSelectedEntityImpl(self: GmMapEditor): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!self.draft || !self.selectedEntity) return;
    self.captureUndoState();
    if (self.selectedEntity.kind === 'portal') {
      removeArrayIndex(self.draft, 'portals', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'npc') {
      removeArrayIndex(self.draft, 'npcs', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'monster') {
      removeArrayIndex(self.draft, 'monsterSpawns', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'aura') {
      removeArrayIndex(self.draft, 'auras', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'resource') {
      removeArrayIndex(self.draft, 'resources', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'safeZone') {
      removeArrayIndex(self.draft, 'safeZones', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'container') {
      removeArrayIndex(self.draft, 'landmarks', self.selectedEntity.index);
    } else if (self.selectedEntity.kind === 'landmark') {
      removeArrayIndex(self.draft, 'landmarks', self.selectedEntity.index);
    }
    self.selectedEntity = null;
    self.markDirty();
  }
