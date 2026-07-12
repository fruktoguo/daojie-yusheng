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
const transmissionSource = readSource('packages/client/src/ui/craft-transmission-view.ts');
const mountSource = readSource('packages/client/src/react-ui/panels/craft/mount-craft-workbench-panel.tsx');
const updateTasksMethod = extractMethod(modalSource, 'updateTechniqueActivityTasks(data: S2C_TechniqueActivityTasks): void');
const syncReactShellMethod = extractMethod(modalSource, '): void {\n    const current = getReactCraftWorkbenchState();');
const headerKeyMethod = extractMethod(modalSource, 'private buildCraftHeaderKey(): string');
const queueStructureKeyMethod = extractMethod(modalSource, 'private buildCraftQueueStructureKey');
const patchOpenCraftShellMethod = extractMethod(modalSource, 'private patchOpenCraftShell(): void');
const patchOpenCraftQueueOnlyMethod = extractMethod(modalSource, 'private patchOpenCraftQueueOnly(): void');
const patchCraftQueuePanelMethod = extractMethod(modalSource, 'private patchCraftQueuePanel(root: HTMLElement): boolean');
const patchTransmissionMethod = extractMethod(transmissionSource, 'tryPatchTransmissionBody(body: HTMLElement): boolean');
const transmissionRenderKeyMethod = extractMethod(transmissionSource, 'buildTransmissionRenderKey(): string');
const techniqueBookCraftKeyMethod = extractMethod(transmissionSource, 'private buildTechniqueBookCraftPickerKey(): string');

assert.match(
  updateTasksMethod,
  /if \(detailModalHost\.isOpenFor\(CraftWorkbenchModal\.MODAL_OWNER\)\) \{\s*this\.patchOpenCraftQueueOnly\(\);\s*\}/,
  'technique activity task updates must patch only the craft queue region',
);
assert.doesNotMatch(
  updateTasksMethod,
  /this\.(render|patchOpenCraftShell|tryPatchEnhancementBody)\(/,
  'technique activity task updates must not render, patch the full shell, or touch the enhancement body',
);
assert.match(
  syncReactShellMethod,
  /const current = getReactCraftWorkbenchState\(\);[\s\S]*?const nextHeaderKey = this\.buildCraftHeaderKey\(\);[\s\S]*?\.\.\.\(current\.headerKey !== nextHeaderKey \? \{ headerHtml: this\.renderCraftHeader\(\) \} : \{\}\)/,
  'React craft shell must only replace header HTML when the structural header key changes',
);
assert.match(
  patchOpenCraftShellMethod,
  /this\.syncReactShell\(definition, this\.activeMode === 'transmission'\);\s*mountReactCraftWorkbenchPanel\(body\);\s*this\.patchCraftShellHeaderAndTabs\(body\);/,
  'React craft task patches must sync transmission structure only when its semantic key changes, then keep DOM-local progress patching',
);
assert.match(
  patchOpenCraftShellMethod,
  /this\.transmissionView\.tryPatchTransmissionBody\(body\);/,
  'craft shell updates must delegate transmission progress and structure patches to the transmission view',
);
assert.match(
  headerKeyMethod,
  /this\.buildCraftQueueStructureKey\(\),/,
  'craft header structural key must include task identity/cancel refs but not volatile progress ticks',
);
assert.match(
  queueStructureKeyMethod,
  /entry\.queueId,[\s\S]*?entry\.isActive \? 'active' : 'idle',[\s\S]*?entry\.cancelRef\?\.queueId \?\? '',[\s\S]*?\]\.join\(':'\)[\s\S]*?\.join\('\|'\);/,
  'craft queue structural key must include task identity/cancel refs but not volatile progress ticks',
);
assert.doesNotMatch(
  headerKeyMethod,
  /workRemainingTicks|workTotalTicks|interruptWaitRemainingTicks|remainingTicks|totalTicks|progress/,
  'craft header structural key must not depend on volatile progress fields',
);
assert.doesNotMatch(
  queueStructureKeyMethod,
  /workRemainingTicks|workTotalTicks|interruptWaitRemainingTicks|remainingTicks|totalTicks|progress/,
  'craft queue structural key must not depend on volatile progress fields',
);
assert.match(
  patchOpenCraftQueueOnlyMethod,
  /syncReactCraftWorkbenchState\(\{[\s\S]*?headerKey: nextHeaderKey,[\s\S]*?headerHtml: this\.renderCraftHeader\(\),[\s\S]*?\}\);[\s\S]*?mountReactCraftWorkbenchPanel\(body\);[\s\S]*?if \(!this\.patchCraftQueuePanel\(body\)\) \{\s*this\.patchOpenCraftShell\(\);\s*\}/,
  'queue-only patches may sync React header state and must fallback only when the queue panel is missing',
);
assert.doesNotMatch(
  patchOpenCraftQueueOnlyMethod,
  /this\.(render|tryPatchEnhancementBody)\(/,
  'queue-only patches must not render or patch the enhancement body',
);
assert.match(
  patchCraftQueuePanelMethod,
  /const queuePanel = root\.querySelector<HTMLElement>\('\.craft-queue-panel'\);[\s\S]*?replaceElementHtml\(queuePanel, this\.renderCraftQueuePanelContent\(queue\)\);[\s\S]*?this\.patchCraftQueueProgress\(queuePanel\);/,
  'queue structural changes must replace only the craft queue panel content, then patch progress in place',
);
assert.match(
  patchTransmissionMethod,
  /this\.shouldDeferTransmissionContentPatch\(content\)[\s\S]*?this\.patchTransmissionProgress\(content\);[\s\S]*?replaceElementHtml\(content, this\.renderTransmissionBody\(\)\);/,
  'transmission structure changes must preserve focused input and otherwise replace only the transmission content region',
);
assert.match(
  transmissionRenderKeyMethod,
  /tech\.name \?\? ''[\s\S]*?tech\.grade \?\? ''[\s\S]*?tech\.category \?\? ''[\s\S]*?tech\.realmLv \?\? ''[\s\S]*?target\.playerId}:\$\{target\.name}/,
  'transmission structure key must cover technique display metadata and target names instead of IDs only',
);
assert.match(
  techniqueBookCraftKeyMethod,
  /tech\.name \?\? ''[\s\S]*?tech\.realmLv \?\? ''[\s\S]*?this\.resolveTechniqueMaxLevel\(tech\)/,
  'technique book craft key must cover the realm and metadata that determine labels and fragment cost',
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
    'Technique activity task updates call patchOpenCraftQueueOnly and do not call render(), patchOpenCraftShell(), or tryPatchEnhancementBody().',
    'Queue structural changes replace only .craft-queue-panel content; volatile progress fields patch text/fill nodes in place.',
    'React craft shell preserves headerHtml when the structural header key is unchanged, then patches queue progress in place.',
    'Transmission patches preserve focused input, include display/cost metadata in structural keys, and patch progress locally.',
    'The structural header key excludes volatile work/interrupt progress fields.',
  ],
}, null, 2));
