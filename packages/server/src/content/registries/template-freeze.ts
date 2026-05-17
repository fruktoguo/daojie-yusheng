export function shouldFreezeTemplates(): boolean {
  return process.env.RUNTIME_FREEZE_TEMPLATES !== '0';
}

export function deepFreezeTemplate<T>(value: T, seen = new WeakSet<object>()): T {
  if (!shouldFreezeTemplates() || value === null || typeof value !== 'object') {
    return value;
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);
  for (const key of Object.keys(objectValue)) {
    deepFreezeTemplate((objectValue as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

export function freezeTemplateMap(map: Map<string, any>): void {
  if (!shouldFreezeTemplates()) {
    return;
  }
  for (const template of map.values()) {
    deepFreezeTemplate(template);
  }
}
