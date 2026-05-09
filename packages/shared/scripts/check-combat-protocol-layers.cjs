#!/usr/bin/env node
/**
 * 用途：检查战斗事件的协议分层，避免审计/诊断内部事件误进入普通 S2C 协议。
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const combatEventTypes = read('src/combat-event-types.ts');
const worldPatchTypes = read('src/world-patch-types.ts');
const protocol = read('src/protocol.ts');
const responsePayloadTypes = read('src/protocol-response-payload-types.ts');
const tickCodecs = read('src/network-protobuf-tick-codecs.ts');
const {
  COMBAT_AOI_EFFECT_WIRE_BYTE_BUDGET,
} = require('../dist/combat-event-types.js');
const {
  tickPayloadType,
} = require('../dist/network-protobuf-schema.js');
const {
  encodeMessage,
  toWireTick,
} = require('../dist/network-protobuf-payload-codecs.js');

function assertContains(label, source, needle) {
  if (!source.includes(needle)) {
    throw new Error(`${label} missing: ${needle}`);
  }
}

function assertNotContains(label, source, needle) {
  if (source.includes(needle)) {
    throw new Error(`${label} must not contain: ${needle}`);
  }
}

for (const layer of ['world_delta_fx', 'notice', 'audit_internal', 'diagnostic_internal']) {
  assertContains('combat protocol layer spec', combatEventTypes, layer);
}

assertContains('combat AOI result budget', combatEventTypes, 'COMBAT_AOI_RESULT_FIELD_BUDGET = 10');
assertContains('combat AOI effect budget', combatEventTypes, 'COMBAT_AOI_EFFECT_FIELD_BUDGET = 10');
assertContains('combat AOI byte budget', combatEventTypes, 'COMBAT_AOI_EFFECT_WIRE_BYTE_BUDGET = 200');
assertContains('combat protocol result normalization', combatEventTypes, "export function normalizeCombatProtocolResult");
assertContains('world delta fx import', worldPatchTypes, "import type { CombatEffect } from './action-combat-types';");
assertContains('world delta fx field', worldPatchTypes, 'fx?: CombatEffect[];');
assertContains('notice payload boundary', responsePayloadTypes, 'export interface S2C_Notice extends NoticeView');
assertContains('world delta payload boundary', responsePayloadTypes, 'export interface S2C_WorldDelta extends WorldDeltaView');
assertContains('tick codec fx encode', tickCodecs, 'if (payload.fx) wire.fx = cloneJson(payload.fx)');
assertContains('tick codec fx decode', tickCodecs, 'if (Array.isArray(wire.fx)) payload.fx = cloneJson(wire.fx)');

for (const forbidden of [
  'CombatAudit',
  'CombatDiagnostic',
  'CombatAuditEvent',
  'CombatDiagnosticEvent',
  'CombatAoiResultEvent',
]) {
  assertNotContains('protocol S2C event map', protocol, forbidden);
}

for (const forbiddenEvent of ['CombatAudit:', 'CombatDiagnostic:', 'CombatResult:']) {
  assertNotContains('protocol S2C events', protocol, forbiddenEvent);
}

const budgetSamples = [
  {
    label: 'attack',
    effect: {
      type: 'attack',
      fromX: 123,
      fromY: 456,
      toX: 124,
      toY: 457,
      color: '#ffdd66',
    },
  },
  {
    label: 'float',
    effect: {
      type: 'float',
      x: 124,
      y: 457,
      text: '-99999',
      color: '#ff5a5a',
      variant: 'damage',
      durationMs: 900,
    },
  },
  {
    label: 'warning_zone',
    effect: {
      type: 'warning_zone',
      cells: Array.from({ length: 9 }, (_, index) => ({
        x: 120 + (index % 3),
        y: 450 + Math.floor(index / 3),
      })),
      color: '#f97316',
      baseColor: '#f97316',
      originX: 121,
      originY: 451,
      durationMs: 1000,
    },
  },
];

for (const sample of budgetSamples) {
  const wire = toWireTick({
    p: [],
    e: [],
    fx: [sample.effect],
  });
  const byteLength = encodeMessage(tickPayloadType, wire).length;
  if (byteLength > COMBAT_AOI_EFFECT_WIRE_BYTE_BUDGET) {
    throw new Error(`combat AOI ${sample.label} effect exceeds protobuf budget: ${byteLength} > ${COMBAT_AOI_EFFECT_WIRE_BYTE_BUDGET}`);
  }
}

console.log('combat protocol layer check passed');
