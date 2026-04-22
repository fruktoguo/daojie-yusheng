#!/usr/bin/env node
/**
 * 用途：钉死 shared 三个入口文件的职责边界，避免协议、兼容聚合口和 protobuf 入口重新长回巨型混杂文件。
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const SHARED_SRC_DIR = path.resolve(__dirname, '../src');

function loadSourceFile(relativePath) {
  const filePath = path.resolve(SHARED_SRC_DIR, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  return {
    filePath,
    sourceFile: ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true),
  };
}

function fail(message) {
  throw new Error(message);
}

function getVariableNames(node) {
  if (!ts.isVariableStatement(node)) {
    return [];
  }
  return node.declarationList.declarations
    .map((declaration) => (ts.isIdentifier(declaration.name) ? declaration.name.text : ''))
    .filter(Boolean);
}

function checkProtocolBoundary() {
  const { filePath, sourceFile } = loadSourceFile('protocol.ts');
  const allowedVariables = new Set(['NEXT_C2S', 'NEXT_S2C', 'C2S', 'S2C']);

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement)
      || ts.isExportDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
    ) {
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      const names = getVariableNames(statement);
      const disallowed = names.filter((name) => !allowedVariables.has(name));
      if (disallowed.length > 0) {
        fail(`${filePath} contains runtime variables outside event constants: ${disallowed.join(', ')}`);
      }
      continue;
    }

    fail(`${filePath} contains unsupported top-level statement: ${ts.SyntaxKind[statement.kind]}`);
  }
}

function checkTypesBoundary() {
  const { filePath, sourceFile } = loadSourceFile('types.ts');

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      continue;
    }
    fail(`${filePath} must remain a pure compatibility barrel, found: ${ts.SyntaxKind[statement.kind]}`);
  }
}

function checkNetworkProtobufBoundary() {
  const { filePath, sourceFile } = loadSourceFile('network-protobuf.ts');
  const allowedFunctions = new Set([
    'encodeServerEventPayload',
    'decodeServerEventPayload',
    'encodeClientEventPayload',
    'isBinaryPayload',
  ]);

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement)
      || ts.isExportDeclaration(statement)
    ) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (!allowedFunctions.has(statement.name.text)) {
        fail(`${filePath} contains unsupported local function: ${statement.name.text}`);
      }
      continue;
    }

    fail(`${filePath} must stay a thin protobuf entry layer, found: ${ts.SyntaxKind[statement.kind]}`);
  }
}

checkProtocolBoundary();
checkTypesBoundary();
checkNetworkProtobufBoundary();

console.log('shared entry boundary check passed');
