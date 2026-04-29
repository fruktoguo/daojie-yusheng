import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DetailModalLayer } from '../overlays/DetailModalLayer';
import { ToastLayer } from '../overlays/ToastLayer';
import { TooltipLayer } from '../overlays/TooltipLayer';
import {
  closeDetailModal,
  hideTooltip,
  openDetailModal,
  showToast,
  showTooltip,
} from '../overlays/overlay-store';
import { UiButton } from '../primitives/UiButton';
import { UiActionListItem } from '../primitives/UiActionListItem';
import { UiEquipmentSlot } from '../primitives/UiEquipmentSlot';
import { UiFieldRow } from '../primitives/UiFieldRow';
import { UiGameItem, type UiGameItemGradeTone } from '../primitives/UiGameItem';
import { UiItemCard } from '../primitives/UiItemCard';
import { UiMailDetail } from '../primitives/UiMailDetail';
import { UiInventoryCell } from '../primitives/UiInventoryCell';
import { UiInlineReferenceText } from '../primitives/UiInlineReferenceText';
import { UiMailListItem } from '../primitives/UiMailListItem';
import { UiMarketOrderRow } from '../primitives/UiMarketOrderRow';
import { UiModalScaffold } from '../primitives/UiModalScaffold';
import { UiPanelFrame } from '../primitives/UiPanelFrame';
import { UiPriceEditor } from '../primitives/UiPriceEditor';
import { UiPill } from '../primitives/UiPill';
import { UiQuantityStepper } from '../primitives/UiQuantityStepper';
import { UiQuestDetail } from '../primitives/UiQuestDetail';
import { UiQuestListItem } from '../primitives/UiQuestListItem';
import { UiResourceBar } from '../primitives/UiResourceBar';
import { UiSection } from '../primitives/UiSection';
import { UiList } from '../primitives/UiList';
import { UiSplitPane } from '../primitives/UiSplitPane';
import { UiSliderField } from '../primitives/UiSliderField';
import { UiTabButton } from '../primitives/UiTabButton';
import { UiTabList } from '../primitives/UiTabList';
import { UiTechniqueDetail } from '../primitives/UiTechniqueDetail';
import { UiTechniqueListItem } from '../primitives/UiTechniqueListItem';
import { UiToolbar } from '../primitives/UiToolbar';
import { UiWorldEntityRow } from '../primitives/UiWorldEntityRow';
import {
  PROTOTYPE_ACTIONS,
  PROTOTYPE_ATTR_TABS,
  PROTOTYPE_INVENTORY,
  PROTOTYPE_MAILS,
  PROTOTYPE_MARKET,
  PROTOTYPE_MODULES,
  PROTOTYPE_PLAYER,
  PROTOTYPE_QUESTS,
  PROTOTYPE_TECHNIQUES,
  PROTOTYPE_WORLD_ENTITIES,
  type PrototypeModuleCardData,
  type PrototypeModuleId,
} from './mock-data';
import './prototype.css';
/**
 * PrototypeTheme：统一结构类型，保证协议与运行时一致性。
 */


type PrototypeTheme = 'light' | 'dark';
/**
 * PreviewDeviceMode：统一结构类型，保证协议与运行时一致性。
 */

type PreviewDeviceMode = 'pc' | 'mobile';

const SCALE_PRESETS = [75, 90, 100, 110, 125] as const;
const MODULE_GROUPS: ReadonlyArray<{
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * ids：ID相关字段。
 */

  ids: PrototypeModuleId[];
}> = [
  {
    title: '主壳层',
    ids: ['foundation', 'login', 'hud', 'attr', 'equipment', 'inventory', 'technique', 'action', 'quest', 'world', 'market', 'mail', 'settings'],
  },
  {
    title: '补充面板',
    ids: ['suggestion', 'npc-shop', 'npc-quest', 'craft', 'loot', 'minimap', 'tutorial', 'changelog'],
  },
  {
    title: '管理与特殊',
    ids: ['debug', 'gm', 'heaven-gate', 'entity-detail'],
  },
];
/**
 * formatNumber：规范化或转换Number。
 * @param value number 参数说明。
 * @returns 返回Number。
 */


function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}
/**
 * ratioPercent：执行ratioPercent相关逻辑。
 * @param current number 参数说明。
 * @param max number 参数说明。
 * @returns 返回ratioPercent。
 */


function ratioPercent(current: number, max: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (max <= 0) {
    return '0%';
  }
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}
/**
 * resolvePrototypeGradeTone：规范化或转换PrototypeGradeTone。
 * @param label string 参数说明。
 * @returns 返回PrototypeGradeTone。
 */


function resolvePrototypeGradeTone(label: string): UiGameItemGradeTone | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (label.includes('凡')) return 'mortal';
  if (label.includes('黄')) return 'yellow';
  if (label.includes('玄')) return 'mystic';
  if (label.includes('地')) return 'earth';
  if (label.includes('天')) return 'heaven';
  if (label.includes('灵')) return 'spirit';
  if (label.includes('圣')) return 'saint';
  if (label.includes('帝')) return 'emperor';
  return null;
}
/**
 * getPrototypeItemTypeLabel：读取Prototype道具TypeLabel。
 * @param category string 参数说明。
 * @returns 返回Prototype道具TypeLabel。
 */


function getPrototypeItemTypeLabel(category: string): string {
  switch (category) {
    case 'equipment':
      return '装备';
    case 'consumable':
      return '丹药';
    case 'skill_book':
      return '功法书';
    case 'material':
      return '材料';
    case 'special':
      return '特殊';
    default:
      return '物品';
  }
}
/**
 * getModuleStatusLabel：读取模块StatuLabel。
 * @param status PrototypeModuleCardData['status'] 参数说明。
 * @returns 返回模块StatuLabel。
 */


function getModuleStatusLabel(status: PrototypeModuleCardData['status']): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (status === 'prototype-ready') {
    return '原型已覆盖';
  }
  if (status === 'in-progress') {
    return '迁移中';
  }
  return '待迁移';
}
/**
 * openModulePreview：执行open模块Preview相关逻辑。
 * @param module PrototypeModuleCardData 参数说明。
 * @returns 无返回值，直接更新open模块Preview相关状态。
 */


