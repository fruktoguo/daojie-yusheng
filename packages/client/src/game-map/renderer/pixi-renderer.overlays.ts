/**
 * pixi-renderer.overlays.ts — 从 pixi-map-renderer-adapter.ts 拆分的 overlay 层域方法。
 *
 * 包含世界 overlay 重建、交互/targeting/sense-qi 覆盖层、地面物品、
 * 路径层、威胁箭头、攻击动画、时间大气 overlay 等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: PixiMapRendererAdapter, ...) 形式导出，
 * 由 pixi-map-renderer-adapter.ts 主类中的同名方法一行委托调用。
 */
import { Container, Graphics, Text } from 'pixi.js';
import {
  SENSE_QI_OVERLAY_STYLE,
  isMobileEntityObjectKind,
  isOffsetInRange,
  type CombatEffect,
  type GameTimeState,
  type GridPoint,
  type GroundItemPileView,
  type NpcQuestMarker,
} from '@mud/shared';
import { getCellSize } from '../../display';
import {
  PATH_ARROW_COLOR,
  PATH_FILL_COLOR,
  PATH_STROKE_COLOR,
  PATH_TARGET_CORE_COLOR,
  PATH_TARGET_FILL_COLOR,
  PATH_TARGET_STROKE_COLOR,
} from '../../constants/visuals/path-highlight';
import {
  TILE_HIDDEN_FADE_MS,
  TIME_ATMOSPHERE_PROFILES,
  TIME_FILTER_LERP,
} from '../../constants/visuals/time-atmosphere';
import { formatDisplayInteger } from '../../utils/number';
import { t as translateUi } from '../../ui/i18n';
import type { MapSceneSnapshot } from '../types';
import {
  buildBuildPreviewSignature,
  buildFengShuiOverlaySignature,
  buildFormationRangeSignature,
  buildGridPointSignature,
  buildGroundPileSignature,
  buildNameplateBadgeSignature,
  buildSenseQiHoverSignature,
  buildTargetingOverlaySignature,
  clamp01,
  colorWithAlpha,
  easeInOutCubic,
  getFengShuiOverlayFill,
  getFengShuiOverlayStroke,
  getSenseQiOverlayStyle,
  isTileInsideFormationRange,
  isTileOnFormationBoundary,
  parseAlpha,
  parseColor,
  resolveGroundItemLabel,
  textStyle,
} from './pixi-render-primitives';
import type {
  EntityView,
  FadingPathState,
  FormationRangeVisual,
  TimeAtmosphereState,
} from './pixi-render-state';
import type { PixiMapRendererAdapter } from './pixi-map-renderer-adapter';
import {
  DEFAULT_PATH_TRAIL_FADE_MS,
  OTHER_THREAT_ARROW_PIXI_COLOR,
  OTHER_THREAT_ARROW_PIXI_GLOW,
  OTHER_THREAT_ARROW_PIXI_GLOW_ALPHA,
  PATH_TRAIL_FADE_ALPHA,
  SELF_THREAT_ARROW_PIXI_COLOR,
  SELF_THREAT_ARROW_PIXI_GLOW,
  SELF_THREAT_ARROW_PIXI_GLOW_ALPHA,
} from './pixi-map-renderer-adapter';
export function rebuildWorldOverlaysImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot): void {
    const signature = `${getCellSize()}|${buildGroundPileSignature(scene.groundPiles)}`;
    if (signature === self.groundPileSignature) {
      return;
    }
    self.groundPileSignature = signature;
    self.clearContainer(self.groundLayer);
    const cellSize = getCellSize();
    self.profiler.setCounter('groundPiles', scene.groundPiles.size);
    for (const pile of scene.groundPiles.values()) {
      const root = new Container();
      root.position.set(pile.x * cellSize, pile.y * cellSize);
      self.drawGroundPile(root, pile, cellSize);
      self.groundLayer.addChild(root);
    }
  }

export function rebuildInteractionOverlayLayerImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot): void {
    const cellSize = getCellSize();
    const signature = [
      cellSize,
      scene.overlays.formationRange
        ? `${scene.overlays.formationRange.rangeHighlightColor ?? ''}:${buildGridPointSignature(scene.overlays.formationRange.affectedCells)}`
        : 'formation:null',
      scene.overlays.buildPreview
        ? `${scene.overlays.buildPreview.defId}:${scene.overlays.buildPreview.originX},${scene.overlays.buildPreview.originY}:${scene.overlays.buildPreview.rotation ?? ''}:${buildBuildPreviewSignature(scene.overlays.buildPreview.cells)}`
        : 'build:null',
      scene.overlays.fengShui
        ? `${scene.terrain.visibleTileRevision}:${scene.overlays.fengShui.instanceId}:${scene.overlays.fengShui.revision}:${buildFengShuiOverlaySignature(scene.overlays.fengShui.cells)}`
        : 'feng:null',
    ].join('|');
    if (signature === self.interactionOverlaySignature) {
      return;
    }
    self.interactionOverlaySignature = signature;
    self.interactionOverlayGraphics.clear();
    const formationRange = scene.overlays.formationRange;
    if (formationRange) {
      const fill = colorWithAlpha(formationRange.rangeHighlightColor, 0.22);
      const stroke = colorWithAlpha(formationRange.rangeHighlightColor, 0.86);
      for (const cell of formationRange.affectedCells) {
        const sx = cell.x * cellSize;
        const sy = cell.y * cellSize;
        self.interactionOverlayGraphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(fill);
        self.interactionOverlayGraphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...stroke, width: 2 });
      }
    }
    if (scene.overlays.fengShui) {
      for (const key of scene.terrain.visibleTiles) {
        const tile = scene.terrain.tileCache.get(key);
        if (!tile) {
          continue;
        }
        const [rawX, rawY] = key.split(',', 2);
        const x = Number(rawX);
        const y = Number(rawY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          continue;
        }
        self.interactionOverlayGraphics.rect(x * cellSize, y * cellSize, cellSize, cellSize).fill({ color: 0x080605, alpha: 0.34 });
      }
      for (const cell of scene.overlays.fengShui.cells) {
        const sx = cell.x * cellSize;
        const sy = cell.y * cellSize;
        self.interactionOverlayGraphics.rect(sx + 1, sy + 1, cellSize - 2, cellSize - 2).fill(getFengShuiOverlayFill(cell));
        self.interactionOverlayGraphics.rect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3).stroke({ ...getFengShuiOverlayStroke(cell), width: 1 });
      }
    }
    for (const cell of scene.overlays.buildPreview?.cells ?? []) {
      self.drawCellHighlight(
        self.interactionOverlayGraphics,
        cell.x * cellSize,
        cell.y * cellSize,
        cellSize,
        cell.ok ? (cell.warning ? 'rgba(217,119,6,0.24)' : 'rgba(22,163,74,0.24)') : 'rgba(220,38,38,0.30)',
        cell.ok ? (cell.warning ? 'rgba(245,158,11,0.92)' : 'rgba(34,197,94,0.92)') : 'rgba(248,113,113,0.96)',
        false,
      );
    }
  }

export function rebuildTargetingLayerImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot): void {
    const signature = `${getCellSize()}|${scene.terrain.visibleTileRevision}|${buildTargetingOverlaySignature(scene.overlays.targeting)}`;
    if (signature === self.targetingOverlaySignature) {
      return;
    }
    self.targetingOverlaySignature = signature;
    self.targetingGraphics.clear();
    const targeting = scene.overlays.targeting;
    if (!targeting) {
      return;
    }
    const cellSize = getCellSize();
    const range = Math.max(0, Math.ceil(Number(targeting.range) || 0));
    const affectedKeys = new Set((targeting.affectedCells ?? []).map((cell) => `${cell.x},${cell.y}`));
    const drawn = new Set<string>();
    const drawCell = (gx: number, gy: number): void => {
      const key = `${gx},${gy}`;
      if (drawn.has(key)) {
        return;
      }
      const isVisible = scene.terrain.visibleTiles.has(key);
      if (targeting.visibleOnly && !isVisible) {
        return;
      }
      const dx = gx - targeting.originX;
      const dy = gy - targeting.originY;
      const affected = affectedKeys.has(key);
      const hovered = gx === targeting.hoverX && gy === targeting.hoverY;
      const inRange = (dx !== 0 || dy !== 0) && isOffsetInRange(dx, dy, targeting.range);
      if (!affected && !inRange) {
        return;
      }
      self.drawCellHighlight(
        self.targetingGraphics,
        gx * cellSize,
        gy * cellSize,
        cellSize,
        affected ? (hovered ? 'rgba(208,76,56,0.42)' : 'rgba(198,72,48,0.3)') : (hovered ? 'rgba(66,153,225,0.3)' : 'rgba(88,180,214,0.18)'),
        affected ? (hovered ? 'rgba(150,28,24,0.98)' : 'rgba(171,56,36,0.9)') : (hovered ? 'rgba(125,211,252,0.94)' : 'rgba(151,236,255,0.72)'),
        hovered || affected,
      );
      drawn.add(key);
    };
    for (let y = targeting.originY - range; y <= targeting.originY + range; y += 1) {
      for (let x = targeting.originX - range; x <= targeting.originX + range; x += 1) {
        drawCell(x, y);
      }
    }
    for (const cell of targeting.affectedCells ?? []) {
      drawCell(cell.x, cell.y);
    }
  }

export function rebuildSenseQiHoverLayerImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot): void {
    const signature = `${getCellSize()}|${scene.terrain.visibleTileRevision}|${buildSenseQiHoverSignature(scene.overlays.senseQi)}`;
    if (signature === self.senseQiHoverSignature) {
      return;
    }
    self.senseQiHoverSignature = signature;
    self.senseQiHoverGraphics.clear();
    const overlay = scene.overlays.senseQi;
    if (!overlay || typeof overlay.hoverX !== 'number' || typeof overlay.hoverY !== 'number') {
      return;
    }
    const key = `${overlay.hoverX},${overlay.hoverY}`;
    if (!scene.terrain.visibleTiles.has(key)) {
      return;
    }
    const cellSize = getCellSize();
    self.senseQiHoverGraphics
      .rect(overlay.hoverX * cellSize + 1, overlay.hoverY * cellSize + 1, cellSize - 2, cellSize - 2)
      .stroke({
        color: parseColor(SENSE_QI_OVERLAY_STYLE.hoverStroke),
        alpha: parseAlpha(SENSE_QI_OVERLAY_STYLE.hoverStroke, 1),
        width: 2,
      });
  }

export function drawGroundPileImpl(self: PixiMapRendererAdapter, root: Container, pile: GroundItemPileView, cellSize: number): void {
    const slotSize = Math.max(8, Math.floor(cellSize / 3));
    const gridSize = slotSize * 3;
    const offsetX = Math.max(0, cellSize - gridSize);
    const offsetY = Math.max(0, cellSize - gridSize);
    const entries = pile.items.slice(0, 9);
    entries.forEach((entry, index) => {
      const col = 2 - (index % 3);
      const row = 2 - Math.floor(index / 3);
      const x = offsetX + col * slotSize;
      const y = offsetY + row * slotSize;
      const graphics = new Graphics();
      graphics.roundRect(x + 1, y + 1, slotSize - 2, slotSize - 2, Math.max(2, slotSize * 0.18)).fill({ color: 0x2e261e, alpha: 0.88 }).stroke({ color: 0xcdb180, alpha: 0.92, width: 1 });
      root.addChild(graphics);
      const label = new Text({ text: resolveGroundItemLabel(entry), style: textStyle('badge', Math.max(6, slotSize * 0.4), '#fff4dc'), anchor: 0.5 });
      label.position.set(x + slotSize / 2, y + slotSize / 2);
      root.addChild(label);
      if (entry.count > 1) {
        const count = new Text({ text: formatDisplayInteger(entry.count), style: textStyle('badge', Math.max(5, slotSize * 0.26), '#fff9ed', 'rgba(12,10,8,0.94)', 2), anchor: { x: 1, y: 0 } });
        count.position.set(x + slotSize, y);
        root.addChild(count);
      }
    });
  }

