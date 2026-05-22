/**
 * 本文件负责配置编辑器的 StatCard 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import { cn } from '../lib/cn';

export function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'default' | 'success' | 'destructive';
}) {
  return (
    <div
      data-slot="card"
      className="rounded-lg border border-border bg-card p-4"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          variant === 'success' && 'text-success',
          variant === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}
