#!/usr/bin/env node
/**
 * 用途：检查 shared-next 数值属性键定义是否一致。
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filePath = path.resolve(__dirname, '../src/numeric.ts');
const realmFilePath = path.resolve(__dirname, '../src/constants/gameplay/realm.ts');
const attributesFilePath = path.resolve(__dirname, '../src/constants/gameplay/attributes.ts');
const protobufFilePath = path.resolve(__dirname, '../src/network-protobuf-schema.ts');
/**
 * 记录来源。
 */
const source = fs.readFileSync(filePath, 'utf8');
const realmSource = fs.readFileSync(realmFilePath, 'utf8');
const attributesSource = fs.readFileSync(attributesFilePath, 'utf8');
const protobufSource = fs.readFileSync(protobufFilePath, 'utf8');
/**
 * 记录来源文件。
 */
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
const realmSourceFile = ts.createSourceFile(realmFilePath, realmSource, ts.ScriptTarget.Latest, true);
const attributesSourceFile = ts.createSourceFile(attributesFilePath, attributesSource, ts.ScriptTarget.Latest, true);
/**
 * 查找variable。
 */
function findVariable(name) {
/**
 * 累计当前结果。
 */
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    const [declaration] = node.declarationList.declarations;
    if (!declaration || !ts.isIdentifier(declaration.name)) return;
    if (declaration.name.text === name) {
      result = declaration;
    }
  });
  return result;
}
/**
 * 查找function。
 */
function findFunction(name) {
/**
 * 累计当前结果。
 */
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isFunctionDeclaration(node) || !node.name) return;
    if (node.name.text === name) {
      result = node;
    }
  });
  return result;
}
/**
 * 提取arraystrings。
 */
function extractArrayStrings(initializer) {
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    return [];
  }
  return initializer.elements
    .map((el) => {
      if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
        return el.text;
      }
      return '';
    })
    .filter((text) => Boolean(text));
}
/**
 * 提取objectkeys。
 */
function extractObjectKeys(initializer) {
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return [];
  }
  return initializer.properties
    .map((prop) => {
      if (ts.isPropertyAssignment(prop)) {
        if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
          return prop.name.text;
        }
      }
      return '';
    })
    .filter((text) => Boolean(text));
}
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
/**
 * 查找returnobjectliteral。
 */
