/**
 * 本文件负责配置编辑器的 index 基础 UI 组件，统一封装样式、组合约定和常用交互语义。
 *
 * 维护时要保持组件无业务真源，只通过 props 或组合子节点表达状态，具体校验仍放在页面、schema 或服务端导入链路。
 */
export { SectionPageLayout } from './SectionPageLayout';
export { Card } from './Card';
export { StatCard } from './StatCard';
export { Button } from './Button';
export { Input } from './Input';
export { Textarea } from './Textarea';
export { Label } from './Label';
export { Badge } from './Badge';
export { Separator } from './Separator';
export { Skeleton } from './Skeleton';
export { EmptyState } from './EmptyState';
export { ScrollArea } from './ScrollArea';
export { Select } from './Select';
export { Switch } from './Switch';
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './Table';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from './Sheet';
export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './Dialog';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './Tooltip';
export { Toaster, toast } from './Toast';
