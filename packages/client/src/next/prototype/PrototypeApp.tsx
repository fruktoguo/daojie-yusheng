import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NextDetailModalLayer } from '../overlays/NextDetailModalLayer';
import { NextToastLayer } from '../overlays/NextToastLayer';
import { NextTooltipLayer } from '../overlays/NextTooltipLayer';
import {
  closeNextDetailModal,
  hideNextTooltip,
  openNextDetailModal,
  showNextToast,
  showNextTooltip,
} from '../overlays/overlay-store';
import { UiButton } from '../primitives/UiButton';
import { UiPill } from '../primitives/UiPill';
import { UiSection } from '../primitives/UiSection';
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

type PrototypeTheme = 'light' | 'dark';
type PreviewDeviceMode = 'pc' | 'mobile';

const SCALE_PRESETS = [75, 90, 100, 110, 125] as const;
const MODULE_GROUPS: ReadonlyArray<{
  title: string;
  ids: PrototypeModuleId[];
}> = [
  {
    title: '主壳层',
    ids: ['login', 'hud', 'attr', 'equipment', 'inventory', 'technique', 'action', 'quest', 'world', 'market', 'mail', 'settings'],
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function ratioPercent(current: number, max: number): string {
  if (max <= 0) {
    return '0%';
  }
  return `${Math.max(0, Math.min(100, (current / max) * 100))}%`;
}

function getModuleStatusLabel(status: PrototypeModuleCardData['status']): string {
  if (status === 'prototype-ready') {
    return '原型已覆盖';
  }
  if (status === 'in-progress') {
    return '迁移中';
  }
  return '待迁移';
}

function openModulePreview(module: PrototypeModuleCardData): void {
  openNextDetailModal({
    title: module.title,
    subtitle: undefined,
    body: (
      <div className="prototype-modal-grid">
        <div className="prototype-modal-copy">{module.title}</div>
        <div className="prototype-chip-row">
          {module.interactions.map((item) => (
            <span key={item} className="prototype-chip">{item}</span>
          ))}
        </div>
        <div className="next-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={closeNextDetailModal}>关闭</UiButton>
        </div>
      </div>
    ),
  });
}

function openInventoryDetail(itemName: string, note: string): void {
  openNextDetailModal({
    title: itemName,
    subtitle: undefined,
    body: (
      <div className="prototype-modal-grid">
        <div className="prototype-chip-row">
          <span className="prototype-chip">{note}</span>
        </div>
        <div className="next-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={closeNextDetailModal}>关闭</UiButton>
        </div>
      </div>
    ),
  });
}

function TooltipItemCard({
  name,
  meta,
  onClick,
}: {
  name: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="prototype-item-card"
      onClick={onClick}
      onPointerMove={(event) => {
        showNextTooltip(name, [meta, '这里未来接入统一物品 Tooltip 内容。'], event.clientX, event.clientY);
      }}
      onPointerLeave={hideNextTooltip}
    >
      <div className="prototype-list-title">{name}</div>
      <div className="prototype-item-meta">{meta}</div>
    </button>
  );
}

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

function HudPanelPreview() {
  return (
    <UiSection title="HUD" subtitle={`${PROTOTYPE_PLAYER.title} · ${PROTOTYPE_PLAYER.realm}`}>
      <div className="prototype-resource-stack">
        <div className="prototype-resource">
          <div className="prototype-resource-head">
            <span>生命值</span>
            <span>{formatNumber(PROTOTYPE_PLAYER.hp)} / {formatNumber(PROTOTYPE_PLAYER.hpMax)}</span>
          </div>
          <div className="prototype-resource-track">
            <div className="prototype-resource-fill" style={{ width: ratioPercent(PROTOTYPE_PLAYER.hp, PROTOTYPE_PLAYER.hpMax) }} />
          </div>
        </div>
        <div className="prototype-resource">
          <div className="prototype-resource-head">
            <span>灵力</span>
            <span>{formatNumber(PROTOTYPE_PLAYER.qi)} / {formatNumber(PROTOTYPE_PLAYER.qiMax)}</span>
          </div>
          <div className="prototype-resource-track">
            <div className="prototype-resource-fill prototype-resource-fill--qi" style={{ width: ratioPercent(PROTOTYPE_PLAYER.qi, PROTOTYPE_PLAYER.qiMax) }} />
          </div>
        </div>
        <div className="prototype-resource">
          <div className="prototype-resource-head">
            <span>修为</span>
            <span>{formatNumber(PROTOTYPE_PLAYER.cultivate)} / {formatNumber(PROTOTYPE_PLAYER.cultivateMax)}</span>
          </div>
          <div className="prototype-resource-track">
            <div className="prototype-resource-fill prototype-resource-fill--cultivate" style={{ width: ratioPercent(PROTOTYPE_PLAYER.cultivate, PROTOTYPE_PLAYER.cultivateMax) }} />
          </div>
        </div>
      </div>

      <div className="prototype-stat-grid">
        <div className="prototype-stat">
          <div className="prototype-stat-label">玩家</div>
          <div className="prototype-stat-value">{PROTOTYPE_PLAYER.name}</div>
        </div>
        <div className="prototype-stat">
          <div className="prototype-stat-label">地图</div>
          <div className="prototype-stat-value">{PROTOTYPE_PLAYER.map}</div>
        </div>
        <div className="prototype-stat">
          <div className="prototype-stat-label">位置</div>
          <div className="prototype-stat-value">{PROTOTYPE_PLAYER.position}</div>
        </div>
        <div className="prototype-stat">
          <div className="prototype-stat-label">底蕴</div>
          <div className="prototype-stat-value">{formatNumber(PROTOTYPE_PLAYER.foundation)}</div>
        </div>
      </div>

      <div className="prototype-chip-row">
        <UiPill tone="accent">{PROTOTYPE_PLAYER.displayName}</UiPill>
        <UiPill>{PROTOTYPE_PLAYER.realm}</UiPill>
        <UiPill>{PROTOTYPE_PLAYER.map}</UiPill>
      </div>
    </UiSection>
  );
}

function AttrPanelPreview() {
  const [activeTab, setActiveTab] = useState<string>(PROTOTYPE_ATTR_TABS[0].id);
  const active = PROTOTYPE_ATTR_TABS.find((tab) => tab.id === activeTab) ?? PROTOTYPE_ATTR_TABS[0];

  return (
    <UiSection title="属性 / 装备">
      <div className="prototype-tab-row">
        {PROTOTYPE_ATTR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`prototype-tab-btn ${tab.id === active.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="prototype-kv-grid">
        {active.rows.map(([label, value]) => (
          <div key={label} className="prototype-kv-row">
            <span className="prototype-kv-label">{label}</span>
            <span className="prototype-kv-value">{value}</span>
          </div>
        ))}
      </div>
      <div className="prototype-chip-row">
        <span className="prototype-chip">基础</span>
        <span className="prototype-chip">战斗</span>
        <span className="prototype-chip">特殊</span>
      </div>
    </UiSection>
  );
}

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
          <div key={slot} className="prototype-list-item">
            <div className="prototype-list-head">
              <span className="prototype-list-title">{slot}</span>
              <span className="prototype-chip">{item === '空' || item === '未装备' ? '空槽' : '已装备'}</span>
            </div>
            <div className="prototype-list-note">{item}</div>
          </div>
        ))}
      </div>
      <div className="prototype-item-grid">
        <TooltipItemCard name="流火长剑" meta="地品 · +7 强化 · 命中偏向" onClick={() => openInventoryDetail('流火长剑', '地品 · +7 强化 · 命中偏向')} />
        <TooltipItemCard name="青纹法袍" meta="玄品 · 抗性偏向 · 衣服" onClick={() => openInventoryDetail('青纹法袍', '玄品 · 抗性偏向 · 衣服')} />
      </div>
    </UiSection>
  );
}

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
      <div className="prototype-tab-row">
        {[
          ['all', '全部'],
          ['equipment', '装备'],
          ['consumable', '丹药'],
          ['skill_book', '功法书'],
          ['material', '材料'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`prototype-tab-btn ${filter === id ? 'active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="prototype-two-pane">
        <div className="prototype-list">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`prototype-list-item ${selected?.id === item.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(item.id)}
              onPointerMove={(event) => {
                showNextTooltip(item.name, [`${item.grade} · ${item.note}`, `数量 ${item.qty}`], event.clientX, event.clientY);
              }}
              onPointerLeave={hideNextTooltip}
            >
              <div className="prototype-list-head">
                <span className="prototype-list-title">{item.name}</span>
                <span className="prototype-chip">{item.qty}</span>
              </div>
              <div className="prototype-list-note">{item.grade} · {item.note}</div>
            </button>
          ))}
        </div>
        <div className="prototype-detail-card">
          {selected ? (
            <>
              <div className="prototype-detail-title">{selected.name}</div>
              <div className="prototype-detail-copy">{selected.grade} · {selected.note}</div>
              <div className="prototype-chip-row">
                <span className="prototype-chip">数量 {selected.qty}</span>
                <span className="prototype-chip">{selected.grade}</span>
              </div>
              <div className="next-ui-detail-preview-actions">
                <UiButton type="button" variants={['ghost']} onClick={() => openInventoryDetail(selected.name, selected.note)}>打开详情弹层</UiButton>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </UiSection>
  );
}

function TechniquePanelPreview() {
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_TECHNIQUES[0]?.id ?? '');
  const selected = PROTOTYPE_TECHNIQUES.find((item) => item.id === selectedId) ?? PROTOTYPE_TECHNIQUES[0] ?? null;

  return (
    <UiSection title="功法">
      <div className="prototype-two-pane">
        <div className="prototype-list">
          {PROTOTYPE_TECHNIQUES.map((technique) => (
            <button
              key={technique.id}
              type="button"
              className={`prototype-list-item ${selected?.id === technique.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(technique.id)}
            >
              <div className="prototype-list-head">
                <span className="prototype-list-title">{technique.name}</span>
                <span className="prototype-chip">{technique.level}</span>
              </div>
              <div className="prototype-list-note">{technique.note}</div>
            </button>
          ))}
        </div>
        <div className="prototype-detail-card">
          {selected ? (
            <>
              <div className="prototype-detail-title">{selected.name}</div>
              <div className="prototype-detail-copy">{selected.level} · {selected.note}</div>
              <div className="prototype-chip-row">
                <span className="prototype-chip">技能 3 / 5</span>
                <span className="prototype-chip">里程碑 2 / 4</span>
              </div>
              <div className="prototype-map-placeholder prototype-map-placeholder--compact">
                <div className="prototype-map-copy">
                  <div className="prototype-map-title">功法展开区</div>
                  <div className="prototype-map-note">心法、技能、进度</div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </UiSection>
  );
}

function ActionPanelPreview() {
  const [autoBattleEnabled, setAutoBattleEnabled] = useState(true);
  const [selectedActionId, setSelectedActionId] = useState(PROTOTYPE_ACTIONS[0]?.id ?? '');

  return (
    <UiSection title="行动">
      <div className="prototype-chip-row">
        <button type="button" className={`prototype-tab-btn ${autoBattleEnabled ? 'active' : ''}`} onClick={() => setAutoBattleEnabled((prev) => !prev)}>
          自动战斗 {autoBattleEnabled ? '开' : '关'}
        </button>
      </div>
      <div className="prototype-list">
        {PROTOTYPE_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`prototype-list-item ${selectedActionId === action.id ? 'is-active' : ''}`}
            onClick={() => setSelectedActionId(action.id)}
          >
            <div className="prototype-list-head">
              <span className="prototype-list-title">{action.name}</span>
              <span className="prototype-chip">{action.state}</span>
            </div>
            <div className="prototype-list-note">{action.note} · 默认 {action.enabled ? '启用' : '禁用'}</div>
          </button>
        ))}
      </div>
    </UiSection>
  );
}

