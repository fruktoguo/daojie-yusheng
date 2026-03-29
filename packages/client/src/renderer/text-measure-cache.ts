type CacheEntry = {
  width: number;
  lastAccess: number;
};

export interface TextMeasureCacheOptions {
  maxEntries?: number;
  pruneBatchSize?: number;
}

const DEFAULT_MAX_ENTRIES = 1024;
const DEFAULT_PRUNE_BATCH_SIZE = 128;

/**
 * Canvas 文本测量缓存。
 * 按 `font + text` 复用 `measureText().width` 结果，降低高频文本测量开销。
 */
export class TextMeasureCache {
  private readonly maxEntries: number;
  private readonly pruneBatchSize: number;
  private readonly entries = new Map<string, CacheEntry>();
  private accessSerial = 0;

  constructor(options?: TextMeasureCacheOptions) {
    this.maxEntries = Math.max(16, Math.floor(options?.maxEntries ?? DEFAULT_MAX_ENTRIES));
    this.pruneBatchSize = Math.max(1, Math.floor(options?.pruneBatchSize ?? DEFAULT_PRUNE_BATCH_SIZE));
  }

  measureWidth(ctx: CanvasRenderingContext2D, font: string, text: string): number {
    const key = this.buildKey(font, text);
    const cached = this.entries.get(key);
    if (cached) {
      cached.lastAccess = ++this.accessSerial;
      return cached.width;
    }

    const previousFont = ctx.font;
    if (previousFont !== font) {
      ctx.font = font;
    }
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

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

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

    const removableCount = Math.min(
      this.pruneBatchSize,
      this.entries.size - this.maxEntries,
    );
    if (removableCount <= 0) {
      return;
    }

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
