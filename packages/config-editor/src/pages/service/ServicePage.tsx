/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import { useState, useEffect, useCallback } from 'react';
import { SectionPageLayout, StatCard, Card, Button } from '../../ui';
import { api } from '../../lib/api';
import { toast } from '../../ui/Toast';
import type { LocalServerStatusRes } from '../../types/api';

export default function ServicePage() {
  const [status, setStatus] = useState<LocalServerStatusRes | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await api.server.status());
    } catch (e) {
      toast.error(`获取状态失败: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const handleRestart = async () => {
    if (!confirm('确认重启服务端？')) return;
    try {
      await api.server.restart();
      toast.success('重启指令已发送');
      fetchStatus();
    } catch (e) {
      toast.error(`重启失败: ${(e as Error).message}`);
    }
  };

  return (
    <SectionPageLayout
      title="服务控制"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={fetchStatus}>刷新</Button>
          <Button variant="destructive" size="sm" onClick={handleRestart}>重启</Button>
        </>
      }
    >
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="运行状态"
            value={status ? (status.running ? '运行中' : '已停止') : '加载中...'}
            variant={status?.running ? 'success' : 'destructive'}
          />
          <StatCard label="启动命令" value={status?.mode ?? '-'} />
          <StatCard label="当前PID" value={status?.pid != null ? String(status.pid) : '-'} />
          <StatCard label="最近重启时间" value={status?.lastRestartAt ?? '-'} />
        </div>

        <Card>
          <h3 className="font-medium mb-2">行为说明</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            <li>编辑器通过本地 API 管理服务端进程</li>
            <li>保存配置文件后服务端会自动热重载</li>
            <li>重启会终止当前进程并重新启动</li>
            <li>状态每 3 秒自动轮询刷新</li>
            <li>如果服务端未启动，部分编辑功能仍可使用</li>
          </ul>
        </Card>
      </div>
    </SectionPageLayout>
  );
}
