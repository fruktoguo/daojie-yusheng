#!/usr/bin/env node
/**
 * 用途：检查 主线协议事件常量与 payload map 是否一一对应。
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const filePath = path.resolve(__dirname, '../src/protocol.ts');
const source = fs.readFileSync(filePath, 'utf8');
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

function findVariable(name) {
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

function findInterface(name) {
  let result = null;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      result = node;
    }
  });
  return result;
}

function extractObjectLiteralKeys(name) {
  const declaration = findVariable(name);
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
    .filter(Boolean);
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

function extractPayloadMapKeys(interfaceName, qualifierName) {
  const declaration = findInterface(interfaceName);
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
    .filter(Boolean);
}

function assertSameKeys(label, expected, actual) {
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${label} mismatch. missing=${missing.join(', ') || 'none'} extra=${extra.join(', ') || 'none'}`);
  }
  if (new Set(actual).size !== actual.length) {
    throw new Error(`${label} contains duplicate keys`);
  }
}

assertSameKeys(
  'C2S_PayloadMap',
  extractObjectLiteralKeys('C2S'),
  extractPayloadMapKeys('C2S_PayloadMap', 'C2S'),
);
assertSameKeys(
  'S2C_PayloadMap',
  extractObjectLiteralKeys('S2C'),
  extractPayloadMapKeys('S2C_PayloadMap', 'S2C'),
);

console.log('protocol event payload map check passed');