export function rebuildPathLayerImpl(self: PixiMapRendererAdapter, scene: MapSceneSnapshot): void {
    const now = performance.now();
    const fadingAlpha = self.getFadingPathAlpha(now);
    const playerX = scene.player?.x ?? 0;
    const playerY = scene.player?.y ?? 0;
    const signature = [
      getCellSize(),
      playerX,
      playerY,
      buildGridPointSignature(self.pathCells),
      self.fadingPath ? buildGridPointSignature(self.fadingPath.cells) : 'fade:null',
      self.fadingPath ? fadingAlpha.toFixed(3) : '0',
    ].join('|');
    if (signature === self.pathLayerSignature) {
      return;
    }
    self.pathLayerSignature = signature;
    self.pathGraphics.clear();
    self.profiler.setCounter('pathCells', self.pathCells.length);
    self.profiler.setCounter('fadingPathCells', self.fadingPath?.cells.length ?? 0);
    self.drawPathCells(self.pathGraphics, self.pathCells, 1);
    if (self.fadingPath && fadingAlpha > 0) self.drawPathCells(self.pathGraphics, self.fadingPath.cells, fadingAlpha * PATH_TRAIL_FADE_ALPHA);
    self.drawPathArrows(self.pathGraphics, playerX, playerY, self.pathCells, 1);
    if (self.fadingPath && fadingAlpha > 0) self.drawPathArrows(self.pathGraphics, playerX, playerY, self.fadingPath.cells, fadingAlpha * PATH_TRAIL_FADE_ALPHA);
  }

export function drawPathCellsImpl(self: PixiMapRendererAdapter, graphics: Graphics, cells: GridPoint[], alpha: number): void {
    const cellSize = getCellSize();
    const target = cells[cells.length - 1];
    const targetKey = target ? `${target.x},${target.y}` : null;
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      const isTarget = key === targetKey;
      self.drawCellHighlight(
        graphics,
        cell.x * cellSize,
        cell.y * cellSize,
        cellSize,
        isTarget ? PATH_TARGET_FILL_COLOR : PATH_FILL_COLOR,
        isTarget ? PATH_TARGET_STROKE_COLOR : PATH_STROKE_COLOR,
        isTarget,
        alpha,
      );
    }
  }

export function drawPathArrowsImpl(self: PixiMapRendererAdapter, graphics: Graphics, playerX: number, playerY: number, cells: GridPoint[], alpha: number): void {
    const cellSize = getCellSize();
    const route = [{ x: playerX, y: playerY }, ...cells];
    for (let index = 0; index < route.length - 1; index += 1) {
      const from = route[index];
      const to = route[index + 1];
      const fromX = from.x * cellSize + cellSize / 2;
      const fromY = from.y * cellSize + cellSize / 2;
      const toX = to.x * cellSize + cellSize / 2;
      const toY = to.y * cellSize + cellSize / 2;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) continue;
      const ux = dx / distance;
      const uy = dy / distance;
      const tipX = toX - ux * cellSize * 0.14;
      const tipY = toY - uy * cellSize * 0.14;
      const headLength = Math.max(8, cellSize * 0.2);
      const headWidth = Math.max(5, cellSize * 0.12);
      const shaftEndX = tipX - ux * headLength;
      const shaftEndY = tipY - uy * headLength;
      const color = parseColor(`${to.x},${to.y}` === `${cells[cells.length - 1]?.x},${cells[cells.length - 1]?.y}` ? PATH_TARGET_STROKE_COLOR : PATH_ARROW_COLOR);
      graphics.moveTo(fromX + ux * cellSize * 0.1, fromY + uy * cellSize * 0.1)
        .lineTo(shaftEndX, shaftEndY)
        .stroke({ color, alpha, width: Math.max(1.25, cellSize * 0.06) });
      const normalX = -uy;
      const normalY = ux;
      graphics.moveTo(tipX, tipY)
        .lineTo(shaftEndX + normalX * headWidth, shaftEndY + normalY * headWidth)
        .lineTo(shaftEndX - normalX * headWidth, shaftEndY - normalY * headWidth)
        .closePath()
        .fill({ color, alpha });
    }
  }

