type GraphemeSegment = {
  segment: string;
};

type GraphemeSegmenter = {
  segment(input: string): Iterable<GraphemeSegment>;
};

type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: 'grapheme' },
  ) => GraphemeSegmenter;
};

const intlWithSegmenter = Intl as IntlWithSegmenter;
const graphemeSegmenter = typeof intlWithSegmenter.Segmenter === 'function'
  ? new intlWithSegmenter.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function splitGraphemes(value: string): string[] {
  if (!value) {
    return [];
  }
  if (!graphemeSegmenter) {
    return Array.from(value);
  }
  return Array.from(graphemeSegmenter.segment(value), (entry) => entry.segment);
}

export function getGraphemeCount(value: string): number {
  return splitGraphemes(value).length;
}

export function getFirstGrapheme(value: string): string {
  return splitGraphemes(value)[0] ?? '';
}
