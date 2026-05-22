/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import { useState, useEffect, useCallback } from 'react';
import { SectionPageLayout, Card, Button, Input, Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { toast } from '../../ui/Toast';
import type { LocalTechniqueEntry, LocalTechniqueTemplateRecord, LocalTechniqueSkill, LocalTechniqueEffect, LocalBuffModifierMode } from '../../types/api';
import {
  TECHNIQUE_GRADE_LABELS,
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_CATEGORY_LABELS,
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_LABELS,
} from '@mud/shared';

export default function TechniquesPage() {
  const [entries, setEntries] = useState<LocalTechniqueEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocalTechniqueTemplateRecord | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [selectedSkillIdx, setSelectedSkillIdx] = useState(0);
  const [selectedEffectIdx, setSelectedEffectIdx] = useState(0);
  const dirty = draft != null && JSON.stringify(draft) !== savedJson;

  const loadList = useCallback(async () => {
    try {
      const res = await api.techniques.list();
      setEntries(res.techniques);
    } catch (e) {
      toast.error(`加载失败: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const selectTechnique = (entry: LocalTechniqueEntry) => {
    if (dirty && !confirm('当前有未保存修改，确认切换？')) return;
    setSelectedKey(entry.key);
    setDraft({ ...entry.technique });
    setSavedJson(JSON.stringify(entry.technique));
    setSelectedSkillIdx(0);
    setSelectedEffectIdx(0);
  };

  const updateDraft = (patch: Partial<LocalTechniqueTemplateRecord>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  };

  const handleSave = async () => {
    if (!selectedKey || !draft) return;
    try {
      const res = await api.techniques.save(selectedKey, draft);
      setSavedJson(JSON.stringify(res.technique));
      setDraft(res.technique);
      toast.success('保存成功');
      loadList();
    } catch (e) {
      toast.error(`保存失败: ${(e as Error).message}`);
    }
  };

  const handleReload = () => {
    const entry = entries.find(e => e.key === selectedKey);
    if (!entry) return;
    setDraft({ ...entry.technique });
    setSavedJson(JSON.stringify(entry.technique));
    toast.info('已重载');
  };

  const sorted = [...entries]
    .filter(e =>
      e.key.toLowerCase().includes(search.toLowerCase()) ||
      e.technique.name?.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const aLv = a.technique.realmLv ?? 1;
      const bLv = b.technique.realmLv ?? 1;
      if (aLv !== bLv) return bLv - aLv;
      const aGrade = TECHNIQUE_GRADE_ORDER.indexOf(a.technique.grade);
      const bGrade = TECHNIQUE_GRADE_ORDER.indexOf(b.technique.grade);
      if (aGrade !== bGrade) return bGrade - aGrade;
      const ac = a.technique.category ?? '';
      const bc = b.technique.category ?? '';
      if (ac !== bc) return ac.localeCompare(bc, 'zh-CN');
      return (a.technique.name || a.key).localeCompare(b.technique.name || b.key, 'zh-CN');
    });

  const currentSkill: LocalTechniqueSkill | undefined = draft?.skills?.[selectedSkillIdx];
  const currentEffect: LocalTechniqueEffect | undefined = currentSkill?.effects?.[selectedEffectIdx];

  const updateSkill = (patch: Partial<LocalTechniqueSkill>) => {
    if (!draft) return;
    const skills = [...(draft.skills ?? [])];
    skills[selectedSkillIdx] = { ...skills[selectedSkillIdx], ...patch };
    updateDraft({ skills });
  };

  const updateEffect = (patch: Partial<LocalTechniqueEffect>) => {
    if (!draft || !currentSkill) return;
    const effects = [...(currentSkill.effects ?? [])];
    effects[selectedEffectIdx] = { ...effects[selectedEffectIdx], ...patch };
    updateSkill({ effects });
  };

  const renderStatRows = (
    group: 'valueStats' | 'stats' | 'attrs',
    data: Record<string, number> | undefined,
    mode: LocalBuffModifierMode | undefined,
    modeKey: 'attrMode' | 'statMode',
  ) => {
    const keys = group === 'attrs' ? ATTR_KEYS : NUMERIC_SCALAR_STAT_KEYS;
    const labels = group === 'attrs' ? ATTR_KEY_LABELS : NUMERIC_SCALAR_STAT_LABELS;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{group === 'attrs' ? '属性' : group === 'valueStats' ? '值属性' : '数值属性'}</span>
          {group !== 'valueStats' && (
            <select
              className="h-6 rounded border border-input bg-background px-1 text-xs"
              value={mode ?? 'flat'}
              onChange={e => updateEffect({ [modeKey]: e.target.value as LocalBuffModifierMode })}
            >
              <option value="flat">固定值</option>
              <option value="percent">百分比</option>
            </select>
          )}
        </div>
        {Object.entries(data ?? {}).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs w-24">{(labels as Record<string, string>)[k] ?? k}</span>
            <Input className="w-24 h-6 text-xs" type="number" value={v} onChange={e => {
              const updated = { ...data, [k]: parseFloat(e.target.value) || 0 };
              updateEffect({ [group]: updated } as never);
            }} />
            <Button variant="ghost" size="sm" onClick={() => {
              const updated = { ...data };
              delete updated[k];
              updateEffect({ [group]: Object.keys(updated).length ? updated : undefined } as never);
            }}>×</Button>
          </div>
        ))}
        <select
          className="h-6 rounded border border-input bg-background px-1 text-xs"
          value=""
          onChange={e => {
            if (!e.target.value) return;
            updateEffect({ [group]: { ...data, [e.target.value]: 0 } } as never);
            e.target.value = '';
          }}
        >
          <option value="">+ 添加</option>
          {(keys as readonly string[]).filter(k => !(data && k in data)).map(k => (
            <option key={k} value={k}>{(labels as Record<string, string>)[k]}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <SectionPageLayout title="功法编辑">
      <div className="flex h-full">
        {/* List */}
        <div className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-2">
            <Input placeholder="搜索功法..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {sorted.map(e => (
              <button
                key={e.key}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-sm truncate',
                  selectedKey === e.key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
                onClick={() => selectTechnique(e)}
              >
                <span className="font-medium">{e.technique.name || e.key}</span>
                <span className="ml-1 text-xs opacity-60">
                  {TECHNIQUE_GRADE_LABELS[e.technique.grade] ?? e.technique.grade}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {draft && selectedKey ? (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <span className="text-sm font-medium">{draft.name || selectedKey}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReload}>重载</Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty}>保存</Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Meta */}
                <Card>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">名称</span>
                      <Input value={draft.name ?? ''} onChange={e => updateDraft({ name: e.target.value })} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">品阶</span>
                      <select className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft.grade ?? ''} onChange={e => updateDraft({ grade: e.target.value as never })}>
                        {Object.entries(TECHNIQUE_GRADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-muted-foreground">类别</span>
                      <select className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft.category ?? ''} onChange={e => updateDraft({ category: e.target.value as never })}>
                        <option value="">无</option>
                        {Object.entries(TECHNIQUE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                  </div>
                </Card>

                {/* Skill select */}
                <Card>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium">技能</span>
                    <select
                      className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
                      value={selectedSkillIdx}
                      onChange={e => { setSelectedSkillIdx(Number(e.target.value)); setSelectedEffectIdx(0); }}
                    >
                      {(draft.skills ?? []).map((s, i) => <option key={i} value={i}>{s.name || s.id || `技能${i + 1}`}</option>)}
                    </select>
                  </div>
                  {currentSkill && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>ID: {currentSkill.id}</div>
                      <div>冷却: {currentSkill.cooldown ?? '-'}</div>
                      <div>消耗: {currentSkill.cost ?? '-'}</div>
                    </div>
                  )}
                </Card>

                {/* Effect select & editor */}
                {currentSkill && (
                  <Card>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium">效果</span>
                      <select
                        className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
                        value={selectedEffectIdx}
                        onChange={e => setSelectedEffectIdx(Number(e.target.value))}
                      >
                        {(currentSkill.effects ?? []).map((ef, i) => <option key={i} value={i}>{ef.type || `效果${i + 1}`}</option>)}
                      </select>
                    </div>
                    {currentEffect && (
                      <div className="space-y-3 mt-3">
                        {renderStatRows('valueStats', currentEffect.valueStats as Record<string, number> | undefined, undefined, 'statMode')}
                        {renderStatRows('stats', currentEffect.stats as Record<string, number> | undefined, currentEffect.statMode, 'statMode')}
                        {renderStatRows('attrs', currentEffect.attrs as Record<string, number> | undefined, currentEffect.attrMode, 'attrMode')}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              请从左侧选择功法
            </div>
          )}
        </div>
      </div>
    </SectionPageLayout>
  );
}
