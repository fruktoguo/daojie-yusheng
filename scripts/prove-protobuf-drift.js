"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const networkProtobufPath = path.join(repoRoot, "packages/shared/src/network-protobuf.ts");
const networkProtobuf = require(path.join(repoRoot, "packages/shared/dist/network-protobuf.js"));

const source = fs.readFileSync(networkProtobufPath, "utf8");

const REQUIRED_PROTOCOL_TYPES = [
  "S2C_Tick",
  "S2C_AttrUpdate",
  "S2C_TechniqueUpdate",
  "S2C_ActionsUpdate",
  "TickRenderEntity",
  "GroundItemPilePatch",
  "VisibleTilePatch",
  "TechniqueUpdateEntry",
  "ActionUpdateEntry",
];

const REQUIRED_LOOKUP_TYPES = [
  "TickPayload",
  "TechniqueUpdatePayload",
  "ActionsUpdatePayload",
  "AttrUpdatePayload",
];

const REQUIRED_WIRE_FUNCTIONS = [
  "toWireTick",
  "fromWireTick",
  "toWireTechniqueUpdate",
  "fromWireTechniqueUpdate",
  "toWireActionsUpdate",
  "fromWireActionsUpdate",
  "toWireAttrUpdate",
  "fromWireAttrUpdate",
];

function main() {
  const failures = [];

  for (const typeName of REQUIRED_PROTOCOL_TYPES) {
    if (!new RegExp(`\\b${typeName}\\b`).test(source)) {
      failures.push(`network-protobuf.ts 缺少协议类型引用 ${typeName}`);
    }
  }

  for (const messageName of REQUIRED_LOOKUP_TYPES) {
    if (!source.includes(`lookupType('${messageName}')`)) {
      failures.push(`network-protobuf.ts 缺少 protobuf message lookup ${messageName}`);
    }
  }

  for (const functionName of REQUIRED_WIRE_FUNCTIONS) {
    if (!new RegExp(`function ${functionName}\\(`).test(source)) {
      failures.push(`network-protobuf.ts 缺少 wire 函数 ${functionName}`);
    }
  }

  if (!(networkProtobuf.PROTOBUF_S2C_EVENTS instanceof Set) || networkProtobuf.PROTOBUF_S2C_EVENTS.size !== 0) {
    failures.push("PROTOBUF_S2C_EVENTS 不再为空，需同步主链与审计策略");
  }
  if (!(networkProtobuf.PROTOBUF_C2S_EVENTS instanceof Set) || networkProtobuf.PROTOBUF_C2S_EVENTS.size !== 0) {
    failures.push("PROTOBUF_C2S_EVENTS 不再为空，需同步主链与审计策略");
  }

  process.stdout.write("[protobuf drift proof] summary\n");
  process.stdout.write(`- required_protocol_types: ${REQUIRED_PROTOCOL_TYPES.length}\n`);
  process.stdout.write(`- required_lookup_types: ${REQUIRED_LOOKUP_TYPES.length}\n`);
  process.stdout.write(`- required_wire_functions: ${REQUIRED_WIRE_FUNCTIONS.length}\n`);
  process.stdout.write(`- protobuf_s2c_events: ${networkProtobuf.PROTOBUF_S2C_EVENTS.size}\n`);
  process.stdout.write(`- protobuf_c2s_events: ${networkProtobuf.PROTOBUF_C2S_EVENTS.size}\n`);

  if (failures.length > 0) {
    process.stderr.write("[protobuf drift proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[protobuf drift proof] passed\n");
}

main();