function openModulePreview(module: PrototypeModuleCardData): void {
  openDetailModal({
    title: module.title,
    subtitle: undefined,
    body: (
      <UiModalScaffold title={module.title}>
        <div className="prototype-chip-row">
          {module.interactions.map((item) => (
            <span key={item} className="prototype-chip">{item}</span>
          ))}
        </div>
        <div className="react-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={closeDetailModal}>关闭</UiButton>
        </div>
      </UiModalScaffold>
    ),
  });
}
/**
 * openInventoryDetail：执行open背包详情相关逻辑。
 * @param itemName string 参数说明。
 * @param note string 参数说明。
 * @returns 无返回值，直接更新open背包详情相关状态。
 */


function openInventoryDetail(itemName: string, note: string): void {
  openDetailModal({
    title: itemName,
    subtitle: undefined,
    body: (
      <UiModalScaffold title={itemName} subtitle={note}>
        <div className="prototype-chip-row">
          <span className="prototype-chip">{note}</span>
        </div>
        <div className="react-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={closeDetailModal}>关闭</UiButton>
        </div>
      </UiModalScaffold>
    ),
  });
}
/**
 * TooltipItemCard：渲染提示道具Card组件。
 * @param {
  name,
  meta,
  onClick,
} {
  name: string;
  meta: string;
  onClick: () => void;
} 参数说明。
 * @returns 无返回值，直接更新提示道具Card相关状态。
 */


function TooltipItemCard({
  name,
  meta,
  onClick,
}: {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * meta：meta相关字段。
 */

  meta: string;  
  /**
 * onClick：onClick相关字段。
 */

  onClick: () => void;
}) {
  return (
    <UiItemCard
      title={name}
      subtitle={meta}
      onClick={onClick}
      onPointerMove={(event) => {
        showTooltip(name, [meta, '这里未来接入统一物品 Tooltip 内容。'], event.clientX, event.clientY);
      }}
      onPointerLeave={hideTooltip}
    >
      <div className="prototype-item-meta">点击查看详情</div>
    </UiItemCard>
  );
}
/**
 * LoginPanelPreview：渲染Login面板Preview组件。
 * @returns 无返回值，直接更新Login面板Preview相关状态。
 */


function LoginPanelPreview() {
  return (
    <UiSection title="登录">
      <div className="prototype-login-grid">
        <div className="prototype-input-stack">
          <input value="gu_changqing" readOnly />
          <input value="******" readOnly />
          <input value="青" readOnly />
          <UiButton type="button">登录</UiButton>
        </div>
        <div className="prototype-list">
          <div className="prototype-list-item">
            <div className="prototype-list-title">账号 / 角色名</div>
            <div className="prototype-list-note">输入账号或角色名</div>
          </div>
          <div className="prototype-list-item">
            <div className="prototype-list-title">显示名</div>
            <div className="prototype-list-note">进入游戏后显示</div>
          </div>
        </div>
      </div>
    </UiSection>
  );
}
/**
 * FoundationPanelPreview：渲染Foundation面板Preview组件。
 * @returns 无返回值，直接更新Foundation面板Preview相关状态。
 */


