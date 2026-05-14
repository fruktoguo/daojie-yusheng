import { useCallback, useState } from 'react';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { Sheet, SheetContent } from '../../ui/Sheet';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => {
    if (window.innerWidth < 768) {
      setMobileOpen((v: boolean) => !v);
    } else {
      setCollapsed((v: boolean) => !v);
    }
  }, []);

  return (
    <div className="flex flex-col h-svh overflow-hidden">
      <AppHeader onToggleSidebar={toggle} />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AppSidebar collapsed={collapsed} />
        </div>
        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent className="inset-y-0 left-0 right-auto w-[var(--sidebar-width-mobile)] p-0">
            <AppSidebar onClose={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        {/* Main content */}
        <main data-slot="sidebar-inset" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
