#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(scriptDirectory, '..');
const html = fs.readFileSync(path.join(clientRoot, 'gm.html'), 'utf8');
const editorSource = fs.readFileSync(path.join(clientRoot, 'src/gm/custom-technique-editor.ts'), 'utf8');
const gmSource = fs.readFileSync(path.join(clientRoot, 'src/gm.ts'), 'utf8');

for (const id of [
  'generated-technique-subtab-manual',
  'custom-technique-form',
  'custom-technique-internal-fields',
  'custom-technique-arts-fields',
  'custom-technique-preview',
  'custom-technique-create',
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`, 'u'), `GM 页面缺少 ${id}`);
}

for (const field of [
  'name',
  'desc',
  'category',
  'grade',
  'realmLv',
  'maxLayer',
  'expDifficulty',
  'budgetPercent',
  'attr.constitution',
  'attr.meridians',
  'skill.target.type',
  'skill.target.targetMode',
  'structure.damage',
  'structure.area',
  'base.maxHp',
  'base.resolvePower',
  'bonus.techLevel',
  'bonus.moveSpeed',
  'bonus.realmLevel',
  'bonus.alchemyLevel',
  'bonus.forgingLevel',
  'bonus.enhancementLevel',
  'bonus.transmissionLevel',
  'bonus.gatherLevel',
  'bonus.miningLevel',
  'bonus.buildingLevel',
  'bonus.formationLevel',
]) {
  assert.match(html, new RegExp(`name=["']${field.replaceAll('.', '\\.')}["']`, 'u'), `GM 手工功法表单缺少 ${field}`);
}

for (const field of [
  'techLevel',
  'moveSpeed',
  'realmLevel',
  'alchemyLevel',
  'forgingLevel',
  'enhancementLevel',
  'transmissionLevel',
  'gatherLevel',
  'miningLevel',
  'buildingLevel',
  'formationLevel',
]) {
  assert.match(
    html,
    new RegExp(`<input[^>]+name=["']bonus\\.${field}["'][^>]+min=["']0["'][^>]+max=["']100["']`, 'u'),
    `GM 百分比权重 ${field} 未限制为 0 到 100`,
  );
}

assert.match(editorSource, /\/generated-techniques\/preview/u, '预览请求未接入服务端 API');
assert.match(editorSource, /\/generated-techniques`/u, '创建请求未接入服务端 API');
assert.match(editorSource, /pendingOperationId \?\?= createOperationId\(\)/u, '创建失败重试没有复用 operationId');
assert.match(editorSource, /setSectionDisabled/u, '类型切换没有停用隐藏字段');
assert.doesNotMatch(editorSource, /\.innerHTML\s*=/u, '手工功法表单不得通过整块 innerHTML 重建');
assert.match(gmSource, /'techniques' \| 'jobs' \| 'manual'/u, 'GM 功法子标签状态缺少手工创建');
assert.match(gmSource, /generatedTechniqueEditor\.activate\(\)/u, '切入手工创建时没有恢复编辑器状态');

console.log(JSON.stringify({
  ok: true,
  case: 'gm-custom-technique-editor',
  assertions: [
    '手工创建子页和完整配置字段存在',
    '预览与创建 API 已接入',
    '百分比权重仅允许0到100',
    '失败重试复用 operationId',
    '类型切换停用隐藏字段且不重建表单 DOM',
  ],
}, null, 2));
