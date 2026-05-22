/**
 * 本文件负责配置编辑器的 EmptyState 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
