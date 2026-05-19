import { CLIENT_I18N_MESSAGES, type ClientI18nKey } from '../constants/ui/i18n.generated';

type I18nValue = string | number | boolean | null | undefined;
type I18nValues = Readonly<Record<string, I18nValue>>;

const PLACEHOLDER_PATTERN = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

function stringifyI18nValue(value: I18nValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

export function hasI18nKey(key: string): key is ClientI18nKey {
  return Object.prototype.hasOwnProperty.call(CLIENT_I18N_MESSAGES, key);
}

export function t(key: ClientI18nKey | string, values?: I18nValues, fallback?: string): string {
  const template = hasI18nKey(key) ? CLIENT_I18N_MESSAGES[key] : fallback ?? key;
  if (!values) {
    return template;
  }
  return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? stringifyI18nValue(values[name]) : match
  ));
}

export function tLoose(key: string, values?: I18nValues, fallback?: string): string {
  return t(key, values, fallback);
}

export function formatI18nList(items: readonly string[], emptyText = ''): string {
  return items.length > 0 ? items.join('、') : emptyText;
}

function applyI18nAttribute(node: Element, sourceAttr: string, targetAttr: string): void {
  const key = node.getAttribute(sourceAttr);
  if (!key || !hasI18nKey(key)) {
    return;
  }
  node.setAttribute(targetAttr, t(key));
}

export function applyStaticI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (key && hasI18nKey(key)) {
      node.textContent = t(key);
    }
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    applyI18nAttribute(node, 'data-i18n-placeholder', 'placeholder');
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    applyI18nAttribute(node, 'data-i18n-aria-label', 'aria-label');
  });
  root.querySelectorAll('[data-i18n-alt]').forEach((node) => {
    applyI18nAttribute(node, 'data-i18n-alt', 'alt');
  });
}
