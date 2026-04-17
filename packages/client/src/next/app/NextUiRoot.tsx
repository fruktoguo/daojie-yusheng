import { NextDetailModalLayer } from '../overlays/NextDetailModalLayer';
import { NextToastLayer } from '../overlays/NextToastLayer';
import { NextTooltipLayer } from '../overlays/NextTooltipLayer';
import { useExternalStoreSnapshot } from '../hooks/use-external-store-snapshot';
import { shellStore } from '../stores/shell-store';
import { NextUiScaffold } from './NextUiScaffold';

export function NextUiRoot() {
  const shellState = useExternalStoreSnapshot(shellStore);

  if (!shellState.enabled) {
    return null;
  }

  return (
    <div className="next-ui-root" data-shell-visible={shellState.runtime.shellVisible ? 'true' : 'false'}>
      <NextUiScaffold />
      <NextTooltipLayer />
      <NextDetailModalLayer />
      <NextToastLayer />
    </div>
  );
}