export function rebuildFormationRangeVisualCacheIfNeededImpl(self: PixiMapRendererAdapter, ): void {
    for (const view of self.entities.values()) {
      const anim = view.anim;
      view.hiddenByFormation = anim.kind === 'formation' && anim.formationEyeVisibleWithoutSenseQi !== true;
    }
    const signature = buildFormationRangeSignature([...self.entities.values()].map((view) => view.anim));
    if (signature === self.formationRangeSignature) return;
    self.formationRangeSignature = signature;
    self.formationRangeVisuals.clear();
    self.formationRangeSenseQiVisuals.clear();
    for (const view of self.entities.values()) {
      const anim = view.anim;
      if (anim.kind !== 'formation' || !Number.isFinite(Number(anim.formationRadius)) || anim.formationActive === false) continue;
      const radius = Math.max(1, Math.trunc(Number(anim.formationRadius) || 0));
      for (let gy = anim.gridY - radius; gy <= anim.gridY + radius; gy += 1) {
        for (let gx = anim.gridX - radius; gx <= anim.gridX + radius; gx += 1) {
          if (!isTileInsideFormationRange(anim, gx, gy)) continue;
          const key = `${gx},${gy}`;
          if (anim.formationBlocksBoundary === true && isTileOnFormationBoundary(anim, gx, gy)) {
            const boundaryVisual: FormationRangeVisual = {
              highlightColor: anim.formationBoundaryRangeHighlightColor ?? anim.formationBoundaryColor ?? anim.formationRangeHighlightColor ?? anim.color,
              boundary: true,
              boundaryChar: anim.formationBoundaryChar,
              boundaryColor: anim.formationBoundaryColor ?? anim.color,
            };
            self.formationRangeSenseQiVisuals.set(key, boundaryVisual);
            if (anim.formationBoundaryVisibleWithoutSenseQi === true) self.formationRangeVisuals.set(key, boundaryVisual);
            continue;
          }
          const rangeVisual: FormationRangeVisual = {
            highlightColor: anim.formationRangeHighlightColor ?? anim.color,
            boundary: false,
            boundaryColor: anim.color,
          };
          if (!self.formationRangeSenseQiVisuals.has(key)) self.formationRangeSenseQiVisuals.set(key, rangeVisual);
          if (anim.formationRangeVisibleWithoutSenseQi === true && !self.formationRangeVisuals.has(key)) self.formationRangeVisuals.set(key, rangeVisual);
        }
      }
    }
  }

export function renderThreatArrowsImpl(self: PixiMapRendererAdapter, localPlayerId: string): void {
    const graphics = self.threatArrowGraphics;
    graphics.clear();
    const cellSize = getCellSize();
    for (const arrow of self.threatArrows) {
      const from = self.resolveThreatEntityView(arrow.ownerId);
      const to = self.resolveThreatEntityView(arrow.targetId);
      if (!from?.root.visible || !to?.root.visible) continue;
      const fromCenterX = from.root.x + cellSize / 2;
      const fromCenterY = from.root.y + cellSize / 2;
      const toCenterX = to.root.x + cellSize / 2;
      const toCenterY = to.root.y + cellSize / 2;
      const dx = toCenterX - fromCenterX;
      const dy = toCenterY - fromCenterY;
      const distance = Math.hypot(dx, dy);
      if (distance < Math.max(10, cellSize * 0.45)) continue;
      const ux = dx / distance;
      const uy = dy / distance;
      const startX = fromCenterX + ux * cellSize * 0.34;
      const startY = fromCenterY + uy * cellSize * 0.34;
      const endX = toCenterX - ux * cellSize * 0.34;
      const endY = toCenterY - uy * cellSize * 0.34;
      const curvature = Math.max(cellSize * 0.32, Math.min(distance * 0.18, cellSize * 0.76));
      const controlX = (startX + endX) / 2;
      const controlY = Math.min(startY, endY) - curvature;
      const isSelf = arrow.ownerId === localPlayerId;
      const color = isSelf ? SELF_THREAT_ARROW_PIXI_COLOR : OTHER_THREAT_ARROW_PIXI_COLOR;
      const glowColor = isSelf ? SELF_THREAT_ARROW_PIXI_GLOW : OTHER_THREAT_ARROW_PIXI_GLOW;
      const glowAlpha = isSelf ? SELF_THREAT_ARROW_PIXI_GLOW_ALPHA : OTHER_THREAT_ARROW_PIXI_GLOW_ALPHA;
      const baseWidth = Math.max(0.55, cellSize * 0.02);
      const dashLength = Math.max(5, cellSize * 0.17);
      const gapLength = Math.max(4, cellSize * 0.12);

      self.drawDashedQuadraticCurve(
        graphics,
        startX,
        startY,
        controlX,
        controlY,
        endX,
        endY,
        dashLength,
        gapLength,
        glowColor,
        glowAlpha,
        baseWidth + Math.max(1.9, cellSize * 0.048),
      );
      self.drawDashedQuadraticCurve(
        graphics,
        startX,
        startY,
        controlX,
        controlY,
        endX,
        endY,
        dashLength,
        gapLength,
        color,
        0.98,
        baseWidth,
      );
      self.drawThreatArrowHead(graphics, startX, startY, controlX, controlY, endX, endY, cellSize, color, 0.98);
    }
  }

