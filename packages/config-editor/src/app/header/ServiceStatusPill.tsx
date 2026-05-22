/**
 * 本文件属于配置编辑器顶部栏，负责展示服务状态、主题切换等全局入口。
 *
 * 维护时要保持展示逻辑轻量，真实服务状态仍以后端 API 返回和编辑器状态为准。
 */
import { useEffect, useState } from 'react';
import { Badge } from '../../ui/Badge';
import { cn } from '../../lib/cn';

type Status = 'running' | 'stopped' | 'unmanaged';

export function ServiceStatusPill() {
  const [status, setStatus] = useState<Status>('stopped');

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/server/status');
        if (!active) return;
        if (!res.ok) { setStatus('stopped'); return; }
        const data = await res.json() as { managed: boolean; running: boolean };
        if (!data.managed) setStatus('unmanaged');
        else if (data.running) setStatus('running');
        else setStatus('stopped');
      } catch {
        if (active) setStatus('stopped');
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const label = status === 'running' ? '运行中' : status === 'unmanaged' ? '未托管' : '未运行';

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] gap-1 px-1.5 py-0',
        status === 'running' && 'border-success/40 text-success',
        status === 'stopped' && 'border-muted-foreground/30 text-muted-foreground',
        status === 'unmanaged' && 'border-border text-foreground/60',
      )}
    >
      <span className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        status === 'running' && 'bg-success',
        status === 'stopped' && 'bg-muted-foreground',
        status === 'unmanaged' && 'bg-foreground/40',
      )} />
      {label}
    </Badge>
  );
}
