import { Map, Skull, Sparkles, FileJson2, ServerCog } from 'lucide-react';
import { cn } from '../../lib/cn';
import { navigate, useRoute, type RouteId } from '../router/HashRouter';

const navItems: { id: RouteId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'maps', label: '地图', icon: Map },
  { id: 'monsters', label: '怪物', icon: Skull },
  { id: 'techniques', label: '功法', icon: Sparkles },
  { id: 'files', label: '文件', icon: FileJson2 },
  { id: 'service', label: '服务', icon: ServerCog },
];

export function AppSidebar({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const route = useRoute();

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 transition-[width] duration-200',
        collapsed ? 'w-0 overflow-hidden' : 'w-[var(--sidebar-width)]',
      )}
    >
      <div className="flex items-center h-12 px-3 text-xs font-medium text-sidebar-foreground/70">
        道劫余生
      </div>
      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { navigate(id); onClose?.(); }}
            className={cn(
              'flex items-center gap-2 w-full h-8 text-sm px-2 rounded-md transition-colors',
              route === id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
