import { UiButton } from '../primitives/UiButton';
import { UiEmptyHint } from '../primitives/UiEmptyHint';
import { UiPill } from '../primitives/UiPill';
import { UiSection } from '../primitives/UiSection';
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import {
  closeDetailModal,
  hideTooltip,
  moveTooltip,
  openDetailModal,
  showToast,
  showTooltip,
} from '../overlays/overlay-store';
import { panelDataStore } from '../stores/panel-data-store';
import { shellStore } from '../stores/shell-store';
/**
 * ReactUiScaffold：判断ReactUiScaffold是否满足条件。
 * @returns 无返回值，直接更新ReactUiScaffold相关状态。
 */


export function ReactUiScaffold() {
  const shellState = useExternalStoreSnapshot(shellStore);
  const panelState = useExternalStoreSnapshot(panelDataStore);
  const player = panelState.player;

  return (
    <div className="react-ui-scaffold">
      <UiSection
        title="React UI 骨架"
        subtitle="当前阶段只验证桥接、store 与视觉原语，不接管旧 UI。"
        actions={<UiPill tone={shellState.runtime.connected ? 'accent' : 'default'}>{shellState.runtime.connected ? '在线' : '离线'}</UiPill>}
        className="react-ui-scaffold-card"
      >
        <div className="react-ui-scaffold-grid">
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">角色</span>
            <span className="react-ui-scaffold-value">{player?.name ?? '未登录'}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">地图</span>
            <span className="react-ui-scaffold-value">{shellState.runtime.mapId ?? '未知'}</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">背包</span>
            <span className="react-ui-scaffold-value">{panelState.inventory?.items.length ?? 0} 项</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">功法</span>
            <span className="react-ui-scaffold-value">{panelState.techniques.length} 项</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">行动</span>
            <span className="react-ui-scaffold-value">{panelState.actions.length} 项</span>
          </div>
          <div className="react-ui-scaffold-row">
            <span className="react-ui-scaffold-label">任务</span>
            <span className="react-ui-scaffold-value">{panelState.quests?.length ?? 0} 项</span>
          </div>
        </div>
        <div className="react-ui-scaffold-actions">
          <UiButton
            type="button"
            variants={['ghost']}
            onClick={() => {
              showToast('新界面单实例提示已接通。', 'success');
            }}
          >
            测试提示
          </UiButton>
          <UiButton
            type="button"
            variants={['ghost']}
            onClick={() => {
              openDetailModal({
                title: '详情弹层骨架',
                subtitle: '单实例 React Host',
                body: (
                  <div className="react-ui-detail-preview">
                    当前只打通 host 和关闭逻辑，后续面板详情会统一走这层。
                    <div className="react-ui-detail-preview-actions">
                      <UiButton type="button" variants={['ghost']} onClick={closeDetailModal}>关闭</UiButton>
                    </div>
                  </div>
                ),
              });
            }}
          >
            测试弹层
          </UiButton>
          <UiButton
            type="button"
            variants={['ghost']}
            onClick={() => {
              window.__toggleMudReactUi__?.(false);
              window.location.reload();
            }}
          >
            关闭新 UI 骨架
          </UiButton>
        </div>
      </UiSection>
      <div
        className="react-ui-tooltip-probe react-ui-surface-pane react-ui-surface-pane--stack"
        onPointerMove={(event) => {
          showTooltip(
            'Tooltip 骨架',
            ['已接入单实例 hover 层。', '后续物品、技能、NPC 提示统一复用。'],
            event.clientX,
            event.clientY,
          );
          moveTooltip(event.clientX, event.clientY);
        }}
        onPointerLeave={hideTooltip}
      >
        悬停这里测试 React Tooltip Host
      </div>
      <UiEmptyHint text="下一步会先迁 Tooltip、详情弹层、胶囊和按钮原语，再逐步替换背包与属性面板。" />
    </div>
  );
}