function FoundationPanelPreview() {
  const [activeTab, setActiveTab] = useState<'primary' | 'danger'>('primary');
  const [activeListTab, setActiveListTab] = useState<'inventory' | 'market' | 'mail'>('inventory');
  const [sliderValue, setSliderValue] = useState(105);
  const [quantity, setQuantity] = useState(12);
  const [price, setPrice] = useState(1880);

  return (
    <UiSection title="基础组件">
      <div className="prototype-foundation-grid">
        <UiPanelFrame title="按钮 / 胶囊 / Tab" subtitle="统一交互语气">
          <UiToolbar className="prototype-pill-row">
            <UiButton type="button">主按钮</UiButton>
            <UiButton type="button" variants={['ghost']}>幽灵按钮</UiButton>
            <UiButton type="button" variants={['danger']}>危险按钮</UiButton>
          </UiToolbar>
          <UiToolbar className="prototype-pill-row">
            <UiPill>默认胶囊</UiPill>
            <UiPill tone="accent">强调胶囊</UiPill>
          </UiToolbar>
          <UiTabList
            items={[
              { key: 'primary', label: '普通态' },
              { key: 'danger', label: '危险态' },
            ]}
            activeKey={activeTab}
            onChange={setActiveTab}
          />
          <UiTabList
            items={[
              { key: 'inventory', label: '背包' },
              { key: 'market', label: '坊市' },
              { key: 'mail', label: '邮件' },
            ]}
            activeKey={activeListTab}
            onChange={setActiveListTab}
            orientation="vertical"
            className="prototype-foundation-vertical-tabs"
          />
        </UiPanelFrame>

        <UiPanelFrame title="Label / 字段行" subtitle="统一排版层级">
          <UiFieldRow label="角色名" value="顾长青" />
          <UiFieldRow label="境界" value="筑基初期" />
          <UiFieldRow label="灵石" value={formatNumber(58210)} />
          <div className="prototype-form-stack">
            <label className="react-ui-form-field">
              <span className="react-ui-form-label">普通输入</span>
              <input className="react-ui-input" defaultValue="流火长剑" />
            </label>
            <label className="react-ui-form-field">
              <span className="react-ui-form-label">说明输入</span>
              <input className="react-ui-input" defaultValue="用于预览统一 input 样式" />
            </label>
          </div>
        </UiPanelFrame>

        <UiPanelFrame title="数值条" subtitle="血条 / 蓝条 / 修为条">
          <div className="react-ui-resource-stack">
            <UiResourceBar label="生命值" value={PROTOTYPE_PLAYER.hp} max={PROTOTYPE_PLAYER.hpMax} tone="health" valueText={`${formatNumber(PROTOTYPE_PLAYER.hp)} / ${formatNumber(PROTOTYPE_PLAYER.hpMax)}`} />
            <UiResourceBar label="灵力" value={PROTOTYPE_PLAYER.qi} max={PROTOTYPE_PLAYER.qiMax} tone="qi" valueText={`${formatNumber(PROTOTYPE_PLAYER.qi)} / ${formatNumber(PROTOTYPE_PLAYER.qiMax)}`} />
            <UiResourceBar label="修为" value={PROTOTYPE_PLAYER.cultivate} max={PROTOTYPE_PLAYER.cultivateMax} tone="cultivate" variant="progress" valueText={`${formatNumber(PROTOTYPE_PLAYER.cultivate)} / ${formatNumber(PROTOTYPE_PLAYER.cultivateMax)}`} />
          </div>
        </UiPanelFrame>

        <UiPanelFrame title="滑杆 / 数量 / 价格" subtitle="统一输入控件">
          <UiSliderField
            label="界面缩放"
            value={sliderValue}
            min={70}
            max={130}
            step={5}
            valueText={`${sliderValue}%`}
            onChange={setSliderValue}
          />
          <UiQuantityStepper
            label="数量选择器"
            value={quantity}
            min={1}
            max={99}
            step={1}
            onChange={setQuantity}
          />
          <UiPriceEditor
            label="价格输入"
            value={price}
            min={1}
            max={99999}
            step={10}
            presets={[1280, 1880, 2880]}
            onChange={setPrice}
          />
        </UiPanelFrame>

        <UiPanelFrame title="列表 / 分栏" subtitle="统一容器骨架">
          <UiSplitPane
            secondarySize={260}
            primary={(
              <UiList className="prototype-item-grid prototype-item-grid--inventory" orientation="grid" columns={2} scrollable>
                <UiInventoryCell
                  name="流火长剑"
                  typeLabel="装备 · 地品"
                  grade="武器 · +7 强化"
                  gradeTone="earth"
                  note="命中偏向"
                  quantity={1}
                  chips={['Lv.48', '火行']}
                  actions={(
                    <>
                      <UiButton type="button">装备</UiButton>
                      <UiButton type="button" variants={['danger']}>丢下</UiButton>
                    </>
                  )}
                  active
                />
                <UiInventoryCell
                  name="青纹法袍"
                  typeLabel="装备 · 玄品"
                  grade="衣服 · 抗性偏向"
                  gradeTone="mystic"
                  note="法袍"
                  quantity={1}
                  chips={['Lv.36']}
                  actions={(
                    <>
                      <UiButton type="button">装备</UiButton>
                      <UiButton type="button" variants={['danger']}>丢下</UiButton>
                    </>
                  )}
                />
                <UiInventoryCell
                  name="养气丹"
                  typeLabel="丹药 · 黄品"
                  grade="可批量使用"
                  gradeTone="yellow"
                  note="恢复灵力"
                  quantity={36}
                  actions={(
                    <>
                      <UiButton type="button">使用</UiButton>
                      <UiButton type="button" variants={['danger']}>丢下</UiButton>
                    </>
                  )}
                />
              </UiList>
            )}
            secondary={(
              <div className="prototype-detail-card">
                <UiPanelFrame title="右侧详情" subtitle="SplitPane Secondary">
                  <UiFieldRow label="当前选中" value="流火长剑" />
                  <UiFieldRow label="容器" value="UiSplitPane" />
                </UiPanelFrame>
              </div>
            )}
          />
        </UiPanelFrame>

        <UiPanelFrame title="复杂物品" subtitle="品阶 / 类型 / chip / 动作区">
          <UiGameItem
            name="九转凝息诀"
            typeLabel="功法书"
            quantity="x1"
            gradeLabel="地品"
            gradeTone="earth"
            note="主修功法 · hover 详情"
            chips={['境五', '法术', '火行']}
            actions={(
              <>
                <UiButton type="button" variants={['ghost']}>查看</UiButton>
                <UiButton type="button" variants={['ghost']}>上架</UiButton>
              </>
            )}
          />
        </UiPanelFrame>
      </div>
    </UiSection>
  );
}
/**
 * HudPanelPreview：渲染Hud面板Preview组件。
 * @returns 无返回值，直接更新Hud面板Preview相关状态。
 */


