/** PlainRecord：通用 record 约束。 */
type PlainRecord = Record<string, unknown>;

/** isPlainRecord：判断是否Plain记录。 */
function isPlainRecord(value: unknown): value is PlainRecord {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** getDefinedKeys：读取Defined Keys。 */
function getDefinedKeys(record: PlainRecord): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

/** 递归克隆仅由 JSON 风格数据组成的对象，避免走 JSON 字符串中转。 */
export function clonePlainValue<T>(value: T): T {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (Array.isArray(value)) {
    return value.map((entry) => clonePlainValue(entry)) as T;
  }
  if (isPlainRecord(value)) {
    const cloned: PlainRecord = {};
    for (const key of getDefinedKeys(value)) {
      cloned[key] = clonePlainValue(value[key]);
    }
    return cloned as T;
  }
  return value;
}

/** 比较仅由 JSON 风格数据组成的对象，忽略值为 undefined 的对象属性。 */
export function isPlainEqual(left: unknown, right: unknown): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!isPlainEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (isPlainRecord(left) || isPlainRecord(right)) {
    if (!isPlainRecord(left) || !isPlainRecord(right)) {
      return false;
    }
    const leftKeys = getDefinedKeys(left);
    const rightKeys = getDefinedKeys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!(key in right) || !isPlainEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}
