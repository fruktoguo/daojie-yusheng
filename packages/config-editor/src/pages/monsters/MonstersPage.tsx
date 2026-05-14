import { useState, useEffect, useCallback, useMemo } from 'react';
import { SectionPageLayout, Card, Button, Input, Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDisplayNumber } from '../../lib/format';
import { toast } from '../../ui/Toast';
import type { LocalMonsterTemplateEntry, LocalEditorItemOption, MonsterTemplateRecord } from '../../types/api';
import {
  resolveMonsterTemplateRecord,
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  MONSTER_TIER_ORDER,
  MONSTER_TIER_LABELS,
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_GRADE_LABELS,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_LABELS,
  ITEM_TYPE_LABELS,
} from '@mud/shared';
import type { MonsterAggroMode, MonsterInitialBuffDef } from '@mud/shared';
import monsterRealmBaselines from '../../../../server/data/content/realm-attr-baselines.json';

const AGGRO_MODES: Array<{ value: MonsterAggroMode; label: string }> = [
  { value: 'always', label: '主动 (always)' },
  { value: 'retaliate', label: '反击 (retaliate)' },
  { value: 'day_only', label: '日间主动 (day_only)' },
  { value: 'night_only', label: '夜间主动 (night_only)' },
];

/** 倾向 tab 中可编辑的基础数值键，跟 monster.ts 的 MONSTER_TENDENCY_NUMERIC_KEYS 对齐。 */
const STAT_TENDENCY_KEYS = [
  'maxHp',
  'maxQi',
  'physAtk',
  'spellAtk',
  'physDef',
  'spellDef',
  'hit',
  'dodge',
  'crit',
  'antiCrit',
  'critDamage',
  'breakPower',
  'resolvePower',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
  'viewRange',
  'moveSpeed',
] as const;

type StatTendencyKey = typeof STAT_TENDENCY_KEYS[number];

/** 把数字字符串转成正整数，无效返回 undefined。 */
function parsePositiveInt(value: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.floor(num);
}

/** 把数字字符串转成 >= 0 的整数；无效返回 undefined。 */
function parseNonNegativeInt(value: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.floor(num);
}