function HudPanelPreview() {
  return (
    <div id="hud">
      <div className="hud-panel">
        <div className="hud-identity">
          <div className="hud-name">{PROTOTYPE_PLAYER.displayName}</div>
          <div className="hud-title">{PROTOTYPE_PLAYER.title}</div>
        </div>

        <div className="hud-resource-bars">
          <UiResourceBar
            className="hud-resource-bar"
            label="生命值"
            value={PROTOTYPE_PLAYER.hp}
            max={PROTOTYPE_PLAYER.hpMax}
            tone="health"
            valueText={`${formatNumber(PROTOTYPE_PLAYER.hp)} / ${formatNumber(PROTOTYPE_PLAYER.hpMax)}`}
          />
          <UiResourceBar
            className="hud-resource-bar"
            label="灵力"
            value={PROTOTYPE_PLAYER.qi}
            max={PROTOTYPE_PLAYER.qiMax}
            tone="qi"
            valueText={`${formatNumber(PROTOTYPE_PLAYER.qi)} / ${formatNumber(PROTOTYPE_PLAYER.qiMax)}`}
          />
          <UiResourceBar
            className="hud-resource-bar"
            label="修为"
            value={PROTOTYPE_PLAYER.cultivate}
            max={PROTOTYPE_PLAYER.cultivateMax}
            tone="cultivate"
            variant="progress"
            valueText={`${formatNumber(PROTOTYPE_PLAYER.cultivate)} / ${formatNumber(PROTOTYPE_PLAYER.cultivateMax)}`}
          />
        </div>

        <div className="hud-grid">
          <div className="hud-row">
            <span className="hud-label">玩家</span>
            <span className="hud-value">{PROTOTYPE_PLAYER.name}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">地图</span>
            <span className="hud-value">{PROTOTYPE_PLAYER.map}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">位置</span>
            <span className="hud-value">{PROTOTYPE_PLAYER.position}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">底蕴</span>
            <span className="hud-value">{formatNumber(PROTOTYPE_PLAYER.foundation)}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
/**
 * AttrPanelPreview：渲染Attr面板Preview组件。
 * @returns 无返回值，直接更新Attr面板Preview相关状态。
 */


function AttrPanelPreview() {
  const [activeTab, setActiveTab] = useState<string>(PROTOTYPE_ATTR_TABS[0].id);
  const active = PROTOTYPE_ATTR_TABS.find((tab) => tab.id === activeTab) ?? PROTOTYPE_ATTR_TABS[0];

  return (
    <UiSection title="属性 / 装备">
      <UiTabList
        items={PROTOTYPE_ATTR_TABS.map((tab) => ({ key: tab.id, label: tab.label }))}
        activeKey={active.id}
        onChange={setActiveTab}
      />
      <UiList className="prototype-kv-grid">
        {active.rows.map(([label, value]) => (
          <UiFieldRow key={label} label={label} value={value} />
        ))}
      </UiList>
      <div className="prototype-chip-row">
        <span className="prototype-chip">基础</span>
        <span className="prototype-chip">战斗</span>
        <span className="prototype-chip">特殊</span>
      </div>
    </UiSection>
  );
}
/**
 * EquipmentPanelPreview：渲染装备面板Preview组件。
 * @returns 无返回值，直接更新装备面板Preview相关状态。
 */


function EquipmentPanelPreview() {
  return (
    <UiSection title="装备">
      <div className="prototype-equipment-grid">
        {[
          ['武器', '流火长剑'],
          ['衣服', '青纹法袍'],
          ['头饰', '空'],
          ['鞋子', '云行履'],
          ['护符', '寒玉符'],
          ['法宝', '未装备'],
        ].map(([slot, item]) => (
          <UiEquipmentSlot
            key={slot}
            slot={slot}
            itemName={item}
            stateLabel={item === '空' || item === '未装备' ? '空槽' : '已装备'}
          />
        ))}
      </div>
      <div className="prototype-item-grid">
        <TooltipItemCard name="流火长剑" meta="地品 · +7 强化 · 命中偏向" onClick={() => openInventoryDetail('流火长剑', '地品 · +7 强化 · 命中偏向')} />
        <TooltipItemCard name="青纹法袍" meta="玄品 · 抗性偏向 · 衣服" onClick={() => openInventoryDetail('青纹法袍', '玄品 · 抗性偏向 · 衣服')} />
      </div>
    </UiSection>
  );
}
/**
 * InventoryPanelPreview：渲染背包面板Preview组件。
 * @returns 无返回值，直接更新背包面板Preview相关状态。
 */


function InventoryPanelPreview() {
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_INVENTORY[0]?.id ?? '');
  const visibleItems = useMemo(() => (
    PROTOTYPE_INVENTORY.filter((item) => filter === 'all' || item.category === filter)
  ), [filter]);
  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;

  useEffect(() => {
    if (!selected || selected.id !== selectedId) {
      setSelectedId(visibleItems[0]?.id ?? '');
    }
  }, [selected, selectedId, visibleItems]);

  return (
    <UiSection title="背包">
      <UiTabList
        items={[
          { key: 'all', label: '全部' },
          { key: 'equipment', label: '装备' },
          { key: 'consumable', label: '丹药' },
          { key: 'skill_book', label: '功法书' },
          { key: 'material', label: '材料' },
        ]}
        activeKey={filter}
        onChange={setFilter}
      />
      <UiSplitPane
        primary={(
          <UiList className="prototype-item-grid prototype-item-grid--inventory" orientation="grid" columns={3} scrollable>
            {visibleItems.map((item) => (
              <UiInventoryCell
                key={item.id}
                name={item.name}
                typeLabel={getPrototypeItemTypeLabel(item.category)}
                grade={item.grade}
                gradeTone={resolvePrototypeGradeTone(item.grade)}
                note={item.note}
                quantity={item.qty}
                chips={item.category === 'skill_book' ? ['主修候选', 'hover'] : undefined}
                actions={(
                  <>
                    <UiButton type="button">{item.category === 'consumable' ? '使用' : item.category === 'equipment' ? '装备' : '查看'}</UiButton>
                    <UiButton type="button" variants={['danger']}>丢下</UiButton>
                  </>
                )}
                active={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
                onPointerMove={(event) => {
                  showTooltip(item.name, [`${item.grade} · ${item.note}`, `数量 ${item.qty}`], event.clientX, event.clientY);
                }}
                onPointerLeave={hideTooltip}
              />
            ))}
          </UiList>
        )}
        secondary={(
          <div className="prototype-detail-card">
            {selected ? (
              <UiPanelFrame title={selected.name} subtitle={`${selected.grade} · ${selected.note}`}>
                <UiFieldRow label="数量" value={selected.qty} />
                <UiFieldRow label="品阶" value={selected.grade} />
                <div className="react-ui-detail-preview-actions">
                  <UiButton type="button" variants={['ghost']} onClick={() => openInventoryDetail(selected.name, selected.note)}>打开详情弹层</UiButton>
                </div>
              </UiPanelFrame>
            ) : null}
          </div>
        )}
      />
    </UiSection>
  );
}
/**
 * TechniquePanelPreview：渲染功法面板Preview组件。
 * @returns 无返回值，直接更新功法面板Preview相关状态。
 */


function TechniquePanelPreview() {
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_TECHNIQUES[0]?.id ?? '');
  const selected = PROTOTYPE_TECHNIQUES.find((item) => item.id === selectedId) ?? PROTOTYPE_TECHNIQUES[0] ?? null;

  return (
    <UiSection title="功法">
      <UiSplitPane
        primary={(
          <UiList className="prototype-list" scrollable>
            {PROTOTYPE_TECHNIQUES.map((technique) => (
              <UiTechniqueListItem
                key={technique.id}
                title={technique.name}
                level={technique.level}
                note={technique.note}
                active={selected?.id === technique.id}
                onClick={() => setSelectedId(technique.id)}
              />
            ))}
          </UiList>
        )}
        secondary={(
          <div className="prototype-detail-card">
            {selected ? (
              <UiTechniqueDetail
                title={selected.name}
                subtitle={`${selected.level} · ${selected.note}`}
                badges={['技能 3 / 5', '里程碑 2 / 4']}
                footer={(
                  <div className="prototype-map-placeholder prototype-map-placeholder--compact">
                    <div className="prototype-map-copy">
                      <div className="prototype-map-title">功法展开区</div>
                      <div className="prototype-map-note">心法、技能、进度</div>
                    </div>
                  </div>
                )}
              />
            ) : null}
          </div>
        )}
      />
    </UiSection>
  );
}
/**
 * ActionPanelPreview：渲染Action面板Preview组件。
 * @returns 无返回值，直接更新Action面板Preview相关状态。
 */


function ActionPanelPreview() {
  const [autoBattleEnabled, setAutoBattleEnabled] = useState(true);
  const [selectedActionId, setSelectedActionId] = useState(PROTOTYPE_ACTIONS[0]?.id ?? '');

  return (
    <UiSection title="行动">
      <div className="prototype-chip-row">
        <UiTabButton active={autoBattleEnabled} onClick={() => setAutoBattleEnabled((prev) => !prev)}>
          自动战斗 {autoBattleEnabled ? '开' : '关'}
        </UiTabButton>
      </div>
      <UiList className="prototype-list" scrollable>
        {PROTOTYPE_ACTIONS.map((action) => (
          <UiActionListItem
            key={action.id}
            title={action.name}
            state={action.state}
            note={`${action.note} · 默认 ${action.enabled ? '启用' : '禁用'}`}
            active={selectedActionId === action.id}
            onClick={() => setSelectedActionId(action.id)}
          />
        ))}
      </UiList>
    </UiSection>
  );
}
/**
 * QuestPanelPreview：渲染任务面板Preview组件。
 * @returns 无返回值，直接更新任务面板Preview相关状态。
 */


function QuestPanelPreview() {
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_QUESTS[0]?.id ?? '');
  const selected = PROTOTYPE_QUESTS.find((item) => item.id === selectedId) ?? PROTOTYPE_QUESTS[0] ?? null;

  return (
    <UiSection title="任务">
      <UiSplitPane
        primary={(
          <UiList className="prototype-list" scrollable>
            {PROTOTYPE_QUESTS.map((quest) => (
              <UiQuestListItem
                key={quest.id}
                title={quest.title}
                status={quest.status}
                note={quest.note}
                active={selected?.id === quest.id}
                onClick={() => setSelectedId(quest.id)}
              />
            ))}
          </UiList>
        )}
        secondary={(
          <div className="prototype-detail-card">
            {selected ? (
              <UiPanelFrame title={selected.title} subtitle={selected.note}>
                <div className="react-ui-badge-row">
                  <UiPill>追踪中</UiPill>
                  <UiPill tone="accent">目标已标记</UiPill>
                </div>
                <UiInlineReferenceText
                  text="收集养气丹与寒铁精，随后前往青石坊外击退赤尾狼，最后把九转凝息诀带回驿馆。"
                  references={[
                    { kind: 'item', id: 'pill-1', label: '养气丹', tone: 'required' },
                    { kind: 'item', id: 'mat-1', label: '寒铁精', tone: 'material' },
                    { kind: 'item', id: 'book-1', label: '九转凝息诀', tone: 'reward' },
                    { kind: 'monster', id: 'w-2', label: '赤尾狼', tone: 'monster' },
                  ]}
                />
                <div className="react-ui-detail-preview-actions">
                  <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(PROTOTYPE_MODULES.find((item) => item.id === 'quest') ?? PROTOTYPE_MODULES[0])}>
                    打开详情
                  </UiButton>
                </div>
              </UiPanelFrame>
            ) : null}
          </div>
        )}
      />
    </UiSection>
  );
}
/**
 * WorldPanelPreview：渲染世界面板Preview组件。
 * @returns 无返回值，直接更新世界面板Preview相关状态。
 */


