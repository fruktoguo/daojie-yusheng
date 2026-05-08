import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { t } from '../../ui/i18n';
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
    title: t('prototype.module-group.main-shell'),
    ids: ['foundation', 'login', 'hud', 'attr', 'equipment', 'inventory', 'technique', 'action', 'quest', 'world', 'market', 'mail', 'settings'],
  },
  {
    title: t('prototype.module-group.supplement'),
    ids: ['suggestion', 'npc-shop', 'npc-quest', 'craft', 'loot', 'minimap', 'tutorial', 'changelog'],
  },
  {
    title: t('prototype.module-group.management'),
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
      return t('prototype.item-type.equipment');
    case 'consumable':
      return t('prototype.item-type.consumable');
    case 'skill_book':
      return t('prototype.item-type.skill-book');
    case 'material':
      return t('prototype.item-type.material');
    case 'special':
      return t('prototype.item-type.special');
    default:
      return t('prototype.item-type.default');
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
    return t('prototype.module.status.prototype-ready');
  }
  if (status === 'in-progress') {
    return t('prototype.module.status.in-progress');
  }
  return t('prototype.module.status.planned');
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
          <UiButton type="button" variants={['ghost']} onClick={closeDetailModal}>{t('prototype.action.close')}</UiButton>
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
          <UiButton type="button" variants={['ghost']} onClick={closeDetailModal}>{t('prototype.action.close')}</UiButton>
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
        showTooltip(name, [meta, t('prototype.tooltip.item.future')], event.clientX, event.clientY);
      }}
      onPointerLeave={hideTooltip}
    >
      <div className="prototype-item-meta">{t('prototype.action.view-details')}</div>
    </UiItemCard>
  );
}
/**
 * LoginPanelPreview：渲染Login面板Preview组件。
 * @returns 无返回值，直接更新Login面板Preview相关状态。
 */


