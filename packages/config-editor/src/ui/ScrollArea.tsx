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