function WorldPanelPreview() {
  return (
    <UiSection title="世界">
      <div className="prototype-world-grid">
        <div className="prototype-map-placeholder">
          <div className="prototype-map-copy">
            <div className="prototype-map-title">地图区域</div>
            <div className="prototype-map-note">附近环境与交互目标</div>
            <div className="prototype-chip-row">
              <span className="prototype-chip">青石坊</span>
              <span className="prototype-chip">安全区域</span>
              <span className="prototype-chip">可移动</span>
            </div>
          </div>
        </div>
        <UiList className="prototype-list" scrollable>
          {PROTOTYPE_WORLD_ENTITIES.map((entity) => (
            <UiWorldEntityRow key={entity.id} name={entity.name} kind={entity.kind} note={entity.note} />
          ))}
        </UiList>
      </div>
      <div className="prototype-chat-log">
        <div className="prototype-chat-line">[系统] 坊市有新的成交记录，灵石已进入托管仓。</div>
        <div className="prototype-chat-line">[任务] 你完成了“坊市来信”，可前往驿馆提交。</div>
        <div className="prototype-chat-line">[战斗] 赤尾狼受到 128 点伤害，剩余生命已不多。</div>
      </div>
    </UiSection>
  );
}
/**
 * MarketPanelPreview：处理坊市面板Preview并更新相关状态。
 * @returns 无返回值，直接更新坊市面板Preview相关状态。
 */


