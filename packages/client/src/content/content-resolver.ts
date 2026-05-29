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

/** L3 发包回调类型：发送内容模板批量查询请求。 */
type SendContentRequestFn = (payload: C2S_RequestContentTemplates) => void;

/** 单域的 pending promise 回调。 */
interface PendingResolve<T> {
  resolve: (value: T | null) => void;
  /** 是否要求完整模板（true = partial 不满足，需要 L3 查询）。 */
  requireFull: boolean;
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

/** L3 批量请求的 debounce 延迟（ms）。 */
const FLUSH_DELAY_MS = 50;
/** L3 单次请求每域最大 ID 数。 */
const MAX_BATCH_PER_DOMAIN = 50;

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

  // ═══ 依赖：延迟注入的发包函数 ═══
  private sendContentRequest: SendContentRequestFn | null = null;

  constructor() {
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
    // reject 所有 pending
    this.rejectAllPending();
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
    const cached = this.getItem(itemId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue(this.pendingItems, itemId, true);
  }

  /** 异步获取功法完整模板。 */
  fetchTechnique(techId: string): Promise<GmEditorTechniqueOption | null> {
    const cached = this.getTechnique(techId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue(this.pendingTechniques, techId, true);
  }

  /** 异步获取技能完整模板。 */
  fetchSkill(skillId: string): Promise<SkillDef | null> {
    const cached = this.getSkill(skillId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue(this.pendingSkills, skillId, true);
  }

  /** 异步获取 Buff 完整模板。 */
  fetchBuff(buffId: string): Promise<LocalBuffTemplate | null> {
    const cached = this.getBuff(buffId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue(this.pendingBuffs, buffId, true);
  }

  /** 异步获取任务完整模板。 */
  fetchQuest(questId: string): Promise<QuestState | null> {
    const cached = this.getQuest(questId);
    if (cached) {
      return Promise.resolve(cached);
    }
    return this.enqueue(this.pendingQuests, questId, true);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // S2C 响应处理
  // ═══════════════════════════════════════════════════════════════════════════

  /** 处理服务端返回的内容模板批量响应。 */
  handleContentTemplatesResponse(payload: S2C_ContentTemplates): void {
    // 注入 L2
    if (payload.items) {
      this.injectItems(payload.items);
    }
    if (payload.techniques) {
      this.injectTechniques(payload.techniques);
    }
    if (payload.skills) {
      this.injectSkills(payload.skills);
    }
    if (payload.buffs) {
      this.injectBuffs(payload.buffs);
    }
    if (payload.quests) {
      this.injectQuests(payload.quests);
    }

    // resolve pending promises
    this.resolvePendingDomain(this.pendingItems, payload.items ?? [], (t) => t.itemId);
    this.resolvePendingDomain(this.pendingTechniques, payload.techniques ?? [], (t) => t.id);
    this.resolvePendingDomain(this.pendingSkills, payload.skills ?? [], (t) => t.id);
    this.resolvePendingDomain(
      this.pendingBuffs,
      (payload.buffs ?? []).map((b) => this.dynamicBuffs.get(b.buffId)?.data).filter(Boolean) as LocalBuffTemplate[],
      (t) => t.buffId,
    );
    this.resolvePendingDomain(this.pendingQuests, payload.quests ?? [], (t) => t.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // L3 内部：debounce + batch
  // ═══════════════════════════════════════════════════════════════════════════

  private enqueue<T>(
    pendingMap: Map<string, Array<PendingResolve<T>>>,
    id: string,
    requireFull: boolean,
  ): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
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
    }, FLUSH_DELAY_MS);
  }

  private flush(): void {
    if (!this.sendContentRequest) {
      // 发包函数未注入，静默 resolve null
      this.rejectAllPending();
      return;
    }

    const batch: C2S_RequestContentTemplates = {};

    if (this.pendingItems.size > 0) {
      batch.items = this.collectIds(this.pendingItems);
    }
    if (this.pendingTechniques.size > 0) {
      batch.techniques = this.collectIds(this.pendingTechniques);
    }
    if (this.pendingSkills.size > 0) {
      batch.skills = this.collectIds(this.pendingSkills);
    }
    if (this.pendingBuffs.size > 0) {
      batch.buffs = this.collectIds(this.pendingBuffs);
    }
    if (this.pendingQuests.size > 0) {
      batch.quests = this.collectIds(this.pendingQuests);
    }

    const hasContent = batch.items || batch.techniques || batch.skills || batch.buffs || batch.quests;
    if (!hasContent) {
      return;
    }

    this.sendContentRequest(batch);
  }

  private collectIds<T>(pendingMap: Map<string, Array<PendingResolve<T>>>): string[] {
    const ids = Array.from(pendingMap.keys());
    return ids.slice(0, MAX_BATCH_PER_DOMAIN);
  }

  private resolvePendingDomain<T>(
    pendingMap: Map<string, Array<PendingResolve<T>>>,
    results: T[],
    getId: (item: T) => string,
  ): void {
    const resultMap = new Map(results.map((r) => [getId(r), r]));

    for (const [id, callbacks] of pendingMap) {
      const result = resultMap.get(id) ?? null;
      for (const cb of callbacks) {
        cb.resolve(result);
      }
    }
    pendingMap.clear();
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
}

// ─── 模块级单例 ──────────────────────────────────────────────────────────────

/** 全局 ContentResolver 单例。L1 在 import 时从 LOCAL_EDITOR_CATALOG 填充。 */
export const contentResolver = new ContentResolver();
