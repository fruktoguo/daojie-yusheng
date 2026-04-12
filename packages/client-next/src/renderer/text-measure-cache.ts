/** CacheEntry：定义该类型的结构与数据语义。 */
type CacheEntry = {
/** width：定义该变量以承载业务值。 */
  width: number;
/** lastAccess：定义该变量以承载业务值。 */
  lastAccess: number;
};

/** TextMeasureCacheOptions：定义该接口的能力与字段约束。 */
export interface TextMeasureCacheOptions {
  maxEntries?: number;
  pruneBatchSize?: number;
}

/** DEFAULT_MAX_ENTRIES：定义该变量以承载业务值。 */
const DEFAULT_MAX_ENTRIES = 1024;
/** DEFAULT_PRUNE_BATCH_SIZE：定义该变量以承载业务值。 */
const DEFAULT_PRUNE_BATCH_SIZE = 128;

/**
 * Canvas 文本测量缓存。
 * 按 `font + text` 复用 `measureText().width` 结果，降低高频文本测量开销。
 */
export class TextMeasureCache {
/** maxEntries：定义该变量以承载业务值。 */
  private readonly maxEntries: number;
/** pruneBatchSize：定义该变量以承载业务值。 */
  private readonly pruneBatchSize: number;
  private readonly entries = new Map<string, CacheEntry>();
  private accessSerial = 0;

/** constructor：处理当前场景中的对应操作。 */
  constructor(options?: TextMeasureCacheOptions) {
    this.maxEntries = Math.max(16, Math.floor(options?.maxEntries ?? DEFAULT_MAX_ENTRIES));
    this.pruneBatchSize = Math.max(1, Math.floor(options?.pruneBatchSize ?? DEFAULT_PRUNE_BATCH_SIZE));
  }

/** measureWidth：执行对应的业务逻辑。 */
  measureWidth(ctx: CanvasRenderingContext2D, font: string, text: string): number {
/** key：定义该变量以承载业务值。 */
    const key = this.buildKey(font, text);
/** cached：定义该变量以承载业务值。 */
    const cached = this.entries.get(key);
    if (cached) {
      cached.lastAccess = ++this.accessSerial;
      return cached.width;
    }

/** previousFont：定义该变量以承载业务值。 */
    const previousFont = ctx.font;
    if (previousFont !== font) {
      ctx.font = font;
    }
/** width：定义该变量以承载业务值。 */
    const width = ctx.measureText(text).width;
    if (previousFont !== font) {
      ctx.font = previousFont;
    }

    this.entries.set(key, {
      width,
      lastAccess: ++this.accessSerial,
    });
    if (this.entries.size > this.maxEntries) {
      this.prune();
    }
    return width;
  }

/** clear：执行对应的业务逻辑。 */
  clear(): void {
    this.entries.clear();
  }

/** size：执行对应的业务逻辑。 */
  size(): number {
    return this.entries.size;
  }

/** buildKey：执行对应的业务逻辑。 */
  private buildKey(font: string, text: string): string {
    return `${font}\n${text}`;
  }

  /**
   * 按最近最少访问策略进行有限清理，避免缓存无限增长。
   */
  private prune(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

/** removableCount：定义该变量以承载业务值。 */
    const removableCount = Math.min(
      this.pruneBatchSize,
      this.entries.size - this.maxEntries,
    );
    if (removableCount <= 0) {
      return;
    }

/** sorted：定义该变量以承载业务值。 */
    const sorted = [...this.entries.entries()]
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess);
    for (let index = 0; index < removableCount; index += 1) {
      const key = sorted[index]?.[0];
      if (!key) {
        break;
      }
      this.entries.delete(key);
    }
  }
}

