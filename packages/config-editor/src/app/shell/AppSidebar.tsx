/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
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
        'flex flex-col bg-sidebar/55 backdrop-blur-md border-r border-sidebar-border/40 shrink-0 transition-[width] duration-300 relative z-20',
        collapsed ? 'w-0 overflow-hidden' : 'w-[var(--sidebar-width)]',
      )}
    >
      <div className="flex items-center h-14 px-5 text-[11px] font-black tracking-widest bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent uppercase select-none">
        道劫余生 MUD
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = route === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { navigate(id); onClose?.(); }}
              className={cn(
                'btn-premium-physics flex items-center gap-2.5 w-full h-9 text-sm px-3 rounded-md transition-all duration-200 relative group',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-[0_1px_4px_rgba(0,0,0,0.05)] border border-white/5'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/35 hover:text-sidebar-foreground',
              )}
            >
              {/* 左侧灵动纵向激活指示器 */}
              {isActive && (
                <div className="absolute left-1 w-1 h-4 rounded-full bg-primary" />
              )}
              
              <Icon 
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110',
                  isActive ? 'text-primary' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground'
                )} 
              />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