/** 把数字字符串转浮点；无效返回 undefined。 */
function parseFloatOrUndef(value: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

export default function MonstersPage() {
  const [entries, setEntries] = useState<LocalMonsterTemplateEntry[]>([]);
  const [catalog, setCatalog] = useState<LocalEditorItemOption[]>([]);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<MonsterTemplateRecord | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [initialBuffsText, setInitialBuffsText] = useState('');
  const [initialBuffsError, setInitialBuffsError] = useState<string | null>(null);
  const dirty = draft != null && JSON.stringify(draft) !== savedJson;

  const catalogMap = useMemo(() => new Map(catalog.map(i => [i.itemId, i])), [catalog]);

  const loadList = useCallback(async () => {
    try {
      const [mRes, cRes] = await Promise.all([api.monsters.list(), api.editorCatalog.get()]);
      setEntries(mRes.monsters);
      setCatalog(cRes.items);
    } catch (e) {
      toast.error(`加载失败: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const selectMonster = (entry: LocalMonsterTemplateEntry) => {
    if (dirty && !confirm('当前有未保存修改，确认切换？')) return;
    setSelectedKey(entry.key);
    setDraft({ ...entry.monster });
    setSavedJson(JSON.stringify(entry.monster));
    setInitialBuffsText(entry.monster.initialBuffs ? JSON.stringify(entry.monster.initialBuffs, null, 2) : '');
    setInitialBuffsError(null);
  };

  const updateField = <K extends keyof MonsterTemplateRecord>(key: K, value: MonsterTemplateRecord[K]) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
  };

  const resolved = useMemo(() => {
    if (!draft) return null;
    try {
      return resolveMonsterTemplateRecord(draft as unknown as Record<string, unknown>, catalogMap, monsterRealmBaselines as never);
    } catch { return null; }
  }, [draft, catalogMap]);

  const handleSave = async () => {
    if (!selectedKey || !draft) return;

    // 把 initialBuffs JSON 文本同步进 draft（容错：空字符串视作清空）
    let initialBuffs: MonsterInitialBuffDef[] | undefined;
    const trimmed = initialBuffsText.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error('initialBuffs 必须是数组');
        }
        initialBuffs = parsed as MonsterInitialBuffDef[];
      } catch (e) {
        setInitialBuffsError(`initialBuffs JSON 非法：${(e as Error).message}`);
        toast.error('initialBuffs JSON 非法');
        return;
      }
    }
    const payload: MonsterTemplateRecord = { ...draft, initialBuffs };

    try {
      const res = await api.monsters.save(selectedKey, payload);
      setSavedJson(JSON.stringify(res.monster));
      setDraft(res.monster);
      setInitialBuffsText(res.monster.initialBuffs ? JSON.stringify(res.monster.initialBuffs, null, 2) : '');
      setInitialBuffsError(null);
      toast.success(`保存成功，更新了 ${res.updatedMapCount} 张地图`);
      loadList();
    } catch (e) {
      toast.error(`保存失败: ${(e as Error).message}`);
    }
  };

  const handleReload = () => {
    const entry = entries.find(e => e.key === selectedKey);
    if (!entry) return;
    setDraft({ ...entry.monster });
    setSavedJson(JSON.stringify(entry.monster));
    setInitialBuffsText(entry.monster.initialBuffs ? JSON.stringify(entry.monster.initialBuffs, null, 2) : '');
    setInitialBuffsError(null);
    toast.info('已重载');
  };

  const filtered = entries.filter(e =>
    e.key.toLowerCase().includes(search.toLowerCase()) ||
    e.monster.name?.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => {
    const aLv = a.monster.level ?? 1;
    const bLv = b.monster.level ?? 1;
    if (aLv !== bLv) return bLv - aLv;
    const aTier = MONSTER_TIER_ORDER.indexOf(a.monster.tier);
    const bTier = MONSTER_TIER_ORDER.indexOf(b.monster.tier);
    if (aTier !== bTier) return bTier - aTier;
    const aGrade = TECHNIQUE_GRADE_ORDER.indexOf(a.monster.grade);
    const bGrade = TECHNIQUE_GRADE_ORDER.indexOf(b.monster.grade);
    if (aGrade !== bGrade) return bGrade - aGrade;
    return (a.monster.name || a.key).localeCompare(b.monster.name || b.key, 'zh-CN');
  });

  return (
    <SectionPageLayout title="怪物编辑">
      <div className="flex h-full">
        {/* List */}
        <div className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-2">
            <Input placeholder="搜索怪物..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {filtered.map(e => (
              <button
                key={e.key}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-sm truncate',
                  selectedKey === e.key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
                onClick={() => selectMonster(e)}
              >
                <span className="font-medium">{e.monster.name || e.key}</span>
                <span className="ml-1 text-xs opacity-60">Lv{e.monster.level ?? '?'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {draft && selectedKey ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <span className="text-sm font-medium">
                  {draft.name || selectedKey}
                  <span className="ml-2 text-xs text-muted-foreground">持久化口径：tendency 模式（attrTendency + statTendency）</span>
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReload}>重载</Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty}>保存</Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <Tabs defaultValue="basic">
                  <TabsList>
                    <TabsTrigger value="basic">基础</TabsTrigger>
                    <TabsTrigger value="behavior">行为</TabsTrigger>
                    <TabsTrigger value="attrTendency">六维倾向</TabsTrigger>
                    <TabsTrigger value="statTendency">基础数值倾向</TabsTrigger>
                    <TabsTrigger value="equip">装备</TabsTrigger>
                    <TabsTrigger value="skills">技能</TabsTrigger>
                    <TabsTrigger value="drops">掉落</TabsTrigger>
                    <TabsTrigger value="initialBuffs">初始 Buff</TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">ID</span>
                        <Input value={draft.id ?? ''} onChange={e => updateField('id', e.target.value)} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">名称</span>
                        <Input value={draft.name ?? ''} onChange={e => updateField('name', e.target.value)} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">字符 (char)</span>
                        <Input value={draft.char ?? ''} onChange={e => updateField('char', e.target.value)} />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">颜色 (color)</span>
                        <div className="flex items-center gap-2">
                          <Input value={draft.color ?? ''} onChange={e => updateField('color', e.target.value)} />
                          <input
                            type="color"
                            value={/^#[0-9a-fA-F]{6}$/.test(draft.color ?? '') ? draft.color : '#ffffff'}
                            onChange={e => updateField('color', e.target.value)}
                            className="h-8 w-10 rounded border border-input"
                          />
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded border border-input text-base font-bold"
                            style={{ color: draft.color || '#ffffff', background: 'rgba(0,0,0,0.45)' }}
                          >
                            {draft.char || '?'}
                          </span>
                        </div>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">等级</span>
                        <Input
                          type="number"
                          value={draft.level ?? ''}
                          onChange={e => updateField('level', parsePositiveInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">品阶</span>
                        <select
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={draft.grade ?? 'mortal'}
                          onChange={e => updateField('grade', e.target.value as never)}
                        >
                          {Object.entries(TECHNIQUE_GRADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">阶级</span>
                        <select
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={draft.tier ?? ''}
                          onChange={e => updateField('tier', e.target.value as never)}
                        >
                          {MONSTER_TIER_ORDER.map(t => <option key={t} value={t}>{MONSTER_TIER_LABELS[t]}</option>)}
                        </select>
                      </label>
                    </div>
                  </TabsContent>

                  <TabsContent value="behavior">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">仇恨模式 (aggroMode)</span>
                        <select
                          className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={draft.aggroMode ?? 'always'}
                          onChange={e => updateField('aggroMode', e.target.value as never)}
                        >
                          {AGGRO_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">刷新数量 (count)</span>
                        <Input
                          type="number"
                          value={draft.count ?? ''}
                          onChange={e => updateField('count', parsePositiveInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">最大同时存活 (maxAlive)</span>
                        <Input
                          type="number"
                          value={draft.maxAlive ?? ''}
                          onChange={e => updateField('maxAlive', parsePositiveInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">刷新半径 (radius)</span>
                        <Input
                          type="number"
                          value={draft.radius ?? ''}
                          onChange={e => updateField('radius', parseNonNegativeInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">仇恨范围 (aggroRange)</span>
                        <Input
                          type="number"
                          value={draft.aggroRange ?? ''}
                          onChange={e => updateField('aggroRange', parseNonNegativeInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">视野范围 (viewRange)</span>
                        <Input
                          type="number"
                          value={draft.viewRange ?? ''}
                          onChange={e => updateField('viewRange', parseNonNegativeInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">复活时间 (respawnSec)</span>
                        <Input
                          type="number"
                          value={draft.respawnSec ?? ''}
                          onChange={e => updateField('respawnSec', parsePositiveInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">复活 ticks (respawnTicks，可选)</span>
                        <Input
                          type="number"
                          value={draft.respawnTicks ?? ''}
                          onChange={e => updateField('respawnTicks', parsePositiveInt(e.target.value) as never)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted-foreground">经验倍率 (expMultiplier，可选)</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.expMultiplier ?? ''}
                          onChange={e => updateField('expMultiplier', parseFloatOrUndef(e.target.value) as never)}
                        />
                      </label>
                    </div>
                  </TabsContent>

                  <TabsContent value="attrTendency">
                    <div className="text-xs text-muted-foreground mb-2">六维倾向百分比，缺省字段按 100% 处理。</div>
                    <div className="grid grid-cols-3 gap-3">
                      {ATTR_KEYS.map(k => (
                        <label key={k} className="space-y-1">
                          <span className="text-xs text-muted-foreground">{ATTR_KEY_LABELS[k]}</span>
                          <Input
                            type="number"
                            placeholder="100"
                            value={(draft.attrTendency as Record<string, number> | undefined)?.[k] ?? ''}
                            onChange={e => {
                              const v = parseNonNegativeInt(e.target.value);
                              const tendency = { ...(draft.attrTendency as Record<string, number> | undefined) };
                              if (v === undefined) {
                                delete tendency[k];
                              } else {
                                tendency[k] = v;
                              }
                              updateField('attrTendency', (Object.keys(tendency).length > 0 ? tendency : undefined) as never);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="statTendency">
                    <div className="text-xs text-muted-foreground mb-2">基础数值倾向百分比，缺省字段按 100% 处理。</div>
                    <div className="grid grid-cols-3 gap-3">
                      {STAT_TENDENCY_KEYS.map(k => (
                        <label key={k} className="space-y-1">
                          <span className="text-xs text-muted-foreground">{NUMERIC_SCALAR_STAT_LABELS[k] ?? k}</span>
                          <Input
                            type="number"
                            placeholder="100"
                            value={(draft.statTendency as Record<string, number> | undefined)?.[k] ?? ''}
                            onChange={e => {
                              const v = parseNonNegativeInt(e.target.value);
                              const tendency = { ...(draft.statTendency as Record<string, number> | undefined) } as Record<StatTendencyKey, number>;
                              if (v === undefined) {
                                delete tendency[k];
                              } else {
                                tendency[k] = v;
                              }
                              updateField('statTendency', (Object.keys(tendency).length > 0 ? tendency : undefined) as never);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="equip">
                    <div className="space-y-3">
                      {EQUIP_SLOTS.map(slot => (
                        <label key={slot} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16">{EQUIP_SLOT_LABELS[slot]}</span>
                          <select
                            className="flex h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                            value={(draft.equipment as Record<string, string>)?.[slot] ?? ''}
                            onChange={e => {
                              const equip = { ...(draft.equipment as Record<string, string>) };
                              if (e.target.value) {
                                equip[slot] = e.target.value;
                              } else {
                                delete equip[slot];
                              }
                              updateField('equipment', (Object.keys(equip).length > 0 ? equip : undefined) as never);
                            }}
                          >
                            <option value="">无</option>
                            {catalog
                              .filter(item => item.type === 'equipment' && (!item.equipSlot || item.equipSlot === slot))
                              .map(item => <option key={item.itemId} value={item.itemId}>{item.name ?? item.itemId}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="skills">
                    <div className="text-xs text-muted-foreground mb-2">怪物可用技能 ID 列表（与 techniques 中的技能 ID 对应）。</div>
                    <div className="space-y-2">
                      {(draft.skills ?? []).map((skillId, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Input
                            value={skillId}
                            onChange={e => {
                              const skills = [...(draft.skills ?? [])];
                              skills[i] = e.target.value;
                              updateField('skills', skills as never);
                            }}
                            placeholder="skill.xxx"
                          />
                          <Button variant="ghost" size="sm" onClick={() => {
                            const skills = (draft.skills ?? []).filter((_, j) => j !== i);
                            updateField('skills', skills as never);
                          }}>×</Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => {
                        updateField('skills', [...(draft.skills ?? []), ''] as never);
                      }}>添加技能 ID</Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="drops">
                    <div className="text-xs text-muted-foreground mb-2">选物品后会自动从物品目录补齐 name/type/count，避免保存时被丢弃。</div>
                    <div className="space-y-2">
                      {(draft.drops ?? []).map((drop, i) => {
                        const item = drop.itemId ? catalogMap.get(drop.itemId) : undefined;
                        const resolvedName = drop.name || item?.name || '';
                        const resolvedType = drop.type || item?.type || 'material';
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <select
                              className="flex h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
                              value={drop.itemId ?? ''}
                              onChange={e => {
                                const drops = [...(draft.drops ?? [])];
                                const nextItem = catalogMap.get(e.target.value);
                                drops[i] = {
                                  ...drops[i],
                                  itemId: e.target.value,
                                  name: nextItem?.name ?? drops[i].name ?? '',
                                  type: nextItem?.type ?? drops[i].type ?? 'material',
                                  count: drops[i].count ?? 1,
                                };
                                updateField('drops', drops as never);
                              }}
                            >
                              <option value="">选择物品</option>
                              {catalog.map(opt => <option key={opt.itemId} value={opt.itemId}>{opt.name ?? opt.itemId}</option>)}
                            </select>
                            <Input
                              className="w-16"
                              type="number"
                              placeholder="数量"
                              value={drop.count ?? 1}
                              onChange={e => {
                                const drops = [...(draft.drops ?? [])];
                                drops[i] = { ...drops[i], count: parsePositiveInt(e.target.value) ?? 1 };
                                updateField('drops', drops as never);
                              }}
                            />
                            <Input
                              className="w-20"
                              type="number"
                              step="0.01"
                              placeholder="概率"
                              value={drop.chance ?? ''}
                              onChange={e => {
                                const drops = [...(draft.drops ?? [])];
                                const num = parseFloatOrUndef(e.target.value);
                                drops[i] = { ...drops[i], chance: num };
                                updateField('drops', drops as never);
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground w-32 truncate">
                              {resolvedName ? `${resolvedName}(${ITEM_TYPE_LABELS[resolvedType] ?? resolvedType})` : '未选物品'}
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => {
                              const drops = (draft.drops ?? []).filter((_, j) => j !== i);
                              updateField('drops', drops as never);
                            }}>×</Button>
                          </div>
                        );
                      })}
                      <Button variant="outline" size="sm" onClick={() => {
                        updateField('drops', [...(draft.drops ?? []), { itemId: '', name: '', type: 'material', count: 1 }] as never);
                      }}>添加掉落</Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="initialBuffs">
                    <div className="text-xs text-muted-foreground mb-2">怪物出生自带 Buff 列表（JSON 数组，元素为 MonsterInitialBuffDef）。</div>
                    <textarea
                      value={initialBuffsText}
                      onChange={e => { setInitialBuffsText(e.target.value); setInitialBuffsError(null); }}
                      placeholder='例如：[{ "buffId": "buff.x", "name": "示例", "category": "buff", "duration": 999 }]'
                      rows={10}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                    />
                    {initialBuffsError && (
                      <div className="text-xs text-destructive mt-1">{initialBuffsError}</div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Computed stats preview */}
                {resolved && (
                  <Card className="mt-4">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">
                      计算预览（只读，sourceMode={resolved.sourceMode}）
                    </h4>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>HP: {formatDisplayNumber(resolved.maxHp)}</div>
                      <div>攻击: {formatDisplayNumber(resolved.attack)}</div>
                      {NUMERIC_SCALAR_STAT_KEYS.map(k => (
                        <div key={k}>{NUMERIC_SCALAR_STAT_LABELS[k] ?? k}: {formatDisplayNumber((resolved.computedStats as unknown as Record<string, number>)[k] ?? 0)}</div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              请从左侧选择怪物
            </div>
          )}
        </div>
      </div>
    </SectionPageLayout>
  );
}
