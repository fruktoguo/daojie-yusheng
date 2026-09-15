/**
 * gm/fields.ts —— GM 编辑器表单字段构建器与路径工具。
 *
 * 从 gm.ts 抽取：pathSegments/setValueByPath/getValueByPath/removeArrayIndex/ensureArray、
 * buildHtmlAttributes、optionsMarkup、textField/numberField/selectField/jsonField 等纯 HTML 构建器。
 * 仅依赖 format.ts 的 escapeHtml/formatJson 与 gm/helpers/pure，无模块级可变状态。
 */

import * as gmPureHelpers from '../gm/helpers/pure';
import { escapeHtml, formatJson } from './format';

// ── 路径工具（委托 gmPureHelpers） ──

export function pathSegments(path: string): string[] {
  return gmPureHelpers.pathSegments(path);
}

export function setValueByPath(target: unknown, path: string, value: unknown): void {
  return gmPureHelpers.setValueByPath(target, path, value);
}

export function getValueByPath(target: unknown, path: string): unknown {
  return gmPureHelpers.getValueByPath(target, path);
}

export function removeArrayIndex(target: unknown, path: string, index: number): void {
  gmPureHelpers.removeArrayIndex(target, path, index);
}

export function ensureArray<T>(value: T[] | undefined | null): T[] {
  return gmPureHelpers.ensureArray(value);
}

// ── HTML 属性构建 ──

export function buildHtmlAttributes(attributes: Record<string, string | undefined>): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeHtml(value ?? '')}"`)
    .join('');
}

// ── 选项标记 ──

export function optionsMarkup<T extends string | number>(options: Array<{ value: T; label: string }>, selected: T | undefined): string {
  return options.map((option) => `
    <option value="${escapeHtml(String(option.value))}" ${selected === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
  `).join('');
}

// ── 表单字段构建器 ──

export function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="string" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

export function nullableTextField(label: string, path: string, value: string | undefined, emptyMode: 'undefined' | 'null' = 'undefined', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-bind="${escapeHtml(path)}" data-kind="nullable-string" data-empty-mode="${emptyMode}" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

export function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-bind="${escapeHtml(path)}" data-kind="number" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}

export function checkboxField(label: string, path: string, checked: boolean | undefined): string {
  return `
    <label class="editor-toggle">
      <input type="checkbox" data-bind="${escapeHtml(path)}" data-kind="boolean" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

export function selectField(
  label: string,
  path: string,
  value: string | number | undefined,
  options: Array<{ value: string | number; label: string }>,
  extraClass = '',
): string {
  const selected = value ?? '';
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <select data-bind="${escapeHtml(path)}" data-kind="${typeof selected === 'number' ? 'number' : 'string'}">
        ${optionsMarkup(options, selected)}
      </select>
    </label>
  `;
}

export function jsonField(label: string, path: string, value: unknown, emptyValue: 'null' | 'object' | 'array' = 'object', extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="json" data-empty-json="${emptyValue}">${escapeHtml(formatJson(value ?? (emptyValue === 'array' ? [] : emptyValue === 'null' ? null : {})))}</textarea>
    </label>
  `;
}

export function stringArrayField(label: string, path: string, value: string[] | undefined, extraClass = ''): string {
  return `
    <label class="editor-field ${extraClass}">
      <span>${escapeHtml(label)}<span class="editor-section-note"> 每行一项</span></span>
      <textarea data-bind="${escapeHtml(path)}" data-kind="string-array">${escapeHtml((value ?? []).join('\n'))}</textarea>
    </label>
  `;
}

export function readonlyCodeBlock(title: string, path: string, value: unknown): string {
  return `
    <div class="editor-field wide">
      <span>${escapeHtml(title)}</span>
      <div class="editor-code" data-preview="readonly" data-path="${escapeHtml(path)}">${escapeHtml(formatJson(value))}</div>
    </div>
  `;
}
