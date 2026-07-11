/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { SectionPageLayout, Card, Button, Input, Textarea } from '../../ui';
import { api, isAbortError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { toast } from '../../ui/Toast';
import type { LocalConfigFileSummary } from '../../types/api';
import { useLatestRequestGuard } from '../../lib/use-request-generation';

export default function FilesPage() {
  const [files, setFiles] = useState<LocalConfigFileSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LocalConfigFileSummary | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedRef = useRef<LocalConfigFileSummary | null>(null);
  const loadingPathRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const listRequestGuard = useLatestRequestGuard();
  const fileRequestGuard = useLatestRequestGuard();
  const saveRequestGuard = useLatestRequestGuard();
  selectedRef.current = selected;
  const dirty = content !== savedContent;

  const loadList = useCallback(async () => {
    const request = listRequestGuard.begin();
    try {
      const res = await api.configFiles.list(request.signal);
      if (!listRequestGuard.isCurrent(request)) return;
      setFiles(res.files);
    } catch (e) {
      if (!listRequestGuard.isCurrent(request) || isAbortError(e)) return;
      toast.error(`加载文件列表失败: ${(e as Error).message}`);
    }
  }, [listRequestGuard]);

  useEffect(() => { void loadList(); }, [loadList]);

  const loadFileContent = async (file: LocalConfigFileSummary, showReloadToast: boolean) => {
    const request = fileRequestGuard.begin();
    loadingPathRef.current = file.path;
    setLoadingPath(file.path);
    try {
      const res = await api.configFiles.get(file.path, request.signal);
      if (!fileRequestGuard.isCurrent(request)) return;
      setSelected(file);
      setContent(res.content);
      setSavedContent(res.content);
      if (showReloadToast) {
        toast.info('已重新加载');
      }
    } catch (e) {
      if (!fileRequestGuard.isCurrent(request) || isAbortError(e)) return;
      toast.error(`${showReloadToast ? '重载' : '加载文件'}失败: ${(e as Error).message}`);
    } finally {
      if (fileRequestGuard.isCurrent(request)) {
        loadingPathRef.current = null;
        setLoadingPath(null);
      }
    }
  };

  const loadFile = async (file: LocalConfigFileSummary) => {
    if (savingRef.current) return;
    if (dirty && !confirm('当前文件有未保存的修改，确认切换？')) return;
    await loadFileContent(file, false);
  };

  const handleSave = async () => {
    if (!selected || savingRef.current || loadingPathRef.current !== null) return;
    try {
      JSON.parse(content);
    } catch {
      toast.error('JSON 格式错误，请检查后重试');
      return;
    }
    const requestFile = selected;
    const requestContent = content;
    const request = saveRequestGuard.begin();
    savingRef.current = true;
    setSaving(true);
    try {
      await api.configFiles.save(requestFile.path, requestContent);
      if (!saveRequestGuard.isCurrent(request)) return;
      if (selectedRef.current?.path === requestFile.path) {
        setSavedContent(requestContent);
      }
      toast.success('保存成功');
    } catch (e) {
      if (!saveRequestGuard.isCurrent(request)) return;
      toast.error(`保存失败: ${(e as Error).message}`);
    } finally {
      savingRef.current = false;
      if (saveRequestGuard.isCurrent(request)) {
        setSaving(false);
      }
    }
  };

  const handleReload = async () => {
    if (!selected || savingRef.current || loadingPathRef.current !== null) return;
    if (dirty && !confirm('当前文件有未保存的修改，确认重新加载？')) return;
    await loadFileContent(selected, true);
  };

  const filtered = files.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.path.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <SectionPageLayout title="配置文件">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="p-2">
            <Input placeholder="搜索文件..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {filtered.map(f => (
              <button
                key={f.path}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-sm truncate',
                  selected?.path === f.path
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
                disabled={saving || loadingPath === f.path}
                onClick={() => loadFile(f)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              <Card className="m-3 mb-0 flex items-center justify-between rounded-b-none border-b-0">
                <div>
                  <p className="font-medium text-sm">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.path}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleReload} disabled={saving || loadingPath !== null}>重载</Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty || saving || loadingPath !== null}>{saving ? '保存中...' : '保存'}</Button>
                </div>
              </Card>
              <div className="flex-1 p-3 pt-0">
                <Textarea
                  className="h-full resize-none font-mono text-xs"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  disabled={saving || loadingPath !== null}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              请从左侧选择文件
            </div>
          )}
        </div>
      </div>
    </SectionPageLayout>
  );
}
