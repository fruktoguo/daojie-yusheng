/**
 * 本文件负责配置编辑器的页面、组件、类型或工程辅助逻辑，服务于内容生产与配置维护链路。
 *
 * 维护时要保持草稿、接口返回和发布数据的边界一致，避免把服务端导入校验提前写死在普通 UI 组件里。
 */
import { useTheme, type ContentLayout, type SidebarVariant, type ThemeMode, type ThemePreset, type ThemeRadius, type ThemeScale } from './ThemeProvider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { cn } from '../../lib/cn';
import { Palette } from 'lucide-react';

const modes: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

const presets: { value: ThemePreset; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'underground', label: '地下' },
  { value: 'rose-garden', label: '玫瑰' },
  { value: 'lake-view', label: '湖景' },
  { value: 'sunset-glow', label: '落霞' },
  { value: 'forest-whisper', label: '森林' },
  { value: 'ocean-breeze', label: '海风' },
  { value: 'lavender-dream', label: '薰衣草' },
];

const radii: { value: ThemeRadius; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
  { value: 'xl', label: '特大' },
];

const scales: { value: ThemeScale; label: string }[] = [
  { value: 'sm', label: '紧凑' },
  { value: 'default', label: '默认' },
  { value: 'lg', label: '宽松' },
];

const sidebarVariants: { value: SidebarVariant; label: string }[] = [
  { value: 'inset', label: '内嵌' },
  { value: 'floating', label: '浮动' },
  { value: 'sidebar', label: '侧栏' },
];

const contentLayouts: { value: ContentLayout; label: string }[] = [
  { value: 'default', label: '默认' },
  { value: 'centered', label: '居中' },
];

function OptionCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-md border px-3 py-1.5 text-xs transition-colors',
        active ? 'border-primary ring-2 ring-ring font-medium' : 'border-border hover:border-muted-foreground/40',
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function ConfigDrawer() {
  const theme = useTheme();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="主题设置">
          <Palette className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>主题设置</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 py-4">
          <Section title="模式">
            <div className="grid grid-cols-3 gap-2">
              {modes.map(m => (
                <OptionCard key={m.value} active={theme.mode === m.value} onClick={() => theme.setMode(m.value)}>
                  {m.label}
                </OptionCard>
              ))}
            </div>
          </Section>

          <Section title="配色">
            <div className="grid grid-cols-4 gap-2">
              {presets.map(p => (
                <OptionCard key={p.value} active={theme.preset === p.value} onClick={() => theme.setPreset(p.value)}>
                  {p.label}
                </OptionCard>
              ))}
            </div>
          </Section>

          <Section title="圆角">
            <div className="grid grid-cols-5 gap-2">
              {radii.map(r => (
                <OptionCard key={r.value} active={theme.radius === r.value} onClick={() => theme.setRadius(r.value)}>
                  {r.label}
                </OptionCard>
              ))}
            </div>
          </Section>

          <Section title="密度">
            <div className="grid grid-cols-3 gap-2">
              {scales.map(s => (
                <OptionCard key={s.value} active={theme.scale === s.value} onClick={() => theme.setScale(s.value)}>
                  {s.label}
                </OptionCard>
              ))}
            </div>
          </Section>

          <Section title="侧栏样式">
            <div className="grid grid-cols-3 gap-2">
              {sidebarVariants.map(v => (
                <OptionCard key={v.value} active={theme.sidebarVariant === v.value} onClick={() => theme.setSidebarVariant(v.value)}>
                  {v.label}
                </OptionCard>
              ))}
            </div>
          </Section>

          <Section title="内容宽度">
            <div className="grid grid-cols-2 gap-2">
              {contentLayouts.map(l => (
                <OptionCard key={l.value} active={theme.contentLayout === l.value} onClick={() => theme.setContentLayout(l.value)}>
                  {l.label}
                </OptionCard>
              ))}
            </div>
          </Section>
        </div>

        <div className="border-t pt-4">
          <Button variant="outline" size="sm" className="w-full" onClick={theme.reset}>
            重置默认
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
