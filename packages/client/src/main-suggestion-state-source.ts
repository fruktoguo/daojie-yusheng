import type { Suggestion } from '@mud/shared-next';
import type { SocketManager } from './network/socket';
import { SuggestionPanel } from './ui/suggestion-panel';

type MainSuggestionStateSourceOptions = {
  socket: SocketManager;
};

export type MainSuggestionStateSource = ReturnType<typeof createMainSuggestionStateSource>;

export function createMainSuggestionStateSource(options: MainSuggestionStateSourceOptions) {
  const suggestionPanel = new SuggestionPanel(options.socket);

  return {
    initFromPlayer(playerId: string): void {
      suggestionPanel.setPlayerId(playerId);
    },

    clear(): void {
      suggestionPanel.clear();
    },

    handleSuggestionUpdate(suggestions: Suggestion[]): void {
      suggestionPanel.updateSuggestions(suggestions);
    },
  };
}
