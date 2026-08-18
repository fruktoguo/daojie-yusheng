import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { S2C, type ChatHistoryCursorView, type PartyChatHistoryView, type PartyChatMessageView } from '@mud/shared';
import { WorldSessionService } from '../../network/world-session.service';
import { PartyMembershipRepository } from './party-membership.repository';
import { PartyChatRepository } from './party-chat.repository';
import type { PartyMemberProfile } from './party-runtime.types';

interface Bucket { tokens: number; at: number; }

@Injectable()
export class PartyChatService implements OnModuleDestroy {
  private readonly logger = new Logger(PartyChatService.name);
  private readonly playerBuckets = new Map<string, Bucket>();
  private readonly partyBuckets = new Map<string, Bucket>();
  private readonly globalBucket: Bucket = { tokens: 200, at: Date.now() };
  private readonly pendingPrunes = new Set<string>();
  private pruneTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneInFlight: Promise<void> | null = null;

  constructor(
    private readonly repository: PartyChatRepository,
    private readonly membership: PartyMembershipRepository,
    private readonly sessions: WorldSessionService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.pruneTimer) {
      clearTimeout(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.pruneInFlight) {
      await this.pruneInFlight.catch(() => undefined);
    }
    while (this.pendingPrunes.size > 0) {
      await this.flushPendingPrunes(false);
    }
  }

  async send(profile: PartyMemberProfile, rawText: unknown): Promise<{ ok: boolean; reason?: string; message?: PartyChatMessageView }> {
    const text = normalizeMessage(rawText);
    if (!text) return { ok: false, reason: 'invalid_message' };
    const party = await this.membership.getPartyByPlayer(profile.playerId);
    if (!party) return { ok: false, reason: 'not_in_party' };
    const now = Date.now();
    if (!consume(this.globalBucket, 200, 50, now)
      || !consume(this.getBucket(this.playerBuckets, profile.playerId, 8, now), 8, 2, now)
      || !consume(this.getBucket(this.partyBuckets, party.partyId, 20, now), 20, 5, now)) {
      return { ok: false, reason: 'message_channel_busy' };
    }
    const result = await this.repository.create(profile, text);
    if (!result.ok || !result.message) return result;
    const message: PartyChatMessageView = result.message;
    const currentParty = await this.membership.getParty(message.partyId);
    for (const member of currentParty?.members ?? []) {
      this.sessions.getSocketByPlayerId(member.playerId)?.emit(S2C.PartyChatMessage, message);
    }
    this.schedulePrune(party.partyId);
    return { ok: true, message };
  }

  async history(playerId: string, cursor?: ChatHistoryCursorView, requestId?: unknown): Promise<{ ok: boolean; reason?: string; history?: PartyChatHistoryView }> {
    const result = await this.repository.history(playerId, cursor);
    if (!result.ok || !result.partyId) return result;
    const normalizedRequestId = typeof requestId === 'string' && requestId.length <= 128 ? requestId : undefined;
    return {
      ok: true,
      history: {
        ...(normalizedRequestId ? { requestId: normalizedRequestId } : {}),
        partyId: result.partyId,
        messages: result.messages ?? [],
      },
    };
  }

  private getBucket(map: Map<string, Bucket>, key: string, capacity: number, now: number): Bucket {
    const existing = map.get(key);
    if (existing) return existing;
    if (map.size >= 32_768) map.delete(map.keys().next().value);
    const bucket = { tokens: capacity, at: now };
    map.set(key, bucket);
    return bucket;
  }

  private schedulePrune(partyId: string): void {
    this.pendingPrunes.add(partyId);
    if (this.pruneTimer) return;
    this.pruneTimer = setTimeout(() => {
      this.pruneTimer = null;
      void this.flushPendingPrunes(true);
    }, 1_000);
    this.pruneTimer.unref();
  }

  private async flushPendingPrunes(reschedule: boolean): Promise<void> {
    if (this.pruneInFlight || this.pendingPrunes.size === 0) return;
    const run = this.runPruneBatch(reschedule).finally(() => {
      if (this.pruneInFlight === run) this.pruneInFlight = null;
    });
    this.pruneInFlight = run;
    await run;
  }

  private async runPruneBatch(reschedule: boolean): Promise<void> {
    const partyIds = Array.from(this.pendingPrunes).slice(0, 100);
    partyIds.forEach((id) => this.pendingPrunes.delete(id));
    await Promise.all(partyIds.map((id) => this.repository.prune(id).catch((error) => {
      this.logger.warn(`队伍聊天裁剪失败 party=${id}: ${error instanceof Error ? error.message : String(error)}`);
    })));
    if (reschedule && this.pendingPrunes.size > 0) this.schedulePrune(this.pendingPrunes.values().next().value);
  }
}

function normalizeMessage(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || Array.from(text).length > 200 || Buffer.byteLength(text, 'utf8') > 600) return '';
  return text;
}

function consume(bucket: Bucket, capacity: number, refill: number, now: number): boolean {
  bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * refill / 1_000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
