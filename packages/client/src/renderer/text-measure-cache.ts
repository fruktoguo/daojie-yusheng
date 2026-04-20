/** 文本宽度缓存条目。 */
type CacheEntry = {
/**
 * width：对象字段。
 */

  width: number;  
  /**
 * lastAccess：对象字段。
 */

  lastAccess: number;
};

/** 文本宽度缓存配置。 */
export interface TextMeasureCacheOptions {
/**
 * maxEntries：TextMeasureCacheOptions 内部字段。
 */

  maxEntries?: number;  
  /**
 * pruneBatchSize：TextMeasureCacheOptions 内部字段。
 */

  pruneBatchSize?: number;
}

/** 默认最大缓存条目数。 */
const DEFAULT_MAX_ENTRIES = 1024;
/** 默认每次清理条目数。 */
const DEFAULT_PRUNE_BATCH_SIZE = 128;

/**
 * Canvas 文本测量缓存。
 * 按 `font + text` 复用 `measureText().width` 结果，降低高频文本测量开销。
 */
export class TextMeasureCache {
  /** 缓存容量上限。 */
  private readonly maxEntries: number;
  /** 每次回收周期清理的最大条目数。 */
  private readonly pruneBatchSize: number;
  /** 按 font+text 组合键缓存测量结果。 */
  private readonly entries = new Map<string, CacheEntry>();
  /** 最近访问序号，辅助 LRU 回收。 */
  private accessSerial = 0;

  /** 初始化上限，确保配置值有最小边界。 */
  constructor(options?: TextMeasureCacheOptions) {
    this.maxEntries = Math.max(16, Math.floor(options?.maxEntries ?? DEFAULT_MAX_ENTRIES));
    this.pruneBatchSize = Math.max(1, Math.floor(options?.pruneBatchSize ?? DEFAULT_PRUNE_BATCH_SIZE));
  }

  /** 返回文本宽度并写入缓存，避免重复 measureText。 */
  measureWidth(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 清空文本测量缓存。 */
  clear(): void {
    this.entries.clear();
  }

  /** 当前缓存条目数量。 */
  size(): number {
    return this.entries.size;
  }

  /** 以 font 与文本构造复用 key。 */
  private buildKey(font: string, text: string): string {
    return `${font}\n${text}`;
  }

  /** 按 LRU 近似策略批量清理过期文本宽度记录。 */
  private prune(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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



