/**
 * 本文件负责配置编辑器的 Tooltip 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(
  ({ className, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Content
      data-slot="tooltip-content"
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 bg-popover text-popover-foreground rounded-md px-2 py-1 text-xs shadow-md animate-in fade-in-0 zoom-in-95', className)}
      {...props}
    />
  ),
);
TooltipContent.displayName = 'TooltipContent';
