"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const entityFacingSource = fs.readFileSync(path.join(repoRoot, "packages/client/src/entity-facing.ts"), "utf8");
const canvasRendererSource = fs.readFileSync(path.join(repoRoot, "packages/client/src/renderer/runtime-image-pack.ts"), "utf8");
const pixiRendererSource = fs.readFileSync(path.join(repoRoot, "packages/client/src/game-map/renderer/pixi-map-renderer-adapter.ts"), "utf8");
const sharedDirectionSource = fs.readFileSync(path.join(repoRoot, "packages/shared/src/direction.ts"), "utf8");
const defaultManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages/client/public/assets/runtime-image-packs/default/manifest.json"), "utf8"));

const normalizesMonsterFacingHorizontally = entityFacingSource.includes("export function resolveMonsterFacing")
  && entityFacingSource.includes("return normalizeHorizontalFacing(nextFacing, previousFacing);")
  && !entityFacingSource.includes("case Direction.North:")
  && !entityFacingSource.includes("case Direction.South:")
  && !entityFacingSource.includes("nextFacing === Direction.North")
  && !entityFacingSource.includes("nextFacing === Direction.South");
const sharedHorizontalFacingRules = sharedDirectionSource.includes("export function normalizeHorizontalFacing")
  && sharedDirectionSource.includes("export function horizontalFacingFromDelta")
  && sharedDirectionSource.includes("export function horizontalFacingFromTo")
  && sharedDirectionSource.includes("return horizontalFacingFromDelta(toX - fromX, previousFacing);");
const directionKeysBeforeTwoWayFallback = entityFacingSource.indexOf("`${key}:${directionKey}`") >= 0
  && entityFacingSource.indexOf("`${key}:${directionKey}`") < entityFacingSource.indexOf("`${key}:${side}`");
const twoWayFallbackBeforeBaseFallback = entityFacingSource.indexOf("...sideKeys,") >= 0
  && entityFacingSource.indexOf("...sideKeys,") < entityFacingSource.indexOf("...baseKeys,");
const baseFallbackTransformsKept = entityFacingSource.includes("function resolveHorizontalBaseSpriteTransform")
  && entityFacingSource.includes("return facing === Direction.West ? { flipX: true } : IDENTITY_SPRITE_TRANSFORM;")
  && !entityFacingSource.includes("rotationTurns")
  && entityFacingSource.includes("...baseKeys.map(() => baseTransform)");
const playersAndMonstersUseHorizontalSpritePlan = entityFacingSource.includes("function supportsHorizontalFacingSprite")
  && entityFacingSource.includes("return entity.kind === 'monster' || entity.kind === 'player';")
  && entityFacingSource.includes("if (!supportsHorizontalFacingSprite(entity))");
const transformsAlignedWithKeys = entityFacingSource.includes("transforms: [")
  && entityFacingSource.indexOf("...directionKeys.map(() => IDENTITY_SPRITE_TRANSFORM),") < entityFacingSource.indexOf("...sideKeys.map(() => IDENTITY_SPRITE_TRANSFORM),")
  && entityFacingSource.indexOf("...sideKeys.map(() => IDENTITY_SPRITE_TRANSFORM),") < entityFacingSource.indexOf("...baseKeys.map(() => baseTransform),");
const canvasAppliesBaseFallbackTransform = canvasRendererSource.includes("type EntitySpriteSelection = {")
  && canvasRendererSource.includes("transform: EntitySpriteTransform;")
  && canvasRendererSource.includes("return this.drawAtlasSprite(ctx, selection.ref, dx, dy, size, selection.transform);")
  && !canvasRendererSource.includes("ctx.rotate(transform.rotationTurns * Math.PI / 2)")
  && canvasRendererSource.includes("ctx.scale(-1, 1)");
const pixiAppliesBaseFallbackTransform = pixiRendererSource.includes("type RuntimeEntitySpriteSelection = {")
  && pixiRendererSource.includes("transform: EntitySpriteTransform;")
  && pixiRendererSource.includes("(selection.transform.flipX ? -1 : 1)")
  && pixiRendererSource.includes("view.image.rotation = 0;")
  && !pixiRendererSource.includes("view.image.rotation = selection.transform.rotationTurns * Math.PI / 2;");
const defaultMonsterAssetsUseBaseKeys = Object.keys(defaultManifest.entities ?? {})
  .filter((key) => key.startsWith("monster:"))
  .every((key) => !/(?:\:left|\:right|\:north|\:south)$/.test(key));

assert.equal(normalizesMonsterFacingHorizontally, true);
assert.equal(sharedHorizontalFacingRules, true);
assert.equal(directionKeysBeforeTwoWayFallback, true);
assert.equal(twoWayFallbackBeforeBaseFallback, true);
assert.equal(baseFallbackTransformsKept, true);
assert.equal(playersAndMonstersUseHorizontalSpritePlan, true);
assert.equal(transformsAlignedWithKeys, true);
assert.equal(canvasAppliesBaseFallbackTransform, true);
assert.equal(pixiAppliesBaseFallbackTransform, true);
assert.equal(defaultMonsterAssetsUseBaseKeys, true);

console.log(JSON.stringify({
  ok: true,
  case: "client-monster-facing-source",
  normalizesMonsterFacingHorizontally,
  sharedHorizontalFacingRules,
  directionKeysBeforeTwoWayFallback,
  twoWayFallbackBeforeBaseFallback,
  baseFallbackTransformsKept,
  playersAndMonstersUseHorizontalSpritePlan,
  transformsAlignedWithKeys,
  canvasAppliesBaseFallbackTransform,
  pixiAppliesBaseFallbackTransform,
  defaultMonsterAssetsUseBaseKeys,
}, null, 2));
