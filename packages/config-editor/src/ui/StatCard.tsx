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
      className="rounded-lg border border-border/35 bg-card/45 backdrop-blur-md p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.01)] relative overflow-hidden"
    >
      <p className="text-xs text-muted-foreground font-medium tracking-wider uppercase">{label}</p>
      <div className="mt-2.5 flex items-center gap-2">
        {variant === 'success' && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success shadow-[0_0_8px_var(--success)]"></span>
          </span>
        )}
        {variant === 'destructive' && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive shadow-[0_0_8px_var(--destructive)]"></span>
          </span>
        )}
        <p
          className={cn(
            'text-xl font-bold tracking-tight',
            variant === 'success' && 'text-success',
            variant === 'destructive' && 'text-destructive',
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
