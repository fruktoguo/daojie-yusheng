import { useState, useEffect, useCallback } from 'react';
import { SectionPageLayout, Card, Button, Input, Textarea } from '../../ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { toast } from '../../ui/Toast';
import type { LocalConfigFileSummary } from '../../types/api';

export default function FilesPage() {
  const [files, setFiles] = useState<LocalConfigFileSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LocalConfigFileSummary | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const dirty = content !== savedContent;

  const loadList = useCallback(async () => {
    try {
      const res = await api.configFiles.list();
      setFiles(res.files);
    } catch (e) {
      toast.error(`加载文件列表失败: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadFile = async (file: LocalConfigFileSummary) => {
    if (dirty && !confirm('当前文件有未保存的修改，确认切换？')) return;
    try {
      const res = await api.configFiles.get(file.path);
      setSelected(file);
      setContent(res.content);
      setSavedContent(res.content);
    } catch (e) {
      toast.error(`加载文件失败: ${(e as Error).message}`);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      JSON.parse(content);
    } catch {
      toast.error('JSON 格式错误，请检查后重试');
      return;
    }
    try {
      await api.configFiles.save(selected.path, content);
      setSavedContent(content);
      toast.success('保存成功');
    } catch (e) {
      toast.error(`保存失败: ${(e as Error).message}`);
    }
  };

  const handleReload = async () => {
    if (!selected) return;
    try {
      const res = await api.configFiles.get(selected.path);
      setContent(res.content);
      setSavedContent(res.content);
      toast.info('已重新加载');
    } catch (e) {
      toast.error(`重载失败: ${(e as Error).message}`);
    }
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
                  <Button variant="outline" size="sm" onClick={handleReload}>重载</Button>
                  <Button size="sm" onClick={handleSave} disabled={!dirty}>保存</Button>
                </div>
              </Card>
              <div className="flex-1 p-3 pt-0">
                <Textarea
                  className="h-full resize-none font-mono text-xs"
                  value={content}
                  onChange={e => setContent(e.target.value)}
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
