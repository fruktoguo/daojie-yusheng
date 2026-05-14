import { type SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      data-slot="select"
      ref={ref}
      className={cn(
        'h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
