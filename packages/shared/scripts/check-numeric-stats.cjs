#!/usr/bin/env node
/**
 * 用途：检查 shared-next 数值属性键定义是否一致。
 */
// TODO(next:T23): 把 shared 一致性检查从单点 numeric 守卫扩成覆盖 protocol/reset/projection/protobuf 的统一检查入口。

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filePath = path.resolve(__dirname, '../src/numeric.ts');
/**
 * 记录来源。
 */
const source = fs.readFileSync(filePath, 'utf8');
/**
 * 记录来源文件。
 */
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
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
assertMatches('createNumericStats', gatherKeysFromFunction('createNumericStats'));
assertMatches('cloneNumericStats', gatherKeysFromFunction('cloneNumericStats'));
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
console.log('numeric stats consistency check passed');