function MarketPanelPreview() {
  const [category, setCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_MARKET[0]?.id ?? '');
  const [tradeQuantity, setTradeQuantity] = useState<number>(1);
  const visibleEntries = useMemo(() => (
    PROTOTYPE_MARKET.filter((entry) => category === 'all' || entry.category === category)
  ), [category]);
  const selected = visibleEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? null;

  useEffect(() => {
    if (!selected || selected.id !== selectedId) {
      setSelectedId(visibleEntries[0]?.id ?? '');
    }
  }, [selected, selectedId, visibleEntries]);

  useEffect(() => {
    setTradeQuantity(1);
  }, [selectedId]);

  return (
    <UiSection title="坊市">
      <UiTabList
        items={[
          { key: 'all', label: '全部' },
          { key: 'equipment', label: '装备' },
          { key: 'skill_book', label: '功法书' },
          { key: 'consumable', label: '丹药' },
          { key: 'material', label: '材料' },
        ]}
        activeKey={category}
        onChange={setCategory}
      />
      <UiSplitPane
        primary={(
          <UiList className="prototype-list" scrollable>
            {visibleEntries.map((entry) => (
              <UiInventoryCell
                key={entry.id}
                name={entry.name}
                typeLabel={getPrototypeItemTypeLabel(entry.category)}
                grade={`卖 ${formatNumber(entry.sell)} · 买 ${formatNumber(entry.buy)}`}
                gradeTone={resolvePrototypeGradeTone(entry.note.includes('强化装备') ? '地品' : entry.note.includes('功法书') ? '地品' : '黄品')}
                note={entry.note}
                quantity={`持有 ${entry.owned}`}
                chips={[`${entry.category === 'skill_book' ? '功法' : '交易'}`, `差价 ${formatNumber(entry.sell - entry.buy)}`]}
                active={selected?.id === entry.id}
                onClick={() => setSelectedId(entry.id)}
                onPointerMove={(event) => {
                  showTooltip(entry.name, [entry.note, `卖 ${formatNumber(entry.sell)} / 买 ${formatNumber(entry.buy)}`], event.clientX, event.clientY);
                }}
                onPointerLeave={hideTooltip}
              />
            ))}
          </UiList>
        )}
        secondary={(
          <div className="prototype-detail-card">
            {selected ? (
              <UiPanelFrame title={selected.name} subtitle={selected.note}>
                <UiFieldRow label="最低卖价" value={formatNumber(selected.sell)} />
                <UiFieldRow label="最高买价" value={formatNumber(selected.buy)} />
                <UiMarketOrderRow side="sell" price={formatNumber(selected.sell)} quantity={tradeQuantity} owner="当前卖盘" />
                <UiMarketOrderRow side="buy" price={formatNumber(selected.buy)} quantity={Math.max(1, tradeQuantity + 2)} owner="当前买盘" />
                <UiPriceEditor label="单价" value={selected.sell} min={1} max={99999} step={10} presets={[selected.buy, selected.sell, selected.sell + 500]} onChange={() => {}} />
                <UiQuantityStepper
                  label="交易数量"
                  value={tradeQuantity}
                  min={1}
                  max={Math.max(1, selected.owned || 99)}
                  onChange={setTradeQuantity}
                />
                <div className="react-ui-detail-preview-actions">
                  <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(PROTOTYPE_MODULES.find((item) => item.id === 'market') ?? PROTOTYPE_MODULES[0])}>
                    打开详情
                  </UiButton>
                </div>
              </UiPanelFrame>
            ) : null}
          </div>
        )}
      />
    </UiSection>
  );
}
/**
 * MailPanelPreview：渲染邮件面板Preview组件。
 * @returns 无返回值，直接更新邮件面板Preview相关状态。
 */


function MailPanelPreview() {
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_MAILS[0]?.id ?? '');
  const selected = PROTOTYPE_MAILS.find((mail) => mail.id === selectedId) ?? PROTOTYPE_MAILS[0] ?? null;

  return (
    <UiSection title="邮件">
      <UiSplitPane
        primary={(
          <UiList className="prototype-list" scrollable>
            {PROTOTYPE_MAILS.map((mail) => (
              <UiMailListItem
                key={mail.id}
                title={mail.title}
                sender={mail.from}
                status={mail.status}
                note={mail.note}
                active={selected?.id === mail.id}
                onClick={() => setSelectedId(mail.id)}
              />
            ))}
          </UiList>
        )}
        secondary={(
          <div className="prototype-detail-card">
            {selected ? (
              <UiMailDetail title={selected.title} from={selected.from} bodyLines={selected.body.split('\n')} />
            ) : null}
          </div>
        )}
      />
    </UiSection>
  );
}
/**
 * SettingsPanelPreview：写入Setting面板Preview。
 * @param {
  theme,
  deviceMode,
  scalePercent,
} {
  theme: PrototypeTheme;
  deviceMode: PreviewDeviceMode;
  scalePercent: number;
} 参数说明。
 * @returns 无返回值，直接更新Setting面板Preview相关状态。
 */


function SettingsPanelPreview({
  theme,
  deviceMode,
  scalePercent,
}: {
/**
 * theme：theme相关字段。
 */

  theme: PrototypeTheme;  
  /**
 * deviceMode：deviceMode相关字段。
 */

  deviceMode: PreviewDeviceMode;  
  /**
 * scalePercent：scalePercent相关字段。
 */

  scalePercent: number;
}) {
  const [uiScale, setUiScale] = useState(scalePercent);
  const [fontScale, setFontScale] = useState(100);

  useEffect(() => {
    setUiScale(scalePercent);
  }, [scalePercent]);

  return (
    <UiSection title="设置">
      <UiPanelFrame title="界面选项">
        <UiFieldRow label="主题" value={theme === 'light' ? '浅色' : '深色'} />
        <UiFieldRow label="预览端" value={deviceMode === 'pc' ? 'PC' : '手机'} />
        <UiFieldRow label="预览缩放" value={`${scalePercent}%`} />
      </UiPanelFrame>
      <UiSliderField label="界面缩放" value={uiScale} min={70} max={130} step={5} valueText={`${uiScale}%`} onChange={setUiScale} />
      <UiSliderField label="字体缩放" value={fontScale} min={85} max={120} step={5} valueText={`${fontScale}%`} onChange={setFontScale} />
      <div className="prototype-chip-row">
        <span className="prototype-chip">主题</span>
        <span className="prototype-chip">缩放</span>
        <span className="prototype-chip">端模式</span>
      </div>
    </UiSection>
  );
}
/**
 * GenericModulePreview：渲染Generic模块Preview组件。
 * @param {
  module,
  deviceMode,
} {
  module: PrototypeModuleCardData;
  deviceMode: PreviewDeviceMode;
} 参数说明。
 * @returns 无返回值，直接更新Generic模块Preview相关状态。
 */


