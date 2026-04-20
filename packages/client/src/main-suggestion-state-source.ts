import type { Suggestion } from '@mud/shared-next';
import type { SocketSocialEconomySender } from './network/socket-send-social-economy';
import { SuggestionPanel } from './ui/suggestion-panel';
/**
 * MainSuggestionStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainSuggestionStateSourceOptions = {
/**
 * socket：对象字段。
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
 * isSocketConnected：对象字段。
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
 * @returns 函数返回值。
 */


export function createMainSuggestionStateSource(options: MainSuggestionStateSourceOptions) {
  const suggestionPanel = new SuggestionPanel(options.socket, options.isSocketConnected);

  return {  
  /**
 * initFromPlayer：初始化并准备运行时基础状态。
 * @param playerId string 玩家 ID。
 * @returns void。
 */

    initFromPlayer(playerId: string): void {
      suggestionPanel.setPlayerId(playerId);
    },    
    /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */


    clear(): void {
      suggestionPanel.clear();
    },    
    /**
 * handleSuggestionUpdate：处理事件并驱动执行路径。
 * @param suggestions Suggestion[] 参数说明。
 * @returns void。
 */


    handleSuggestionUpdate(suggestions: Suggestion[]): void {
      suggestionPanel.updateSuggestions(suggestions);
    },
  };
}
