import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { overlayStore } from './overlay-store';

export function NextTooltipLayer() {
  const { tooltip } = useExternalStoreSnapshot(overlayStore);

  if (!tooltip.visible) {
    return null;
  }

  return (
    <div
      className="next-ui-tooltip-layer"
      style={{
        left: `${tooltip.clientX + 14}px`,
        top: `${tooltip.clientY + 14}px`,
      }}
      aria-hidden="true"
    >
      <div className="next-ui-tooltip-shell">
        <strong>{tooltip.title}</strong>
        {tooltip.lines.length > 0 ? (
          <div className="next-ui-tooltip-detail">
            {tooltip.lines.map((line, index) => (
              <div key={`${line}-${index}`}>{line}</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
