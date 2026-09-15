/**
 * pixi-renderer.entities.ts — 从 pixi-map-renderer-adapter.ts 拆分的实体域方法。
 *
 * 包含实体视图创建/销毁/补丁、精灵渲染、名牌/血条/buff 绘制、
 * 法宝光环、复活倒计时、NPC 任务标记、移动插值等逻辑。
 * 采用模式 B（委托壳）：所有方法以 xxxImpl(self: PixiMapRendererAdapter, ...) 形式导出，
 * 由 pixi-map-renderer-adapter.ts 主类中的同名方法一行委托调用。
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  isMobileEntityObjectKind,
  normalizeAuraLevelBaseValue,
  resolveWorldObjectRenderOrder,
  type NpcQuestMarker,
  type Tile,
} from '@mud/shared';
import { getCellSize } from '../../display';
import { getMonsterPresentation } from '../../monster-presentation';
import { formatDisplayInteger } from '../../utils/number';
import { t as translateUi } from '../../ui/i18n';
import type { MapEntityTransition, MapSceneSnapshot, ObservedMapEntity } from '../types';
import { isPixiEntityInViewport, PixiFrameGridPointSet } from './pixi-frame-spatial-index';
import { buildArtifactAuraGeometry } from './pixi-artifact-aura-geometry';
import {
  type PixiTileSpriteRef,
  type RuntimeEntitySpriteSelection,
} from './pixi-runtime-image-manifest';
import {
  buildNameplateBadgeSignature,
  clamp01,
  colorWithAlpha,
  easeInOutCubic,
  easeOutCubic,
  parseAlpha,
  parseColor,
  resolveEntityBadgePalette,
  resolveEntityFallbackLabel,
  resolveEntityHpBarColor,
  resolveEntityLabelColor,
  resolveNameplateBadges,
  textStyle,
} from './pixi-render-primitives';
import type {
  AnimEntity,
  EntityNameplateBadge,
  EntityView,
} from './pixi-render-state';
import type { CameraState } from '../camera/camera-controller';
import type { PixiMapRendererAdapter } from './pixi-map-renderer-adapter';
import {
  ARTIFACT_AURA_COLOR,
  ARTIFACT_AURA_FLOW_MS,
  ARTIFACT_AURA_FRAME_COUNT,
  ATTACK_MOTION_DURATION_MS,
  ENTITY_FACING_FLIP_TRANSITION_MS,
} from './pixi-map-renderer-adapter';
export function invalidateEntityStaticViewsImpl(self: PixiMapRendererAdapter, ): void {
    for (const view of self.entities.values()) {
      view.staticSignature = '';
    }
  }

export function syncEntitiesImpl(self: PixiMapRendererAdapter, list: readonly ObservedMapEntity[], transition: MapEntityTransition | null, motionSyncToken?: number): void {
    const seen = new Set<string>();
    const cellSize = getCellSize();
    const sameMotionSync = motionSyncToken !== undefined && motionSyncToken === self.lastEntityMotionToken;
    for (const entity of list) {
      seen.add(entity.id);
      const targetWX = entity.wx * cellSize;
      const targetWY = entity.wy * cellSize;
      let view = self.entities.get(entity.id);
      if (!view) {
        view = self.createEntityView(entity, targetWX, targetWY);
        self.entities.set(entity.id, view);
        self.entityLayer.addChild(view.root);
      } else {
        const anim = view.anim;
        const sameGrid = anim.gridX === entity.wx && anim.gridY === entity.wy;
        if (entity.id === transition?.movedId) {
          anim.oldWX = (entity.wx - (transition.shiftX ?? 0)) * cellSize;
          anim.oldWY = (entity.wy - (transition.shiftY ?? 0)) * cellSize;
        } else if (sameGrid && sameMotionSync) {
          // 保留同 tick 插值状态。
        } else if (!sameGrid) {
          anim.oldWX = anim.targetWX;
          anim.oldWY = anim.targetWY;
        } else {
          anim.oldWX = targetWX;
          anim.oldWY = targetWY;
        }
        Object.assign(anim, entity, { gridX: entity.wx, gridY: entity.wy, targetWX, targetWY });
      }
      self.patchEntityStatic(view);
    }
    for (const [id, view] of self.entities) {
      if (!seen.has(id)) {
        self.destroyEntityView(view);
        self.entities.delete(id);
      }
    }
    if (motionSyncToken !== undefined) self.lastEntityMotionToken = motionSyncToken;
  }

export function createEntityViewImpl(self: PixiMapRendererAdapter, entity: ObservedMapEntity, targetWX: number, targetWY: number): EntityView {
    const root = new Container();
    const visualRoot = new Container();
    const view: EntityView = {
      anim: { ...entity, gridX: entity.wx, gridY: entity.wy, oldWX: targetWX, oldWY: targetWY, targetWX, targetWY },
      root,
      visualRoot,
      artifactAura: new Container(),
      artifactAuraFrames: [],
      artifactAuraCellSize: 0,
      artifactAuraFrameIndex: -1,
      shadow: new Graphics(),
      image: new Sprite(Texture.EMPTY),
      glyph: new Text({ text: entity.char, style: textStyle('entityGlyph', getCellSize() * 0.75, entity.color), anchor: 0.5 }),
      label: new Text({ text: '', style: textStyle('label', getCellSize() * 0.3, '#cce7ff'), anchor: 0.5 }),
      badgeLayer: new Container(),
      hpBar: new Graphics(),
      progressBar: new Graphics(),
      buffLayer: new Container(),
      questMarker: new Container(),
      formationMarker: new Graphics(),
      respawnLabel: new Text({ text: '', style: textStyle('label', getCellSize() * 0.22, '#e7d5a7'), anchor: 0.5 }),
      staticSignature: '',
      hiddenByFormation: false,
      imageBaseScaleX: 1,
      imageBaseScaleY: 1,
      imageFlipSourceSign: 1,
      imageFlipTargetSign: 1,
      imageFlipStartedAt: 0,
      attackMotionUnitX: 0,
      attackMotionUnitY: 0,
    };
    view.image.anchor.set(0.5);
    view.image.visible = false;
    visualRoot.addChild(view.shadow, view.image, view.glyph);
    root.addChild(view.formationMarker, view.artifactAura, visualRoot, view.badgeLayer, view.label, view.hpBar, view.progressBar, view.buffLayer, view.questMarker, view.respawnLabel);
    return view;
  }

export function destroyEntityViewImpl(self: PixiMapRendererAdapter, view: EntityView): void {
    for (const frame of view.artifactAura.removeChildren()) {
      frame.destroy({ context: true });
    }
    view.artifactAuraFrames = [];
    view.root.destroy({ children: true });
  }

export function patchEntityStaticImpl(self: PixiMapRendererAdapter, view: EntityView): void {
    const anim = view.anim;
    const cellSize = getCellSize();
    const presentation = anim.kind === 'monster' ? getMonsterPresentation(anim.name, anim.monsterTier) : null;
    const badges = resolveNameplateBadges(anim.badges, presentation?.badge);
    const signature = [
      cellSize,
      anim.char, anim.color, anim.name ?? '', anim.kind ?? '', anim.hp ?? '', anim.maxHp ?? '',
      anim.respawnRemainingTicks ?? '', anim.respawnTotalTicks ?? '',
      anim.monsterTier ?? '',
      anim.monsterId ?? '',
      buildNameplateBadgeSignature(badges), anim.hostile ? 1 : 0,
      anim.artifactActive === true ? 1 : 0,
      anim.monsterScale ?? '', anim.facing ?? '',
      self.runtimeTileSpriteRevision,
      anim.buffs?.map((buff) => `${buff.buffId}:${buff.remainingTicks}:${buff.stacks}`).join(',') ?? '',
      anim.npcQuestMarker ? `${anim.npcQuestMarker.line}:${anim.npcQuestMarker.state}` : '',
      anim.formationShowText === false ? 1 : 0,
      anim.formationRangeHighlightColor ?? '',
      self.isEntityTextMode(anim.kind) ? 1 : 0,
    ].join('|');
    if (signature === view.staticSignature) return;
    const visualScale = (presentation?.scale ?? 1) * Math.max(1, anim.monsterScale ?? 1);
    const visualCellSize = cellSize * visualScale;
    view.visualRoot.pivot.set(visualCellSize / 2, visualCellSize - 3);
    view.visualRoot.position.set(cellSize / 2, cellSize - 3);
    view.shadow.clear().ellipse(visualCellSize / 2, visualCellSize - 3, visualCellSize * 0.32, Math.max(2, visualCellSize * 0.1)).fill({ color: 0x000000, alpha: 0.3 });
    const forceTextMode = self.isEntityTextMode(anim.kind);
    let drewEntityImage = false;
    if (forceTextMode) {
      view.image.visible = false;
    } else {
      drewEntityImage = self.patchRuntimeEntitySprite(view, visualCellSize);
    }
    view.glyph.text = anim.char;
    view.glyph.style = textStyle('entityGlyph', visualCellSize * 0.75, anim.color);
    view.glyph.visible = !drewEntityImage;
    view.glyph.position.set(visualCellSize / 2, visualCellSize / 2);
    const label = presentation?.label ?? anim.name ?? resolveEntityFallbackLabel(anim.kind);
    const shouldShowLabel = anim.kind !== 'formation' || anim.formationShowText !== false;
    const labelY = cellSize - visualCellSize - Math.max(6, cellSize * 0.18);
    self.patchEntityNameplate(view, label, badges, shouldShowLabel, labelY, cellSize);
    self.drawEntityBars(view, visualCellSize);
    self.drawBuffs(view, cellSize);
    self.syncArtifactAura(view, cellSize);
    self.drawNpcQuestMarker(view.questMarker, anim.npcQuestMarker ?? undefined, cellSize);
    self.drawFormationMarker(view.formationMarker, anim, cellSize);
    self.drawRespawnLabel(view, cellSize, visualCellSize);
    view.root.zIndex = resolveWorldObjectRenderOrder(anim.kind);
    view.root.alpha = anim.kind === 'building' && (anim.respawnTotalTicks ?? 0) > 0 ? 0.58 : 1;
    view.staticSignature = signature;
  }

export function isEntityTextModeImpl(self: PixiMapRendererAdapter, kind: AnimEntity['kind']): boolean {
    if (kind === 'npc') return self.performanceConfig.npcTextMode;
    if (kind === 'monster') return self.performanceConfig.monsterTextMode;
    if (kind === 'container') return self.performanceConfig.herbTextMode;
    return false;
  }

export function patchRuntimeEntitySpriteImpl(self: PixiMapRendererAdapter, view: EntityView, visualCellSize: number): boolean {
    const selection = self.resolveRuntimeEntitySpriteSelection(view.anim);
    if (!selection) {
      view.image.visible = false;
      return false;
    }
    const texture = self.getRuntimeEntityTexture(selection.ref);
    if (!texture) {
      self.requestRuntimeEntityTexture(selection.ref);
      view.image.visible = false;
      return false;
    }
    const inset = Math.max(0, Math.min(0.4, selection.ref.insetRatio)) * visualCellSize;
    const maxW = Math.max(1, visualCellSize - inset * 2);
    const maxH = Math.max(1, visualCellSize - inset * 2);
    let targetW = maxW;
    let targetH = maxH;
    if (selection.ref.fit === 'contain') {
      const scale = Math.min(maxW / Math.max(1, texture.width), maxH / Math.max(1, texture.height));
      targetW = Math.max(1, texture.width * scale);
      targetH = Math.max(1, texture.height * scale);
    }
    view.image.texture = texture;
    const baseScaleX = targetW / Math.max(1, texture.width);
    const baseScaleY = targetH / Math.max(1, texture.height);
    const nextFlipSign = selection.transform.flipX ? -1 : 1;
    const now = performance.now();
    const currentFlipSign = self.resolveCurrentImageFlipSign(view, now);
    const shouldAnimateFlip = view.image.visible && view.imageFlipTargetSign !== nextFlipSign;
    view.imageBaseScaleX = baseScaleX;
    view.imageBaseScaleY = baseScaleY;
    view.imageFlipSourceSign = shouldAnimateFlip ? currentFlipSign : nextFlipSign;
    view.imageFlipTargetSign = nextFlipSign;
    view.imageFlipStartedAt = shouldAnimateFlip ? now : 0;
    self.applyEntityImageScale(view, now);
    view.image.rotation = 0;
    view.image.position.set(visualCellSize / 2, visualCellSize / 2);
    view.image.visible = true;
    return true;
  }

export function resolveCurrentImageFlipSignImpl(self: PixiMapRendererAdapter, view: EntityView, now: number): number {
    if (view.imageFlipStartedAt <= 0) {
      return view.imageFlipTargetSign;
    }
    const progress = clamp01((now - view.imageFlipStartedAt) / ENTITY_FACING_FLIP_TRANSITION_MS);
    if (progress >= 1) {
      return view.imageFlipTargetSign;
    }
    const eased = easeInOutCubic(progress);
    return view.imageFlipSourceSign + (view.imageFlipTargetSign - view.imageFlipSourceSign) * eased;
  }

export function applyEntityImageScaleImpl(self: PixiMapRendererAdapter, view: EntityView, now: number): void {
    const sign = self.resolveCurrentImageFlipSign(view, now);
    view.image.scale.set(view.imageBaseScaleX * sign, view.imageBaseScaleY);
    if (view.imageFlipStartedAt > 0 && now - view.imageFlipStartedAt >= ENTITY_FACING_FLIP_TRANSITION_MS) {
      view.imageFlipStartedAt = 0;
      view.imageFlipSourceSign = view.imageFlipTargetSign;
      view.image.scale.set(view.imageBaseScaleX * view.imageFlipTargetSign, view.imageBaseScaleY);
    }
  }

export function patchEntityNameplateImpl(self: PixiMapRendererAdapter, 
    view: EntityView,
    label: string,
    badges: readonly EntityNameplateBadge[],
    shouldShowLabel: boolean,
    labelY: number,
    cellSize: number,
  ): void {
    const labelColor = resolveEntityLabelColor(view.anim.kind);
    view.label.visible = shouldShowLabel;
    view.label.text = label;
    view.label.style = textStyle('label', cellSize * (view.anim.kind === 'crowd' ? 0.24 : 0.3), labelColor);

    const visibleBadges = shouldShowLabel ? badges : [];
    self.clearContainer(view.badgeLayer);
    view.badgeLayer.visible = visibleBadges.length > 0;

    if (!shouldShowLabel) {
      return;
    }
    if (visibleBadges.length === 0) {
      view.label.position.set(cellSize / 2, labelY);
      return;
    }

    const badgeTextSize = Math.max(9, cellSize * 0.2);
    const badgePaddingX = Math.max(4, cellSize * 0.1);
    const badgeHeight = Math.max(12, cellSize * 0.28);
    const badgeRadius = Math.max(4, badgeHeight * 0.38);
    const badgeGap = Math.max(2, cellSize * 0.04);
    const labelGap = Math.max(4, cellSize * 0.08);

    const labelWidth = Math.max(0, view.label.width);
    const badgeEntries = visibleBadges.map((badge) => {
      const palette = resolveEntityBadgePalette(badge);
      const text = new Text({
        text: badge.text,
        style: textStyle('badge', badgeTextSize, palette.text, 'rgba(0,0,0,0)', 0),
        anchor: 0.5,
      });
      return {
        badge,
        text,
        width: Math.max(16, text.width + badgePaddingX * 2),
      };
    });
    const badgesWidth = badgeEntries.reduce((sum, entry) => sum + entry.width, 0)
      + Math.max(0, badgeEntries.length - 1) * badgeGap;
    const totalWidth = badgesWidth + labelGap + labelWidth;
    const left = cellSize / 2 - totalWidth / 2;
    const badgeY = labelY - badgeHeight / 2;
    let badgeX = left;
    for (const entry of badgeEntries) {
      const palette = resolveEntityBadgePalette(entry.badge);
      const plate = new Graphics()
        .roundRect(0, 0, entry.width, badgeHeight, badgeRadius)
        .fill({ color: parseColor(palette.fill), alpha: parseAlpha(palette.fill, 1) })
        .stroke({ color: parseColor(palette.stroke), alpha: parseAlpha(palette.stroke, 1), width: 1 });
      plate.position.set(badgeX, badgeY);
      entry.text.position.set(badgeX + entry.width / 2, labelY);
      view.badgeLayer.addChild(plate, entry.text);
      badgeX += entry.width + badgeGap;
    }
    view.label.position.set(left + badgesWidth + labelGap + labelWidth / 2, labelY);
  }

export function drawEntityBarsImpl(self: PixiMapRendererAdapter, view: EntityView, visualCellSize: number): void {
    const anim = view.anim;
    const cellSize = getCellSize();
    view.hpBar.clear();
    view.progressBar.clear();
    const isConstructionBuilding = anim.kind === 'building' && (anim.respawnTotalTicks ?? 0) > 0;
    if (isConstructionBuilding) {
      const remaining = Math.max(0, Math.trunc(Number(anim.respawnRemainingTicks) || 0));
      const total = Math.max(1, Math.trunc(Number(anim.respawnTotalTicks) || 1));
      const ratio = clamp01(1 - (remaining / total));
      const y = visualCellSize - 5;
      const barH = Math.max(3, Math.round(visualCellSize * 0.08));
      view.progressBar.rect(3, y, Math.max(1, visualCellSize - 6), barH).fill({ color: 0x06121e, alpha: 0.58 });
      view.progressBar.rect(3, y, Math.max(0, (visualCellSize - 6) * ratio), barH).fill({ color: 0x7dd3fc });
      view.progressBar.position.set((cellSize - visualCellSize) / 2, cellSize - visualCellSize);
      return;
    }
    if ((anim.maxHp ?? 0) <= 0 || anim.kind === 'crowd') return;
    const ratio = clamp01((anim.hp ?? 0) / Math.max(anim.maxHp ?? 1, 1));
    const y = visualCellSize - 5;
    view.hpBar.rect(3, y, Math.max(1, visualCellSize - 6), 3).fill({ color: 0x000000, alpha: 0.45 });
    view.hpBar.rect(3, y, Math.max(0, (visualCellSize - 6) * ratio), 3).fill({ color: parseColor(resolveEntityHpBarColor(anim.kind, anim.hostile)) });
    view.hpBar.position.set((cellSize - visualCellSize) / 2, cellSize - visualCellSize);
  }

export function drawFormationMarkerImpl(self: PixiMapRendererAdapter, graphics: Graphics, anim: AnimEntity, cellSize: number): void {
    graphics.clear();
    if (anim.kind !== 'formation') return;
    const center = cellSize / 2;
    const radius = Math.max(5, cellSize * 0.36);
    const color = anim.formationRangeHighlightColor ?? anim.color;
    graphics.circle(center, center, radius).fill(colorWithAlpha(color, 0.18)).stroke({ ...colorWithAlpha(color, 0.9), width: Math.max(1.5, cellSize * 0.055) });
    graphics.moveTo(center - radius * 0.66, center).lineTo(center + radius * 0.66, center)
      .moveTo(center, center - radius * 0.66).lineTo(center, center + radius * 0.66)
      .stroke({ ...colorWithAlpha(color, 0.72), width: Math.max(1, cellSize * 0.035) });
  }

export function syncArtifactAuraImpl(self: PixiMapRendererAdapter, view: EntityView, cellSize: number): void {
    const { anim, artifactAura } = view;
    const active = anim.kind === 'player' && anim.artifactActive === true;
    artifactAura.visible = active;
    if (!active) {
      return;
    }
    artifactAura.position.set(cellSize / 2, cellSize / 2);
    if (view.artifactAuraCellSize !== cellSize || view.artifactAuraFrames.length !== ARTIFACT_AURA_FRAME_COUNT) {
      for (const child of artifactAura.removeChildren()) {
        child.destroy({ context: true });
      }
      view.artifactAuraFrames = Array.from(
        { length: ARTIFACT_AURA_FRAME_COUNT },
        (_, frameIndex) => self.createArtifactAuraFrame(cellSize, frameIndex),
      );
      artifactAura.addChild(...view.artifactAuraFrames);
      view.artifactAuraCellSize = cellSize;
      view.artifactAuraFrameIndex = -1;
    }
    if (view.artifactAuraFrameIndex < 0) {
      self.updateArtifactAuraFrame(view, 0);
    }
  }

export function createArtifactAuraFrameImpl(self: PixiMapRendererAdapter, cellSize: number, frameIndex: number): Graphics {
    const graphics = new Graphics();
    const geometry = buildArtifactAuraGeometry(cellSize, frameIndex, ARTIFACT_AURA_FRAME_COUNT);
    const { half, side, perimeter } = geometry;

    const pointAt = (distance: number): { x: number; y: number } => {
      const wrapped = ((distance % perimeter) + perimeter) % perimeter;
      if (wrapped < side) {
        return { x: -half + wrapped, y: -half };
      }
      if (wrapped < side * 2) {
        return { x: half, y: -half + wrapped - side };
      }
      if (wrapped < side * 3) {
        return { x: half - (wrapped - side * 2), y: half };
      }
      return { x: -half, y: half - (wrapped - side * 3) };
    };
    const appendDashes = (): void => {
      for (const segment of geometry.segments) {
        const from = pointAt(segment.from);
        const to = pointAt(segment.to);
        graphics.moveTo(from.x, from.y).lineTo(to.x, to.y);
      }
    };
    appendDashes();
    graphics.stroke({ color: ARTIFACT_AURA_COLOR, alpha: 0.28, width: Math.max(4, cellSize * 0.13) });
    appendDashes();
    graphics.stroke({ color: ARTIFACT_AURA_COLOR, alpha: 1, width: Math.max(2, cellSize * 0.06) });
    graphics.visible = false;
    return graphics;
  }

export function updateArtifactAuraFrameImpl(self: PixiMapRendererAdapter, view: EntityView, timeMs: number): void {
    if (!view.artifactAura.visible || view.artifactAuraFrames.length === 0) {
      return;
    }
    const frameIndex = Math.floor(
      (timeMs % ARTIFACT_AURA_FLOW_MS) / ARTIFACT_AURA_FLOW_MS * ARTIFACT_AURA_FRAME_COUNT,
    ) % ARTIFACT_AURA_FRAME_COUNT;
    if (frameIndex === view.artifactAuraFrameIndex) {
      return;
    }
    const previousFrame = view.artifactAuraFrames[view.artifactAuraFrameIndex];
    if (previousFrame) {
      previousFrame.visible = false;
    }
    const nextFrame = view.artifactAuraFrames[frameIndex];
    if (nextFrame) {
      nextFrame.visible = true;
    }
    view.artifactAuraFrameIndex = frameIndex;
  }

export function drawRespawnLabelImpl(self: PixiMapRendererAdapter, view: EntityView, cellSize: number, visualCellSize: number): void {
    const anim = view.anim;
    view.respawnLabel.visible = anim.kind === 'container' && (anim.respawnRemainingTicks ?? 0) > 0;
    if (!view.respawnLabel.visible) return;
    view.respawnLabel.text = translateUi('map-render.respawn-countdown', { countdown: self.formatRespawnCountdown(anim.respawnRemainingTicks) });
    view.respawnLabel.style = textStyle('label', cellSize * 0.22, '#e7d5a7', 'rgba(15,12,10,0.92)', 3);
    view.respawnLabel.position.set(cellSize / 2, cellSize - visualCellSize + visualCellSize + Math.max(8, cellSize * 0.16));
  }

export function formatRespawnCountdownImpl(self: PixiMapRendererAdapter, ticks: number | undefined): string {
    const safeTicks = Math.max(0, Math.trunc(Number(ticks) || 0));
    if (safeTicks <= 0) return '0';
    if (safeTicks < 60) return String(safeTicks);
    const minutes = Math.floor(safeTicks / 60);
    const seconds = safeTicks % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

export function drawBuffsImpl(self: PixiMapRendererAdapter, view: EntityView, cellSize: number): void {
    self.clearContainer(view.buffLayer);
    const visible = (view.anim.buffs ?? []).filter((buff) => buff.visibility === 'public');
    const rows = [
      visible.filter((buff) => buff.category === 'buff'),
      visible.filter((buff) => buff.category === 'debuff'),
    ];
    rows.forEach((row, rowIndex) => {
      const badgeSize = Math.max(8, Math.floor(cellSize * 0.24));
      row.slice(0, 4).forEach((buff, index) => {
        const root = new Container();
        root.position.set(index * (badgeSize + 2), rowIndex * (badgeSize + 4));
        const bg = new Graphics().roundRect(0, 0, badgeSize, badgeSize, 2).fill({ color: 0x0f0c0a, alpha: 0.78 }).stroke({ color: 0xfaf4e9, alpha: 0.14, width: 1 });
        const mark = new Text({ text: buff.shortMark, style: textStyle('badge', Math.max(6, badgeSize * 0.62), '#f7f0dd', 'rgba(0,0,0,0)', 0), anchor: 0.5 });
        mark.position.set(badgeSize / 2, badgeSize / 2);
        root.addChild(bg, mark);
        view.buffLayer.addChild(root);
      });
    });
    view.buffLayer.position.set(0, 1);
  }

export function drawNpcQuestMarkerImpl(self: PixiMapRendererAdapter, container: Container, marker: NpcQuestMarker | undefined, cellSize: number): void {
    self.clearContainer(container);
    if (!marker) return;
    const size = Math.max(8, cellSize * 0.18);
    const graphics = new Graphics();
    graphics.circle(0, 0, size).fill({ color: marker.line === 'main' ? 0xecb337 : 0x549cde, alpha: 0.95 }).stroke({ color: 0xfff0b0, width: 2 });
    const symbol = marker.state === 'ready' ? '?' : marker.state === 'active' ? '...' : '!';
    const text = new Text({ text: symbol, style: textStyle('badge', Math.max(11, cellSize * 0.26), '#3d2500', 'rgba(0,0,0,0)', 0), anchor: 0.5 });
    container.position.set(cellSize + Math.max(8, cellSize * 0.18), Math.max(9, cellSize * 0.18));
    container.addChild(graphics, text);
  }

export function updateEntityViewsImpl(self: PixiMapRendererAdapter, camera: CameraState, progress: number, localPlayerId: string, localPlayerX: number, localPlayerY: number, localPlayerChar: string): void {
    const cellSize = getCellSize();
    self.profiler.setCounter('entities', self.entities.size);
    const motionProgress = clamp01(progress);
    const t = easeOutCubic(motionProgress);
    const viewportLeft = camera.x - self.width / 2 - cellSize * 2;
    const viewportTop = camera.y - self.height / 2 - cellSize * 2;
    const viewportRight = camera.x + self.width / 2 + cellSize * 2;
    const viewportBottom = camera.y + self.height / 2 + cellSize * 2;
    const frameNow = performance.now();
    const crowdedTileKeys = self.crowdedTileKeysScratch;
    crowdedTileKeys.reset();
    let localPlayerInRenderedEntities = false;
    for (const [id, view] of self.entities) {
      const anim = view.anim;
      if (anim.kind === 'crowd') {
        const worldX = anim.oldWX + (anim.targetWX - anim.oldWX) * t;
        const worldY = anim.oldWY + (anim.targetWY - anim.oldWY) * t;
        if (isPixiEntityInViewport(worldX, worldY, cellSize, viewportLeft, viewportTop, viewportRight, viewportBottom)) {
          crowdedTileKeys.add(anim.gridX, anim.gridY);
        }
      }
      if (id !== self.localPlayerFallbackId && anim.id === localPlayerId) localPlayerInRenderedEntities = true;
    }
    for (const view of self.entities.values()) {
      const anim = view.anim;
      if (anim.kind === 'formation' && view.hiddenByFormation) {
        view.root.visible = false;
        continue;
      }
      const wx = anim.oldWX + (anim.targetWX - anim.oldWX) * t;
      const wy = anim.oldWY + (anim.targetWY - anim.oldWY) * t;
      view.root.position.set(wx, wy);
      const inViewport = isPixiEntityInViewport(wx, wy, cellSize, viewportLeft, viewportTop, viewportRight, viewportBottom);
      const hiddenByCrowd = anim.kind === 'player' && crowdedTileKeys.has(anim.gridX, anim.gridY);
      view.root.visible = inViewport && !hiddenByCrowd;
      if (view.root.visible) self.patchEntityMotion(view, motionProgress, frameNow);
    }
    self.ensureLocalPlayerFallback(localPlayerId, localPlayerX, localPlayerY, localPlayerChar, localPlayerInRenderedEntities);
  }

export function patchEntityMotionImpl(self: PixiMapRendererAdapter, view: EntityView, motionProgress: number, now: number): void {
    const anim = view.anim;
    const motionDx = anim.targetWX - anim.oldWX;
    const motionDy = anim.targetWY - anim.oldWY;
    const motionDistance = Math.hypot(motionDx, motionDy);
    const isMoving = isMobileEntityObjectKind(anim.kind) && motionDistance > 0.5 && motionProgress < 1;
    const travelPulse = isMoving ? Math.sin(Math.PI * motionProgress) : 0;
    const landPhase = isMoving && motionProgress > 0.62 ? clamp01((motionProgress - 0.62) / 0.38) : 0;
    const landPulse = landPhase > 0 ? Math.sin(Math.PI * landPhase) : 0;
    const motionUnitX = motionDistance > 0 ? motionDx / motionDistance : 0;
    const motionUnitY = motionDistance > 0 ? motionDy / motionDistance : 0;
    let attackPulse = 0;
    if (view.attackMotionStartedAt !== undefined) {
      const attackProgress = clamp01((now - view.attackMotionStartedAt) / ATTACK_MOTION_DURATION_MS);
      if (attackProgress >= 1) {
        view.attackMotionStartedAt = undefined;
        view.attackMotionUnitX = 0;
        view.attackMotionUnitY = 0;
      } else {
        attackPulse = Math.sin(Math.PI * attackProgress);
      }
    }
    const attackUnitX = view.attackMotionUnitX ?? 0;
    const attackUnitY = view.attackMotionUnitY ?? 0;
    const glyphLean = (motionUnitX - motionUnitY) * travelPulse * 0.1 + (attackUnitX - attackUnitY) * attackPulse * 0.08;
    const impactScaleX = (1 + travelPulse * 0.08 + landPulse * 0.1) * (1 + attackPulse * 0.1);
    const impactScaleY = (1 - travelPulse * 0.06 - landPulse * 0.12) * (1 - attackPulse * 0.08);
    const visualCellSize = Math.max(1, view.visualRoot.pivot.x * 2);
    const cellSize = getCellSize();
    const attackLunge = attackPulse * cellSize * 0.08;
    view.visualRoot.position.set(cellSize / 2 + attackUnitX * attackLunge, cellSize - 3 + attackUnitY * attackLunge);
    view.visualRoot.scale.set(
      (isMoving ? 1 + travelPulse * 0.24 : 1) * (1 + attackPulse * 0.16),
      (isMoving ? 1 - travelPulse * 0.16 : 1) * (1 - attackPulse * 0.1),
    );
    self.applyEntityImageScale(view, now);
    view.glyph.rotation = isMoving || attackPulse > 0 ? glyphLean : 0;
    view.glyph.scale.set(isMoving || attackPulse > 0 ? impactScaleX : 1, isMoving || attackPulse > 0 ? impactScaleY : 1);
    view.glyph.y = visualCellSize / 2 - travelPulse * cellSize * 0.08;
    self.updateArtifactAuraFrame(view, now);
  }

export function ensureLocalPlayerFallbackImpl(self: PixiMapRendererAdapter, localPlayerId: string, localPlayerX: number, localPlayerY: number, localPlayerChar: string, exists: boolean): void {
    if (exists || !Number.isFinite(localPlayerX) || !Number.isFinite(localPlayerY)) {
      const fallback = self.entities.get(self.localPlayerFallbackId);
      if (fallback) {
        self.destroyEntityView(fallback);
        self.entities.delete(self.localPlayerFallbackId);
      }
      return;
    }
    const cellSize = getCellSize();
    const fallbackEntity: ObservedMapEntity = {
      id: self.localPlayerFallbackId,
      wx: localPlayerX,
      wy: localPlayerY,
      char: localPlayerChar || translateUi('map-render.local-player-char', undefined),
      color: '#fff4dc',
      kind: 'player',
      name: resolveEntityFallbackLabel('player'),
    };
    let view = self.entities.get(self.localPlayerFallbackId);
    if (!view) {
      view = self.createEntityView(fallbackEntity, localPlayerX * cellSize, localPlayerY * cellSize);
      self.entities.set(self.localPlayerFallbackId, view);
      self.entityLayer.addChild(view.root);
    }
    Object.assign(view.anim, fallbackEntity, {
      id: self.localPlayerFallbackId,
      gridX: localPlayerX,
      gridY: localPlayerY,
      oldWX: localPlayerX * cellSize,
      oldWY: localPlayerY * cellSize,
      targetWX: localPlayerX * cellSize,
      targetWY: localPlayerY * cellSize,
    });
    view.root.position.set(localPlayerX * cellSize, localPlayerY * cellSize);
    self.patchEntityStatic(view);
    view.root.visible = true;
  }
