import { PlayerState, TechniqueState } from '@mud/shared-next';
import type { SocketRuntimeSender } from './network/socket-send-runtime';
import { TechniquePanel } from './ui/panels/technique-panel';

type MainTechniqueStateSourceOptions = {
  techniquePanel: Pick<TechniquePanel, 'setCallbacks' | 'initFromPlayer' | 'update' | 'syncDynamic' | 'clear'>;
  socket: Pick<SocketRuntimeSender, 'sendCultivate'>;
};

export type MainTechniqueStateSource = ReturnType<typeof createMainTechniqueStateSource>;

export function createMainTechniqueStateSource(options: MainTechniqueStateSourceOptions) {
  options.techniquePanel.setCallbacks((techId) => options.socket.sendCultivate(techId));

  return {
    initFromPlayer(player: PlayerState): void {
      options.techniquePanel.initFromPlayer(player);
    },

    update(techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState): void {
      options.techniquePanel.update(techniques, cultivatingTechId, player);
    },

    syncDynamic(techniques: TechniqueState[], cultivatingTechId?: string, player?: PlayerState): void {
      options.techniquePanel.syncDynamic(techniques, cultivatingTechId, player);
    },

    clear(): void {
      options.techniquePanel.clear();
    },
  };
}