function GenericModulePreview({
  module,
  deviceMode,
}: {
/**
 * module：模块引用。
 */

  module: PrototypeModuleCardData;  
  /**
 * deviceMode：deviceMode相关字段。
 */

  deviceMode: PreviewDeviceMode;
}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (module.id === 'heaven-gate') {
    return (
      <UiSection title={module.title}>
        <UiPanelFrame title="突破要求" subtitle="自动高亮物品与怪物">
          <UiInlineReferenceText
            text="突破前需备好养气丹、寒铁精与九转凝息诀，并确认已击退赤尾狼。若条件齐备，方可尝试叩开天门。"
            references={[
              { kind: 'item', id: 'pill-1', label: '养气丹', tone: 'required' },
              { kind: 'item', id: 'mat-1', label: '寒铁精', tone: 'material' },
              { kind: 'item', id: 'book-1', label: '九转凝息诀', tone: 'required' },
              { kind: 'monster', id: 'w-2', label: '赤尾狼', tone: 'monster' },
            ]}
          />
          <div className="react-ui-detail-preview-actions">
            <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(module)}>打开详情</UiButton>
          </div>
        </UiPanelFrame>
      </UiSection>
    );
  }

  return (
    <UiSection
      title={module.title}
      subtitle={undefined}
    >
      <div className={`prototype-generic-preview ${deviceMode === 'mobile' ? 'is-mobile' : ''}`}>
        <div className="prototype-map-placeholder">
          <div className="prototype-map-copy">
            <div className="prototype-map-title">{module.title}</div>
            <div className="prototype-map-note">模块内容区域</div>
          </div>
        </div>
        <div className="prototype-chip-row">
          {module.interactions.map((item) => (
            <span key={item} className="prototype-chip">{item}</span>
          ))}
        </div>
        <div className="react-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(module)}>打开详情</UiButton>
        </div>
      </div>
    </UiSection>
  );
}
/**
 * renderModulePreview：执行模块Preview相关逻辑。
 * @param module PrototypeModuleCardData 参数说明。
 * @param deviceMode PreviewDeviceMode 参数说明。
 * @param theme PrototypeTheme 参数说明。
 * @param scalePercent number 参数说明。
 * @returns 返回模块Preview。
 */


function renderModulePreview(
  module: PrototypeModuleCardData,
  deviceMode: PreviewDeviceMode,
  theme: PrototypeTheme,
  scalePercent: number,
): ReactNode {
  switch (module.id) {
    case 'foundation':
      return <FoundationPanelPreview />;
    case 'login':
      return <LoginPanelPreview />;
    case 'hud':
      return <HudPanelPreview />;
    case 'attr':
      return <AttrPanelPreview />;
    case 'equipment':
      return <EquipmentPanelPreview />;
    case 'inventory':
      return <InventoryPanelPreview />;
    case 'technique':
      return <TechniquePanelPreview />;
    case 'action':
      return <ActionPanelPreview />;
    case 'quest':
      return <QuestPanelPreview />;
    case 'world':
      return <WorldPanelPreview />;
    case 'market':
      return <MarketPanelPreview />;
    case 'mail':
      return <MailPanelPreview />;
    case 'settings':
      return <SettingsPanelPreview theme={theme} deviceMode={deviceMode} scalePercent={scalePercent} />;
    default:
      return <GenericModulePreview module={module} deviceMode={deviceMode} />;
  }
}
/**
 * ModuleNavigator：渲染模块Navigator组件。
 * @param {
  groupedModules,
  selectedModuleId,
  onSelect,
} {
  groupedModules: { title: string; items: PrototypeModuleCardData[] }[];
  selectedModuleId: PrototypeModuleId;
  onSelect: (moduleId: PrototypeModuleId) => void;
} 参数说明。
 * @returns 无返回值，直接更新模块Navigator相关状态。
 */


function ModuleNavigator({
  groupedModules,
  selectedModuleId,
  onSelect,
}: {
/**
 * groupedModules：grouped模块相关字段。
 */

  groupedModules: {  
  /**
 * title：title名称或显示文本。
 */
 title: string;  
 /**
 * items：集合字段。
 */
 items: PrototypeModuleCardData[] }[];  
 /**
 * selectedModuleId：selected模块ID标识。
 */

  selectedModuleId: PrototypeModuleId;  
  /**
 * onSelect：onSelect相关字段。
 */

  onSelect: (moduleId: PrototypeModuleId) => void;
}) {
  return (
    <UiSection title="模块">
      <div className="prototype-shell-nav">
        {groupedModules.map((group) => (
          <div key={group.title} className="prototype-shell-nav-group">
            <div className="prototype-shell-nav-title">{group.title}</div>
            <UiTabList
              items={group.items.map((module) => ({ key: module.id, label: module.title }))}
              activeKey={selectedModuleId}
              onChange={onSelect}
              orientation="vertical"
              className="prototype-shell-nav-list"
              itemClassName="prototype-shell-nav-btn"
            />
          </div>
        ))}
      </div>
    </UiSection>
  );
}
/**
 * PrototypeDesktopShell：渲染PrototypeDesktopShell组件。
 * @param {
  groupedModules,
  selectedModuleId,
  onSelectModule,
  renderSelectedModule,
} {
  groupedModules: { title: string; items: PrototypeModuleCardData[] }[];
  selectedModuleId: PrototypeModuleId;
  onSelectModule: (moduleId: PrototypeModuleId) => void;
  renderSelectedModule: ReactNode;
} 参数说明。
 * @returns 无返回值，直接更新PrototypeDesktopShell相关状态。
 */


function PrototypeDesktopShell({
  groupedModules,
  selectedModuleId,
  onSelectModule,
  renderSelectedModule,
}: {
/**
 * groupedModules：grouped模块相关字段。
 */

  groupedModules: {  
  /**
 * title：title名称或显示文本。
 */
 title: string;  
 /**
 * items：集合字段。
 */
 items: PrototypeModuleCardData[] }[];  
 /**
 * selectedModuleId：selected模块ID标识。
 */

  selectedModuleId: PrototypeModuleId;  
  /**
 * onSelectModule：onSelect模块引用。
 */

  onSelectModule: (moduleId: PrototypeModuleId) => void;  
  /**
 * renderSelectedModule：Selected模块引用。
 */

  renderSelectedModule: ReactNode;
}) {
  return (
    <div className="prototype-single-shell">
      <div className="prototype-layout-section prototype-layout-section--nav">
        <ModuleNavigator groupedModules={groupedModules} selectedModuleId={selectedModuleId} onSelect={onSelectModule} />
      </div>
      <div className="prototype-layout-section prototype-layout-section--fill">
        {renderSelectedModule}
      </div>
    </div>
  );
}
/**
 * PrototypeMobileShell：渲染PrototypeMobileShell组件。
 * @param {
  groupedModules,
  selectedModuleId,
  onSelectModule,
  renderSelectedModule,
} {
  groupedModules: { title: string; items: PrototypeModuleCardData[] }[];
  selectedModuleId: PrototypeModuleId;
  onSelectModule: (moduleId: PrototypeModuleId) => void;
  renderSelectedModule: ReactNode;
} 参数说明。
 * @returns 无返回值，直接更新PrototypeMobileShell相关状态。
 */


