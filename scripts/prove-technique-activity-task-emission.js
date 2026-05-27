#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const repoRoot = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractMethod(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing method signature: ${signature}`);
  const openBrace = source.indexOf('{', start);
  assert.notEqual(openBrace, -1, `missing method body: ${signature}`);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unterminated method body: ${signature}`);
}

const mutationSource = readSource('packages/server/src/runtime/world/world-runtime-craft-mutation.service.ts');
const taskViewSource = readSource('packages/server/src/runtime/craft/technique-activity-task-view.helpers.ts');
const registrySource = readSource('packages/shared/src/technique-activity-meta.ts');
const panelUpdateMethod = extractMethod(mutationSource, 'emitCraftPanelUpdate(playerId, panel, _deps)');
const panelEventHelper = extractMethod(mutationSource, 'function hasTechniqueActivityPanelEvent(panel)');

const flushStart = mutationSource.indexOf('flushCraftMutation(playerId, result, panel, deps, options: any = {})');
assert.notEqual(flushStart, -1, 'missing flushCraftMutation method');
const taskUpdateIndex = mutationSource.indexOf('this.emitTechniqueActivityTaskUpdate(playerId);', flushStart);
const panelUpdateIndex = mutationSource.indexOf('this.emitCraftPanelUpdate(playerId, panel, deps);', flushStart);
assert.ok(taskUpdateIndex >= 0, 'flushCraftMutation must emit the unified technique task list');
assert.ok(panelUpdateIndex >= 0, 'flushCraftMutation may still emit concrete panel updates');
assert.ok(
  taskUpdateIndex < panelUpdateIndex,
  'unified technique task list must be emitted before concrete panel updates so mining cannot be hidden by no-panel branches',
);
assert.match(
  panelUpdateMethod,
  /if \(!hasTechniqueActivityPanelEvent\(panel\)\) \{\s*return;\s*\}/,
  'concrete panel update must skip kinds without a panel event instead of building empty mining/gather/building panels',
);
assert.match(
  panelEventHelper,
  /getTechniqueActivityMetadata\(panel\)\?\.panelEvent/,
  'panel-event guard must use shared technique activity metadata',
);
assert.match(
  taskViewSource,
  /const LEGACY_ACTIVE_JOB_SLOTS = \[[\s\S]*?\['mining', 'miningJob'\]/,
  'unified task view must include active mining jobs',
);
assert.match(
  taskViewSource,
  /if \(kind === 'mining'\) \{\s*return normalizeText\(job\.miningNodeName\);\s*\}/,
  'mining task view must expose the mining node name as the target label',
);
assert.match(
  registrySource,
  /mining: \{[\s\S]*?panelEvent: null,[\s\S]*?startCommandKind: 'startMining'/,
  'mining is a no-panel technique activity and must rely on the unified task list for queue visibility',
);

console.log(JSON.stringify({
  ok: true,
  answers: [
    'flushCraftMutation emits the unified technique task list before concrete panel updates.',
    'No-panel activities such as mining skip concrete panel emission and rely on TechniqueActivityTasks.',
    'The unified task view includes miningJob with miningNodeName as targetLabel.',
  ],
}, null, 2));
