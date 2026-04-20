#!/usr/bin/env node
/**
 * 用途：把关键协议载荷与 shared 核心类型的字段关系写成硬门禁，避免新增字段只落进单层实现。
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const filePath = path.resolve(__dirname, '../src/protocol.ts');
const tsconfigPath = path.resolve(__dirname, '../tsconfig.json');
const rawConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (rawConfig.error) {
  throw new Error(ts.flattenDiagnosticMessageText(rawConfig.error.messageText, '\n'));
}
const parsedConfig = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, path.dirname(tsconfigPath));
const program = ts.createProgram({
  rootNames: parsedConfig.fileNames,
  options: parsedConfig.options,
});
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(filePath);
if (!sourceFile) {
  throw new Error(`source file missing: ${filePath}`);
}

const EXPECTED_INTERFACES = {
  NEXT_S2C_Bootstrap: {
    self: { type: 'PlayerState', optional: false },
    mapMeta: { type: 'MapMeta', optional: true },
    minimap: { type: 'MapMinimapSnapshot', optional: true },
    visibleMinimapMarkers: { type: 'MapMinimapMarker[]', optional: true },
    minimapLibrary: { type: 'MapMinimapArchiveEntry[]', optional: true },
    tiles: { type: 'VisibleTile[][]', optional: true },
    players: { type: 'RenderEntity[]', optional: true },
    time: { type: 'GameTimeState', optional: true },
    auraLevelBaseValue: { type: 'number', optional: true },
  },
  NEXT_S2C_MapStatic: {
    mapId: { type: 'string', optional: false },
    mapMeta: { type: 'MapMeta', optional: true },
    minimap: { type: 'MapMinimapSnapshot', optional: true },
    minimapLibrary: { type: 'MapMinimapArchiveEntry[]', optional: true },
    tiles: { type: 'VisibleTile[][]', optional: true },
    tilesOriginX: { type: 'number', optional: true },
    tilesOriginY: { type: 'number', optional: true },
    tilePatches: { type: 'VisibleTilePatch[]', optional: true },
    visibleMinimapMarkers: { type: 'MapMinimapMarker[]', optional: true },
    visibleMinimapMarkerAdds: { type: 'MapMinimapMarker[]', optional: true },
    visibleMinimapMarkerRemoves: { type: 'string[]', optional: true },
  },
  NEXT_S2C_PanelDelta: {
    inv: { type: 'NEXT_S2C_PanelInventoryDelta', optional: true },
    eq: { type: 'NEXT_S2C_PanelEquipmentDelta', optional: true },
    tech: { type: 'NEXT_S2C_PanelTechniqueDelta', optional: true },
    attr: { type: 'NEXT_S2C_PanelAttrDelta', optional: true },
    act: { type: 'NEXT_S2C_PanelActionDelta', optional: true },
    buff: { type: 'NEXT_S2C_PanelBuffDelta', optional: true },
  },
  NEXT_S2C_Detail: {
    kind: { type: "'npc' | 'monster' | 'ground' | 'player' | 'portal' | 'container'", optional: false },
    id: { type: 'string', optional: false },
    error: { type: 'string', optional: true },
    npc: { type: 'NEXT_S2C_NpcDetail', optional: true },
    monster: { type: 'NEXT_S2C_MonsterDetail', optional: true },
    player: { type: 'NEXT_S2C_PlayerDetail', optional: true },
    portal: { type: 'NEXT_S2C_PortalDetail', optional: true },
    ground: { type: 'NEXT_S2C_GroundDetail', optional: true },
    container: { type: 'NEXT_S2C_ContainerDetail', optional: true },
  },
  NEXT_S2C_AlchemyPanel: {
    state: { type: 'SyncedAlchemyPanelState | null', optional: false },
    catalogVersion: { type: 'number', optional: false },
    catalog: { type: 'AlchemyRecipeCatalogEntry[]', optional: true },
    error: { type: 'string', optional: true },
  },
  NEXT_S2C_EnhancementPanel: {
    state: { type: 'SyncedEnhancementPanelState | null', optional: false },
    error: { type: 'string', optional: true },
  },
  NEXT_S2C_MailDetail: {
    detail: { type: 'MailDetailView | null', optional: false },
    error: { type: 'string', optional: true },
  },
  NEXT_S2C_AttrDetail: {
    baseAttrs: { type: 'Attributes', optional: false },
    bonuses: { type: 'AttrBonus[]', optional: false },
    finalAttrs: { type: 'Attributes', optional: false },
    numericStats: { type: 'NumericStats', optional: false },
    ratioDivisors: { type: 'NumericRatioDivisors', optional: false },
    numericStatBreakdowns: { type: 'NumericStatBreakdownMap', optional: false },
    alchemySkill: { type: "PlayerState['alchemySkill']", optional: true },
    gatherSkill: { type: "PlayerState['gatherSkill']", optional: true },
    enhancementSkill: { type: "PlayerState['enhancementSkill']", optional: true },
  },
};

function normalizeTypeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function findInterface(name) {
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      result = node;
    }
  });
  return result;
}

function getPropertyName(node) {
  if (!node.name) return '';
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) {
    return node.name.text;
  }
  return '';
}

function extractInterfaceShape(name) {
  const declaration = findInterface(name);
  if (!declaration) {
    throw new Error(`interface missing: ${name}`);
  }
  const symbol = checker.getSymbolAtLocation(declaration.name);
  if (!symbol) {
    throw new Error(`interface symbol missing: ${name}`);
  }
  const interfaceType = checker.getDeclaredTypeOfSymbol(symbol);
  const shape = {};
  for (const propertySymbol of checker.getPropertiesOfType(interfaceType)) {
    const propName = propertySymbol.getName();
    const propertyDeclaration = propertySymbol.declarations?.find((node) => ts.isPropertySignature(node) || ts.isPropertyDeclaration(node));
    if (!propName || !propertyDeclaration || !propertyDeclaration.type) continue;
    shape[propName] = {
      optional: Boolean(propertySymbol.flags & ts.SymbolFlags.Optional),
      type: normalizeTypeText(propertyDeclaration.type.getText(propertyDeclaration.getSourceFile())),
    };
  }
  return shape;
}

function assertInterfaceShape(name, expected) {
  const actual = extractInterfaceShape(name);
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const extra = actualKeys.filter((key) => !expectedKeys.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${name} keys mismatch. missing=${missing.join(', ') || 'none'} extra=${extra.join(', ') || 'none'}`);
  }
  for (const key of expectedKeys) {
    const actualEntry = actual[key];
    const expectedEntry = expected[key];
    if (actualEntry.optional !== expectedEntry.optional) {
      throw new Error(`${name}.${key} optional mismatch. expected=${expectedEntry.optional} actual=${actualEntry.optional}`);
    }
    if (actualEntry.type !== normalizeTypeText(expectedEntry.type)) {
      throw new Error(`${name}.${key} type mismatch. expected=${expectedEntry.type} actual=${actualEntry.type}`);
    }
  }
}

for (const [name, expected] of Object.entries(EXPECTED_INTERFACES)) {
  assertInterfaceShape(name, expected);
}

console.log('protocol payload shape check passed');
