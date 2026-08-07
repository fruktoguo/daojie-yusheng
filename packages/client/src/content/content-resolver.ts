/**
 * 本文件负责客户端内容索引、模板读取或本地展示数据解析。
 *
 * 维护时要区分展示缓存与正式配置真源，避免在客户端内容层重新裁定掉落、资产或战斗规则。
 */
/**
 * ContentResolver —— 统一内容模板解析管理器。
 *
 * 三级解析策略：
 *   L1 - 本地静态目录（editor-catalog.generated.json，零延迟）
 *   L2 - 运行时动态缓存（服务端推送或 L3 查询结果，支持 partial/full 两种粒度）
 *   L3 - 按需服务端查询（debounce + batch，50ms 合并窗口，单次最多 50 ID）
 *
 * 设计要点：
 * - getXxx() 同步方法只查 L1+L2，热路径零 IO
 * - fetchXxx() 异步方法在 miss 时触发 L3 批量查询
 * - 支持精简摘要（partial）和完整模板（full）两种缓存状态
 * - 断线重连时清空 L2，Bootstrap 首包重新填充
 */

import type {
  C2S_RequestContentTemplates,
  GmEditorBuffOption,
  GmEditorItemOption,
  GmEditorRealmOption,
  GmEditorTechniqueOption,
  QuestState,
  S2C_ContentTemplates,
  SkillDef,
} from '@mud/shared';
import { LOCAL_EDITOR_CATALOG } from './editor-catalog';

// ─── 内部类型 ────────────────────────────────────────────────────────────────

/** Buff 模板的客户端最小字段集合（与 local-templates.ts 中定义一致）。 */
export type LocalBuffTemplate = {
  buffId: string;
  name: string;
  shortMark?: string;
  category?: 'buff' | 'debuff';
  desc?: string;
  duration?: number;
  maxStacks?: number;
  valueStats?: Record<string, number>;
  stats?: Record<string, number>;
  attrs?: Record<string, number>;
  attrMode?: string;
  statMode?: string;
};

/** L2 缓存条目包装：区分完整模板和精简摘要。 */
interface CacheEntry<T> {
  /** 缓存的模板数据。 */
  data: T;
  /** 是否为完整模板（false = 仅精简摘要，可触发 L3 补全）。 */
  complete: boolean;
}

/** L3 发包回调类型：发送内容模板批量查询请求，并回传是否已交给活动会话。 */
type SendContentRequestFn = (payload: C2S_RequestContentTemplates) => { accepted: boolean };

/** 单域的 pending promise 回调。 */
interface PendingResolve<T> {
  resolve: (value: T | null) => void;
  /** 是否要求完整模板（true = partial 不满足，需要 L3 查询）。 */
  requireFull: boolean;
}

/** 已发出但尚未结算的单域批次。 */
interface InFlightDomain<T> {
  callbacksById: Map<string, Array<PendingResolve<T>>>;
}

type ContentDomainName = 'items' | 'techniques' | 'skills' | 'buffs' | 'quests';

/** 单次内容查询请求 owner；requestId 同时是响应关联与迟到包隔离边界。 */
interface InFlightContentRequest {
  requestId: string;
  timeoutId: ReturnType<typeof setTimeout>;
  items?: InFlightDomain<GmEditorItemOption>;
  techniques?: InFlightDomain<GmEditorTechniqueOption>;
  skills?: InFlightDomain<SkillDef>;
  buffs?: InFlightDomain<LocalBuffTemplate>;
  quests?: InFlightDomain<QuestState>;
}

export interface ContentResolverOptions {
  /** 仅供专项验证缩短 debounce；生产默认使用固定低频窗口。 */
  flushDelayMs?: number;
  /** 仅供专项验证缩短超时；生产默认保证弱网下仍有充足回包时间。 */
  requestTimeoutMs?: number;
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** L3 批量请求的 debounce 延迟（ms）。 */
const FLUSH_DELAY_MS = 50;
/** L3 单次请求每域最大 ID 数。 */
const MAX_BATCH_PER_DOMAIN = 50;
/** L3 请求超时；超时后对应 promise 收敛为 null，迟到包由 requestId 丢弃。 */
const REQUEST_TIMEOUT_MS = 10_000;

// ─── ContentResolver 类 ──────────────────────────────────────────────────────

export class ContentResolver {
  // ═══ L1: 静态目录（模块加载时从 LOCAL_EDITOR_CATALOG 构建，只读） ═══
  private readonly staticItems: ReadonlyMap<string, GmEditorItemOption>;
  private readonly staticTechniques: ReadonlyMap<string, GmEditorTechniqueOption>;
  private readonly staticSkills: ReadonlyMap<string, SkillDef>;
  private readonly staticBuffs: ReadonlyMap<string, LocalBuffTemplate>;
  private readonly staticQuests: ReadonlyMap<string, QuestState>;
  private readonly staticRealmLevels: ReadonlyMap<number, GmEditorRealmOption>;

