/**
 * 本文件负责配置编辑器的 Card 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-lg border border-border/35 bg-card/45 backdrop-blur-md p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}
