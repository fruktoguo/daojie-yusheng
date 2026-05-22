/**
 * 本文件负责 更新日志 面板的主要 React 视图入口，统一承接状态展示、用户操作回调和样式组合。
 *
 * 维护时要保持它只处理前端表现和组件契约，不保存业务真源，也不绕过共享规则或服务端权威运行时。
 */
import { CHANGELOG_ENTRIES, getLatestChangelogEntry } from '../../../ui/changelog-data';
import { t } from '../../../ui/i18n';

/** 更新日志面板内容（用于嵌入 DetailModal body） */
export function ChangelogPanelContent() {
  return (
    <div className="chronicle-shell">
      <section className="panel-section chronicle-history">
        <div className="panel-section-title">
          {t('changelog.panel.section.title')}
        </div>
        <div className="chronicle-entry-list">
          {CHANGELOG_ENTRIES.map((entry, index) => (
            <ChangelogEntry key={`${entry.updatedAt}-${index}`} entry={entry} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ChangelogEntry({ entry }: { entry: { updatedAt: string; summary: string; items: string[] } }) {
  return (
    <article className="chronicle-entry">
      <div className="chronicle-entry-head">
        <div className="chronicle-entry-time">{entry.updatedAt}</div>
        <div className="chronicle-entry-summary">{entry.summary}</div>
      </div>
      <ul className="chronicle-entry-items">
        {entry.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

/** 获取弹层标题和副标题 */
export function getChangelogModalMeta() {
  const latest = getLatestChangelogEntry();
  return {
    title: t('changelog.panel.title'),
    subtitle: latest
      ? t('changelog.panel.subtitle.latest', { updatedAt: latest.updatedAt })
      : t('changelog.panel.subtitle.empty'),
    hint: t('changelog.panel.close-hint'),
  };
}
