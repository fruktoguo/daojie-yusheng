/**
 * 本文件是客户端 DOM UI 的 changelog panel 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
import { detailModalHost } from './detail-modal-host';
import { t } from './i18n';
import { CHANGELOG_ENTRIES, getLatestChangelogEntry } from './changelog-data';
import {
  mountReactChangelogPanel,
  shouldUseReactChangelogPanel,
  unmountReactChangelogPanel,
} from '../react-ui/panels/changelog/mount-changelog-panel';

/** ChangelogPanel：Changelog面板实现。 */
export class ChangelogPanel {
  /** MODAL_OWNER：弹窗OWNER。 */
  private static readonly MODAL_OWNER = 'changelog-panel';  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    document.getElementById('hud-open-chronicle')?.addEventListener('click', () => this.open());
  }

  /** open：打开open。 */
  open(): void {
    const useReactPanel = shouldUseReactChangelogPanel();
    detailModalHost.open({
      ownerId: ChangelogPanel.MODAL_OWNER,
      variantClass: 'detail-modal--changelog',
      title: t('changelog.panel.title', undefined),
      subtitle: this.buildSubtitle(),
      hint: t('changelog.panel.close-hint', undefined),
      renderBody: (body) => {
        if (useReactPanel) {
          body.replaceChildren();
          return;
        }
        this.renderBody(body);
      },
      onAfterRender: useReactPanel
        ? (body, signal) => mountReactChangelogPanel(body, signal)
        : undefined,
      onClose: useReactPanel ? unmountReactChangelogPanel : undefined,
    });
  }

  /** buildSubtitle：构建Subtitle。 */
  private buildSubtitle(): string {
    const latest = getLatestChangelogEntry();
    return latest
      ? t('changelog.panel.subtitle.latest', { updatedAt: latest.updatedAt })
      : t('changelog.panel.subtitle.empty', undefined);
  }

  /** renderBody：渲染身体。 */
  private renderBody(body: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const shell = createElement('div', 'chronicle-shell');
    const historySection = createElement('section', 'panel-section chronicle-history');
    const sectionTitle = createElement('div', 'panel-section-title', t('changelog.panel.section.title', undefined));
    const entryList = createElement('div', 'chronicle-entry-list');
    for (const entry of CHANGELOG_ENTRIES) {
      entryList.append(this.renderEntry(entry));
    }
    historySection.append(sectionTitle, entryList);
    shell.append(historySection);
    body.replaceChildren(shell);
  }

  /** renderEntry：渲染条目。 */
  private renderEntry(entry: {  
  /**
 * updatedAt：updatedAt相关字段。
 */
 updatedAt: string;  
 /**
 * summary：摘要状态或数据块。
 */
 summary: string;  
 /**
 * items：集合字段。
 */
 items: string[] }): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const article = createElement('article', 'chronicle-entry');
    const head = createElement('div', 'chronicle-entry-head');
    head.append(
      createElement('div', 'chronicle-entry-time', entry.updatedAt),
      createElement('div', 'chronicle-entry-summary', entry.summary),
    );
    const list = createElement('ul', 'chronicle-entry-items');
    for (const item of entry.items) {
      list.append(createElement('li', '', item));
    }
    article.append(head, list);
    return article;
  }
}

/** createElement：创建文本元素。 */
function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (typeof text === 'string') {
    element.textContent = text;
  }
  return element;
}
