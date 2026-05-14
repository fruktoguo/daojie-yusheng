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
      className={cn('rounded-lg border border-border bg-card p-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
