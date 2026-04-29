#!/usr/bin/env node
/**
 * 用途：把 shared protocol、network-protobuf 与 server protocol audit 的静态契约绑成硬门禁。
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const protobuf = require('protobufjs');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const protocolPath = path.resolve(__dirname, '../src/protocol.ts');
const protobufPath = path.resolve(__dirname, '../src/network-protobuf.ts');
const protobufSchemaPath = path.resolve(__dirname, '../src/network-protobuf-schema.ts');
const serverAuditPath = path.resolve(repoRoot, 'packages/server/src/tools/protocol-audit.ts');

const protocolSource = fs.readFileSync(protocolPath, 'utf8');
const protocolFile = ts.createSourceFile(protocolPath, protocolSource, ts.ScriptTarget.Latest, true);
const protobufSource = fs.readFileSync(protobufPath, 'utf8');
const protobufFile = ts.createSourceFile(protobufPath, protobufSource, ts.ScriptTarget.Latest, true);
const protobufSchemaSource = fs.readFileSync(protobufSchemaPath, 'utf8');
const protobufSchemaFile = ts.createSourceFile(protobufSchemaPath, protobufSchemaSource, ts.ScriptTarget.Latest, true);
const serverAuditSource = fs.readFileSync(serverAuditPath, 'utf8');
const serverAuditFile = ts.createSourceFile(serverAuditPath, serverAuditSource, ts.ScriptTarget.Latest, true);

const LEGACY_HIGH_FREQ_EVENT_KEYS = ['Tick', 'AttrUpdate', 'TechniqueUpdate', 'ActionsUpdate'];
const EXPECTED_PROTOBUF_TYPES = [
  'ActionsUpdatePayload',
  'AttrUpdatePayload',
  'TechniqueUpdatePayload',
  'TickPayload',
];
const EXPECTED_STATIC_S2C_SURFACES = [
  {
    label: 'world-sync-protocol service emits',
    relativePath: 'packages/server/src/network/world-sync-protocol.service.ts',
    qualifierName: 'S2C',
    expectedMembers: ['Bootstrap', 'InitSession', 'LootWindowUpdate', 'MapEnter', 'MapStatic', 'Notice', 'PanelDelta', 'Quests', 'Realm', 'SelfDelta', 'WorldDelta'],
  },
  {
    label: 'world-client-event service emits',
    relativePath: 'packages/server/src/network/world-client-event.service.ts',
    qualifierName: 'S2C',
    expectedMembers: [
      'Error',
      'LootWindowUpdate',
      'MailDetail',
      'MailOpResult',
      'MailPage',
      'MailSummary',
      'MarketItemBook',
      'MarketListings',
      'MarketOrders',
      'MarketStorage',
      'MarketTradeHistory',
      'MarketUpdate',
      'Notice',
      'NpcShop',
      'Pong',
      'QuestNavigateResult',
      'Quests',
      'RedeemCodesResult',
      'SuggestionUpdate',
    ],
  },
  {
    label: 'world-protocol-projection service emits',
    relativePath: 'packages/server/src/network/world-protocol-projection.service.ts',
    qualifierName: 'S2C',
    expectedMembers: ['TileDetail'],
  },
];

function unwrapExpression(node) {
  let current = node ?? null;
  while (
    current
    && (ts.isAsExpression(current)
      || ts.isSatisfiesExpression(current)
      || ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function findVariable(sourceFile, name) {
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        result = declaration;
      }
    }
  });
  return result;
}

function findInterface(sourceFile, name) {
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      result = node;
    }
  });
  return result;
}

function extractObjectLiteralKeys(sourceFile, name) {
  const declaration = findVariable(sourceFile, name);
  const initializer = unwrapExpression(declaration?.initializer);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`${name} object literal missing`);
  }
  return initializer.properties
    .map((property) => {
      if (!ts.isPropertyAssignment(property)) return '';
      if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
        return property.name.text;
      }
      return '';
    })
    .filter(Boolean)
    .sort();
}

function extractPayloadMapKeys(sourceFile, interfaceName, qualifierName) {
  const declaration = findInterface(sourceFile, interfaceName);
  if (!declaration) {
    throw new Error(`${interfaceName} interface missing`);
  }
  return declaration.members
    .map((member) => {
      if (!ts.isPropertySignature(member) || !member.name || !ts.isComputedPropertyName(member.name)) {
        return '';
      }
      const expression = member.name.expression;
      if (
        ts.isPropertyAccessExpression(expression)
        && ts.isIdentifier(expression.expression)
        && expression.expression.text === qualifierName
      ) {
        return expression.name.text;
      }
      return '';
    })
    .filter(Boolean)
    .sort();
}

function assertSameKeys(label, expected, actual) {
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${label} mismatch. missing=${missing.join(', ') || 'none'} extra=${extra.join(', ') || 'none'}`);
  }
}

function extractTemplateLiteralText(sourceFile, name) {
  const declaration = findVariable(sourceFile, name);
  const initializer = unwrapExpression(declaration?.initializer);
  if (!initializer) {
    throw new Error(`${name} initializer missing`);
  }
  if (ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isTemplateExpression(initializer) && initializer.templateSpans.length === 0) {
    return initializer.head.text;
  }
  throw new Error(`${name} template literal missing`);
}

function extractLookupTypeNames(sourceFile) {
  const result = [];
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      const initializer = unwrapExpression(declaration.initializer);
      if (
        initializer
        && ts.isCallExpression(initializer)
        && ts.isPropertyAccessExpression(initializer.expression)
        && ts.isIdentifier(initializer.expression.expression)
        && initializer.expression.expression.text === 'root'
        && initializer.expression.name.text === 'lookupType'
        && initializer.arguments.length === 1
        && ts.isStringLiteral(initializer.arguments[0])
      ) {
        result.push(initializer.arguments[0].text);
      }
    }
  });
  return result.sort();
}

function extractSetMembers(sourceFile, name, qualifierName) {
  const declaration = findVariable(sourceFile, name);
  const initializer = unwrapExpression(declaration?.initializer);
  if (!initializer || !ts.isNewExpression(initializer)) {
    throw new Error(`${name} set initializer missing`);
  }
  if (!ts.isIdentifier(initializer.expression) || initializer.expression.text !== 'Set') {
    throw new Error(`${name} is not a Set initializer`);
  }
  const [firstArg] = initializer.arguments ?? [];
  if (!firstArg) {
    return [];
  }
  const expression = unwrapExpression(firstArg);
  if (!expression || !ts.isArrayLiteralExpression(expression)) {
    throw new Error(`${name} set members must use an array literal`);
  }
  return expression.elements.map((element) => {
    if (ts.isStringLiteral(element)) {
      return element.text;
    }
    if (
      qualifierName
      && ts.isPropertyAccessExpression(element)
      && ts.isIdentifier(element.expression)
      && element.expression.text === qualifierName
    ) {
      return element.name.text;
    }
    throw new Error(`${name} contains unsupported member expression: ${element.getText(sourceFile)}`);
  }).sort();
}

function normalizeObjectLiteralObject(node) {
  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : '';
    if (!key) {
      continue;
    }
    result[key] = property.initializer;
  }
  return result;
}

function extractStringArray(node, sourceFile, qualifierName) {
  const expression = unwrapExpression(node);
  if (!expression || !ts.isArrayLiteralExpression(expression)) {
    throw new Error(`expected array literal, got ${node?.getText(sourceFile) ?? 'null'}`);
  }
  return expression.elements.map((element) => {
    if (ts.isStringLiteral(element)) {
      return element.text;
    }
    if (
      qualifierName
      && ts.isPropertyAccessExpression(element)
      && ts.isIdentifier(element.expression)
      && element.expression.text === qualifierName
    ) {
      return element.name.text;
    }
    throw new Error(`unsupported array element: ${element.getText(sourceFile)}`);
  }).sort();
}

function extractStaticSurfaceChecks(sourceFile) {
  const declaration = findVariable(sourceFile, 'STATIC_S2C_SURFACE_CHECKS');
  const initializer = unwrapExpression(declaration?.initializer);
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error('STATIC_S2C_SURFACE_CHECKS array missing');
  }
  return initializer.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(`STATIC_S2C_SURFACE_CHECKS entry is not an object: ${element.getText(sourceFile)}`);
    }
    const properties = normalizeObjectLiteralObject(element);
    const labelNode = properties.label;
    const pathNode = properties.relativePath;
    const qualifierNode = properties.qualifierName;
    const membersNode = properties.expectedMembers;
    if (!labelNode || !pathNode || !qualifierNode || !membersNode) {
      throw new Error(`STATIC_S2C_SURFACE_CHECKS entry missing required fields: ${element.getText(sourceFile)}`);
    }
    if (!ts.isStringLiteral(labelNode) || !ts.isStringLiteral(pathNode) || !ts.isStringLiteral(qualifierNode)) {
      throw new Error(`STATIC_S2C_SURFACE_CHECKS entry must use string literals: ${element.getText(sourceFile)}`);
    }
    return {
      label: labelNode.text,
      relativePath: pathNode.text,
      qualifierName: qualifierNode.text,
      expectedMembers: extractStringArray(membersNode, sourceFile, qualifierNode.text),
    };
  });
}

function assertNoLegacyHighFrequencyEvents() {
  const nextS2CKeys = extractObjectLiteralKeys(protocolFile, 'S2C');
  const payloadMapKeys = extractPayloadMapKeys(protocolFile, 'S2C_PayloadMap', 'S2C');
  for (const key of LEGACY_HIGH_FREQ_EVENT_KEYS) {
    if (nextS2CKeys.includes(key)) {
      throw new Error(`S2C should not expose legacy high-frequency event key: ${key}`);
    }
    if (payloadMapKeys.includes(key)) {
      throw new Error(`S2C_PayloadMap should not expose legacy high-frequency event key: ${key}`);
    }
  }
}

function assertHelperInterfacesExist() {
  for (const name of ['S2C_Tick', 'S2C_AttrUpdate', 'S2C_TechniqueUpdate', 'S2C_ActionsUpdate']) {
    if (!findInterface(protocolFile, name)) {
      throw new Error(`protocol helper interface missing: ${name}`);
    }
  }
}

function assertNetworkProtobufSchema() {
  const lookupTypes = extractLookupTypeNames(protobufSchemaFile);
  assertSameKeys('network-protobuf lookupType names', EXPECTED_PROTOBUF_TYPES, lookupTypes);
  const schemaText = extractTemplateLiteralText(protobufSchemaFile, 'PROTO_SCHEMA');
  const root = protobuf.parse(schemaText).root;
  for (const typeName of EXPECTED_PROTOBUF_TYPES) {
    if (!root.lookupType(typeName)) {
      throw new Error(`PROTO_SCHEMA missing message type: ${typeName}`);
    }
  }
}

function assertProtobufEventWhitelists() {
  const s2cEvents = extractSetMembers(protobufSchemaFile, 'PROTOBUF_S2C_EVENTS', 'S2C');
  const c2sEvents = extractSetMembers(protobufSchemaFile, 'PROTOBUF_C2S_EVENTS', 'C2S');
  if (s2cEvents.length > 0 || c2sEvents.length > 0) {
    throw new Error(`protobuf event whitelist drifted. s2c=${s2cEvents.join(', ') || 'none'} c2s=${c2sEvents.join(', ') || 'none'}`);
  }
}

function assertServerAuditStaticSurfaces() {
  const actual = extractStaticSurfaceChecks(serverAuditFile)
    .map((entry) => ({
      label: entry.label,
      relativePath: entry.relativePath,
      qualifierName: entry.qualifierName,
      expectedMembers: [...entry.expectedMembers].sort(),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const expected = EXPECTED_STATIC_S2C_SURFACES
    .map((entry) => ({
      label: entry.label,
      relativePath: entry.relativePath,
      qualifierName: entry.qualifierName,
      expectedMembers: [...entry.expectedMembers].sort(),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`server next protocol audit static surface mismatch.\nexpected=${JSON.stringify(expected, null, 2)}\nactual=${JSON.stringify(actual, null, 2)}`);
  }
}

assertNoLegacyHighFrequencyEvents();
assertHelperInterfacesExist();
assertNetworkProtobufSchema();
assertProtobufEventWhitelists();
assertServerAuditStaticSurfaces();

console.log('network protobuf contract check passed');
