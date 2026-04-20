import type { Suggestion } from '@mud/shared-next';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { SuggestionPanel } from './ui/suggestion-panel';
/**
 * MainSuggestionStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainSuggestionStateSourceOptions = {
/**
 * socket：socket相关字段。
 */

  socket: Pick<
    SocketSocialEconomySender,
    | 'sendRequestSuggestions'
    | 'sendCreateSuggestion'
    | 'sendReplySuggestion'
    | 'sendVoteSuggestion'
    | 'sendMarkSuggestionRepliesRead'
  >;  
  /**
 * isSocketConnected：启用开关或状态标识。
 */

  isSocketConnected: () => boolean;
};
/**
 * MainSuggestionStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainSuggestionStateSource = ReturnType<typeof createMainSuggestionStateSource>;
/**
 * createMainSuggestionStateSource：构建并返回目标对象。
 * @param options MainSuggestionStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainSuggestion状态来源相关状态。
 */


export function createMainSuggestionStateSource(options: MainSuggestionStateSourceOptions) {
  const suggestionPanel = new SuggestionPanel(options.socket, options.isSocketConnected);

  return {  
  /**
 * initFromPlayer：执行initFrom玩家相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 无返回值，直接更新initFrom玩家相关状态。
 */

    initFromPlayer(playerId: string): void {
      suggestionPanel.setPlayerId(playerId);
    },    
    /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */


    clear(): void {
      suggestionPanel.clear();
    },    
    /**
 * handleSuggestionUpdate：处理SuggestionUpdate并更新相关状态。
 * @param suggestions Suggestion[] 参数说明。
 * @returns 无返回值，直接更新SuggestionUpdate相关状态。
 */


    handleSuggestionUpdate(suggestions: Suggestion[]): void {
      suggestionPanel.updateSuggestions(suggestions);
    },
  };
}
