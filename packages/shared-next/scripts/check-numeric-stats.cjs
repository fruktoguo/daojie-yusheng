#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filePath = path.resolve(__dirname, '../src/numeric.ts');
const source = fs.readFileSync(filePath, 'utf8');
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
function findVariable(name) {
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
function findFunction(name) {
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isFunctionDeclaration(node) || !node.name) return;
    if (node.name.text === name) {
      result = node;
    }
  });
  return result;
}
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
function findReturnObjectLiteral(fn) {
  if (!fn?.body) {
    return null;
  }
  let literal = null;
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
function gatherKeysFromFunction(name) {
  const fn = findFunction(name);
  const literal = findReturnObjectLiteral(fn);
  return extractObjectKeys(literal);
}
function gatherKeysFromMapping(name) {
  const declaration = findVariable(name);
  return extractObjectKeys(declaration && declaration.initializer);
}
const numericStatsKeys = extractArrayStrings(findVariable('NUMERIC_STATS_KEYS')?.initializer);
if (!numericStatsKeys.length) {
  throw new Error('NUMERIC_STATS_KEYS array missing or empty');
}
const keySet = new Set(numericStatsKeys);
if (keySet.size !== numericStatsKeys.length) {
  throw new Error('NUMERIC_STATS_KEYS contains duplicate entries');
}
function assertMatches(label, providedKeys) {
  const missing = numericStatsKeys.filter((key) => !providedKeys.includes(key));
  if (missing.length) {
    throw new Error(`${label} missing keys: ${missing.join(', ')}`);
  }
}
assertMatches('createNumericStats', gatherKeysFromFunction('createNumericStats'));
assertMatches('cloneNumericStats', gatherKeysFromFunction('cloneNumericStats'));
const pointsKeys = gatherKeysFromMapping('NUMERIC_STAT_POINTS_PER_VALUE');
pointsKeys.forEach((key) => {
  if (!keySet.has(key)) {
    throw new Error(`NUMERIC_STAT_POINTS_PER_VALUE contains unexpected key: ${key}`);
  }
});
const actualKeys = gatherKeysFromMapping('NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE');
actualKeys.forEach((key) => {
  if (!keySet.has(key)) {
    throw new Error(`NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE contains unexpected key: ${key}`);
  }
});
console.log('numeric stats consistency check passed');