function LoginPanelPreview() {
  return (
    <UiSection title={t('prototype.section.login')}>
      <div className="prototype-login-grid">
        <div className="prototype-input-stack">
          <input value="gu_changqing" readOnly />
          <input value="******" readOnly />
          <input value={t('prototype.login.display-name.short')} readOnly />
          <UiButton type="button">{t('prototype.action.login')}</UiButton>
        </div>
        <div className="prototype-list">
          <div className="prototype-list-item">
            <div className="prototype-list-title">{t('prototype.login.account-role.title')}</div>
            <div className="prototype-list-note">{t('prototype.login.account-role.note')}</div>
          </div>
          <div className="prototype-list-item">
            <div className="prototype-list-title">{t('prototype.login.display-name.title')}</div>
            <div className="prototype-list-note">{t('prototype.login.display-name.note')}</div>
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
    <UiSection title={t('prototype.section.foundation')}>
      <div className="prototype-foundation-grid">
        <UiPanelFrame title={t('prototype.foundation.frame.controls.title')} subtitle={t('prototype.foundation.frame.controls.subtitle')}>
          <UiToolbar className="prototype-pill-row">
            <UiButton type="button">{t('prototype.button.primary')}</UiButton>
            <UiButton type="button" variants={['ghost']}>{t('prototype.button.ghost')}</UiButton>
            <UiButton type="button" variants={['danger']}>{t('prototype.button.danger')}</UiButton>
          </UiToolbar>
          <UiToolbar className="prototype-pill-row">
            <UiPill>{t('prototype.pill.default')}</UiPill>
            <UiPill tone="accent">{t('prototype.pill.accent')}</UiPill>
          </UiToolbar>
          <UiTabList
            items={[
              { key: 'primary', label: t('prototype.tab.normal-state') },
              { key: 'danger', label: t('prototype.tab.danger-state') },
            ]}
            activeKey={activeTab}
            onChange={setActiveTab}
          />
          <UiTabList
            items={[
              { key: 'inventory', label: t('prototype.tab.inventory') },
              { key: 'market', label: t('prototype.tab.market') },
              { key: 'mail', label: t('prototype.tab.mail') },
            ]}
            activeKey={activeListTab}
            onChange={setActiveListTab}
            orientation="vertical"
            className="prototype-foundation-vertical-tabs"
          />
        </UiPanelFrame>

        <UiPanelFrame title={t('prototype.foundation.frame.fields.title')} subtitle={t('prototype.foundation.frame.fields.subtitle')}>
          <UiFieldRow label={t('prototype.foundation.field.character-name')} value={t('prototype.player.name')} />
          <UiFieldRow label={t('prototype.foundation.field.realm')} value={t('prototype.player.realm')} />
          <UiFieldRow label={t('prototype.foundation.field.spirit-stone')} value={formatNumber(58210)} />
          <div className="prototype-form-stack">
            <label className="react-ui-form-field">
              <span className="react-ui-form-label">{t('prototype.foundation.input.normal')}</span>
              <input className="react-ui-input" defaultValue={t('prototype.inventory.item.flowing-fire-sword')} />
            </label>
            <label className="react-ui-form-field">
              <span className="react-ui-form-label">{t('prototype.foundation.input.description')}</span>
              <input className="react-ui-input" defaultValue={t('prototype.foundation.input.description-value')} />
            </label>
          </div>
        </UiPanelFrame>

        <UiPanelFrame title={t('prototype.foundation.frame.resource.title')} subtitle={t('prototype.foundation.frame.resource.subtitle')}>
          <div className="react-ui-resource-stack">
            <UiResourceBar label={t('prototype.resource.health')} value={PROTOTYPE_PLAYER.hp} max={PROTOTYPE_PLAYER.hpMax} tone="health" valueText={`${formatNumber(PROTOTYPE_PLAYER.hp)} / ${formatNumber(PROTOTYPE_PLAYER.hpMax)}`} />
            <UiResourceBar label={t('prototype.resource.qi')} value={PROTOTYPE_PLAYER.qi} max={PROTOTYPE_PLAYER.qiMax} tone="qi" valueText={`${formatNumber(PROTOTYPE_PLAYER.qi)} / ${formatNumber(PROTOTYPE_PLAYER.qiMax)}`} />
            <UiResourceBar label={t('prototype.resource.cultivate')} value={PROTOTYPE_PLAYER.cultivate} max={PROTOTYPE_PLAYER.cultivateMax} tone="cultivate" variant="progress" valueText={`${formatNumber(PROTOTYPE_PLAYER.cultivate)} / ${formatNumber(PROTOTYPE_PLAYER.cultivateMax)}`} />
          </div>
        </UiPanelFrame>

        <UiPanelFrame title={t('prototype.foundation.frame.inputs.title')} subtitle={t('prototype.foundation.frame.inputs.subtitle')}>
          <UiSliderField
            label={t('prototype.foundation.slider.ui-scale')}
            value={sliderValue}
            min={70}
            max={130}
            step={5}
            valueText={`${sliderValue}%`}
            onChange={setSliderValue}
          />
          <UiQuantityStepper
            label={t('prototype.foundation.quantity-stepper')}
            value={quantity}
            min={1}
            max={99}
            step={1}
            onChange={setQuantity}
          />
          <UiPriceEditor
            label={t('prototype.foundation.price-editor')}
            value={price}
            min={1}
            max={99999}
            step={10}
            presets={[1280, 1880, 2880]}
            onChange={setPrice}
          />
        </UiPanelFrame>

        <UiPanelFrame title={t('prototype.foundation.frame.split-list.title')} subtitle={t('prototype.foundation.frame.split-list.subtitle')}>
          <UiSplitPane
            secondarySize={260}
            primary={(
              <UiList className="prototype-item-grid prototype-item-grid--inventory" orientation="grid" columns={2} scrollable>
                <UiInventoryCell
                  name={t('prototype.inventory.item.flowing-fire-sword')}
                  typeLabel={t('prototype.inventory.cell.flowing-fire-sword.type')}
                  grade={t('prototype.inventory.cell.flowing-fire-sword.grade')}
                  gradeTone="earth"
                  note={t('prototype.inventory.cell.flowing-fire-sword.note')}
                  quantity={1}
                  chips={[t('prototype.inventory.cell.flowing-fire-sword.chip.level'), t('prototype.inventory.cell.flowing-fire-sword.chip.element')]}
                  actions={(
                    <>
                      <UiButton type="button">{t('prototype.action.equip')}</UiButton>
                      <UiButton type="button" variants={['danger']}>{t('prototype.action.drop')}</UiButton>
                    </>
                  )}
                  active
                />
                <UiInventoryCell
                  name={t('prototype.inventory.item.qing-pattern-robe')}
                  typeLabel={t('prototype.inventory.cell.qing-pattern-robe.type')}
                  grade={t('prototype.inventory.cell.qing-pattern-robe.grade')}
                  gradeTone="mystic"
                  note={t('prototype.inventory.cell.qing-pattern-robe.note')}
                  quantity={1}
                  chips={[t('prototype.inventory.cell.qing-pattern-robe.chip.level')]}
                  actions={(
                    <>
                      <UiButton type="button">{t('prototype.action.equip')}</UiButton>
                      <UiButton type="button" variants={['danger']}>{t('prototype.action.drop')}</UiButton>
                    </>
                  )}
                />
                <UiInventoryCell
                  name={t('prototype.inventory.item.qi-pill')}
                  typeLabel={t('prototype.inventory.cell.qi-pill.type')}
                  grade={t('prototype.inventory.cell.qi-pill.grade')}
                  gradeTone="yellow"
                  note={t('prototype.inventory.cell.qi-pill.note')}
                  quantity={36}
                  actions={(
                    <>
                      <UiButton type="button">{t('prototype.action.use')}</UiButton>
                      <UiButton type="button" variants={['danger']}>{t('prototype.action.drop')}</UiButton>
                    </>
                  )}
                />
              </UiList>
            )}
            secondary={(
              <div className="prototype-detail-card">
                <UiPanelFrame title={t('prototype.foundation.split-pane.detail.title')} subtitle={t('prototype.foundation.split-pane.detail.subtitle')}>
                  <UiFieldRow label={t('prototype.foundation.split-pane.detail.selected')} value={t('prototype.inventory.item.flowing-fire-sword')} />
                  <UiFieldRow label={t('prototype.foundation.split-pane.detail.container')} value="UiSplitPane" />
                </UiPanelFrame>
              </div>
            )}
          />
        </UiPanelFrame>

        <UiPanelFrame title={t('prototype.foundation.frame.item.title')} subtitle={t('prototype.foundation.frame.item.subtitle')}>
          <UiGameItem
            name={t('prototype.inventory.item.nine-turn-convergence-manual')}
            typeLabel={t('prototype.item-type.skill-book')}
            quantity="x1"
            gradeLabel={t('prototype.grade.earth')}
            gradeTone="earth"
            note={t('prototype.technique.nine-turn-convergence-manual.note')}
            chips={[t('prototype.foundation.item-chip.realm-five'), t('prototype.foundation.item-chip.spell'), t('prototype.foundation.item-chip.element-fire')]}
            actions={(
              <>
                <UiButton type="button" variants={['ghost']}>{t('prototype.action.view')}</UiButton>
                <UiButton type="button" variants={['ghost']}>{t('prototype.action.list-for-sale')}</UiButton>
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
            label={t('prototype.resource.health')}
            value={PROTOTYPE_PLAYER.hp}
            max={PROTOTYPE_PLAYER.hpMax}
            tone="health"
            valueText={`${formatNumber(PROTOTYPE_PLAYER.hp)} / ${formatNumber(PROTOTYPE_PLAYER.hpMax)}`}
          />
          <UiResourceBar
            className="hud-resource-bar"
            label={t('prototype.resource.qi')}
            value={PROTOTYPE_PLAYER.qi}
            max={PROTOTYPE_PLAYER.qiMax}
            tone="qi"
            valueText={`${formatNumber(PROTOTYPE_PLAYER.qi)} / ${formatNumber(PROTOTYPE_PLAYER.qiMax)}`}
          />
          <UiResourceBar
            className="hud-resource-bar"
            label={t('prototype.resource.cultivate')}
            value={PROTOTYPE_PLAYER.cultivate}
            max={PROTOTYPE_PLAYER.cultivateMax}
            tone="cultivate"
            variant="progress"
            valueText={`${formatNumber(PROTOTYPE_PLAYER.cultivate)} / ${formatNumber(PROTOTYPE_PLAYER.cultivateMax)}`}
          />
        </div>

        <div className="hud-grid">
        <div className="hud-row">
            <span className="hud-label">{t('prototype.hud.player')}</span>
            <span className="hud-value">{PROTOTYPE_PLAYER.name}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">{t('prototype.hud.map')}</span>
            <span className="hud-value">{PROTOTYPE_PLAYER.map}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">{t('prototype.hud.position')}</span>
            <span className="hud-value">{PROTOTYPE_PLAYER.position}</span>
          </div>
          <div className="hud-row">
            <span className="hud-label">{t('prototype.hud.foundation')}</span>
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
    <UiSection title={t('prototype.section.attr-equipment')}>
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
        <span className="prototype-chip">{t('prototype.attr-tab.base')}</span>
        <span className="prototype-chip">{t('prototype.attr-tab.combat')}</span>
        <span className="prototype-chip">{t('prototype.attr-tab.special')}</span>
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
    <UiSection title={t('prototype.section.equipment')}>
      <div className="prototype-equipment-grid">
        {[
          [t('prototype.equipment.slot.weapon'), t('prototype.inventory.item.flowing-fire-sword')],
          [t('prototype.equipment.slot.clothes'), t('prototype.inventory.item.qing-pattern-robe')],
          [t('prototype.equipment.slot.head'), t('prototype.equipment.slot.empty')],
          [t('prototype.equipment.slot.shoes'), t('prototype.equipment.item.cloud-walk-boots')],
          [t('prototype.equipment.slot.talisman'), t('prototype.equipment.item.cold-jade-talisman')],
          [t('prototype.equipment.slot.artifact'), t('prototype.equipment.slot.unequipped')],
        ].map(([slot, item]) => (
          <UiEquipmentSlot
            key={slot}
            slot={slot}
            itemName={item}
            stateLabel={item === t('prototype.equipment.slot.empty') || item === t('prototype.equipment.slot.unequipped') ? t('prototype.equipment.state.empty-slot') : t('prototype.equipment.state.equipped')}
          />
        ))}
      </div>
      <div className="prototype-item-grid">
        <TooltipItemCard name={t('prototype.inventory.item.flowing-fire-sword')} meta={t('prototype.equipment.card.flowing-fire-sword.meta')} onClick={() => openInventoryDetail(t('prototype.inventory.item.flowing-fire-sword'), t('prototype.equipment.card.flowing-fire-sword.meta'))} />
        <TooltipItemCard name={t('prototype.inventory.item.qing-pattern-robe')} meta={t('prototype.equipment.card.qing-pattern-robe.meta')} onClick={() => openInventoryDetail(t('prototype.inventory.item.qing-pattern-robe'), t('prototype.equipment.card.qing-pattern-robe.meta'))} />
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
    <UiSection title={t('prototype.section.inventory')}>
      <UiTabList
        items={[
          { key: 'all', label: t('prototype.inventory.filter.all') },
          { key: 'equipment', label: t('prototype.inventory.filter.equipment') },
          { key: 'consumable', label: t('prototype.inventory.filter.consumable') },
          { key: 'skill_book', label: t('prototype.inventory.filter.skill-book') },
          { key: 'material', label: t('prototype.inventory.filter.material') },
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
                chips={item.category === 'skill_book' ? [t('prototype.inventory.item.skill-book.candidate'), t('prototype.inventory.item.skill-book.hover')] : undefined}
                actions={(
                  <>
                    <UiButton type="button">{item.category === 'consumable' ? t('prototype.action.use') : item.category === 'equipment' ? t('prototype.action.equip') : t('prototype.action.view')}</UiButton>
                    <UiButton type="button" variants={['danger']}>{t('prototype.action.drop')}</UiButton>
                  </>
                )}
                active={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
                onPointerMove={(event) => {
                  showTooltip(item.name, [t('prototype.inventory.tooltip.line', { grade: item.grade, note: item.note }), t('prototype.inventory.tooltip.quantity', { qty: item.qty })], event.clientX, event.clientY);
                }}
                onPointerLeave={hideTooltip}
              />
            ))}
          </UiList>
        )}
        secondary={(
          <div className="prototype-detail-card">
            {selected ? (
              <UiPanelFrame title={selected.name} subtitle={t('prototype.inventory.detail.subtitle', { grade: selected.grade, note: selected.note })}>
                <UiFieldRow label={t('prototype.inventory.detail.count')} value={selected.qty} />
                <UiFieldRow label={t('prototype.inventory.detail.grade')} value={selected.grade} />
                <div className="react-ui-detail-preview-actions">
                  <UiButton type="button" variants={['ghost']} onClick={() => openInventoryDetail(selected.name, selected.note)}>{t('prototype.action.open-detail-modal')}</UiButton>
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
    <UiSection title={t('prototype.section.technique')}>
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
                badges={[t('prototype.technique.badge.skill-progress'), t('prototype.technique.badge.milestone-progress')]}
                footer={(
                  <div className="prototype-map-placeholder prototype-map-placeholder--compact">
                    <div className="prototype-map-copy">
                      <div className="prototype-map-title">{t('prototype.technique.expand.title')}</div>
                      <div className="prototype-map-note">{t('prototype.technique.expand.note')}</div>
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
    <UiSection title={t('prototype.section.action')}>
      <div className="prototype-chip-row">
        <UiTabButton active={autoBattleEnabled} onClick={() => setAutoBattleEnabled((prev) => !prev)}>
          {t('prototype.action.auto-battle')} {autoBattleEnabled ? t('prototype.action.on') : t('prototype.action.off')}
        </UiTabButton>
      </div>
      <UiList className="prototype-list" scrollable>
        {PROTOTYPE_ACTIONS.map((action) => (
          <UiActionListItem
            key={action.id}
            title={action.name}
            state={action.state}
            note={t('prototype.action.note.default-enabled', { note: action.note, state: action.enabled ? t('prototype.action.enabled') : t('prototype.action.disabled') })}
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
    <UiSection title={t('prototype.section.quest')}>
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
                  <UiPill>{t('prototype.quest.badge.tracking')}</UiPill>
                  <UiPill tone="accent">{t('prototype.quest.badge.target-marked')}</UiPill>
                </div>
                <UiInlineReferenceText
                  text={t('prototype.quest.inline-reference.text')}
                  references={[
                    { kind: 'item', id: 'pill-1', label: t('prototype.inventory.item.qi-pill'), tone: 'required' },
                    { kind: 'item', id: 'mat-1', label: t('prototype.inventory.item.cold-iron-essence'), tone: 'material' },
                    { kind: 'item', id: 'book-1', label: t('prototype.inventory.item.nine-turn-convergence-manual'), tone: 'reward' },
                    { kind: 'monster', id: 'w-2', label: t('prototype.world.crimson-tail-wolf.name'), tone: 'monster' },
                  ]}
                />
                <div className="react-ui-detail-preview-actions">
                  <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(PROTOTYPE_MODULES.find((item) => item.id === 'quest') ?? PROTOTYPE_MODULES[0])}>
                    {t('prototype.action.open-detail')}
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
    <UiSection title={t('prototype.section.world')}>
      <div className="prototype-world-grid">
        <div className="prototype-map-placeholder">
          <div className="prototype-map-copy">
            <div className="prototype-map-title">{t('prototype.world.map.title')}</div>
            <div className="prototype-map-note">{t('prototype.world.map.note')}</div>
            <div className="prototype-chip-row">
              <span className="prototype-chip">{t('prototype.player.map')}</span>
              <span className="prototype-chip">{t('prototype.world.map.safe-area')}</span>
              <span className="prototype-chip">{t('prototype.world.map.movable')}</span>
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
        <div className="prototype-chat-line">{t('prototype.world.chat.system')}</div>
        <div className="prototype-chat-line">{t('prototype.world.chat.quest')}</div>
        <div className="prototype-chat-line">{t('prototype.world.chat.battle')}</div>
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
    <UiSection title={t('prototype.section.market')}>
      <UiTabList
        items={[
          { key: 'all', label: t('prototype.market.filter.all') },
          { key: 'equipment', label: t('prototype.market.filter.equipment') },
          { key: 'skill_book', label: t('prototype.market.filter.skill-book') },
          { key: 'consumable', label: t('prototype.market.filter.consumable') },
          { key: 'material', label: t('prototype.market.filter.material') },
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
                grade={t('prototype.market.price-range', { sell: formatNumber(entry.sell), buy: formatNumber(entry.buy) })}
                gradeTone={resolvePrototypeGradeTone(entry.note.includes(t('prototype.market.note.enhanced-equipment-keyword')) ? t('prototype.grade.earth') : entry.note.includes(t('prototype.market.note.skill-book-keyword')) ? t('prototype.grade.earth') : t('prototype.grade.yellow'))}
                note={entry.note}
                quantity={t('prototype.market.quantity-held', { count: entry.owned })}
                chips={[entry.category === 'skill_book' ? t('prototype.market.chip.technique') : t('prototype.market.chip.trade'), t('prototype.market.chip.spread', { spread: formatNumber(entry.sell - entry.buy) })]}
                active={selected?.id === entry.id}
                onClick={() => setSelectedId(entry.id)}
                onPointerMove={(event) => {
                  showTooltip(entry.name, [entry.note, t('prototype.market.tooltip.price', { sell: formatNumber(entry.sell), buy: formatNumber(entry.buy) })], event.clientX, event.clientY);
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
                <UiFieldRow label={t('prototype.market.detail.lowest-sell')} value={formatNumber(selected.sell)} />
                <UiFieldRow label={t('prototype.market.detail.highest-buy')} value={formatNumber(selected.buy)} />
                <UiMarketOrderRow side="sell" price={formatNumber(selected.sell)} quantity={tradeQuantity} owner={t('prototype.market.owner.sell-book')} />
                <UiMarketOrderRow side="buy" price={formatNumber(selected.buy)} quantity={Math.max(1, tradeQuantity + 2)} owner={t('prototype.market.owner.buy-book')} />
                <UiPriceEditor label={t('prototype.market.detail.unit-price')} value={selected.sell} min={1} max={99999} step={10} presets={[selected.buy, selected.sell, selected.sell + 500]} onChange={() => {}} />
                <UiQuantityStepper
                  label={t('prototype.market.detail.trade-quantity')}
                  value={tradeQuantity}
                  min={1}
                  max={Math.max(1, selected.owned || 99)}
                  onChange={setTradeQuantity}
                />
                <div className="react-ui-detail-preview-actions">
                  <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(PROTOTYPE_MODULES.find((item) => item.id === 'market') ?? PROTOTYPE_MODULES[0])}>
                    {t('prototype.action.open-detail')}
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
    <UiSection title={t('prototype.section.mail')}>
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
    <UiSection title={t('prototype.section.settings')}>
      <UiPanelFrame title={t('prototype.settings.frame.title')}>
        <UiFieldRow label={t('prototype.settings.field.theme')} value={theme === 'light' ? t('prototype.theme.light') : t('prototype.theme.dark')} />
        <UiFieldRow label={t('prototype.settings.field.device')} value={deviceMode === 'pc' ? t('prototype.device.pc') : t('prototype.device.mobile')} />
        <UiFieldRow label={t('prototype.settings.field.preview-scale')} value={`${scalePercent}%`} />
      </UiPanelFrame>
      <UiSliderField label={t('prototype.settings.slider.ui-scale')} value={uiScale} min={70} max={130} step={5} valueText={`${uiScale}%`} onChange={setUiScale} />
      <UiSliderField label={t('prototype.settings.slider.font-scale')} value={fontScale} min={85} max={120} step={5} valueText={`${fontScale}%`} onChange={setFontScale} />
      <div className="prototype-chip-row">
        <span className="prototype-chip">{t('prototype.settings.chip.theme')}</span>
        <span className="prototype-chip">{t('prototype.settings.chip.scale')}</span>
        <span className="prototype-chip">{t('prototype.settings.chip.device-mode')}</span>
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
        <UiPanelFrame title={t('prototype.heaven-gate.frame.requirements.title')} subtitle={t('prototype.heaven-gate.frame.requirements.subtitle')}>
          <UiInlineReferenceText
            text={t('prototype.heaven-gate.requirements.text')}
            references={[
              { kind: 'item', id: 'pill-1', label: t('prototype.inventory.item.qi-pill'), tone: 'required' },
              { kind: 'item', id: 'mat-1', label: t('prototype.inventory.item.cold-iron-essence'), tone: 'material' },
              { kind: 'item', id: 'book-1', label: t('prototype.inventory.item.nine-turn-convergence-manual'), tone: 'required' },
              { kind: 'monster', id: 'w-2', label: t('prototype.world.crimson-tail-wolf.name'), tone: 'monster' },
            ]}
          />
          <div className="react-ui-detail-preview-actions">
            <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(module)}>{t('prototype.action.open-detail')}</UiButton>
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
            <div className="prototype-map-note">{t('prototype.module.content-area')}</div>
          </div>
        </div>
        <div className="prototype-chip-row">
          {module.interactions.map((item) => (
            <span key={item} className="prototype-chip">{item}</span>
          ))}
        </div>
        <div className="react-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(module)}>{t('prototype.action.open-detail')}</UiButton>
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
    <UiSection title={t('prototype.section.module')}>
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
    <UiSection title={t('prototype.section.display-settings')}>
          <UiToolbar className="prototype-settings-toolbar">
            <div className="prototype-setting-inline">
              <span className="prototype-setting-label">{t('prototype.display.theme')}</span>
              <div className="prototype-pill-row">
                <UiTabButton active={theme === 'light'} onClick={() => setTheme('light')}>{t('prototype.theme.light')}</UiTabButton>
                <UiTabButton active={theme === 'dark'} onClick={() => setTheme('dark')}>{t('prototype.theme.dark')}</UiTabButton>
              </div>
            </div>

          <div className="prototype-setting-inline">
            <span className="prototype-setting-label">{t('prototype.display.device')}</span>
              <div className="prototype-pill-row">
                <UiTabButton active={deviceMode === 'pc'} onClick={() => setDeviceMode('pc')}>{t('prototype.device.pc')}</UiTabButton>
                <UiTabButton active={deviceMode === 'mobile'} onClick={() => setDeviceMode('mobile')}>{t('prototype.device.mobile')}</UiTabButton>
              </div>
            </div>

            <div className="prototype-setting-inline prototype-setting-inline--scale">
              <span className="prototype-setting-label">{t('prototype.display.scale')}</span>
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
              <UiSliderField label={t('prototype.display.preview-scale')} value={scalePercent} min={70} max={130} step={5} valueText={`${scalePercent}%`} onChange={setScalePercent} />
            </div>

            <div className="prototype-setting-inline prototype-setting-inline--actions">
              <UiButton type="button" variants={['ghost']} onClick={() => showToast(t('prototype.toast.host-ok'), 'success')}>{t('prototype.action.toast')}</UiButton>
              <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(selectedModule)}>{t('prototype.action.detail')}</UiButton>
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
