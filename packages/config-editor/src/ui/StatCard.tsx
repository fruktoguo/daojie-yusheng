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
      className="rounded-lg border border-border bg-card p-4"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold',
          variant === 'success' && 'text-success',
          variant === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}