function findReturnObjectLiteral(fn) {
  if (!fn?.body) {
    return null;
  }
/**
 * 记录literal。
 */
  let literal = null;
/**
 * 处理visit。
 */
  function visit(node) {
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
      literal = node.expression;
      return;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(fn.body, visit);
  return literal;
}

function gatherAssignedKeysFromFunction(name) {
  const fn = findFunction(name);
  if (!fn?.body) {
    return [];
  }
  const keys = new Set();
  function visit(node) {
    if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && ts.isIdentifier(node.left.expression)
      && node.left.expression.text === 'target'
    ) {
      keys.add(node.left.name.text);
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'resetElementStatGroup'
      && node.arguments.length > 0
      && ts.isPropertyAccessExpression(node.arguments[0])
      && ts.isIdentifier(node.arguments[0].expression)
      && node.arguments[0].expression.text === 'target'
    ) {
      keys.add(node.arguments[0].name.text);
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(fn.body, visit);
  return [...keys];
}
/**
 * 汇总keysfromfunction。
 */
function gatherKeysFromFunction(name) {
/**
 * 记录fn。
 */
  const fn = findFunction(name);
/**
 * 记录literal。
 */
  const literal = findReturnObjectLiteral(fn);
  return extractObjectKeys(literal);
}
/**
 * 汇总keysfrommapping。
 */
function gatherKeysFromMapping(name) {
/**
 * 记录declaration。
 */
  const declaration = findVariable(name);
  return extractObjectKeys(declaration && declaration.initializer);
}
function findRealmVariable(name) {
  let result = null;
  ts.forEachChild(realmSourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    const [declaration] = node.declarationList.declarations;
    if (!declaration || !ts.isIdentifier(declaration.name)) return;
    if (declaration.name.text === name) {
      result = declaration;
    }
  });
  return result;
}
function findAttributesVariable(name) {
  let result = null;
  ts.forEachChild(attributesSourceFile, (node) => {
    if (!ts.isVariableStatement(node)) return;
    const [declaration] = node.declarationList.declarations;
    if (!declaration || !ts.isIdentifier(declaration.name)) return;
    if (declaration.name.text === name) {
      result = declaration;
    }
  });
  return result;
}
function gatherRealmTemplateRatioDivisorObjectKeys() {
  const declaration = findRealmVariable('PLAYER_REALM_NUMERIC_TEMPLATES');
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error('PLAYER_REALM_NUMERIC_TEMPLATES object missing');
  }
  const results = [];
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
      continue;
    }
    const stage = property.name.getText(realmSourceFile);
    const ratioDivisorsProperty = property.initializer.properties.find((entry) => {
      return ts.isPropertyAssignment(entry)
        && ((ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) && entry.name.text === 'ratioDivisors');
    });
    if (!ratioDivisorsProperty || !ts.isPropertyAssignment(ratioDivisorsProperty)) {
      throw new Error(`realm template ${stage} missing ratioDivisors`);
    }
    const expression = ratioDivisorsProperty.initializer;
    if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== 'ensureNumericRatioDivisorsTemplate') {
      throw new Error(`realm template ${stage} ratioDivisors must be wrapped by ensureNumericRatioDivisorsTemplate`);
    }
    const [arg] = expression.arguments;
    if (!arg || !ts.isObjectLiteralExpression(arg)) {
      throw new Error(`realm template ${stage} ratioDivisors object missing`);
    }
    const keys = extractObjectKeys(arg);
    const elementDamageReduceProperty = arg.properties.find((entry) => {
      return ts.isPropertyAssignment(entry)
        && ((ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) && entry.name.text === 'elementDamageReduce');
    });
    if (!elementDamageReduceProperty || !ts.isPropertyAssignment(elementDamageReduceProperty) || !ts.isObjectLiteralExpression(elementDamageReduceProperty.initializer)) {
      throw new Error(`realm template ${stage} ratioDivisors.elementDamageReduce missing`);
    }
    results.push({
      stage,
      keys,
      elementKeys: extractObjectKeys(elementDamageReduceProperty.initializer),
    });
  }
  return results;
}
function extractProtoMessageFieldNames(messageName) {
  const escapedName = messageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = protobufSource.match(new RegExp(`message\\s+${escapedName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  if (!match) {
    throw new Error(`${messageName} protobuf message missing`);
  }
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const fieldMatch = line.match(/^(?:optional|required|repeated)\s+[A-Za-z0-9_<>.]+\s+([A-Za-z0-9_]+)\s*=/);
      return fieldMatch ? fieldMatch[1] : '';
    })
    .filter(Boolean);
}
/**
 * 记录数值属性字段keys。
 */
const numericStatsKeys = extractArrayStrings(findVariable('NUMERIC_STATS_KEYS')?.initializer);
if (!numericStatsKeys.length) {
  throw new Error('NUMERIC_STATS_KEYS array missing or empty');
}
/**
 * 收集key集合。
 */
const keySet = new Set(numericStatsKeys);
if (keySet.size !== numericStatsKeys.length) {
  throw new Error('NUMERIC_STATS_KEYS contains duplicate entries');
}
const numericRatioDivisorKeys = extractArrayStrings(findVariable('NUMERIC_RATIO_DIVISOR_KEYS')?.initializer);
if (!numericRatioDivisorKeys.length) {
  throw new Error('NUMERIC_RATIO_DIVISOR_KEYS array missing or empty');
}
const numericRatioDivisorKeySet = new Set(numericRatioDivisorKeys);
if (numericRatioDivisorKeySet.size !== numericRatioDivisorKeys.length) {
  throw new Error('NUMERIC_RATIO_DIVISOR_KEYS contains duplicate entries');
}
const elementKeys = extractArrayStrings(unwrapExpression(findAttributesVariable('ELEMENT_KEYS')?.initializer));
if (!elementKeys.length) {
  throw new Error('ELEMENT_KEYS array missing or empty');
}
/**
 * 断言matches。
 */
function assertMatches(label, providedKeys) {
/**
 * 记录missing。
 */
  const missing = numericStatsKeys.filter((key) => !providedKeys.includes(key));
  if (missing.length) {
    throw new Error(`${label} missing keys: ${missing.join(', ')}`);
  }
}
function assertExpectedKeys(label, expectedKeys, providedKeys) {
  const missing = expectedKeys.filter((key) => !providedKeys.includes(key));
  const extra = providedKeys.filter((key) => !expectedKeys.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${label} key mismatch. missing=${missing.join(', ') || 'none'} extra=${extra.join(', ') || 'none'}`);
  }
}
assertMatches('createNumericStats', gatherKeysFromFunction('createNumericStats'));
assertMatches('cloneNumericStats', gatherKeysFromFunction('cloneNumericStats'));
assertMatches('resetNumericStats', gatherAssignedKeysFromFunction('resetNumericStats'));
assertExpectedKeys('createNumericRatioDivisors', numericRatioDivisorKeys, gatherKeysFromFunction('createNumericRatioDivisors'));
assertExpectedKeys('cloneNumericRatioDivisors', numericRatioDivisorKeys, gatherKeysFromFunction('cloneNumericRatioDivisors'));
/**
 * 记录pointskeys。
 */
