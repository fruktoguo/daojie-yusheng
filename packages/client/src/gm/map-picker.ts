/**
 * gm/map-picker.ts —— GM 位置/地图选择器纯 HTML 渲染。
 *
 * 从 gm.ts 抽取：renderPositionMapPickerHtml。
 * 纯函数，接收类别和选项数据，返回 HTML 字符串。
 */

import { optionsMarkup } from './fields';

/** renderPositionMapPickerHtml：渲染位置地图选择器 HTML。 */
export function renderPositionMapPickerHtml(
  category: string,
  categoryOptions: Array<{ value: string; label: string }>,
  mapOptions: Array<{ value: string; label: string }>,
  currentMapId: string,
): string {
  return `
    <label class="editor-field">
      <span>类别</span>
      <select data-gm-position-map-category>
        ${optionsMarkup(categoryOptions, category)}
      </select>
    </label>
    <label class="editor-field wide">
      <span>地图</span>
      <select data-bind="mapId" data-kind="string" data-gm-position-map-select>
        ${optionsMarkup(mapOptions, currentMapId)}
      </select>
    </label>
  `;
}
