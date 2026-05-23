/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import { Menu } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ServiceStatusPill } from '../header/ServiceStatusPill';
import { ThemeModeToggle } from '../header/ThemeModeToggle';
import { ConfigDrawer } from '../theme/ConfigDrawer';

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex items-center h-14 px-4 border-b border-border/35 bg-background/40 backdrop-blur-md relative z-20">
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={onToggleSidebar} 
        aria-label="切换侧栏"
        className="btn-premium-physics text-muted-foreground hover:text-foreground hover:bg-accent/40"
      >
        <Menu className="h-4.5 w-4.5" />
      </Button>
      <span className="ml-3 text-sm font-bold select-none bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent tracking-wider">
        配置编辑器
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <ServiceStatusPill />
        <ThemeModeToggle />
        <ConfigDrawer />
      </div>
    </header>
  );
}
