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
    return Array.from(value);
  }
  return Array.from(graphemeSegmenter.segment(value), (entry) => entry.segment);
}

/** getGraphemeCount：读取Grapheme数量。 */
export function getGraphemeCount(value: string): number {
  return splitGraphemes(value).length;
}

/** getFirstGrapheme：读取First Grapheme。 */
export function getFirstGrapheme(value: string): string {
  return splitGraphemes(value)[0] ?? '';
}






