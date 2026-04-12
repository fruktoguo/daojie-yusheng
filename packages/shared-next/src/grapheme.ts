/** GraphemeSegment：定义该类型的结构与数据语义。 */
type GraphemeSegment = {
/** segment：定义该变量以承载业务值。 */
  segment: string;
};

/** GraphemeSegmenter：定义该类型的结构与数据语义。 */
type GraphemeSegmenter = {
  segment(input: string): Iterable<GraphemeSegment>;
};

/** IntlWithSegmenter：定义该类型的结构与数据语义。 */
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: 'grapheme' },
  ) => GraphemeSegmenter;
};

/** intlWithSegmenter：定义该变量以承载业务值。 */
const intlWithSegmenter = Intl as IntlWithSegmenter;
/** graphemeSegmenter：定义该变量以承载业务值。 */
const graphemeSegmenter = typeof intlWithSegmenter.Segmenter === 'function'
  ? new intlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/** splitGraphemes：执行对应的业务逻辑。 */
export function splitGraphemes(value: string): string[] {
  if (!value) {
    return [];
  }
  if (!graphemeSegmenter) {
    return Array.from(value);
  }
  return Array.from(graphemeSegmenter.segment(value), (entry) => entry.segment);
}

/** getGraphemeCount：执行对应的业务逻辑。 */
export function getGraphemeCount(value: string): number {
  return splitGraphemes(value).length;
}

/** getFirstGrapheme：执行对应的业务逻辑。 */
export function getFirstGrapheme(value: string): string {
  return splitGraphemes(value)[0] ?? '';
}