export function drawDashedQuadraticCurveImpl(self: PixiMapRendererAdapter, 
    graphics: Graphics,
    startX: number,
    startY: number,
    controlX: number,
    controlY: number,
    endX: number,
    endY: number,
    dashLength: number,
    gapLength: number,
    color: number,
    alpha: number,
    width: number,
  ): void {
    const straightDistance = Math.hypot(endX - startX, endY - startY);
    const segmentCount = Math.max(12, Math.min(48, Math.ceil(straightDistance / Math.max(4, dashLength))));
    let previousX = startX;
    let previousY = startY;
    let drawingDash = true;
    let remaining = dashLength;
    for (let index = 1; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const nextX = self.getQuadraticPoint(startX, controlX, endX, t);
      const nextY = self.getQuadraticPoint(startY, controlY, endY, t);
      const segmentLength = Math.hypot(nextX - previousX, nextY - previousY);
      if (segmentLength < 0.001) {
        previousX = nextX;
        previousY = nextY;
        continue;
      }
      const ux = (nextX - previousX) / segmentLength;
      const uy = (nextY - previousY) / segmentLength;
      let consumed = 0;
      while (consumed < segmentLength) {
        const take = Math.min(remaining, segmentLength - consumed);
        if (drawingDash) {
          const dashStartX = previousX + ux * consumed;
          const dashStartY = previousY + uy * consumed;
          const dashEndX = previousX + ux * (consumed + take);
          const dashEndY = previousY + uy * (consumed + take);
          graphics.moveTo(dashStartX, dashStartY).lineTo(dashEndX, dashEndY);
        }
        consumed += take;
        remaining -= take;
        if (remaining <= 0.001) {
          drawingDash = !drawingDash;
          remaining = drawingDash ? dashLength : gapLength;
        }
      }
      previousX = nextX;
      previousY = nextY;
    }
    graphics.stroke({ color, alpha, width });
  }

export function drawThreatArrowHeadImpl(self: PixiMapRendererAdapter, 
    graphics: Graphics,
    startX: number,
    startY: number,
    controlX: number,
    controlY: number,
    endX: number,
    endY: number,
    cellSize: number,
    color: number,
    alpha: number,
  ): void {
    const tangentX = endX - self.getQuadraticPoint(startX, controlX, endX, 0.86);
    const tangentY = endY - self.getQuadraticPoint(startY, controlY, endY, 0.86);
    const tangentLength = Math.hypot(tangentX, tangentY);
    if (tangentLength < 0.001) return;
    const arrowUx = tangentX / tangentLength;
    const arrowUy = tangentY / tangentLength;
    const headLength = Math.max(7, cellSize * 0.22);
    const headWidth = Math.max(2.4, cellSize * 0.076);
    const baseX = endX - arrowUx * headLength;
    const baseY = endY - arrowUy * headLength;
    graphics
      .moveTo(endX, endY)
      .lineTo(baseX + (-arrowUy) * headWidth, baseY + arrowUx * headWidth)
      .lineTo(baseX - (-arrowUy) * headWidth, baseY - arrowUx * headWidth)
      .closePath()
      .fill({ color, alpha });
  }

export function getQuadraticPointImpl(self: PixiMapRendererAdapter, start: number, control: number, end: number, t: number): number {
    const invT = 1 - t;
    return invT * invT * start + 2 * invT * t * control + t * t * end;
  }

export function resolveThreatEntityViewImpl(self: PixiMapRendererAdapter, id: string): EntityView | undefined {
    return self.entities.get(id);
  }

export function triggerAttackMotionImpl(self: PixiMapRendererAdapter, fromX: number, fromY: number, toX: number, toY: number): void {
    const view = self.resolveAttackMotionView(fromX, fromY);
    if (!view) return;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);
    view.attackMotionStartedAt = performance.now();
    view.attackMotionUnitX = distance > 0 ? dx / distance : 0;
    view.attackMotionUnitY = distance > 0 ? dy / distance : 0;
  }

