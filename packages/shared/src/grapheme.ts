/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** Grapheme 分段项：保存单段可见字符。 */
type GraphemeSegment = {
/**
 * segment：segment相关字段。
 */

  segment: string;
};

/** GraphemeSegmenter 抽象：兼容 Intl 实现和降级分词。 */
type GraphemeSegmenter = {
  segment(input: string): Iterable<GraphemeSegment>;
};

/** 仅含可选 Segmenter 的 Intl 扩展声明。 */
type IntlWithSegmenter = typeof Intl & {
/**
 * Segmenter：Segmenter相关字段。
 */

  Segmenter?: new (
    locales?: string | string[],
    options?: {    
    /**
 * granularity：granularity相关字段。
 */
 granularity: 'grapheme' },
  ) => GraphemeSegmenter;
};

/** intlWithSegmenter：intl With Segmenter。 */
const intlWithSegmenter = Intl as IntlWithSegmenter;
/** graphemeSegmenter：grapheme Segmenter。 */
const graphemeSegmenter = typeof intlWithSegmenter.Segmenter === 'function'
  ? new intlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/** splitGraphemes：处理split Graphemes。 */
export function splitGraphemes(value: string): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value) {
    return [];
  }
  if (!graphemeSegmenter) {
    return splitGraphemesFallback(value);
  }
  return Array.from(graphemeSegmenter.segment(value), (entry) => entry.segment);
}

function splitGraphemesFallback(value: string): string[] {
  const codePoints = Array.from(value);
  const result: string[] = [];
  for (const codePoint of codePoints) {
    if (result.length > 0 && codePoint === '\u200D') {
      result[result.length - 1] += codePoint;
      continue;
    }
    if (
      result.length > 0
      && (
        isCombiningMark(codePoint)
        || isVariationSelector(codePoint)
        || isEmojiModifier(codePoint)
        || isEmojiTag(codePoint)
      )
    ) {
      result[result.length - 1] += codePoint;
      continue;
    }
    if (
      result.length > 0
      && isRegionalIndicator(codePoint)
      && countRegionalIndicators(result[result.length - 1] ?? '') % 2 === 1
    ) {
      result[result.length - 1] += codePoint;
      continue;
    }
    if (result.length > 0 && result[result.length - 1]?.endsWith('\u200D')) {
      result[result.length - 1] += codePoint;
      continue;
    }
    result.push(codePoint);
  }
  return result;
}

function isCombiningMark(value: string): boolean {
  return /^\p{Mark}$/u.test(value);
}

function isVariationSelector(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function isEmojiModifier(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}

function isEmojiTag(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0xe0020 && codePoint <= 0xe007f;
}

function isRegionalIndicator(value: string): boolean {
  const codePoint = value.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function countRegionalIndicators(value: string): number {
  let count = 0;
  for (const codePoint of value) {
    if (isRegionalIndicator(codePoint)) {
      count += 1;
    }
  }
  return count;
}

/** getGraphemeCount：读取Grapheme数量。 */
export function getGraphemeCount(value: string): number {
  return splitGraphemes(value).length;
}

/** getFirstGrapheme：读取First Grapheme。 */
export function getFirstGrapheme(value: string): string {
  return splitGraphemes(value)[0] ?? '';
}