function PrototypeMobileShell({
  groupedModules,
  selectedModuleId,
  onSelectModule,
  renderSelectedModule,
}: {
/**
 * groupedModules：grouped模块相关字段。
 */

  groupedModules: {  
  /**
 * title：title名称或显示文本。
 */
 title: string;  
 /**
 * items：集合字段。
 */
 items: PrototypeModuleCardData[] }[];  
 /**
 * selectedModuleId：selected模块ID标识。
 */

  selectedModuleId: PrototypeModuleId;  
  /**
 * onSelectModule：onSelect模块引用。
 */

  onSelectModule: (moduleId: PrototypeModuleId) => void;  
  /**
 * renderSelectedModule：Selected模块引用。
 */

  renderSelectedModule: ReactNode;
}) {
  return (
    <div className="prototype-mobile-shell">
      <div className="prototype-layout-section prototype-layout-section--nav">
        <ModuleNavigator groupedModules={groupedModules} selectedModuleId={selectedModuleId} onSelect={onSelectModule} />
      </div>
      <div className="prototype-layout-section prototype-layout-section--fill">
        {renderSelectedModule}
      </div>
    </div>
  );
}
/**
 * PrototypeApp：渲染PrototypeApp组件。
 * @returns 无返回值，直接更新PrototypeApp相关状态。
 */


export function PrototypeApp() {
  const [theme, setTheme] = useState<PrototypeTheme>('light');
  const [deviceMode, setDeviceMode] = useState<PreviewDeviceMode>('pc');
  const [scalePercent, setScalePercent] = useState<number>(100);
  const [selectedModuleId, setSelectedModuleId] = useState<PrototypeModuleId>('foundation');

  useEffect(() => {
    document.documentElement.dataset.colorMode = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const groupedModules = useMemo(() => {
    return MODULE_GROUPS.map((group) => ({
      title: group.title,
      items: group.ids
        .map((id) => PROTOTYPE_MODULES.find((module) => module.id === id))
        .filter((module): module is PrototypeModuleCardData => Boolean(module)),
    }));
  }, []);

  const selectedModule = PROTOTYPE_MODULES.find((module) => module.id === selectedModuleId) ?? PROTOTYPE_MODULES[0];
  const previewScale = scalePercent / 100;
  const previewBaseWidth = deviceMode === 'pc' ? 1120 : 420;
  const previewBaseHeight = deviceMode === 'pc' ? 860 : 980;
  const selectedModuleNode = renderModulePreview(selectedModule, deviceMode, theme, scalePercent);

  return (
    <div className="prototype-page">
      <div className="prototype-shell">
        <UiSection title="显示设置">
          <UiToolbar className="prototype-settings-toolbar">
            <div className="prototype-setting-inline">
              <span className="prototype-setting-label">主题</span>
              <div className="prototype-pill-row">
                <UiTabButton active={theme === 'light'} onClick={() => setTheme('light')}>浅色</UiTabButton>
                <UiTabButton active={theme === 'dark'} onClick={() => setTheme('dark')}>深色</UiTabButton>
              </div>
            </div>

            <div className="prototype-setting-inline">
              <span className="prototype-setting-label">端</span>
              <div className="prototype-pill-row">
                <UiTabButton active={deviceMode === 'pc'} onClick={() => setDeviceMode('pc')}>PC</UiTabButton>
                <UiTabButton active={deviceMode === 'mobile'} onClick={() => setDeviceMode('mobile')}>手机</UiTabButton>
              </div>
            </div>

            <div className="prototype-setting-inline prototype-setting-inline--scale">
              <span className="prototype-setting-label">缩放</span>
              <div className="prototype-pill-row">
                {SCALE_PRESETS.map((value) => (
                  <UiTabButton
                    key={value}
                    active={scalePercent === value}
                    onClick={() => setScalePercent(value)}
                  >
                    {value}%
                  </UiTabButton>
                ))}
              </div>
              <UiSliderField label="预览缩放" value={scalePercent} min={70} max={130} step={5} valueText={`${scalePercent}%`} onChange={setScalePercent} />
            </div>

            <div className="prototype-setting-inline prototype-setting-inline--actions">
              <UiButton type="button" variants={['ghost']} onClick={() => showToast('Toast host 正常。', 'success')}>Toast</UiButton>
              <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(selectedModule)}>详情</UiButton>
            </div>
          </UiToolbar>
        </UiSection>

        <div className="prototype-preview-stage">
          <div
            className={`prototype-preview-shell prototype-preview-shell--${deviceMode}`}
            style={{
              width: `${previewBaseWidth * previewScale}px`,
              minHeight: `${previewBaseHeight * previewScale}px`,
            }}
          >
            <div
              className="prototype-preview-shell-inner"
              style={{
                width: `${previewBaseWidth}px`,
                minHeight: `${previewBaseHeight}px`,
                transform: `scale(${previewScale})`,
              }}
            >
              {deviceMode === 'pc' ? (
                <PrototypeDesktopShell
                  groupedModules={groupedModules}
                  selectedModuleId={selectedModuleId}
                  onSelectModule={setSelectedModuleId}
                  renderSelectedModule={selectedModuleNode}
                />
              ) : (
                <PrototypeMobileShell
                  groupedModules={groupedModules}
                  selectedModuleId={selectedModuleId}
                  onSelectModule={setSelectedModuleId}
                  renderSelectedModule={selectedModuleNode}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <TooltipLayer />
      <DetailModalLayer />
      <ToastLayer />
    </div>
  );
}
