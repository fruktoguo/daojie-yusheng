/**
 * 本文件属于配置编辑器顶部栏，负责展示服务状态、主题切换等全局入口。
 *
 * 维护时要保持展示逻辑轻量，真实服务状态仍以后端 API 返回和编辑器状态为准。
 */
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '../../ui/Button';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';

const cycle: ThemeMode[] = ['light', 'dark', 'system'];

export function ThemeModeToggle() {
  const { mode, setMode } = useTheme();

  const next = () => {
    const idx = cycle.indexOf(mode);
    setMode(cycle[(idx + 1) % cycle.length]);
  };

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

  return (
    <Button variant="ghost" size="icon" onClick={next} aria-label="切换主题模式">
      <Icon className="h-4 w-4" />
    </Button>
  );
}