function QuestPanelPreview() {
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_QUESTS[0]?.id ?? '');
  const selected = PROTOTYPE_QUESTS.find((item) => item.id === selectedId) ?? PROTOTYPE_QUESTS[0] ?? null;

  return (
    <UiSection title="任务">
      <div className="prototype-two-pane">
        <div className="prototype-list">
          {PROTOTYPE_QUESTS.map((quest) => (
            <button
              key={quest.id}
              type="button"
              className={`prototype-list-item ${selected?.id === quest.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(quest.id)}
            >
              <div className="prototype-list-head">
                <span className="prototype-list-title">{quest.title}</span>
                <span className="prototype-chip">{quest.status}</span>
              </div>
              <div className="prototype-list-note">{quest.note}</div>
            </button>
          ))}
        </div>
        <div className="prototype-detail-card">
          {selected ? (
            <>
              <div className="prototype-detail-title">{selected.title}</div>
              <div className="prototype-detail-copy">{selected.note}</div>
              <div className="prototype-chip-row">
                <span className="prototype-chip">追踪中</span>
                <span className="prototype-chip">目标已标记</span>
              </div>
              <div className="next-ui-detail-preview-actions">
                <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(PROTOTYPE_MODULES.find((item) => item.id === 'quest') ?? PROTOTYPE_MODULES[0])}>
                  打开详情
                </UiButton>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </UiSection>
  );
}

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
        <div className="prototype-list">
          {PROTOTYPE_WORLD_ENTITIES.map((entity) => (
            <div key={entity.id} className="prototype-list-item">
              <div className="prototype-list-head">
                <span className="prototype-list-title">{entity.name}</span>
                <span className="prototype-chip">{entity.kind}</span>
              </div>
              <div className="prototype-list-note">{entity.note}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="prototype-chat-log">
        <div className="prototype-chat-line">[系统] 坊市有新的成交记录，灵石已进入托管仓。</div>
        <div className="prototype-chat-line">[任务] 你完成了“坊市来信”，可前往驿馆提交。</div>
        <div className="prototype-chat-line">[战斗] 赤尾狼受到 128 点伤害，剩余生命已不多。</div>
      </div>
    </UiSection>
  );
}

function MarketPanelPreview() {
  const [category, setCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_MARKET[0]?.id ?? '');
  const visibleEntries = useMemo(() => (
    PROTOTYPE_MARKET.filter((entry) => category === 'all' || entry.category === category)
  ), [category]);
  const selected = visibleEntries.find((entry) => entry.id === selectedId) ?? visibleEntries[0] ?? null;

  useEffect(() => {
    if (!selected || selected.id !== selectedId) {
      setSelectedId(visibleEntries[0]?.id ?? '');
    }
  }, [selected, selectedId, visibleEntries]);

  return (
    <UiSection title="坊市">
      <div className="prototype-tab-row">
        {[
          ['all', '全部'],
          ['equipment', '装备'],
          ['skill_book', '功法书'],
          ['consumable', '丹药'],
          ['material', '材料'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`prototype-tab-btn ${category === id ? 'active' : ''}`}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="prototype-two-pane">
        <div className="prototype-list">
          {visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`prototype-list-item ${selected?.id === entry.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(entry.id)}
              onPointerMove={(event) => {
                showNextTooltip(entry.name, [entry.note, `卖 ${formatNumber(entry.sell)} / 买 ${formatNumber(entry.buy)}`], event.clientX, event.clientY);
              }}
              onPointerLeave={hideNextTooltip}
            >
              <div className="prototype-list-head">
                <span className="prototype-list-title">{entry.name}</span>
                <span className="prototype-chip">持有 {entry.owned}</span>
              </div>
              <div className="prototype-list-note">{entry.note}</div>
              <div className="prototype-list-note">卖 {formatNumber(entry.sell)} · 买 {formatNumber(entry.buy)}</div>
            </button>
          ))}
        </div>
        <div className="prototype-detail-card">
          {selected ? (
            <>
              <div className="prototype-detail-title">{selected.name}</div>
              <div className="prototype-detail-copy">{selected.note}</div>
              <div className="prototype-kv-grid">
                <div className="prototype-kv-row">
                  <span className="prototype-kv-label">最低卖价</span>
                  <span className="prototype-kv-value">{formatNumber(selected.sell)}</span>
                </div>
                <div className="prototype-kv-row">
                  <span className="prototype-kv-label">最高买价</span>
                  <span className="prototype-kv-value">{formatNumber(selected.buy)}</span>
                </div>
              </div>
              <div className="next-ui-detail-preview-actions">
                <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(PROTOTYPE_MODULES.find((item) => item.id === 'market') ?? PROTOTYPE_MODULES[0])}>
                  打开详情
                </UiButton>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </UiSection>
  );
}

function MailPanelPreview() {
  const [selectedId, setSelectedId] = useState<string>(PROTOTYPE_MAILS[0]?.id ?? '');
  const selected = PROTOTYPE_MAILS.find((mail) => mail.id === selectedId) ?? PROTOTYPE_MAILS[0] ?? null;

  return (
    <UiSection title="邮件">
      <div className="prototype-two-pane">
        <div className="prototype-list">
          {PROTOTYPE_MAILS.map((mail) => (
            <button
              key={mail.id}
              type="button"
              className={`prototype-list-item ${selected?.id === mail.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(mail.id)}
            >
              <div className="prototype-list-head">
                <span className="prototype-list-title">{mail.title}</span>
                <span className="prototype-chip">{mail.status}</span>
              </div>
              <div className="prototype-list-note">{mail.from} · {mail.note}</div>
            </button>
          ))}
        </div>
        <div className="prototype-detail-card">
          {selected ? (
            <>
              <div className="prototype-detail-title">{selected.title}</div>
              <div className="prototype-detail-copy">来自 {selected.from}</div>
              <div className="prototype-mail-body">
                {selected.body.split('\n').map((line, index) => (
                  <p key={`${selected.id}-${index}`}>{line}</p>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </UiSection>
  );
}

function SettingsPanelPreview({
  theme,
  deviceMode,
  scalePercent,
}: {
  theme: PrototypeTheme;
  deviceMode: PreviewDeviceMode;
  scalePercent: number;
}) {
  return (
    <UiSection title="设置">
      <div className="prototype-kv-grid">
        <div className="prototype-kv-row">
          <span className="prototype-kv-label">主题</span>
          <span className="prototype-kv-value">{theme === 'light' ? '浅色' : '深色'}</span>
        </div>
        <div className="prototype-kv-row">
          <span className="prototype-kv-label">预览端</span>
          <span className="prototype-kv-value">{deviceMode === 'pc' ? 'PC' : '手机'}</span>
        </div>
        <div className="prototype-kv-row">
          <span className="prototype-kv-label">预览缩放</span>
          <span className="prototype-kv-value">{scalePercent}%</span>
        </div>
      </div>
      <div className="prototype-chip-row">
        <span className="prototype-chip">主题</span>
        <span className="prototype-chip">缩放</span>
        <span className="prototype-chip">端模式</span>
      </div>
    </UiSection>
  );
}

function GenericModulePreview({
  module,
  deviceMode,
}: {
  module: PrototypeModuleCardData;
  deviceMode: PreviewDeviceMode;
}) {
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
        <div className="next-ui-detail-preview-actions">
          <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(module)}>打开详情</UiButton>
        </div>
      </div>
    </UiSection>
  );
}

function renderModulePreview(
  module: PrototypeModuleCardData,
  deviceMode: PreviewDeviceMode,
  theme: PrototypeTheme,
  scalePercent: number,
): ReactNode {
  switch (module.id) {
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

function ModuleNavigator({
  groupedModules,
  selectedModuleId,
  onSelect,
}: {
  groupedModules: { title: string; items: PrototypeModuleCardData[] }[];
  selectedModuleId: PrototypeModuleId;
  onSelect: (moduleId: PrototypeModuleId) => void;
}) {
  return (
    <UiSection title="模块">
      <div className="prototype-shell-nav">
        {groupedModules.map((group) => (
          <div key={group.title} className="prototype-shell-nav-group">
            <div className="prototype-shell-nav-title">{group.title}</div>
            <div className="prototype-shell-nav-list">
              {group.items.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  className={`prototype-shell-nav-btn ${selectedModuleId === module.id ? 'active' : ''}`}
                  onClick={() => onSelect(module.id)}
                >
                  {module.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </UiSection>
  );
}

function PrototypeDesktopShell({
  groupedModules,
  selectedModuleId,
  onSelectModule,
  renderSelectedModule,
}: {
  groupedModules: { title: string; items: PrototypeModuleCardData[] }[];
  selectedModuleId: PrototypeModuleId;
  onSelectModule: (moduleId: PrototypeModuleId) => void;
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

function PrototypeMobileShell({
  groupedModules,
  selectedModuleId,
  onSelectModule,
  renderSelectedModule,
}: {
  groupedModules: { title: string; items: PrototypeModuleCardData[] }[];
  selectedModuleId: PrototypeModuleId;
  onSelectModule: (moduleId: PrototypeModuleId) => void;
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

export function PrototypeApp() {
  const [theme, setTheme] = useState<PrototypeTheme>('light');
  const [deviceMode, setDeviceMode] = useState<PreviewDeviceMode>('pc');
  const [scalePercent, setScalePercent] = useState<number>(100);
  const [selectedModuleId, setSelectedModuleId] = useState<PrototypeModuleId>('inventory');

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
          <div className="prototype-settings-toolbar">
            <div className="prototype-setting-inline">
              <span className="prototype-setting-label">主题</span>
              <div className="prototype-pill-row">
                <button type="button" className={`prototype-tab-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>浅色</button>
                <button type="button" className={`prototype-tab-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>深色</button>
              </div>
            </div>

            <div className="prototype-setting-inline">
              <span className="prototype-setting-label">端</span>
              <div className="prototype-pill-row">
                <button type="button" className={`prototype-tab-btn ${deviceMode === 'pc' ? 'active' : ''}`} onClick={() => setDeviceMode('pc')}>PC</button>
                <button type="button" className={`prototype-tab-btn ${deviceMode === 'mobile' ? 'active' : ''}`} onClick={() => setDeviceMode('mobile')}>手机</button>
              </div>
            </div>

            <div className="prototype-setting-inline prototype-setting-inline--scale">
              <span className="prototype-setting-label">缩放 {scalePercent}%</span>
              <div className="prototype-pill-row">
                {SCALE_PRESETS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`prototype-tab-btn ${scalePercent === value ? 'active' : ''}`}
                    onClick={() => setScalePercent(value)}
                  >
                    {value}%
                  </button>
                ))}
              </div>
              <input
                className="prototype-scale-slider"
                type="range"
                min="70"
                max="130"
                step="5"
                value={scalePercent}
                onChange={(event) => setScalePercent(Number(event.target.value))}
              />
            </div>

            <div className="prototype-setting-inline prototype-setting-inline--actions">
              <UiButton type="button" variants={['ghost']} onClick={() => showNextToast('Toast host 正常。', 'success')}>Toast</UiButton>
              <UiButton type="button" variants={['ghost']} onClick={() => openModulePreview(selectedModule)}>详情</UiButton>
            </div>
          </div>
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

      <NextTooltipLayer />
      <NextDetailModalLayer />
      <NextToastLayer />
    </div>
  );
}
