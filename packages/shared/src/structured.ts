/** PlainRecord：定义该类型的结构与数据语义。 */
type PlainRecord = Record<string, unknown>;

/** isPlainRecord：执行对应的业务逻辑。 */
function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
/** prototype：定义该变量以承载业务值。 */
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** getDefinedKeys：执行对应的业务逻辑。 */
function getDefinedKeys(record: PlainRecord): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

/** 递归克隆仅由 JSON 风格数据组成的对象，避免走 JSON 字符串中转。 */
export function clonePlainValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => clonePlainValue(entry)) as T;
  }
  if (isPlainRecord(value)) {
/** cloned：定义该变量以承载业务值。 */
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
/** leftKeys：定义该变量以承载业务值。 */
    const leftKeys = getDefinedKeys(left);
/** rightKeys：定义该变量以承载业务值。 */
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

