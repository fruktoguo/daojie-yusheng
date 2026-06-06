"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "packages/client/src/entity-facing.ts"), "utf8");

const keepsFourWayFacing = source.includes("export function resolveMonsterFacing")
  && source.includes("nextFacing === Direction.North")
  && source.includes("nextFacing === Direction.South")
  && !source.includes("return Direction.West;\n  }\n  return undefined;");
const directionKeysBeforeFallback = source.indexOf("`${key}:${directionKey}`") >= 0
  && source.indexOf("`${key}:${directionKey}`") < source.indexOf("`${key}:${side}`");
const twoWayFallbackKept = source.includes("side && side !== directionKey")
  && source.includes("flipBaseX: side === 'right'");

assert.equal(keepsFourWayFacing, true);
assert.equal(directionKeysBeforeFallback, true);
assert.equal(twoWayFallbackKept, true);

console.log(JSON.stringify({
  ok: true,
  case: "client-monster-facing-source",
  keepsFourWayFacing,
  directionKeysBeforeFallback,
  twoWayFallbackKept,
}, null, 2));
