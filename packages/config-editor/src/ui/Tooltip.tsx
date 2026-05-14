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
