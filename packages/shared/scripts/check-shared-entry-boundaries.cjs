#!/usr/bin/env node
/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
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
  const allowedVariables = new Set(['C2S', 'S2C']);

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
checkNetworkProtobufBoundary();

console.log('shared entry boundary check passed');
