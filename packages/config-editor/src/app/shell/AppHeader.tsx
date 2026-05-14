import { Menu } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ServiceStatusPill } from '../header/ServiceStatusPill';
import { ThemeModeToggle } from '../header/ThemeModeToggle';
import { ConfigDrawer } from '../theme/ConfigDrawer';

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center h-12 px-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="切换侧栏">
        <Menu className="h-4 w-4" />
      </Button>
      <span className="ml-2 text-sm font-medium select-none">配置编辑器</span>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <ServiceStatusPill />
        <ThemeModeToggle />
        <ConfigDrawer />
      </div>
    </header>
  );
}
