/** 本文件负责功法领悟弹层装配；它只发送用户意图和维护临时 UI 状态，不保存玩法真源。 */
import { detailModalHost } from './ui/detail-modal-host';
import {
  closeTechniqueGenerationPanel,
  getTechniqueGenerationSelectedItemSpend,
  getTechniqueGenerationSelectedMode,
  openTechniqueGenerationPanel,
  setTechniqueGenerationCallbacks,
  syncTechniqueGenerationState,
} from './react-ui/panels/technique-generation/mount-technique-generation-panel';
import type { SocketTechniqueGenerationSender } from './network/socket-send-technique-generation';

type MainTechniqueGenerationPanelSourceOptions = {
  sender: SocketTechniqueGenerationSender;
};

export function createMainTechniqueGenerationPanelSource(
  options: MainTechniqueGenerationPanelSourceOptions,
) {
  const { sender } = options;

  setTechniqueGenerationCallbacks({
    onGenerate: (category, playerContext, itemSpend, mode) => {
      if (category !== 'internal' && category !== 'arts') {
        syncTechniqueGenerationState({ error: '当前仅开放内功和术法' });
        return;
      }
      sender.sendGenerate(category, playerContext, itemSpend, mode);
      syncTechniqueGenerationState({ generating: true, currentDraft: null, currentBatch: null, error: '' });
    },
    onPreviewItemSpend: (itemSpend, mode) => sender.sendGetStatus(itemSpend, mode),
    onAdopt: (jobId, customName) => sender.sendAdopt(jobId, customName),
    onDiscard: (jobId) => sender.sendDiscard(jobId),
    onAdoptBatch: (batchId) => sender.sendAdoptBatch(batchId),
    onDiscardBatch: (batchId) => sender.sendDiscardBatch(batchId),
    onClose: () => detailModalHost.close('technique-generation-panel'),
  });

  return {
    openNamedPanel(panel: string): void {
      if (panel !== 'technique_generation') {
        return;
      }
      syncTechniqueGenerationState({ error: '' });
      detailModalHost.open({
        ownerId: 'technique-generation-panel',
        variantClass: 'detail-modal--technique-generation',
        title: '功法领悟',
        size: 'full',
        renderBody: (body) => body.replaceChildren(),
        onAfterRender: (body) => {
          openTechniqueGenerationPanel(body);
          sender.sendGetStatus(
            getTechniqueGenerationSelectedItemSpend(),
            getTechniqueGenerationSelectedMode(),
          );
          syncTechniqueGenerationState({ available: true, unavailableReason: '' });
        },
        onClose: () => closeTechniqueGenerationPanel(),
      });
    },
  };
}
