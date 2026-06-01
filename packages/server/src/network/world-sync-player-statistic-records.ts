import { S2C } from '@mud/shared';

export function emitPendingPlayerStatisticRecords(playerRuntimeService: any, playerId: string, socket: any): void {
    const records = typeof playerRuntimeService.consumePendingPlayerStatisticRecordsForEmit === 'function'
        ? playerRuntimeService.consumePendingPlayerStatisticRecordsForEmit(playerId)
        : (typeof playerRuntimeService.getPendingPlayerStatisticRecords === 'function'
            ? playerRuntimeService.getPendingPlayerStatisticRecords(playerId) : []);
    const totalsPatch = typeof playerRuntimeService.consumePlayerStatisticTotalsPatchForEmit === 'function'
        ? playerRuntimeService.consumePlayerStatisticTotalsPatchForEmit(playerId) : null;
    const totals = !totalsPatch && typeof playerRuntimeService.consumePlayerStatisticTotalsForEmit === 'function'
        ? playerRuntimeService.consumePlayerStatisticTotalsForEmit(playerId) : null;
    if (typeof socket?.emit !== 'function') return;
    if ((!Array.isArray(records) || records.length === 0) && !totals && !totalsPatch) return;
    socket.emit(S2C.OfflineGainReports, {
        reports: Array.isArray(records) ? records : [],
        ...(totals ? { totals } : {}),
        ...(totalsPatch ? { totalsPatch } : {}),
    });
}
