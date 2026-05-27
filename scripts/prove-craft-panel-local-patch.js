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

const modalSource = readSource('packages/client/src/ui/craft-workbench-modal.ts');
const queueSource = readSource('packages/client/src/ui/craft-queue-view.ts');
const mountSource = readSource('packages/client/src/react-ui/panels/craft/mount-craft-workbench-panel.tsx');
const updateTasksMethod = extractMethod(modalSource, 'updateTechniqueActivityTasks(data: S2C_TechniqueActivityTasks): void');
const syncReactShellMethod = extractMethod(modalSource, '): void {\n    const current = getReactCraftWorkbenchState();');
const headerKeyMethod = extractMethod(modalSource, 'private buildCraftHeaderKey(): string');
const patchOpenCraftShellMethod = extractMethod(modalSource, 'private patchOpenCraftShell(): void');

assert.match(
  updateTasksMethod,
  /if \(detailModalHost\.isOpenFor\(CraftWorkbenchModal\.MODAL_OWNER\)\) \{\s*this\.patchOpenCraftShell\(\);\s*\}/,
  'technique activity task updates must patch the open craft shell instead of rendering the modal',
);
assert.doesNotMatch(
  updateTasksMethod,
  /this\.render\(\);/,
  'technique activity task updates must not call render()',
);
assert.match(
  syncReactShellMethod,
  /const current = getReactCraftWorkbenchState\(\);[\s\S]*?const nextHeaderKey = this\.buildCraftHeaderKey\(\);[\s\S]*?\.\.\.\(current\.headerKey !== nextHeaderKey \? \{ headerHtml: this\.renderCraftHeader\(\) \} : \{\}\)/,
  'React craft shell must only replace header HTML when the structural header key changes',
);
assert.match(
  patchOpenCraftShellMethod,
  /this\.syncReactShell\(definition, false\);\s*mountReactCraftWorkbenchPanel\(body\);\s*this\.patchCraftShellHeaderAndTabs\(body\);/,
  'React craft task patches must still use DOM-local queue progress patching after syncing structural shell state',
);
assert.match(
  headerKeyMethod,
  /entry\.queueId,[\s\S]*?entry\.isActive \? 'active' : 'idle',[\s\S]*?entry\.cancelRef\?\.queueId \?\? '',[\s\S]*?\]\.join\(':'\)[\s\S]*?\]\.join\('::'\);/,
  'craft header structural key must include task identity/cancel refs but not volatile progress ticks',
);
assert.doesNotMatch(
  headerKeyMethod,
  /workRemainingTicks|workTotalTicks|interruptWaitRemainingTicks|remainingTicks|totalTicks|progress/,
  'craft header structural key must not depend on volatile progress fields',
);
assert.match(
  queueSource,
  /patchCraftQueueProgress\(root: HTMLElement\): void \{[\s\S]*?detail\.textContent = progress\.detail;[\s\S]*?label\.textContent = progress\.label;[\s\S]*?fill\.style\.width = `\$\{\(progress\.ratio \* 100\)\.toFixed\(2\)\}%`;[\s\S]*?interrupt\.classList\.toggle\('is-hidden', !interruptProgress\);/,
  'craft queue progress patch must update text, fill width, active class and interrupt bar in place',
);
assert.match(
  mountSource,
  /export function getReactCraftWorkbenchState\(\): ReactCraftWorkbenchState \{\s*return craftWorkbenchStore\.getState\(\);\s*\}/,
  'React craft shell must expose current state so modal patches can avoid replacing unchanged HTML',
);

console.log(JSON.stringify({
  ok: true,
  answers: [
    'Technique activity task updates call patchOpenCraftShell and do not call render().',
    'Native craft shell uses structural header keys and patchCraftQueueProgress for volatile progress fields.',
    'React craft shell preserves headerHtml when the structural header key is unchanged, then patches queue progress in place.',
    'The structural header key excludes volatile work/interrupt progress fields.',
  ],
}, null, 2));
