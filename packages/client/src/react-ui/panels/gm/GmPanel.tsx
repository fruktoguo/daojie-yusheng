/**
 * React 版 GM 管理面板
 * 提供服务端性能监控、在线玩家列表、玩家编辑、机器人控制与意见管理
 */
import { memo, useCallback, useMemo, useState, useRef } from 'react';
import type { C2S_GmUpdatePlayer, GmPlayerSummary, GmWorkerPoolAllMetrics, GmWorkerPoolMetrics, S2C_GmState, Suggestion } from '@mud/shared';
import { createPanelStore } from '../../stores/create-panel-store';

// ─── Store ───────────────────────────────────────────────────────────────────

interface GmPanelState {
  gmState: S2C_GmState | null;
  suggestions: Suggestion[];
}

function createEmptyGmState(): S2C_GmState {
  return {
    players: [],
    mapIds: [],
    botCount: 0,
    perf: {
      cpuPercent: 0,
      memoryMb: 0,
      tickMs: 0,
      tick: {
        lastMapId: null,
        lastMs: 0,
        windowElapsedSec: 0,
        windowTickCount: 0,
        windowTotalMs: 0,
        windowAvgMs: 0,
        windowBusyPercent: 0,
      },
      cpu: {
        cores: 0, loadAvg1m: 0, loadAvg5m: 0, loadAvg15m: 0,
        processUptimeSec: 0, systemUptimeSec: 0,
        userCpuMs: 0, systemCpuMs: 0,
        rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0,
        profileStartedAt: 0, profileElapsedSec: 0, breakdown: [],
      },
      memoryEstimate: {
        mode: 'snapshot_estimate', generatedAt: 0, cacheTtlMs: 0,
        rssBytes: 0, coveredBytes: 0, uncoveredBytes: 0, coveragePercent: 0,
        domains: [], topInstances: [], heapSpaces: [],
      },
      pathfinding: {
        statsStartedAt: 0, statsElapsedSec: 0,
        workerCount: 0, runningWorkers: 0, idleWorkers: 0, peakRunningWorkers: 0,
        queueDepth: 0, peakQueueDepth: 0,
        enqueued: 0, dispatched: 0, completed: 0, succeeded: 0,
        failed: 0, cancelled: 0, droppedPending: 0, droppedStaleResults: 0,
        avgQueueMs: 0, maxQueueMs: 0, avgRunMs: 0, maxRunMs: 0,
        avgExpandedNodes: 0, maxExpandedNodes: 0, failureReasons: [],
      },
      networkStatsStartedAt: 0, networkStatsElapsedSec: 0,
      networkInBytes: 0, networkOutBytes: 0,
      networkInBuckets: [], networkOutBuckets: [],
    },
  };
}

export const { store: gmPanelStore, useStore: useGmPanelStore } = createPanelStore<GmPanelState>({
  gmState: null,
  suggestions: [],
});

// ─── Callbacks ───────────────────────────────────────────────────────────────

interface GmPanelCallbacks {
  onRefresh: (() => void) | null;
  onResetSelf: (() => void) | null;
  onCycleZoom: (() => void) | null;
  onSpawnBots: ((count: number) => void) | null;
  onRemoveBots: ((playerIds?: string[], all?: boolean) => void) | null;
  onUpdatePlayer: ((payload: C2S_GmUpdatePlayer) => void) | null;
  onResetPlayer: ((playerId: string) => void) | null;
  onResetHeavenGate: ((playerId: string) => void) | null;
  onMarkSuggestionCompleted: ((id: string) => void) | null;
  onRemoveSuggestion: ((id: string) => void) | null;
}

const callbacks: GmPanelCallbacks = {
  onRefresh: null,
  onResetSelf: null,
  onCycleZoom: null,
  onSpawnBots: null,
  onRemoveBots: null,
  onUpdatePlayer: null,
  onResetPlayer: null,
  onResetHeavenGate: null,
  onMarkSuggestionCompleted: null,
  onRemoveSuggestion: null,
};

export function setGmPanelCallbacks(cbs: Partial<GmPanelCallbacks>): void {
  Object.assign(callbacks, cbs);
}

// ─── 辅助 ────────────────────────────────────────────────────────────────────

function getPlayerAccountLabel(player: GmPlayerSummary): string {
  return player.accountName ?? (player.isBot ? '机器人' : '无');
}

