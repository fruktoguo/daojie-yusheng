import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { S2C, Suggestion } from '@mud/shared';

@Injectable()
export class SuggestionRealtimeService {
  private server: Server | null = null;

  bindServer(server: Server): void {
    this.server = server;
  }

  broadcastSuggestions(suggestions: Suggestion[]): void {
    this.server?.emit(S2C.SuggestionUpdate, { suggestions });
  }
}
