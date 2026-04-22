import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { overlayStore } from './overlay-store';
/**
 * TooltipLayer：渲染Next提示层组件。
 * @returns 无返回值，直接更新Next提示层相关状态。
 */


export function TooltipLayer() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