export function resolveAttackMotionViewImpl(self: PixiMapRendererAdapter, fromX: number, fromY: number): EntityView | null {
    const gridX = Math.round(fromX);
    const gridY = Math.round(fromY);
    for (const view of self.entities.values()) {
      if (!isMobileEntityObjectKind(view.anim.kind)) continue;
      if (view.anim.gridX === gridX && view.anim.gridY === gridY) return view;
    }
    return null;
  }

export function getFadingPathAlphaImpl(self: PixiMapRendererAdapter, now: number): number {
    if (!self.fadingPath) return 0;
    const progress = (now - self.fadingPath.startedAt) / self.fadingPath.durationMs;
    if (progress >= 1) {
      self.fadingPath = null;
      return 0;
    }
    return 1 - progress;
  }

export function renderTimeOverlayImpl(self: PixiMapRendererAdapter, time: GameTimeState | null): void {
    const graphics = self.timeOverlayGraphics;
    graphics.clear();
    if (!time) return;
    const atmosphere = self.resolveTimeAtmosphere(time);
    if (atmosphere.overlay[3] > 0.001) {
      graphics.rect(0, 0, self.width, self.height).fill({ color: (atmosphere.overlay[0] << 16) | (atmosphere.overlay[1] << 8) | atmosphere.overlay[2], alpha: atmosphere.overlay[3] });
    }
    if (atmosphere.vignetteAlpha > 0.001) {
      graphics.rect(0, 0, self.width, self.height).stroke({ color: 0x050408, alpha: atmosphere.vignetteAlpha, width: Math.max(self.width, self.height) * 0.08 });
    }
  }

export function resolveTimeAtmosphereImpl(self: PixiMapRendererAdapter, time: GameTimeState): TimeAtmosphereState {
    const profile = TIME_ATMOSPHERE_PROFILES[time.phase];
    const target: TimeAtmosphereState = {
      initialized: true,
      overlay: self.buildRgbaVector(time.tint, Math.max(0, Math.min(1, time.overlayAlpha * profile.overlayBoost))),
      sky: self.buildRgbaVector(profile.skyTint, profile.skyAlpha),
      horizon: self.buildRgbaVector(profile.horizonTint, profile.horizonAlpha),
      vignetteAlpha: profile.vignetteAlpha,
    };
    if (!self.timeAtmosphere.initialized) {
      self.timeAtmosphere = target;
      return self.timeAtmosphere;
    }
    self.timeAtmosphere.overlay = self.lerpColorVector(self.timeAtmosphere.overlay, target.overlay, TIME_FILTER_LERP);
    self.timeAtmosphere.sky = self.lerpColorVector(self.timeAtmosphere.sky, target.sky, TIME_FILTER_LERP);
    self.timeAtmosphere.horizon = self.lerpColorVector(self.timeAtmosphere.horizon, target.horizon, TIME_FILTER_LERP);
    self.timeAtmosphere.vignetteAlpha += (target.vignetteAlpha - self.timeAtmosphere.vignetteAlpha) * TIME_FILTER_LERP;
    return self.timeAtmosphere;
  }

export function buildRgbaVectorImpl(self: PixiMapRendererAdapter, hex: string, alpha: number): [number, number, number, number] {
    const value = hex.trim().replace('#', '');
    const normalized = value.length === 3 ? value.split('').map((char) => char + char).join('') : value.padEnd(6, '0').slice(0, 6);
    return [
      Number.parseInt(normalized.slice(0, 2), 16) || 0,
      Number.parseInt(normalized.slice(2, 4), 16) || 0,
      Number.parseInt(normalized.slice(4, 6), 16) || 0,
      clamp01(alpha),
    ];
  }

export function lerpColorVectorImpl(self: PixiMapRendererAdapter, current: [number, number, number, number], target: [number, number, number, number], factor: number): [number, number, number, number] {
    return [
      Math.round(current[0] + (target[0] - current[0]) * factor),
      Math.round(current[1] + (target[1] - current[1]) * factor),
      Math.round(current[2] + (target[2] - current[2]) * factor),
      current[3] + (target[3] - current[3]) * factor,
    ];
  }
