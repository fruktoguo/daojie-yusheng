/**
 * 本文件负责配置编辑器的 Button 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
import { cn } from '../lib/cn';

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline';
type ButtonSize = 'default' | 'sm' | 'icon';

const variantStyles: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_2px_10px_oklch(var(--primary)/8%)] btn-premium-physics',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/85 btn-premium-physics',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 btn-premium-physics',
  ghost: 'hover:bg-accent/40 hover:text-accent-foreground btn-premium-physics',
  outline: 'border border-input/45 bg-background/35 backdrop-blur-sm hover:bg-accent/40 hover:text-accent-foreground btn-premium-physics',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-8.5 px-3.5 text-sm rounded-md',
  sm: 'h-7.5 px-2.5 text-xs rounded-md',
  icon: 'h-8.5 w-8.5 rounded-md',
};

export function Button({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
