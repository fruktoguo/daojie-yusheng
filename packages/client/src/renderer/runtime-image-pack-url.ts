/**
 * 本文件属于运行时图包资源 URL 边界，负责把 manifest 版本收敛为静态资源缓存版本。
 *
 * 维护时保持调用方无感知：manifest 继续控制图包版本，渲染层只消费已版本化的图片 URL。
 */

const RUNTIME_IMAGE_PACK_VERSION_PARAM = 'v';
const MAX_RUNTIME_IMAGE_PACK_VERSION_LENGTH = 96;

export function normalizeRuntimeImagePackVersion(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_RUNTIME_IMAGE_PACK_VERSION_LENGTH ? trimmed : '';
}

export function resolveRuntimeImagePackAssetUrl(manifestUrl: string, src: string, version: string): string {
  const trimmedSrc = src.trim();
  const resolvedUrl = resolveRuntimeImagePackRawAssetUrl(manifestUrl, trimmedSrc);
  return appendRuntimeImagePackVersion(resolvedUrl, version);
}

function resolveRuntimeImagePackRawAssetUrl(manifestUrl: string, src: string): string {
  if (src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
    return src;
  }
  try {
    return new URL(src, new URL(manifestUrl, window.location.href)).toString();
  } catch {
    const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
    return `${base}${src}`;
  }
}

function appendRuntimeImagePackVersion(url: string, version: string): string {
  if (!version || /^(?:data|blob):/i.test(url)) {
    return url;
  }

  const hashIndex = url.indexOf('#');
  const body = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const questionIndex = body.indexOf('?');
  const base = questionIndex >= 0 ? body.slice(0, questionIndex) : body;
  const rawQuery = questionIndex >= 0 ? body.slice(questionIndex + 1) : '';
  const params = new URLSearchParams(rawQuery);
  params.set(RUNTIME_IMAGE_PACK_VERSION_PARAM, version);
  const query = params.toString();
  return query ? `${base}?${query}${hash}` : `${base}${hash}`;
}
