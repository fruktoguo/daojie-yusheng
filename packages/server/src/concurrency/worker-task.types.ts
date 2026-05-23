/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * Worker 任务协议契约。
 * 所有 worker pool 共用的统一 envelope 格式。
 * 入参出参必须是 plain object / ArrayBuffer / TypedArray，
 * 不传 class 实例、不传 Map/Set。
 */

/** 主线程 → Worker 的任务 envelope */
export interface WorkerTaskEnvelope<TPayload = unknown> {
  /** 主线程分配的唯一任务 ID */
  taskId: string;
  /** 任务类型 */
  kind: WorkerTaskKind;
  /** 任务载荷（plain object 或 Transferable） */
  payload: TPayload;
  /** 主线程要求的最迟完成时间（Date.now() + budget） */
  deadlineMs: number;
  /** 超时是否允许主线程自己跑兜底 */
  fallbackOnTimeout: boolean;
}

/** Worker → 主线程的任务结果 */
export interface WorkerTaskResult<TResult = unknown> {
  /** 对应的任务 ID */
  taskId: string;
  /** 是否成功 */
  ok: boolean;
  /** 成功时的结果 */
  result?: TResult;
  /** 失败时的错误信息 */
  errorMessage?: string;
  /** 任务执行耗时（ms） */
  durationMs: number;
}

/** 任务类型枚举 */
export type WorkerTaskKind =
  | 'envelope-encode'
  | 'pathfind'
  | 'fov'
  | 'instance-advance'
  | 'persistence-build'
  | 'leaderboard-build';

// ─── Encoding Worker 载荷类型 ──────────────────────────────────

/** AOI envelope 编码任务载荷 */
export interface EnvelopeEncodePayload {
  /** 玩家 ID */
  playerId: string;
  /** envelope spec（POJO，由主线程从权威态投影） */
  envelopeSpec: unknown;
}

/** AOI envelope 编码结果 */
export interface EnvelopeEncodeResult {
  /** 编码后的 envelope bytes */
  envelopeBytes: Uint8Array;
}

/** A* 寻路任务载荷 */
export interface PathfindPayload {
  /** 地图 ID（用于 worker 内缓存 staticGrid） */
  mapId: string;
  /** 地图版本（变更时重新传输 staticGrid） */
  mapRevision: number;
  /** 静态网格（首次或版本变更时传输，Transferable） */
  staticGrid?: Uint8Array;
  /** 占位网格 */
  occupied?: Uint8Array;
  /** 地图宽度 */
  width: number;
  /** 地图高度 */
  height: number;
  /** 起点 */
  startX: number;
  startY: number;
  /** 目标点列表 */
  goals: Array<{ x: number; y: number }>;
  /** 搜索限制 */
  maxSteps?: number;
}

/** A* 寻路结果 */
export interface PathfindResult {
  /** 是否找到路径 */
  found: boolean;
  /** 路径点列表 */
  path: Array<{ x: number; y: number }>;
  /** 搜索步数 */
  stepsUsed: number;
}

/** FOV 计算任务载荷 */
export interface FovPayload {
  /** 遮挡视线的 tile mask */
  blocksSightMask: Uint8Array;
  /** 地图宽度 */
  width: number;
  /** 地图高度 */
  height: number;
  /** 观察者位置 */
  originX: number;
  originY: number;
  /** 视野半径 */
  radius: number;
}

/** FOV 计算结果 */
export interface FovResult {
  /** 可见 tile index 列表（Transferable） */
  visibleIndices: Uint32Array;
}

/** 实例 tick 推进任务载荷 */
export interface InstanceAdvancePayload {
  /** 实例 ID */
  instanceId: string;
  /** 当前 tick */
  tick: number;
  /** 实例状态快照（只读镜像） */
  snapshot: unknown;
}

/** 实例 tick 推进结果 */
export interface InstanceAdvanceResult {
  /** 实例 ID */
  instanceId: string;
  /** 产出的 mutation 列表 */
  mutations: unknown[];
}

/** 持久化写计划任务载荷 */
export interface PersistenceBuildPayload {
  /** 玩家 ID */
  playerId: string;
  /** 玩家快照（plain object） */
  snapshot: unknown;
  /** 脏域列表 */
  domains: string[];
  /** 分域写入选项 */
  options: Record<string, unknown>;
}

/** 持久化写计划结果 */
export interface PersistenceBuildResult {
  /** 玩家 ID */
  playerId: string;
  /** 计划包含的脏域 */
  domains: string[];
  /** 可执行 SQL 步骤 */
  steps: Array<{ sql: string; params: unknown[] }>;
}

// ─── Leaderboard Worker 载荷类型 ──────────────────────────────────

/** 排行榜构建任务载荷：主线程把已组装好的 snapshot 数组传给 worker，
 *  worker 只做纯 CPU 的 sort/slice/map。 */
export interface LeaderboardBuildPayload {
  /** 已经在主线程通过 createSnapshot 组装好的扁平 snapshot 数组 */
  snapshots: unknown[];
  /** 主线程已经算好的宗门人数榜（依赖 NestJS DI 服务，worker 不能算） */
  sects: unknown[];
  /** 排行榜上限 */
  limit: number;
}

/** 排行榜构建结果 */
export interface LeaderboardBuildResult {
  /** 8 个 board 的最终结果 */
  boards: {
    realm: unknown[];
    monsterKills: unknown[];
    spiritStones: unknown[];
    playerKills: unknown[];
    deaths: unknown[];
    bodyTraining: unknown[];
    supremeAttrs: unknown[];
    sects: unknown[];
  };
}

// ─── Worker Pool 通用配置 ──────────────────────────────────────

/** Worker Pool 配置 */
export interface WorkerPoolConfig {
  /** worker 线程数量 */
  poolSize: number;
  /** 任务默认超时（ms） */
  defaultDeadlineMs: number;
}

/** Worker Pool 指标 */
export interface WorkerPoolMetrics {
  /** 累计提交任务数 */
  totalSubmitted: number;
  /** 累计完成任务数 */
  totalCompleted: number;
  /** 累计超时任务数 */
  totalTimedOut: number;
  /** 累计异常任务数 */
  totalFailed: number;
  /** 累计 fallback 到主线程的任务数 */
  totalFallback: number;
  /** 最近 100 个任务的 p50 耗时（ms） */
  p50Ms: number;
  /** 最近 100 个任务的 p95 耗时（ms） */
  p95Ms: number;
  /** 当前 in-flight 任务数 */
  inFlight: number;
  /** 池中活跃 worker 数 */
  activeWorkers: number;
}
