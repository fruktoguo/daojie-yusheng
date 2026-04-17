import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { closeNextDetailModal, overlayStore } from './overlay-store';

export function NextDetailModalLayer() {
  const { detailModal } = useExternalStoreSnapshot(overlayStore);

  if (!detailModal.open) {
    return null;
  }

  return (
    <div
      className="detail-modal ui-modal-layer next-ui-detail-modal-layer"
      aria-hidden="false"
      onClick={closeNextDetailModal}
    >
      <div
        className="detail-modal-card ui-modal-card ui-modal-card--md next-ui-detail-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-modal-head ui-modal-head">
          <div>
            <div className="detail-modal-title ui-modal-title">{detailModal.title}</div>
            {detailModal.subtitle ? (
              <div className="detail-modal-subtitle ui-modal-subtitle">{detailModal.subtitle}</div>
            ) : null}
          </div>
          <div className="detail-modal-hint ui-modal-hint">{detailModal.hint ?? '点击空白处关闭'}</div>
        </div>
        <div className="ui-modal-body next-ui-detail-modal-body">
          {detailModal.body}
        </div>
      </div>
    </div>
  );
}
