#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const repoRoot = path.resolve(__dirname, '..');
const panelsCss = fs.readFileSync(path.join(repoRoot, 'packages/client/src/styles/panels.css'), 'utf8');
const tokensCss = fs.readFileSync(path.join(repoRoot, 'packages/client/src/styles/tokens.css'), 'utf8');

function assertMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

assertMatch(
  panelsCss,
  /\.detail-modal\s*\{[\s\S]*?--detail-modal-padding-top: max\(var\(--detail-modal-padding\), env\(safe-area-inset-top, 0px\)\);[\s\S]*?--detail-modal-padding-bottom: max\(var\(--detail-modal-padding\), env\(safe-area-inset-bottom, 0px\)\);/,
  'detail modal must preserve safe-area padding variables',
);
assertMatch(
  panelsCss,
  /\.detail-modal-card\.detail-modal--craft\s*\{[\s\S]*?width: min\(1760px, calc\(100vw - 24px\)\);[\s\S]*?height: min\(90dvh, calc\(100dvh - var\(--detail-modal-padding-top\) - var\(--detail-modal-padding-bottom\) - \(var\(--detail-modal-safe-gap\) \* 2\)\)\);[\s\S]*?overflow: hidden;/,
  'desktop craft workbench must stay bounded by viewport height and avoid body overflow',
);
assertMatch(
  panelsCss,
  /\.detail-modal-card\.detail-modal--craft #detail-modal-body,[\s\S]*?\.detail-modal-card\.detail-modal--alchemy #detail-modal-body\s*\{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/,
  'craft modal body must keep vertical scroll contained',
);
assertMatch(
  panelsCss,
  /\.craft-workbench-shell\s*\{[\s\S]*?grid-template-columns: minmax\(220px, 280px\) minmax\(0, 1fr\);/,
  'desktop craft shell must keep sidebar/content layout',
);
assertMatch(
  panelsCss,
  /:root\[data-color-mode="dark"\] \.detail-modal-card\.detail-modal--craft,[\s\S]*?color: var\(--ink-dark\);[\s\S]*?box-shadow: 14px 14px 0 rgba\(0, 0, 0, 0\.34\);/,
  'dark craft modal card must have explicit dark-mode surface and text treatment',
);
assertMatch(
  panelsCss,
  /:root\[data-color-mode="dark"\] \.craft-profession-summary,[\s\S]*?:root\[data-color-mode="dark"\] \.craft-queue-panel,[\s\S]*?:root\[data-color-mode="dark"\] \.craft-placeholder-panel\s*\{[\s\S]*?background: rgba\(34, 28, 24, 0\.82\);/,
  'dark craft summary and queue panels must keep dark surfaces',
);
assertMatch(
  panelsCss,
  /:root\[data-color-mode="dark"\] \.craft-queue-item,[\s\S]*?:root\[data-color-mode="dark"\] \.craft-queue-empty\s*\{[\s\S]*?color: rgba\(235, 221, 201, 0\.78\);/,
  'dark craft queue rows must keep readable text color',
);
assertMatch(
  panelsCss,
  /@media \(max-width: 760px\) \{[\s\S]*?\.detail-modal\.detail-modal--craft\s*\{[\s\S]*?--detail-modal-padding: 4px;[\s\S]*?\.detail-modal-card\.detail-modal--craft\s*\{[\s\S]*?width: calc\(100vw - 8px\);[\s\S]*?height: min\(92dvh, calc\(100dvh - var\(--detail-modal-padding-top\) - var\(--detail-modal-padding-bottom\) - 28px\)\);/,
  'mobile craft modal must use compact viewport-safe dimensions',
);
assertMatch(
  panelsCss,
  /@media \(max-width: 760px\) \{[\s\S]*?\.craft-workbench-shell\s*\{[\s\S]*?grid-template-columns: 1fr;[\s\S]*?\.craft-workbench-tabs\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  'mobile craft workbench must collapse to one column and keep three mode tabs usable',
);
assertMatch(
  panelsCss,
  /@media \(max-width: 760px\) \{[\s\S]*?\.craft-queue-list\s*\{[\s\S]*?max-height: 56px;[\s\S]*?\.craft-workbench-content \.alchemy-layout,[\s\S]*?\.craft-workbench-content \.enhancement-layout,[\s\S]*?\.craft-workbench-content \.enhancement-layout--single-slot\s*\{[\s\S]*?grid-template-columns: 1fr;/,
  'mobile craft task list and child workbench layouts must stay compact and single-column',
);
assertMatch(
  panelsCss,
  /\.craft-queue-progress-head span\s*\{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/,
  'craft queue progress text must not overflow its row',
);
assertMatch(
  tokensCss,
  /:root\s*\{[\s\S]*?--paper-light:[\s\S]*?--surface-card:[\s\S]*?--ink-dark:/,
  'light theme tokens must define craft surface and text variables',
);
assertMatch(
  tokensCss,
  /:root\[data-color-mode="dark"\]\s*\{(?=[\s\S]*?--paper-light:)(?=[\s\S]*?--surface-card:)(?=[\s\S]*?--ink-dark:)[\s\S]*?\n\s*\}/,
  'dark theme tokens must define craft surface and text variables',
);

console.log(JSON.stringify({
  ok: true,
  answers: [
    'Craft modal keeps safe-area aware viewport bounds and contained scrolling.',
    'Desktop craft workbench preserves sidebar/content layout.',
    'Mobile craft workbench collapses to one column, keeps compact tabs, task list and child layouts.',
    'Light and dark theme tokens plus craft-specific dark selectors remain present.',
    'Task progress text keeps overflow-safe ellipsis behavior.',
  ],
}, null, 2));
