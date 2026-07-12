/** Pixi 主世界渲染器内部场景状态类型，不包含运行时行为。 */
import type { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GridPoint } from '@mud/shared';
import type { ObservedMapEntity } from '../types';

export type FloatingActionTextStyle = 'default' | 'divine' | 'chant';

export interface TerrainChunkView {
  key: string;
  cx: number;
  cy: number;
  baseContainer: Container;
  spriteContainer: Container;
  edgeContainer: Container;
  glyphContainer: Container;
  overlayContainer: Container;
  staticSignature: string;
  overlaySignature: string;
  staticSignatureDeps: TerrainChunkStaticSignatureDeps | null;
  overlaySignatureDeps: TerrainChunkOverlaySignatureDeps | null;
  lastSeenFrame: number;
}

export interface TerrainFogChunkView {
  key: string;
  cx: number;
  cy: number;
  graphics: Graphics;
  signature: string;
  lastSeenFrame: number;
}

export interface TerrainChunkStaticSignatureDeps {
  cellSize: number;
  renderRuntimeTileSprites: boolean;
  terrainTextMode: boolean;
  runtimeTileSpriteRevision: number;
  terrainChunkRevision: number;
}

export interface TerrainChunkOverlaySignatureDeps {
  cellSize: number;
  terrainOverlaySignature: string;
  visibleTileRevision: number;
}

export interface AnimEntity extends ObservedMapEntity {
  gridX: number;
  gridY: number;
  oldWX: number;
  oldWY: number;
  targetWX: number;
  targetWY: number;
}

export type EntityNameplateBadge = NonNullable<ObservedMapEntity['badge']>;

export interface EntityView {
  anim: AnimEntity;
  root: Container;
  visualRoot: Container;
  artifactAura: Graphics;
  shadow: Graphics;
  image: Sprite;
  glyph: Text;
  label: Text;
  badgeLayer: Container;
  hpBar: Graphics;
  progressBar: Graphics;
  buffLayer: Container;
  questMarker: Container;
  formationMarker: Graphics;
  respawnLabel: Text;
  staticSignature: string;
  hiddenByFormation: boolean;
  imageBaseScaleX: number;
  imageBaseScaleY: number;
  imageFlipSourceSign: number;
  imageFlipTargetSign: number;
  imageFlipStartedAt: number;
  attackMotionStartedAt?: number;
  attackMotionUnitX?: number;
  attackMotionUnitY?: number;
}

export interface FloatingTextEffect {
  x: number;
  y: number;
  text: Text;
  variant: 'damage' | 'action';
  actionStyle?: FloatingActionTextStyle;
  burstOffsetX: number;
  burstOffsetY: number;
  createdAt: number;
  duration: number;
}

export interface AttackTrailEffect {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: number;
  colorAlpha: number;
  graphics: Graphics;
  createdAt: number;
  duration: number;
}

export interface WarningZoneEffect {
  cells: Array<{ x: number; y: number; expandDistance: number }>;
  color: number;
  colorAlpha: number;
  baseColor: number;
  baseColorAlpha: number;
  createdAt: number;
  duration: number;
  maxExpandDistance: number;
  graphics: Graphics;
}

export interface FadingPathState {
  cells: GridPoint[];
  startedAt: number;
  durationMs: number;
}

export interface TimeAtmosphereState {
  initialized: boolean;
  overlay: [number, number, number, number];
  sky: [number, number, number, number];
  horizon: [number, number, number, number];
  vignetteAlpha: number;
}

export interface FormationRangeVisual {
  highlightColor: string;
  boundary: boolean;
  boundaryChar?: string;
  boundaryColor: string;
}
