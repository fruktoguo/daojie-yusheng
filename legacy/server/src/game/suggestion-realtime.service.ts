import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { S2C, Suggestion } from '@mud/shared';

@Injectable()
/** SuggestionRealtimeService：封装相关状态与行为。 */
export class SuggestionRealtimeService {
/** server：定义该变量以承载业务值。 */
  private server: Server | null = null;

/** bindServer：执行对应的业务逻辑。 */
  bindServer(server: Server): void {
    this.server = server;
  }

/** broadcastSuggestions：执行对应的业务逻辑。 */
  broadcastSuggestions(suggestions: Suggestion[]): void {
    this.server?.emit(S2C.SuggestionUpdate, { suggestions });
  }
}

