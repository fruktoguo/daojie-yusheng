import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { closeNextDetailModal, overlayStore } from './overlay-store';
/**
 * NextDetailModalLayer：执行核心业务逻辑。
 * @returns 函数返回值。
 */


export function NextDetailModalLayer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const { detailModal } = useExternalStoreSnapshot(overlayStore);

  if (!detailModal.open) {
    return null;
  }

  return (
    <div
      className="next-ui-modal-layer next-ui-detail-modal-layer"
      aria-hidden="false"
      onClick={closeNextDetailModal}
    >
      <div
        className="next-ui-modal-card next-ui-modal-card--md next-ui-detail-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="next-ui-modal-head">
          <div>
            <div className="next-ui-modal-title">{detailModal.title}</div>
            {detailModal.subtitle ? (
              <div className="next-ui-modal-subtitle">{detailModal.subtitle}</div>
            ) : null}
          </div>
          <div className="next-ui-modal-hint">{detailModal.hint ?? '点击空白处关闭'}</div>
        </div>
        <div className="next-ui-modal-body next-ui-detail-modal-body">
          {detailModal.body}
        </div>
      </div>
    </div>
  );
}