const pointsKeys = gatherKeysFromMapping('NUMERIC_STAT_POINTS_PER_VALUE');
pointsKeys.forEach((key) => {
  if (!keySet.has(key)) {
    throw new Error(`NUMERIC_STAT_POINTS_PER_VALUE contains unexpected key: ${key}`);
  }
});
/**
 * 记录actualkeys。
 */
const actualKeys = gatherKeysFromMapping('NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE');
actualKeys.forEach((key) => {
  if (!keySet.has(key)) {
    throw new Error(`NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE contains unexpected key: ${key}`);
  }
});
const ratioCreateKeys = gatherKeysFromFunction('createNumericRatioDivisors');
const ratioCloneKeys = gatherKeysFromFunction('cloneNumericRatioDivisors');
const missingRatioCloneKeys = ratioCreateKeys.filter((key) => !ratioCloneKeys.includes(key));
const extraRatioCloneKeys = ratioCloneKeys.filter((key) => !ratioCreateKeys.includes(key));
if (missingRatioCloneKeys.length || extraRatioCloneKeys.length) {
  throw new Error(`cloneNumericRatioDivisors key mismatch. missing=${missingRatioCloneKeys.join(', ') || 'none'} extra=${extraRatioCloneKeys.join(', ') || 'none'}`);
}
const realmTemplateRatioDivisors = gatherRealmTemplateRatioDivisorObjectKeys();
for (const entry of realmTemplateRatioDivisors) {
  assertExpectedKeys(`realm template ${entry.stage} ratioDivisors`, numericRatioDivisorKeys, entry.keys);
  assertExpectedKeys(`realm template ${entry.stage} ratioDivisors.elementDamageReduce`, elementKeys, entry.elementKeys);
}
assertExpectedKeys('NumericStatsPayload', numericStatsKeys, extractProtoMessageFieldNames('NumericStatsPayload'));
assertExpectedKeys('NumericRatioDivisorsPayload', numericRatioDivisorKeys, extractProtoMessageFieldNames('NumericRatioDivisorsPayload'));
assertExpectedKeys('ElementStatGroupPayload', elementKeys, extractProtoMessageFieldNames('ElementStatGroupPayload'));
console.log('numeric stats consistency check passed');
