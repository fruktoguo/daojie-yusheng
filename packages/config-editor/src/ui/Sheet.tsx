/**
 * 本文件负责配置编辑器的 Sheet 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        ref={ref}
        className={cn('fixed inset-y-0 right-0 z-50 w-80 bg-background border-l border-border p-6 shadow-lg', className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
SheetContent.displayName = 'SheetContent';

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 mb-4', className)} {...props} />;
}

export const SheetTitle = forwardRef<HTMLHeadingElement, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title data-slot="sheet-title" ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
  ),
);
SheetTitle.displayName = 'SheetTitle';

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sheet-footer" className={cn('flex items-center justify-end gap-2 mt-auto pt-4', className)} {...props} />;
}