  // ═══ L2: 运行时动态缓存 ═══
  private readonly dynamicItems = new Map<string, CacheEntry<GmEditorItemOption>>();
  private readonly dynamicTechniques = new Map<string, CacheEntry<GmEditorTechniqueOption>>();
  private readonly dynamicSkills = new Map<string, CacheEntry<SkillDef>>();
  private readonly dynamicBuffs = new Map<string, CacheEntry<LocalBuffTemplate>>();
  private readonly dynamicQuests = new Map<string, CacheEntry<QuestState>>();

  // ═══ L3: 批量查询队列 ═══
  private readonly pendingItems = new Map<string, Array<PendingResolve<GmEditorItemOption>>>();
  private readonly pendingTechniques = new Map<string, Array<PendingResolve<GmEditorTechniqueOption>>>();
  private readonly pendingSkills = new Map<string, Array<PendingResolve<SkillDef>>>();
  private readonly pendingBuffs = new Map<string, Array<PendingResolve<LocalBuffTemplate>>>();
  private readonly pendingQuests = new Map<string, Array<PendingResolve<QuestState>>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** 按 requestId 保存已发送批次，响应只允许结算精确命中的 owner。 */
  private readonly inFlightRequests = new Map<string, InFlightContentRequest>();
  /** 单域 ID 到 requestId 的反向索引，用于合并同 ID 的并发调用。 */
  private readonly inFlightRequestIdByDomain: Record<ContentDomainName, Map<string, string>> = {
    items: new Map(),
    techniques: new Map(),
    skills: new Map(),
    buffs: new Map(),
    quests: new Map(),
  };
  private requestSequence = 0;
  private readonly flushDelayMs: number;
  private readonly requestTimeoutMs: number;

  // ═══ 依赖：延迟注入的发包函数 ═══
  private sendContentRequest: SendContentRequestFn | null = null;

