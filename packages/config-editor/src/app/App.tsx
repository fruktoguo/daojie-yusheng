import { lazy, Suspense } from 'react';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { TooltipProvider } from '../ui/Tooltip';
import { Toaster } from '../ui/Toast';
import { AppShell } from './shell/AppShell';
import { HashRouter, useRoute } from './router/HashRouter';

const MapsPage = lazy(() => import('../pages/maps/MapsPage'));
const MonstersPage = lazy(() => import('../pages/monsters/MonstersPage'));
const TechniquesPage = lazy(() => import('../pages/techniques/TechniquesPage'));
const FilesPage = lazy(() => import('../pages/files/FilesPage'));
const ServicePage = lazy(() => import('../pages/service/ServicePage'));

function PageRouter() {
  const route = useRoute();

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中…</div>}>
      {route === 'maps' && <MapsPage />}
      {route === 'monsters' && <MonstersPage />}
      {route === 'techniques' && <TechniquesPage />}
      {route === 'files' && <FilesPage />}
      {route === 'service' && <ServicePage />}
    </Suspense>
  );
}

function ThemedToaster() {
  const { resolvedMode } = useTheme();
  return <Toaster theme={resolvedMode} richColors position="bottom-right" />;
}

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <HashRouter>
          <AppShell>
            <PageRouter />
          </AppShell>
        </HashRouter>
        <ThemedToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
