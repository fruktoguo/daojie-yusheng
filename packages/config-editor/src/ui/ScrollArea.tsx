/**
 * 本文件负责配置编辑器的 ScrollArea 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      data-slot="scroll-area"
      ref={ref}
      className={cn('overflow-auto [scrollbar-width:thin]', className)}
      {...props}
    />
  ),
);
ScrollArea.displayName = 'ScrollArea';
