import type { Suggestion } from '@mud/shared-next';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { SuggestionPanel } from './ui/suggestion-panel';

type MainSuggestionStateSourceOptions = {
  socket: Pick<
    SocketSocialEconomySender,
    | 'sendRequestSuggestions'
    | 'sendCreateSuggestion'
    | 'sendReplySuggestion'
    | 'sendVoteSuggestion'
    | 'sendMarkSuggestionRepliesRead'
  >;
  isSocketConnected: () => boolean;
};

export type MainSuggestionStateSource = ReturnType<typeof createMainSuggestionStateSource>;

export function createMainSuggestionStateSource(options: MainSuggestionStateSourceOptions) {
  const suggestionPanel = new SuggestionPanel(options.socket, options.isSocketConnected);

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
