/**
 * 本文件属于渐进式 React UI 层，负责壳层、桥接、覆盖层或前端 store 组合。
 *
 * 维护时要复用现有网络、运行态和样式 token，避免形成与 DOM UI 冲突的第二套业务真源。
 */
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { closeDetailModal, overlayStore } from './overlay-store';
import { t } from '../../ui/i18n';
/**
 * DetailModalLayer：渲染Next详情弹层层组件。
 * @returns 无返回值，直接更新Next详情弹层层相关状态。
 */


export function DetailModalLayer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const { detailModal } = useExternalStoreSnapshot(overlayStore);

  if (!detailModal.open) {
    return null;
  }

  return (
    <div
      className="react-ui-modal-layer react-ui-detail-modal-layer"
      aria-hidden="false"
      onClick={closeDetailModal}
    >
      <div
        className="react-ui-modal-card react-ui-modal-card--md react-ui-detail-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="react-ui-modal-head">
          <div>
            <div className="react-ui-modal-title">{detailModal.title}</div>
            {detailModal.subtitle ? (
              <div className="react-ui-modal-subtitle">{detailModal.subtitle}</div>
            ) : null}
          </div>
          <div className="react-ui-modal-hint">{detailModal.hint ?? t('detail-modal.hint.close')}</div>
        </div>
        <div className="react-ui-modal-body react-ui-detail-modal-body">
          {detailModal.body}
        </div>
      </div>
    </div>
  );
}
