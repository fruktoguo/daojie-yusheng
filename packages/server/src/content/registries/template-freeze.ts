/**
 * 本文件实现服务端内容模板 Registry，负责把启动期解析后的配置变成运行期只读引用。
 *
 * 维护时要保持模板冻结和实例工厂边界，避免 tick 热路径复制大对象或手写模板字段。
 */
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