function getPlayerMapLabel(player: GmPlayerSummary): string {
  return player.mapName || player.mapId;
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

type GmTab = 'overview' | 'workers';

export function GmPanel() {
  const { gmState, suggestions } = useGmPanelStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GmTab>('overview');

  const state = gmState ?? createEmptyGmState();

  // 自动选中第一个玩家
  const effectiveSelectedId = useMemo(() => {
    if (selectedPlayerId && state.players.some((p) => p.id === selectedPlayerId)) {
      return selectedPlayerId;
    }
    return state.players[0]?.id ?? null;
  }, [selectedPlayerId, state.players]);

  const selectedPlayer = useMemo(
    () => state.players.find((p) => p.id === effectiveSelectedId) ?? null,
    [state.players, effectiveSelectedId],
  );

  if (!gmState) {
    return <div className="empty-hint ui-empty-hint">暂无 GM 数据</div>;
  }

  return (
    <div className="gm-panel-content">
      <div className="gm-tab-bar">
        <button
          className={`gm-tab-btn${activeTab === 'overview' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('overview')}
        >总览</button>
        <button
          className={`gm-tab-btn${activeTab === 'workers' ? ' is-active' : ''}`}
          type="button"
          onClick={() => setActiveTab('workers')}
        >多线程</button>
      </div>
      {activeTab === 'overview' && (
        <>
          <GmPerfSection perf={state.perf} />
          <GmOverviewSection playerCount={state.players.length} botCount={state.botCount} />
          <GmDebugSection />
          <GmBotSection />
          <GmPlayerListSection
            players={state.players}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedPlayerId}
          />
          <GmPlayerDetailSection
            player={selectedPlayer}
            mapIds={state.mapIds}
          />
          <GmSuggestionSection suggestions={suggestions} />
        </>
      )}
      {activeTab === 'workers' && (
        <GmWorkerPoolSection workerPool={state.perf.workerPool ?? null} />
      )}
    </div>
  );
}

// ─── 性能区 ──────────────────────────────────────────────────────────────────

function formatDomainCounts(counts: Record<string, number> | undefined): string {
  if (!counts || Object.keys(counts).length === 0) {
    return '无 domain';
  }
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right, 'zh-Hans-CN'))
    .map(([domain, count]) => `${domain}:${count}`)
    .join(', ');
}

function formatPoolStats(stats: { totalCount: number; idleCount: number; waitingCount: number } | null | undefined): string {
  if (!stats) {
    return '无数据';
  }
  return `total ${stats.totalCount} / idle ${stats.idleCount} / waiting ${stats.waitingCount}`;
}

const GmPerfSection = memo(function GmPerfSection({ perf }: { perf: S2C_GmState['perf'] }) {
  const tickPerf = perf.tick ?? { lastMapId: null, lastMs: perf.tickMs };
  const tickLabel = tickPerf.lastMapId
    ? `${Math.round(tickPerf.lastMs)} ms · ${tickPerf.lastMapId}`
    : `${Math.round(tickPerf.lastMs)} ms`;
  const flushDiagnostics = perf.flushDiagnostics ?? null;
  const playerFlush = flushDiagnostics?.player ?? null;
  const mapFlush = flushDiagnostics?.map ?? null;
  const pgPool = flushDiagnostics?.pgPool ?? null;
  const pgPools = flushDiagnostics?.pgPools ?? null;
  const pgLockWait = flushDiagnostics?.pgLockWait ?? null;

  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">服务端性能</div>
      <div className="panel-row"><span className="panel-label">CPU 压力</span><span className="panel-value">{Math.round(perf.cpuPercent)}%</span></div>
      <div className="panel-row"><span className="panel-label">内存占用</span><span className="panel-value">{Math.round(perf.memoryMb)} MB</span></div>
      <div className="panel-row"><span className="panel-label">最近单图 tick</span><span className="panel-value">{tickLabel}</span></div>
      {pgPools ? (
        <>
          <div className="panel-row"><span className="panel-label">PG runtime-critical</span><span className="panel-value">{formatPoolStats(pgPools.runtimeCritical)}</span></div>
          <div className="panel-row"><span className="panel-label">PG flush</span><span className="panel-value">{formatPoolStats(pgPools.flush)}</span></div>
          <div className="panel-row"><span className="panel-label">PG outbox</span><span className="panel-value">{formatPoolStats(pgPools.outbox)}</span></div>
          <div className="panel-row"><span className="panel-label">PG gm-diagnostics</span><span className="panel-value">{formatPoolStats(pgPools.gmDiagnostics)}</span></div>
        </>
      ) : pgPool && (
        <div className="panel-row"><span className="panel-label">PG pool</span><span className="panel-value">{formatPoolStats(pgPool)}</span></div>
      )}
      {pgLockWait && (
        <div className="panel-row"><span className="panel-label">PG 锁等待</span><span className="panel-value">{pgLockWait.waitingCount}{pgLockWait.error ? ` · ${pgLockWait.error}` : ''}</span></div>
      )}
      {playerFlush && (
        <div className="panel-row"><span className="panel-label">玩家刷盘</span><span className="panel-value">{playerFlush.totalMs}ms · dirty {playerFlush.dirtyPlayerCount} · DB {playerFlush.dbWriteMs}ms · build {playerFlush.buildSnapshotMs}ms</span></div>
      )}
      {mapFlush && (
        <div className="panel-row"><span className="panel-label">地图刷盘</span><span className="panel-value">{mapFlush.totalMs}ms · dirty {mapFlush.dirtyInstanceCount} · DB {mapFlush.dbWriteMs}ms · coalesced {mapFlush.coalescedDomainCount ?? 0} · {formatDomainCounts(mapFlush.domainCounts)}</span></div>
      )}
    </div>
  );
});

// ─── 概览区 ──────────────────────────────────────────────────────────────────

const GmOverviewSection = memo(function GmOverviewSection({ playerCount, botCount }: { playerCount: number; botCount: number }) {
  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">GM 概览</div>
      <div className="panel-row"><span className="panel-label">在线玩家</span><span className="panel-value">{playerCount}</span></div>
      <div className="panel-row"><span className="panel-label">机器人</span><span className="panel-value">{botCount}</span></div>
    </div>
  );
});

// ─── 调试区 ──────────────────────────────────────────────────────────────────

function GmDebugSection() {
  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">调试</div>
      <div className="gm-btn-row ui-action-row ui-action-row--start">
        <button className="small-btn" type="button" onClick={() => callbacks.onResetSelf?.()}>自己回出生点</button>
        <button className="small-btn" type="button" onClick={() => callbacks.onRefresh?.()}>刷新</button>
        <button className="small-btn" type="button" onClick={() => callbacks.onCycleZoom?.()}>缩放</button>
      </div>
    </div>
  );
}

// ─── 机器人控制区 ────────────────────────────────────────────────────────────

function GmBotSection() {
  const botCountRef = useRef<HTMLInputElement>(null);

  const handleSpawn = useCallback(() => {
    const count = Number(botCountRef.current?.value ?? '0');
    if (Number.isNaN(count) || count <= 0) return;
    callbacks.onSpawnBots?.(count);
  }, []);

  const handleRemoveAll = useCallback(() => {
    callbacks.onRemoveBots?.(undefined, true);
  }, []);

  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">机器人控制</div>
      <div className="gm-btn-row ui-action-row ui-action-row--start">
        <input
          ref={botCountRef}
          className="gm-inline-input ui-input"
          type="number"
          min={1}
          max={50}
          defaultValue={5}
          onKeyDown={(e) => {
            if (e.key === 'e' || e.key === 'E' || e.key === '.' || e.key === '+') {
              e.preventDefault();
            }
          }}
        />
        <button className="small-btn" type="button" onClick={handleSpawn}>生成</button>
        <button className="small-btn danger" type="button" onClick={handleRemoveAll}>移除全部</button>
      </div>
    </div>
  );
}

// ─── 玩家列表区 ──────────────────────────────────────────────────────────────

const GmPlayerListSection = memo(function GmPlayerListSection({
  players,
  selectedId,
  onSelect,
}: {
  players: GmPlayerSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (players.length === 0) {
    return (
      <div className="panel-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">在线列表</div>
        <div className="empty-hint ui-empty-hint">当前没有在线玩家</div>
      </div>
    );
  }

  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">在线列表</div>
      <div className="gm-player-list ui-card-list ui-scroll-panel">
        {players.map((player) => (
          <GmPlayerRow
            key={player.id}
            player={player}
            isActive={player.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
});

const GmPlayerRow = memo(function GmPlayerRow({
  player,
  isActive,
  onSelect,
}: {
  player: GmPlayerSummary;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(player.id), [onSelect, player.id]);

  return (
    <button
      className={`gm-player-row ui-surface-card ui-surface-card--compact ui-selectable-card${isActive ? ' is-active' : ''}`}
      type="button"
      data-gm-player-id={player.id}
      onClick={handleClick}
    >
      <div>
        <div className="gm-player-name">{player.roleName}</div>
        <div className="gm-player-meta">账号: {getPlayerAccountLabel(player)} · 显示名: {player.displayName}</div>
        <div className="gm-player-meta">{player.isBot ? '机器人' : '真人'} · {getPlayerMapLabel(player)}</div>
      </div>
    </button>
  );
});

// ─── 玩家编辑区 ──────────────────────────────────────────────────────────────

function GmPlayerDetailSection({
  player,
  mapIds,
}: {
  player: GmPlayerSummary | null;
  mapIds: string[];
}) {
  const mapRef = useRef<HTMLSelectElement>(null);
  const xRef = useRef<HTMLInputElement>(null);
  const yRef = useRef<HTMLInputElement>(null);
  const hpRef = useRef<HTMLInputElement>(null);
  const autoBattleRef = useRef<HTMLInputElement>(null);

  const allMapIds = useMemo(() => {
    if (!player) return mapIds;
    const set = new Set(mapIds);
    if (!set.has(player.mapId)) {
      return [...mapIds, player.mapId];
    }
    return mapIds;
  }, [mapIds, player]);

  const handleSave = useCallback(() => {
    if (!player) return;
    callbacks.onUpdatePlayer?.({
      playerId: player.id,
      mapId: mapRef.current?.value ?? player.mapId,
      x: Number(xRef.current?.value ?? player.x),
      y: Number(yRef.current?.value ?? player.y),
      hp: Number(hpRef.current?.value ?? player.hp),
      autoBattle: Boolean(autoBattleRef.current?.checked),
    });
  }, [player]);

  const handleHeal = useCallback(() => {
    if (!player) return;
    callbacks.onUpdatePlayer?.({
      playerId: player.id,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      hp: player.maxHp,
      autoBattle: false,
    });
  }, [player]);

  const handleReset = useCallback(() => {
    if (!player) return;
    callbacks.onResetPlayer?.(player.id);
  }, [player]);

  const handleResetHeavenGate = useCallback(() => {
    if (!player) return;
    callbacks.onResetHeavenGate?.(player.id);
  }, [player]);

  const handleRemove = useCallback(() => {
    if (!player || !player.isBot) return;
    callbacks.onRemoveBots?.([player.id], false);
  }, [player]);

  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">玩家编辑</div>
      {!player ? (
        <div className="empty-hint ui-empty-hint">请选择一名玩家</div>
      ) : (
        <>
          <div className="gm-form-grid ui-form-grid ui-form-grid--three-column">
            <label className="gm-field ui-form-field">
              <span>地图</span>
              <select ref={mapRef} className="ui-input" defaultValue={player.mapId} key={player.id}>
                {allMapIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="gm-field ui-form-field">
              <span>X</span>
              <input ref={xRef} className="ui-input" type="number" defaultValue={player.x} key={`${player.id}-x`} />
            </label>
            <label className="gm-field ui-form-field">
              <span>Y</span>
              <input ref={yRef} className="ui-input" type="number" defaultValue={player.y} key={`${player.id}-y`} />
            </label>
            <label className="gm-field ui-form-field">
              <span>HP</span>
              <input ref={hpRef} className="ui-input" type="number" min={0} max={player.maxHp} defaultValue={player.hp} key={`${player.id}-hp`} />
            </label>
          </div>
          <label className="gm-checkbox">
            <input ref={autoBattleRef} type="checkbox" defaultChecked={player.autoBattle} disabled={!!player.dead} key={`${player.id}-ab`} />
            <span>自动战斗</span>
          </label>
          <div className="gm-btn-row ui-action-row ui-action-row--start">
            <button className="small-btn" type="button" onClick={handleSave}>保存</button>
            <button className="small-btn" type="button" onClick={handleHeal}>满血</button>
            <button className="small-btn" type="button" onClick={handleReset}>回出生点</button>
            <button className="small-btn" type="button" onClick={handleResetHeavenGate}>重置天门</button>
            {player.isBot && (
              <button className="small-btn danger" type="button" onClick={handleRemove}>移除机器人</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 意见管理区 ──────────────────────────────────────────────────────────────

const GmSuggestionSection = memo(function GmSuggestionSection({ suggestions }: { suggestions: Suggestion[] }) {
  const sorted = useMemo(
    () => [...suggestions].sort((a, b) => b.createdAt - a.createdAt),
    [suggestions],
  );

  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">意见管理</div>
      <div className="gm-suggestion-list ui-surface-pane ui-surface-pane--stack ui-scroll-panel">
        {sorted.length === 0 ? (
          <div className="empty-hint ui-empty-hint">暂无意见收集</div>
        ) : (
          sorted.map((suggestion) => (
            <GmSuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))
        )}
      </div>
    </div>
  );
});

const GmSuggestionCard = memo(function GmSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const handleComplete = useCallback(() => {
    callbacks.onMarkSuggestionCompleted?.(suggestion.id);
  }, [suggestion.id]);

  const handleRemove = useCallback(() => {
    if (confirm('确定移除这条意见吗？')) {
      callbacks.onRemoveSuggestion?.(suggestion.id);
    }
  }, [suggestion.id]);

  return (
    <div className="gm-suggestion-card ui-surface-card ui-surface-card--compact" data-gm-suggestion-id={suggestion.id}>
      <div className="gm-suggestion-head">
        <span className={`gm-suggestion-title ${suggestion.status === 'completed' ? 'completed' : 'pending'}`}>
          {suggestion.title}
        </span>
        <span className="gm-suggestion-author">{suggestion.authorName}</span>
      </div>
      <div className="gm-suggestion-desc">{suggestion.description}</div>
      <div className="gm-suggestion-actions">
        <span className="gm-suggestion-votes">👍{suggestion.upvotes.length} 👎{suggestion.downvotes.length}</span>
        {suggestion.status === 'pending' && (
          <button className="gm-suggestion-action" type="button" onClick={handleComplete}>标记完成</button>
        )}
        <button className="gm-suggestion-action gm-suggestion-action--danger" type="button" onClick={handleRemove}>移除</button>
      </div>
    </div>
  );
});

// ─── 多线程 Worker Pool 区 ──────────────────────────────────────────────────

const POOL_LABELS: Record<string, string> = {
  encoding: 'AOI 编码池',
  instance: '实例分片池',
  persistence: '持久化序列化池',
};

const GmWorkerPoolSection = memo(function GmWorkerPoolSection({ workerPool }: { workerPool: GmWorkerPoolAllMetrics | null }) {
  if (!workerPool) {
    return (
      <div className="panel-section ui-surface-pane ui-surface-pane--stack">
        <div className="panel-section-title">Worker Pool 多线程</div>
        <div className="empty-hint ui-empty-hint">Worker Pool 未启用或数据未就绪</div>
      </div>
    );
  }

  return (
    <div className="panel-section ui-surface-pane ui-surface-pane--stack">
      <div className="panel-section-title">Worker Pool 多线程</div>
      {(['encoding', 'instance', 'persistence'] as const).map((poolKey) => (
        <GmWorkerPoolCard key={poolKey} label={POOL_LABELS[poolKey]} metrics={workerPool[poolKey]} />
      ))}
    </div>
  );
});

const GmWorkerPoolCard = memo(function GmWorkerPoolCard({ label, metrics }: { label: string; metrics: GmWorkerPoolMetrics }) {
  const isActive = metrics.activeWorkers > 0;
  return (
    <div className="gm-worker-pool-card ui-surface-card ui-surface-card--compact">
      <div className="gm-worker-pool-header">
        <span className="gm-worker-pool-name">{label}</span>
        <span className={`gm-worker-pool-status${isActive ? ' is-active' : ' is-idle'}`}>
          {isActive ? `${metrics.activeWorkers} worker` : '未启用'}
        </span>
      </div>
      <div className="gm-worker-pool-grid">
        <div className="panel-row"><span className="panel-label">提交</span><span className="panel-value">{metrics.totalSubmitted}</span></div>
        <div className="panel-row"><span className="panel-label">完成</span><span className="panel-value">{metrics.totalCompleted}</span></div>
        <div className="panel-row"><span className="panel-label">超时</span><span className="panel-value">{metrics.totalTimedOut}</span></div>
        <div className="panel-row"><span className="panel-label">失败</span><span className="panel-value">{metrics.totalFailed}</span></div>
        <div className="panel-row"><span className="panel-label">Fallback</span><span className="panel-value">{metrics.totalFallback}</span></div>
        <div className="panel-row"><span className="panel-label">进行中</span><span className="panel-value">{metrics.inFlight}</span></div>
        <div className="panel-row"><span className="panel-label">P50</span><span className="panel-value">{metrics.p50Ms.toFixed(1)} ms</span></div>
        <div className="panel-row"><span className="panel-label">P95</span><span className="panel-value">{metrics.p95Ms.toFixed(1)} ms</span></div>
      </div>
    </div>
  );
});