  constructor(options: ContentResolverOptions = {}) {
    this.flushDelayMs = normalizeDelay(options.flushDelayMs, FLUSH_DELAY_MS, 0);
    this.requestTimeoutMs = normalizeDelay(options.requestTimeoutMs, REQUEST_TIMEOUT_MS, 1);
    // 构建 L1 静态索引
    this.staticItems = new Map(
      LOCAL_EDITOR_CATALOG.items.map((item) => [item.itemId, item] as const),
    );
    this.staticTechniques = new Map(
      LOCAL_EDITOR_CATALOG.techniques.map((t) => [t.id, t] as const),
    );
    this.staticSkills = new Map(
      LOCAL_EDITOR_CATALOG.techniques.flatMap((t) =>
        (t.skills ?? []).map((s) => [s.id, s] as const),
      ),
    );
    this.staticBuffs = new Map(
      LOCAL_EDITOR_CATALOG.techniques.flatMap((t) =>
        (t.skills ?? []).flatMap((s) =>
          s.effects.flatMap((e) =>
            e.type === 'buff'
              ? [[e.buffId, {
                  buffId: e.buffId,
                  name: e.name,
                  shortMark: e.shortMark,
                  category: e.category,
                  desc: e.desc,
                  duration: e.duration,
                  maxStacks: e.maxStacks,
                  valueStats: e.valueStats as Record<string, number> | undefined,
                  stats: e.stats as Record<string, number> | undefined,
                  attrs: e.attrs as Record<string, number> | undefined,
                  attrMode: e.attrMode,
                  statMode: e.statMode,
                } satisfies LocalBuffTemplate] as const]
              : [],
          ),
        ),
      ),
    );
    this.staticQuests = new Map(
      (LOCAL_EDITOR_CATALOG.quests ?? []).map((q) => [q.id, q] as const),
    );
    this.staticRealmLevels = new Map(
      LOCAL_EDITOR_CATALOG.realmLevels.map((r) => [r.realmLv, r] as const),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 生命周期
  // ═══════════════════════════════════════════════════════════════════════════

  /** 注入发包函数（socket 就绪后调用）。 */
  bindEmitter(sendFn: SendContentRequestFn): void {
    this.sendContentRequest = sendFn;
  }

  /** 断线重连时清空 L2 动态缓存和所有 pending 请求。 */
  clearDynamicCache(): void {
    this.dynamicItems.clear();
    this.dynamicTechniques.clear();
    this.dynamicSkills.clear();
    this.dynamicBuffs.clear();
    this.dynamicQuests.clear();
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // 所有 pending/in-flight promise 都以 null 收敛；旧 requestId 的迟到包随后会被忽略。
    this.rejectAllPending();
    this.rejectAllInFlight();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 同步查询（L1 + L2，热路径零 IO）
  // ═══════════════════════════════════════════════════════════════════════════

  /** 查询物品模板（同步，L1+L2）。 */
  getItem(itemId: string): GmEditorItemOption | null {
    return this.staticItems.get(itemId)
      ?? this.dynamicItems.get(itemId)?.data
      ?? null;
  }

  /** 查询功法模板（同步，L1+L2）。 */
  getTechnique(techId: string): GmEditorTechniqueOption | null {
    return this.staticTechniques.get(techId)
      ?? this.dynamicTechniques.get(techId)?.data
      ?? null;
  }

  /** 查询技能模板（同步，L1+L2）。 */
  getSkill(skillId: string): SkillDef | null {
    return this.staticSkills.get(skillId)
      ?? this.dynamicSkills.get(skillId)?.data
      ?? null;
  }

  /** 查询 Buff 模板（同步，L1+L2）。 */
  getBuff(buffId: string): LocalBuffTemplate | null {
    return this.staticBuffs.get(buffId)
      ?? this.dynamicBuffs.get(buffId)?.data
      ?? null;
  }

  /** 查询任务模板（同步，L1+L2）。 */
  getQuest(questId: string): QuestState | null {
    return this.staticQuests.get(questId)
      ?? this.dynamicQuests.get(questId)?.data
      ?? null;
  }

  /** 查询境界等级配置（同步，仅 L1，境界配置不会动态变化）。 */
  getRealmLevel(realmLv: number | undefined): GmEditorRealmOption | null {
    if (!Number.isFinite(realmLv)) {
      return null;
    }
    return this.staticRealmLevels.get(Math.max(1, Math.floor(Number(realmLv)))) ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 异步查询（L1+L2 miss 时触发 L3 批量请求）
  // ═══════════════════════════════════════════════════════════════════════════

  /** 异步获取物品完整模板。L1+L2(full) 命中立即返回，否则触发 L3。 */
  fetchItem(itemId: string): Promise<GmEditorItemOption | null> {
    const cached = this.getCompleteItem(itemId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue('items', this.pendingItems, itemId, true);
  }

  /** 异步获取功法完整模板。 */
  fetchTechnique(techId: string): Promise<GmEditorTechniqueOption | null> {
    const cached = this.getCompleteTechnique(techId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue('techniques', this.pendingTechniques, techId, true);
  }

  /** 异步获取技能完整模板。 */
  fetchSkill(skillId: string): Promise<SkillDef | null> {
    const cached = this.getSkill(skillId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue('skills', this.pendingSkills, skillId, true);
  }

  /** 异步获取 Buff 完整模板。 */
  fetchBuff(buffId: string): Promise<LocalBuffTemplate | null> {
    const cached = this.getBuff(buffId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue('buffs', this.pendingBuffs, buffId, true);
  }

  /** 异步获取任务完整模板。 */
  fetchQuest(questId: string): Promise<QuestState | null> {
    const cached = this.getQuest(questId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue('quests', this.pendingQuests, questId, true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 注入方法（服务端推送 → 填充 L2）
  // ═══════════════════════════════════════════════════════════════════════════

  /** 注入完整物品模板到 L2 缓存。 */
  injectItems(items: GmEditorItemOption[]): void {
    for (const item of items) {
      this.dynamicItems.set(item.itemId, { data: item, complete: true });
    }
  }

  /** 注入完整功法模板到 L2 缓存。 */
  injectTechniques(techniques: GmEditorTechniqueOption[]): void {
    for (const t of techniques) {
      this.dynamicTechniques.set(t.id, { data: t, complete: true });
    }
  }

  /** 注入完整技能模板到 L2 缓存。 */
  injectSkills(skills: SkillDef[]): void {
    for (const s of skills) {
      this.dynamicSkills.set(s.id, { data: s, complete: true });
    }
  }

  /** 注入完整 Buff 模板到 L2 缓存。 */
  injectBuffs(buffs: GmEditorBuffOption[]): void {
    for (const b of buffs) {
      const legacyValueStats = 'valueStats' in b
        ? (b as { valueStats?: Record<string, number> }).valueStats
        : undefined;
      this.dynamicBuffs.set(b.buffId, {
        data: {
          buffId: b.buffId,
          name: b.name,
          shortMark: b.shortMark,
          category: b.category,
          desc: b.desc,
          duration: b.duration,
          maxStacks: b.maxStacks,
          valueStats: legacyValueStats,
          stats: b.stats as Record<string, number> | undefined,
          attrs: b.attrs as Record<string, number> | undefined,
          attrMode: b.attrMode,
          statMode: b.statMode,
        },
        complete: true,
      });
    }
  }

  /** 注入完整任务模板到 L2 缓存。 */
  injectQuests(quests: QuestState[]): void {
    for (const q of quests) {
      this.dynamicQuests.set(q.id, { data: q, complete: true });
    }
  }

  /**
   * 注入精简摘要到 L2（partial 缓存）。
   * 用于从服务端高频下发数据中提取最小展示字段，不覆盖已有的完整模板。
   */
  injectItemSummary(itemId: string, partial: Partial<GmEditorItemOption>): void {
    const existing = this.dynamicItems.get(itemId);
    if (existing?.complete) {
      return; // 已有完整模板，不降级
    }
    this.dynamicItems.set(itemId, {
      data: { itemId, name: '', type: 'misc', ...partial } as GmEditorItemOption,
      complete: false,
    });
  }

  /** 查询可用于详情页的完整物品模板；精简摘要只能供同步展示，不可阻断 L3 补全。 */
  private getCompleteItem(itemId: string): GmEditorItemOption | null {
    const staticItem = this.staticItems.get(itemId);
    if (staticItem) {
      return staticItem;
    }
    const dynamicItem = this.dynamicItems.get(itemId);
    return dynamicItem?.complete ? dynamicItem.data : null;
  }

  /** 查询可用于详情页的完整功法模板；精简摘要不能替代强度等静态详情。 */
  private getCompleteTechnique(techId: string): GmEditorTechniqueOption | null {
    const staticTechnique = this.staticTechniques.get(techId);
    if (staticTechnique) {
      return staticTechnique;
    }
    const dynamicTechnique = this.dynamicTechniques.get(techId);
    return dynamicTechnique?.complete ? dynamicTechnique.data : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S2C 响应处理
  // ═══════════════════════════════════════════════════════════════════════════

  /** 处理服务端返回的内容模板批量响应。 */
  handleContentTemplatesResponse(payload: S2C_ContentTemplates): void {
    const request = this.inFlightRequests.get(payload.requestId);
    if (!request) {
      // 超时、断线清理或未知 requestId 的响应不得回填缓存，更不能结算新批次。
      return;
    }
    clearTimeout(request.timeoutId);
    this.inFlightRequests.delete(request.requestId);

    if (request.items) {
      const results = this.filterRequestedResults(request.items, payload.items ?? [], (item) => item.itemId);
      this.injectItems(results);
      this.resolveInFlightDomain(request.requestId, 'items', request.items, results, (item) => item.itemId);
    }
    if (request.techniques) {
      const results = this.filterRequestedResults(request.techniques, payload.techniques ?? [], (technique) => technique.id);
      this.injectTechniques(results);
      this.resolveInFlightDomain(request.requestId, 'techniques', request.techniques, results, (technique) => technique.id);
    }
    if (request.skills) {
      const results = this.filterRequestedResults(request.skills, payload.skills ?? [], (skill) => skill.id);
      this.injectSkills(results);
      this.resolveInFlightDomain(request.requestId, 'skills', request.skills, results, (skill) => skill.id);
    }
    if (request.buffs) {
      const rawResults = this.filterRequestedResults(request.buffs, payload.buffs ?? [], (buff) => buff.buffId);
      this.injectBuffs(rawResults);
      const results = rawResults
        .map((buff) => this.dynamicBuffs.get(buff.buffId)?.data)
        .filter((buff): buff is LocalBuffTemplate => Boolean(buff));
      this.resolveInFlightDomain(request.requestId, 'buffs', request.buffs, results, (buff) => buff.buffId);
    }
    if (request.quests) {
      const results = this.filterRequestedResults(request.quests, payload.quests ?? [], (quest) => quest.id);
      this.injectQuests(results);
      this.resolveInFlightDomain(request.requestId, 'quests', request.quests, results, (quest) => quest.id);
    }

    if (this.hasPendingRequests()) {
      this.scheduleFlush();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3 内部：debounce + batch
  // ═══════════════════════════════════════════════════════════════════════════

  private enqueue<T>(
    domainName: ContentDomainName,
    pendingMap: Map<string, Array<PendingResolve<T>>>,
    id: string,
    requireFull: boolean,
  ): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      const inFlightCallbacks = this.getInFlightCallbacks<T>(domainName, id);
      if (inFlightCallbacks) {
        inFlightCallbacks.push({ resolve, requireFull });
        return;
      }
      let list = pendingMap.get(id);
      if (!list) {
        list = [];
        pendingMap.set(id, list);
      }
      list.push({ resolve, requireFull });
      this.scheduleFlush();
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushDelayMs);
  }

  private flush(): void {
    if (!this.sendContentRequest) {
      // 发包函数未注入，静默 resolve null
      this.rejectAllPending();
      return;
    }

    const requestId = this.createRequestId();
    const items = this.collectDomainBatch(requestId, 'items', this.pendingItems);
    const techniques = this.collectDomainBatch(requestId, 'techniques', this.pendingTechniques);
    const skills = this.collectDomainBatch(requestId, 'skills', this.pendingSkills);
    const buffs = this.collectDomainBatch(requestId, 'buffs', this.pendingBuffs);
    const quests = this.collectDomainBatch(requestId, 'quests', this.pendingQuests);
    if (!items && !techniques && !skills && !buffs && !quests) {
      return;
    }

    const payload: C2S_RequestContentTemplates = {
      requestId,
      ...(items ? { items: [...items.callbacksById.keys()] } : undefined),
      ...(techniques ? { techniques: [...techniques.callbacksById.keys()] } : undefined),
      ...(skills ? { skills: [...skills.callbacksById.keys()] } : undefined),
      ...(buffs ? { buffs: [...buffs.callbacksById.keys()] } : undefined),
      ...(quests ? { quests: [...quests.callbacksById.keys()] } : undefined),
    };
    const request: InFlightContentRequest = {
      requestId,
      timeoutId: setTimeout(() => this.handleRequestTimeout(requestId), this.requestTimeoutMs),
      ...(items ? { items } : undefined),
      ...(techniques ? { techniques } : undefined),
      ...(skills ? { skills } : undefined),
      ...(buffs ? { buffs } : undefined),
      ...(quests ? { quests } : undefined),
    };
    this.inFlightRequests.set(requestId, request);
    try {
      const result = this.sendContentRequest(payload);
      if (!result.accepted) {
        this.rejectInFlightRequest(requestId);
      }
    } catch {
      this.rejectInFlightRequest(requestId);
    }

    if (this.hasPendingRequests()) {
      this.scheduleFlush();
    }
  }

  private createRequestId(): string {
    this.requestSequence += 1;
    return `ct:${this.requestSequence.toString(36)}`;
  }

  private collectDomainBatch<T>(
    requestId: string,
    domainName: ContentDomainName,
    pendingMap: Map<string, Array<PendingResolve<T>>>,
  ): InFlightDomain<T> | undefined {
    if (pendingMap.size === 0) {
      return undefined;
    }
    const callbacksById = new Map<string, Array<PendingResolve<T>>>();
    for (const [id, callbacks] of pendingMap) {
      callbacksById.set(id, callbacks);
      pendingMap.delete(id);
      this.inFlightRequestIdByDomain[domainName].set(id, requestId);
      if (callbacksById.size >= MAX_BATCH_PER_DOMAIN) {
        break;
      }
    }
    return { callbacksById };
  }

  private getInFlightCallbacks<T>(domainName: ContentDomainName, id: string): Array<PendingResolve<T>> | null {
    const requestId = this.inFlightRequestIdByDomain[domainName].get(id);
    if (!requestId) {
      return null;
    }
    const request = this.inFlightRequests.get(requestId);
    const domain = request?.[domainName] as InFlightDomain<T> | undefined;
    return domain?.callbacksById.get(id) ?? null;
  }

  private filterRequestedResults<T, TResult>(
    domain: InFlightDomain<T>,
    results: TResult[],
    getId: (item: TResult) => string,
  ): TResult[] {
    return results.filter((item) => domain.callbacksById.has(getId(item)));
  }

  private resolveInFlightDomain<T>(
    requestId: string,
    domainName: ContentDomainName,
    domain: InFlightDomain<T>,
    results: T[],
    getId: (item: T) => string,
  ): void {
    const resultMap = new Map(results.map((result) => [getId(result), result]));
    for (const [id, callbacks] of domain.callbacksById) {
      if (this.inFlightRequestIdByDomain[domainName].get(id) === requestId) {
        this.inFlightRequestIdByDomain[domainName].delete(id);
      }
      const result = resultMap.get(id) ?? null;
      for (const callback of callbacks) {
        callback.resolve(result);
      }
    }
    domain.callbacksById.clear();
  }

  private rejectInFlightDomain<T>(
    requestId: string,
    domainName: ContentDomainName,
    domain: InFlightDomain<T> | undefined,
  ): void {
    if (!domain) {
      return;
    }
    for (const [id, callbacks] of domain.callbacksById) {
      if (this.inFlightRequestIdByDomain[domainName].get(id) === requestId) {
        this.inFlightRequestIdByDomain[domainName].delete(id);
      }
      for (const callback of callbacks) {
        callback.resolve(null);
      }
    }
    domain.callbacksById.clear();
  }

  private rejectInFlightRequest(requestId: string): void {
    const request = this.inFlightRequests.get(requestId);
    if (!request) {
      return;
    }
    clearTimeout(request.timeoutId);
    this.inFlightRequests.delete(requestId);
    this.rejectInFlightDomain(requestId, 'items', request.items);
    this.rejectInFlightDomain(requestId, 'techniques', request.techniques);
    this.rejectInFlightDomain(requestId, 'skills', request.skills);
    this.rejectInFlightDomain(requestId, 'buffs', request.buffs);
    this.rejectInFlightDomain(requestId, 'quests', request.quests);
  }

  private handleRequestTimeout(requestId: string): void {
    this.rejectInFlightRequest(requestId);
    if (this.hasPendingRequests()) {
      this.scheduleFlush();
    }
  }

  private hasPendingRequests(): boolean {
    return this.pendingItems.size > 0
      || this.pendingTechniques.size > 0
      || this.pendingSkills.size > 0
      || this.pendingBuffs.size > 0
      || this.pendingQuests.size > 0;
  }

  private rejectAllPending(): void {
    const allMaps = [
      this.pendingItems,
      this.pendingTechniques,
      this.pendingSkills,
      this.pendingBuffs,
      this.pendingQuests,
    ];
    for (const map of allMaps) {
      for (const callbacks of map.values()) {
        for (const cb of callbacks) {
          cb.resolve(null);
        }
      }
      map.clear();
    }
  }

  private rejectAllInFlight(): void {
    for (const requestId of [...this.inFlightRequests.keys()]) {
      this.rejectInFlightRequest(requestId);
    }
  }
}

function normalizeDelay(value: number | undefined, fallback: number, minimum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.trunc(Number(value)));
}

// ─── 模块级单例 ──────────────────────────────────────────────────────────────

/** 全局 ContentResolver 单例。L1 在 import 时从 LOCAL_EDITOR_CATALOG 填充。 */
export const contentResolver = new ContentResolver();
