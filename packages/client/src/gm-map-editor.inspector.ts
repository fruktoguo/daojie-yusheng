/**
 * gm-map-editor.inspector.ts —— GM 地图编辑器属性面板（Inspector）各 Tab 渲染。
 *
 * 从 GmMapEditor 类抽取的 inspector 渲染逻辑：renderSelectedEntitySection 等。
 * 通过参数接收所需数据，不直接依赖类实例的私有字段。
 * 纯 HTML 生成，不修改任何状态。
 */

import {
  type GmMapDocument,
  type GmMapContainerRecord,
  type GmMapLandmarkRecord,
  type GmMapPortalRecord,
  type GmMapNpcRecord,
  type GmMapMonsterSpawnRecord,
  type GmMapAuraRecord,
  type GmMapResourceRecord,
  type GmMapSafeZoneRecord,
  type GmMapSummary,
  TECHNIQUE_GRADE_LABELS,
  TILE_TYPE_LABELS,
  TERRAIN_TYPE_LABELS,
  SURFACE_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
  INTERACTABLE_KIND_LABELS,
  type PortalRouteDomain,
  type MapRouteDomain,
  type TileType,
} from '@mud/shared';
import {
  PAINT_TILE_TYPES,
  PAINT_TERRAIN_TYPES,
  PAINT_SURFACE_TYPES,
  PAINT_STRUCTURE_TYPES,
  PAINT_INTERACTABLE_KINDS,
} from './constants/editor/map-editor';
import {
  booleanField,
  escapeHtml,
  formatAuraPointLabel,
  formatAuraLevelText,
  formatResourcePointLabel,
  formatResourceSummary,
  formatResourceTypeLabel,
  formatTagGroups,
  getResourceRecordKey,
  getResourceRecordKeyName,
  getResourceTypeSortKey,
  numberField,
  nullableDecimalField,
  nullableNumberField,
  nullableSelectField,
  readonlyField,
  selectField,
  textareaField,
  textField,
} from './gm-map-editor-helpers';

const MONSTER_GRADE_OPTIONS = Object.entries(TECHNIQUE_GRADE_LABELS).map(([value, label]) => ({ value, label }));
const PORTAL_ROUTE_DOMAIN_OPTIONS: Array<{ value: PortalRouteDomain; label: string }> = [
  { value: 'inherit', label: '继承地图' },
  { value: 'system', label: '系统传送点' },
  { value: 'sect', label: '宗门传送点' },
  { value: 'personal', label: '个人传送点' },
  { value: 'dynamic', label: '动态图传送点' },
];
const MONSTER_GRADE_OVERRIDE_OPTIONS = [
  { value: '', label: '跟随模板' },
  ...MONSTER_GRADE_OPTIONS,
];

const MAP_ROUTE_DOMAIN_OPTIONS: Array<{ value: MapRouteDomain; label: string }> = [
  { value: 'system', label: '系统地图' },
  { value: 'sect', label: '宗门地图' },
  { value: 'personal', label: '个人地图' },
  { value: 'dynamic', label: '动态图' },
];

const TERRAIN_SELECT_OPTIONS = PAINT_TERRAIN_TYPES.map((value) => ({
  value,
  label: TERRAIN_TYPE_LABELS[value] ?? '未知地貌',
}));
const SURFACE_SELECT_OPTIONS = PAINT_SURFACE_TYPES.map((value) => ({
  value: value ?? '',
  label: value ? SURFACE_TYPE_LABELS[value] ?? '未知地表' : '无',
}));
const STRUCTURE_SELECT_OPTIONS = PAINT_STRUCTURE_TYPES.map((value) => ({
  value: value ?? '',
  label: value ? STRUCTURE_TYPE_LABELS[value] ?? '未知结构' : '无',
}));
const INTERACTABLE_SELECT_OPTIONS = PAINT_INTERACTABLE_KINDS.map((value) => ({
  value: value ?? '',
  label: value ? INTERACTABLE_KIND_LABELS[value] ?? '未知交互物' : '无',
}));

/** InspectorTabSelectedPoint：inspector 中选中格坐标。 */
type InspectorTabSelectedPoint = { x: number; y: number } | null;

/** MapEntitySelection：编辑器当前选中的地图实体定位。 */
type MapEntitySelection =
  | { kind: 'portal'; index: number }
  | { kind: 'npc'; index: number }
  | { kind: 'monster'; index: number }
  | { kind: 'aura'; index: number }
  | { kind: 'resource'; index: number }
  | { kind: 'safeZone'; index: number }
  | { kind: 'landmark'; index: number }
  | { kind: 'container'; index: number }
  | null;

/** ContainerLandmarkInfo：容器地标信息。 */
interface ContainerLandmarkInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  resourceNodeId: string | undefined;
  desc: string | undefined;
  container: GmMapContainerRecord;
}

/** RenderSelectedEntitySectionParams：renderSelectedEntitySection 的参数。 */
interface RenderSelectedEntitySectionParams {
  draft: GmMapDocument | null;
  selectedEntity: MapEntitySelection;
  selectedPoint: InspectorTabSelectedPoint;
  containerLandmark: ContainerLandmarkInfo | null;
  containerTagHint: string;
}

/** renderSelectedEntitySectionHtml：渲染选中实体属性编辑区。 */
export function renderSelectedEntitySectionHtml(params: RenderSelectedEntitySectionParams): string {
  const { draft, selectedEntity, selectedPoint, containerLandmark, containerTagHint } = params;
  if (!draft || !selectedEntity) {
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">对象属性</div>
            <div class="editor-section-note">先从上面的对象列表里选中一个。</div>
          </div>
        </div>
        <div class="editor-note">当前没有选中的传送点、场景人物、怪物刷新点、无属性灵气点、气机点、安全区、地标或容器。</div>
      </section>
    `;
  }

  if (selectedEntity.kind === 'portal') {
    const portal = draft.portals[selectedEntity.index];
    if (!portal) return '';
    const portalKind = portal.kind === 'stairs' ? 'stairs' : 'portal';
    const portalTrigger = portal.trigger ?? (portalKind === 'stairs' ? 'auto' : 'manual');
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">传送点属性</div>
            <div class="editor-section-note">格子 ${selectedPoint ? `(${selectedPoint.x}, ${selectedPoint.y})` : '-'}</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${numberField('X', `portals.${selectedEntity.index}.x`, portal.x)}
          ${numberField('Y', `portals.${selectedEntity.index}.y`, portal.y)}
          ${textField('ID', `portals.${selectedEntity.index}.id`, portal.id)}
          ${selectField('类型', `portals.${selectedEntity.index}.kind`, portalKind, [
            { value: 'portal', label: '传送阵' },
            { value: 'stairs', label: '楼梯' },
          ])}
          ${selectField('触发', `portals.${selectedEntity.index}.trigger`, portalTrigger, [
            { value: 'manual', label: '手动' },
            { value: 'auto', label: '自动' },
          ])}
          ${selectField('方向', `portals.${selectedEntity.index}.direction`, portal.direction ?? 'two_way', [
            { value: 'two_way', label: '双向' },
            { value: 'one_way', label: '单向' },
          ])}
          ${selectField('路网域', `portals.${selectedEntity.index}.routeDomain`, portal.routeDomain ?? 'inherit', PORTAL_ROUTE_DOMAIN_OPTIONS)}
          ${booleanField('允许玩家重叠', `portals.${selectedEntity.index}.allowPlayerOverlap`, portal.allowPlayerOverlap, 'wide')}
          ${booleanField('隐藏入口', `portals.${selectedEntity.index}.hidden`, portal.hidden, 'wide')}
          ${textField('目标地图', `portals.${selectedEntity.index}.targetMapId`, portal.targetMapId)}
          ${textField('目标传送点 ID', `portals.${selectedEntity.index}.targetPortalId`, portal.targetPortalId)}
          ${numberField('目标 X', `portals.${selectedEntity.index}.targetX`, portal.targetX)}
          ${numberField('目标 Y', `portals.${selectedEntity.index}.targetY`, portal.targetY)}
          ${textField('观察标题', `portals.${selectedEntity.index}.observeTitle`, portal.observeTitle, 'wide')}
          ${textField('观察说明', `portals.${selectedEntity.index}.observeDesc`, portal.observeDesc, 'wide')}
        </div>
      </section>
    `;
  }

  if (selectedEntity.kind === 'npc') {
    const npcIndex = selectedEntity.index;
    const npc = draft.npcs[npcIndex];
    if (!npc) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">场景人物属性</div>
            <div class="editor-section-note">任务已迁移到独立章节文件，这里只维护场景人物本身的地图属性。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${textField('ID', `npcs.${npcIndex}.id`, npc.id)}
          ${textField('名称', `npcs.${npcIndex}.name`, npc.name)}
          ${numberField('X', `npcs.${npcIndex}.x`, npc.x)}
          ${numberField('Y', `npcs.${npcIndex}.y`, npc.y)}
          ${textField('显示字', `npcs.${npcIndex}.char`, npc.char)}
          ${textField('颜色', `npcs.${npcIndex}.color`, npc.color)}
          ${textField('角色类型', `npcs.${npcIndex}.role`, npc.role)}
          ${textField('对白', `npcs.${npcIndex}.dialogue`, npc.dialogue, 'wide')}
        </div>
        <div class="editor-note" style="margin-top: 12px;">任务请改到 <code>packages/server/data/content/quests/</code> 下对应章节文件，例如 <code>第一章_主线.json</code>、<code>第一章_支线.json</code>。</div>
      </section>
    `;
  }

  if (selectedEntity.kind === 'monster') {
    const spawn = draft.monsterSpawns[selectedEntity.index];
    if (!spawn) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">怪物刷新点属性</div>
            <div class="editor-section-note">地图里只维护模板引用、可选等级/品阶覆盖，以及生成与漫游参数。名称、显示字、基础属性都来自怪物模板。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${textField('怪物 ID', `monsterSpawns.${selectedEntity.index}.id`, spawn.id)}
          ${numberField('X', `monsterSpawns.${selectedEntity.index}.x`, spawn.x)}
          ${numberField('Y', `monsterSpawns.${selectedEntity.index}.y`, spawn.y)}
          ${readonlyField('名称', spawn.name || '未匹配到怪物模板')}
          ${readonlyField('显示字', spawn.char || '-')}
          ${readonlyField('颜色', spawn.color || '-')}
          ${nullableNumberField('等级覆盖', `monsterSpawns.${selectedEntity.index}.level`, spawn.level)}
          ${nullableSelectField('品阶覆盖', `monsterSpawns.${selectedEntity.index}.grade`, spawn.grade, MONSTER_GRADE_OVERRIDE_OPTIONS)}
          ${nullableNumberField('生成数量', `monsterSpawns.${selectedEntity.index}.count`, spawn.count)}
          ${nullableNumberField('生成半径', `monsterSpawns.${selectedEntity.index}.radius`, spawn.radius)}
          ${nullableNumberField('最大维持数量', `monsterSpawns.${selectedEntity.index}.maxAlive`, spawn.maxAlive)}
          ${nullableNumberField('重生时间(秒)', `monsterSpawns.${selectedEntity.index}.respawnTicks`, spawn.respawnTicks ?? spawn.respawnSec)}
          ${nullableNumberField('分布范围', `monsterSpawns.${selectedEntity.index}.wanderRadius`, spawn.wanderRadius ?? spawn.radius)}
        </div>
        <div class="editor-note">留空时跟随怪物模板；分布范围留空时默认等于生成半径。要改名字、显示字、基础属性、移动速度或索敌半径，请改怪物模板。</div>
      </section>
    `;
  }

  if (selectedEntity.kind === 'safeZone') {
    const zone = draft.safeZones?.[selectedEntity.index];
    if (!zone) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">安全区属性</div>
            <div class="editor-section-note">格子 ${selectedPoint ? `(${selectedPoint.x}, ${selectedPoint.y})` : '-'} · 只限制玩家从区内主动发起攻击。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${numberField('中心 X', `safeZones.${selectedEntity.index}.x`, zone.x)}
          ${numberField('中心 Y', `safeZones.${selectedEntity.index}.y`, zone.y)}
          ${numberField('半径', `safeZones.${selectedEntity.index}.radius`, zone.radius)}
        </div>
      </section>
    `;
  }

  if (selectedEntity.kind === 'container') {
    const selectedIndex = selectedEntity.index;
    if (!containerLandmark) return '';
    const container = containerLandmark.container;
    const poolRows = (container.lootPools ?? []).map((pool, poolIndex) => `
      <section class="editor-section" style="margin-top: 12px;">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">随机池 ${poolIndex + 1}</div>
            <div class="editor-section-note">等级/品阶为筛选条件，tag 组按"每行至少命中一项"组合筛选。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-container-pool" data-pool-index="${poolIndex}">删除随机池</button>
        </div>
        <div class="map-form-grid">
          ${nullableNumberField('抽取次数', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.rolls`, pool.rolls)}
          ${nullableDecimalField('触发概率', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.chance`, pool.chance)}
          ${nullableNumberField('最低等级', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.minLevel`, pool.minLevel)}
          ${nullableNumberField('最高等级', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.maxLevel`, pool.maxLevel)}
          ${nullableSelectField('最低品阶', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.minGrade`, pool.minGrade, [
            { value: '', label: '不限' },
            ...MONSTER_GRADE_OPTIONS,
          ])}
          ${nullableSelectField('最高品阶', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.maxGrade`, pool.maxGrade, [
            { value: '', label: '不限' },
            ...MONSTER_GRADE_OPTIONS,
          ])}
          ${nullableNumberField('最小数量', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.countMin`, pool.countMin)}
          ${nullableNumberField('最大数量', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.countMax`, pool.countMax)}
          ${booleanField('允许重复', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.allowDuplicates`, pool.allowDuplicates, 'wide')}
          ${textareaField('Tag 组', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.tagGroups`, formatTagGroups(pool.tagGroups), 'wide', 'tag-groups')}
        </div>
      </section>
    `).join('');

    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">容器属性</div>
            <div class="editor-section-note">格子 ${selectedPoint ? `(${selectedPoint.x}, ${selectedPoint.y})` : '-'} · 底层仍保存为地标 + container。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除容器</button>
        </div>
        <div class="map-form-grid">
          ${textField('ID', `landmarks.${selectedIndex}.id`, containerLandmark.id)}
          ${textField('名称', `landmarks.${selectedIndex}.name`, containerLandmark.name)}
          ${numberField('X', `landmarks.${selectedIndex}.x`, containerLandmark.x)}
          ${numberField('Y', `landmarks.${selectedIndex}.y`, containerLandmark.y)}
          ${textField('资源节点 ID', `landmarks.${selectedIndex}.resourceNodeId`, containerLandmark.resourceNodeId)}
          ${textField('显示字', `landmarks.${selectedIndex}.container.char`, container.char)}
          ${textField('颜色', `landmarks.${selectedIndex}.container.color`, container.color)}
          ${selectField('搜索阶次', `landmarks.${selectedIndex}.container.grade`, container.grade ?? 'mortal', MONSTER_GRADE_OPTIONS)}
          ${nullableNumberField('刷新 ticks', `landmarks.${selectedIndex}.container.refreshTicks`, container.refreshTicks)}
          ${textareaField('说明', `landmarks.${selectedIndex}.desc`, containerLandmark.desc, 'wide')}
        </div>
        <div class="button-row" style="margin-top: 10px;">
          <button class="small-btn" type="button" data-map-action="add-container-pool">新增随机池</button>
        </div>
        <div class="editor-note" style="margin-top: 12px;">${escapeHtml(containerTagHint)}</div>
      </section>
      ${poolRows || '<div class="editor-note">当前没有随机池，点上方"新增随机池"添加。</div>'}
    `;
  }

  const aura = draft.auras?.[selectedEntity.index];
  if (selectedEntity.kind === 'aura') {
    if (!aura) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
        <div>
          <div class="editor-section-title">无属性灵气点属性</div>
          <div class="editor-section-note">用于配置可自动回补的无属性灵气。</div>
        </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${numberField('X', `auras.${selectedEntity.index}.x`, aura.x)}
          ${numberField('Y', `auras.${selectedEntity.index}.y`, aura.y)}
          ${numberField('灵气值', `auras.${selectedEntity.index}.value`, aura.value)}
        </div>
      </section>
    `;
  }

  if (selectedEntity.kind === 'resource') {
    const resource = draft.resources?.[selectedEntity.index];
    if (!resource) return '';
    const resourceKey = getResourceRecordKey(resource);
    const resourceKeyName = getResourceRecordKeyName(resource);
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">气机点属性</div>
            <div class="editor-section-note">同格可并存多个不同资源键。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${numberField('X', `resources.${selectedEntity.index}.x`, resource.x)}
          ${numberField('Y', `resources.${selectedEntity.index}.y`, resource.y)}
          ${textField('资源键', `resources.${selectedEntity.index}.${resourceKeyName}`, resourceKey, 'wide')}
          ${numberField('数值', `resources.${selectedEntity.index}.value`, resource.value)}
        </div>
      </section>
    `;
  }

  const landmark = draft.landmarks?.[selectedEntity.index];
  if (!landmark) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">地标属性</div>
          <div class="editor-section-note">用于区域名、提示文本和地图标识。</div>
        </div>
        <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
      </div>
      <div class="map-form-grid">
        ${textField('ID', `landmarks.${selectedEntity.index}.id`, landmark.id)}
        ${textField('名称', `landmarks.${selectedEntity.index}.name`, landmark.name)}
        ${numberField('X', `landmarks.${selectedEntity.index}.x`, landmark.x)}
        ${numberField('Y', `landmarks.${selectedEntity.index}.y`, landmark.y)}
        ${textField('资源节点 ID', `landmarks.${selectedEntity.index}.resourceNodeId`, landmark.resourceNodeId)}
        ${textField('说明', `landmarks.${selectedEntity.index}.desc`, landmark.desc, 'wide')}
      </div>
    </section>
  `;
}

// ── 实体列表 Tab 渲染 ──

/** EntityTabParams：实体 Tab 渲染通用参数。 */
interface EntityTabParams {
  draft: GmMapDocument | null;
  selectedEntity: MapEntitySelection;
  selectedPoint: InspectorTabSelectedPoint;
  selectedEntitySectionHtml: string;
}

/** renderPortalTabHtml：渲染传送点 Tab。 */
export function renderPortalTabHtml(params: EntityTabParams & { formatMapTargetLabel: (mapId: string) => string }): string {
  const { draft, selectedEntity, selectedEntitySectionHtml, formatMapTargetLabel } = params;
  if (!draft) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">传送点</div>
          <div class="editor-section-note">可从列表选中，也可直接在地图上拖动移动。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-portal">新建传送点</button>
      </div>
      <div class="map-entity-list">
        ${draft.portals.map((portal, index) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'portal' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="portal" data-entity-index="${index}" type="button">
            ${escapeHtml(`${portal.hidden ? '隐藏' : ''}${portal.direction === 'one_way' ? '单向' : '双向'}${portal.kind === 'stairs' ? '楼梯' : '传送阵'} (${portal.x},${portal.y}) -> ${formatMapTargetLabel(portal.targetMapId)}`)}
          </button>
        `).join('') || '<div class="editor-note">暂无传送点。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'portal'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个传送点后可在下方编辑属性。</div>'}
  `;
}

/** renderNpcTabHtml：渲染 NPC Tab。 */
export function renderNpcTabHtml(params: EntityTabParams): string {
  const { draft, selectedEntity, selectedEntitySectionHtml } = params;
  if (!draft) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">场景人物</div>
          <div class="editor-section-note">选中后可直接拖动位置，也可继续改属性。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-npc">新建场景人物</button>
      </div>
      <div class="map-entity-list">
        ${draft.npcs.map((npc, index) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'npc' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="npc" data-entity-index="${index}" type="button">
            ${escapeHtml(`${npc.name?.trim() || '未命名场景人物'} @ (${npc.x},${npc.y})`)}
          </button>
        `).join('') || '<div class="editor-note">暂无场景人物。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'npc'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个场景人物后可在下方编辑属性。</div>'}
  `;
}

/** renderMonsterTabHtml：渲染妖兽 Tab。 */
export function renderMonsterTabHtml(params: EntityTabParams): string {
  const { draft, selectedEntity, selectedEntitySectionHtml } = params;
  if (!draft) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">怪物刷新点</div>
          <div class="editor-section-note">支持在地图中拖动移动生成点。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-monster">新建怪物点</button>
      </div>
      <div class="map-entity-list">
        ${draft.monsterSpawns.map((spawn, index) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'monster' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="monster" data-entity-index="${index}" type="button">
            ${escapeHtml(`${spawn.name?.trim() || '未命名怪物'} @ (${spawn.x},${spawn.y})`)}
          </button>
        `).join('') || '<div class="editor-note">暂无怪物刷新点。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'monster'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个怪物刷新点后可在下方编辑属性。</div>'}
  `;
}

/** renderAuraTabHtml：渲染灵气 Tab。 */
export function renderAuraTabHtml(params: EntityTabParams): string {
  const { draft, selectedEntity, selectedEntitySectionHtml } = params;
  if (!draft) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">无属性灵气点</div>
          <div class="editor-section-note">切到工具面板后可选等级直接笔刷，0 表示清除。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-aura">新建灵气点</button>
      </div>
      <div class="map-entity-list">
        ${(draft.auras ?? []).map((point, index) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'aura' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="aura" data-entity-index="${index}" type="button">
            ${escapeHtml(`(${point.x},${point.y}) ${formatAuraPointLabel(point.value)}`)}
          </button>
        `).join('') || '<div class="editor-note">暂无灵气点。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'aura'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个无属性灵气点后可在下方编辑属性。</div>'}
  `;
}

/** renderSafeZoneTabHtml：渲染安全区 Tab。 */
export function renderSafeZoneTabHtml(params: EntityTabParams): string {
  const { draft, selectedEntity, selectedEntitySectionHtml } = params;
  if (!draft) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">安全区</div>
          <div class="editor-section-note">玩家站在安全区内时无法主动发起攻击。范围显示与怪物点类似，可直接拖动中心点。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-safe-zone">新建安全区</button>
      </div>
      <div class="map-entity-list">
        ${(draft.safeZones ?? []).map((zone, index) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'safeZone' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="safeZone" data-entity-index="${index}" type="button">
            ${escapeHtml(`中心 (${zone.x},${zone.y}) · 半径 ${zone.radius}`)}
          </button>
        `).join('') || '<div class="editor-note">暂无安全区。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'safeZone'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个安全区后可在下方编辑半径。</div>'}
  `;
}

/** renderLandmarkTabHtml：渲染地标 Tab。 */
export function renderLandmarkTabHtml(params: EntityTabParams): string {
  const { draft, selectedEntity, selectedEntitySectionHtml } = params;
  if (!draft) return '';
  const landmarks = (draft.landmarks ?? []).flatMap((landmark, index) => landmark.container ? [] : [{ landmark, index }]);
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">地标</div>
          <div class="editor-section-note">用于区域名和地图标识，也支持拖动位置。可搜索家具类容器请到"容器"页配置。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-landmark">新建地标</button>
      </div>
      <div class="map-entity-list">
        ${landmarks.map(({ landmark, index }) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'landmark' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="landmark" data-entity-index="${index}" type="button">
            ${escapeHtml(`${landmark.name?.trim() || '未命名地标'} @ (${landmark.x},${landmark.y})`)}
          </button>
        `).join('') || '<div class="editor-note">暂无地标。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'landmark'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个地标后可在下方编辑属性。</div>'}
  `;
}

/** ContainerLandmarkEntry：容器地标列表条目。 */
interface ContainerLandmarkEntry {
  landmark: GmMapLandmarkRecord;
  index: number;
}

/** renderContainerTabHtml：渲染容器 Tab。 */
export function renderContainerTabHtml(params: EntityTabParams & { containers: ContainerLandmarkEntry[] }): string {
  const { draft, selectedEntity, selectedEntitySectionHtml, containers } = params;
  if (!draft) return '';
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">容器</div>
          <div class="editor-section-note">容器实际挂在地标下，这里单独抽出，便于配置展示外观、搜索阶次与随机池。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-container">新建容器</button>
      </div>
      <div class="map-entity-list">
        ${containers.map(({ landmark, index }) => `
          <button class="map-entity-btn ${selectedEntity?.kind === 'container' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="container" data-entity-index="${index}" type="button">
            ${escapeHtml(`${landmark.name?.trim() || '未命名容器'} @ (${landmark.x},${landmark.y}) · ${landmark.container?.char || '箱'} · ${TECHNIQUE_GRADE_LABELS[landmark.container?.grade ?? 'mortal'] ?? '未知品阶'}`)}
          </button>
        `).join('') || '<div class="editor-note">暂无容器。</div>'}
      </div>
    </section>
    ${selectedEntity?.kind === 'container'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个容器后可在下方编辑随机池。</div>'}
  `;
}

// ── 拼图块 Tab 渲染 ──

/** ComposePieceInfo：拼图块渲染所需的最小信息。 */
interface ComposePieceInfo {
  id: string;
  sourceMapName: string;
  x: number;
  y: number;
  rotation: number;
}

/** RenderComposeTabParams：renderComposeTab 的参数。 */
interface RenderComposeTabParams {
  draftId: string | undefined;
  mapList: GmMapSummary[];
  composeSourceMapId: string;
  selectedPiece: ComposePieceInfo | null;
  composePieces: ComposePieceInfo[];
  selectedComposePieceId: string | null;
}

/** renderComposeTabHtml：渲染拼图块 Tab。 */
export function renderComposeTabHtml(params: RenderComposeTabParams): string {
  const { draftId, mapList, composeSourceMapId, selectedPiece, composePieces, selectedComposePieceId } = params;
  const sourceOptions = mapList.filter((map) => map.id !== draftId);
  const selectedSource = composeSourceMapId
    ? mapList.find((map) => map.id === composeSourceMapId) ?? null
    : null;
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">拼图块</div>
          <div class="editor-section-note">把子地图作为临时拼图块放到画布上。左键拖拽移动，旋转后再烘焙进当前地图。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="compose-add-piece">加入拼图块</button>
      </div>
      <div class="map-form-grid compact">
        <label class="map-field wide">
          <span>来源地图</span>
          <select data-map-ui="composeSourceMapId">
            <option value="">请选择子地图</option>
            ${sourceOptions.map((map) => `
              <option value="${escapeHtml(map.id)}" ${map.id === composeSourceMapId ? 'selected' : ''}>
                ${escapeHtml(`${map.name} (${map.id})`)}
              </option>
            `).join('')}
          </select>
        </label>
        ${readonlyField('当前来源', selectedSource ? `${selectedSource.name} · ${selectedSource.width}x${selectedSource.height}` : '未选择')}
        ${readonlyField('选中拼图', selectedPiece ? `${selectedPiece.sourceMapName} @ (${selectedPiece.x}, ${selectedPiece.y}) · ${selectedPiece.rotation}°` : '无')}
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-map-action="compose-rotate-left" ${selectedPiece ? '' : 'disabled'}>左转 90°</button>
        <button class="small-btn" type="button" data-map-action="compose-rotate-right" ${selectedPiece ? '' : 'disabled'}>右转 90°</button>
        <button class="small-btn" type="button" data-map-action="compose-bake-selected" ${selectedPiece ? '' : 'disabled'}>烘焙选中块</button>
        <button class="small-btn" type="button" data-map-action="compose-bake-all" ${composePieces.length > 0 ? '' : 'disabled'}>全部烘焙</button>
      </div>
      <div class="button-row" style="margin-top: 8px;">
        <button class="small-btn danger" type="button" data-map-action="compose-remove-piece" ${selectedPiece ? '' : 'disabled'}>删除选中块</button>
        <button class="small-btn danger" type="button" data-map-action="compose-clear-pieces" ${composePieces.length > 0 ? '' : 'disabled'}>清空拼图块</button>
      </div>
      <div class="map-entity-list" style="margin-top: 10px;">
        ${composePieces.map((piece) => `
          <button class="map-entity-btn ${piece.id === selectedComposePieceId ? 'active' : ''}" data-compose-piece-id="${escapeHtml(piece.id)}" type="button">
            ${escapeHtml(`${piece.sourceMapName} @ (${piece.x},${piece.y}) · ${piece.rotation}°`)}
          </button>
        `).join('') || '<div class="editor-note">暂无拼图块。</div>'}
      </div>
    </section>
    <div class="editor-note" style="margin-top: 8px;">
      当前烘焙只写入地块，不自动带入子图里的传送点、场景人物、怪物、灵气和地标，避免把内部逻辑一并拼进大图。
    </div>
  `;
}

// ── 气机点 Tab 渲染 ──

/** renderResourceTabHtml：渲染气机点 Tab。 */
export function renderResourceTabHtml(
  params: EntityTabParams & { resourcePaintKey: string; resourcePaintValue: number },
): string {
  const { draft, selectedEntity, selectedEntitySectionHtml, resourcePaintKey, resourcePaintValue } = params;
  if (!draft) return '';
  const uniqueKeys = [...new Set((draft.resources ?? []).map((point) => getResourceRecordKey(point)).filter(Boolean))]
    .sort((left, right) => {
      const sortKeyCompare = getResourceTypeSortKey(left).localeCompare(getResourceTypeSortKey(right), 'zh-CN');
      return sortKeyCompare !== 0 ? sortKeyCompare : left.localeCompare(right, 'zh-CN');
    });
  const resourceGroups = uniqueKeys.map((resourceKey) => ({
    resourceKey,
    label: formatResourceTypeLabel(resourceKey),
    items: (draft.resources ?? [])
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => getResourceRecordKey(point) === resourceKey)
      .sort((left, right) => (
        left.point.y - right.point.y
        || left.point.x - right.point.x
        || left.index - right.index
      )),
  }));
  const selectedResource = selectedEntity?.kind === 'resource'
    ? draft.resources?.[selectedEntity.index]
    : null;
  const selectedResourceKey = selectedResource ? getResourceRecordKey(selectedResource) : resourcePaintKey;
  const currentBrushLabel = `${formatResourceTypeLabel(resourcePaintKey || selectedResourceKey)} ${formatAuraLevelText(resourcePaintValue)}`;
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">气机点</div>
          <div class="editor-section-note">可编辑任意资源键，同格允许并存多个气机条目。</div>
        </div>
        <button class="small-btn" type="button" data-map-action="add-resource">新建气机点</button>
      </div>
      <div class="map-form-grid compact" style="margin-bottom: 10px;">
        <label class="map-field">
          <span>画笔资源键</span>
          <input data-map-ui="resourcePaintKey" value="${escapeHtml(resourcePaintKey)}" />
        </label>
        <label class="map-field">
          <span>画笔值</span>
          <input data-map-ui="resourcePaintValue" type="number" min="0" value="${resourcePaintValue}" />
        </label>
      </div>
      <div class="button-row" style="margin-bottom: 10px;">
        <button class="small-btn" type="button" data-map-action="apply-resource-brush-key">应用到画笔</button>
      </div>
      <div class="editor-note" style="margin-bottom: 10px;">已存在资源种类：${escapeHtml(uniqueKeys.length > 0 ? uniqueKeys.map((resourceKey) => formatResourceTypeLabel(resourceKey)).join('、') : '无')}</div>
      ${resourceGroups.length > 0
        ? resourceGroups.map((group) => `
          <div class="editor-note" style="margin: 10px 0 6px;">${escapeHtml(group.label)}</div>
          <div class="map-entity-list">
            ${group.items.map(({ point, index }) => `
              <button class="map-entity-btn ${selectedEntity?.kind === 'resource' && selectedEntity.index === index ? 'active' : ''}" data-entity-kind="resource" data-entity-index="${index}" type="button">
                ${escapeHtml(`(${point.x},${point.y}) ${formatResourcePointLabel(point)}`)}
              </button>
            `).join('')}
          </div>
        `).join('')
        : '<div class="editor-note">暂无气机点。</div>'}
    </section>
    ${selectedEntity?.kind === 'resource'
      ? selectedEntitySectionHtml
      : '<div class="editor-note">选中一个气机点后可在下方编辑属性。</div>'}
    <div class="editor-note" style="margin-top: 8px;">当前画笔：${escapeHtml(currentBrushLabel)}</div>
  `;
}

// ── 选中实体描述 ──

/** DescribeSelectedEntityParams：describeSelectedEntity 的参数。 */
interface DescribeSelectedEntityParams {
  draft: GmMapDocument | null;
  selectedEntity: MapEntitySelection;
  selectedComposePiece: ComposePieceInfo | null;
  formatMapTargetLabel: (mapId: string) => string;
  containerLandmarkName: string | null;
}

/** describeSelectedEntityHtml：返回选中实体的描述文本。 */
export function describeSelectedEntityHtml(params: DescribeSelectedEntityParams): string {
  const { draft, selectedEntity, selectedComposePiece, formatMapTargetLabel, containerLandmarkName } = params;
  if (selectedComposePiece) {
    return `拼图块 ${selectedComposePiece.sourceMapName} ${selectedComposePiece.rotation}°`;
  }
  if (!draft || !selectedEntity) {
    return '无';
  }
  if (selectedEntity.kind === 'portal') {
    const portal = draft.portals[selectedEntity.index];
    return portal ? `${portal.kind === 'stairs' ? '楼梯' : '传送阵'} (${portal.x}, ${portal.y}) -> ${formatMapTargetLabel(portal.targetMapId)}` : '无';
  }
  if (selectedEntity.kind === 'npc') {
    const npc = draft.npcs[selectedEntity.index];
    return npc ? `场景人物 ${npc.name?.trim() || '未命名场景人物'}` : '无';
  }
  if (selectedEntity.kind === 'monster') {
    const spawn = draft.monsterSpawns[selectedEntity.index];
    return spawn ? `怪物 ${spawn.name?.trim() || '未命名怪物'}` : '无';
  }
  if (selectedEntity.kind === 'aura') {
    const aura = draft.auras?.[selectedEntity.index];
    return aura ? formatAuraPointLabel(aura.value) : '无';
  }
  if (selectedEntity.kind === 'resource') {
    const resource = draft.resources?.[selectedEntity.index];
    return resource ? formatResourcePointLabel(resource) : '无';
  }
  if (selectedEntity.kind === 'safeZone') {
    const zone = draft.safeZones?.[selectedEntity.index];
    return zone ? `安全区 半径 ${zone.radius}` : '无';
  }
  if (selectedEntity.kind === 'container') {
    return containerLandmarkName ? `容器 ${containerLandmarkName.trim() || '未命名容器'}` : '无';
  }
  const landmark = draft.landmarks?.[selectedEntity.index];
  return landmark ? `地标 ${landmark.name?.trim() || '未命名地标'}` : '无';
}

// ── 选区 Tab 与元数据 Tab ──

/** SelectionTabParams：renderSelectionTab 的参数。 */
interface SelectionTabParams {
  selectedCell: { x: number; y: number } | null;
  hoveredCell: { x: number; y: number } | null;
  selectedTileType: TileType | null;
  selectedAuraValue: number | null;
  resourceSummary: string;
  selectedLayers: {
    terrain: string;
    surface: string | null;
    structure: string | null;
    interactableKinds: string[];
  } | null;
  currentToolLabel: string;
  selectedEntityDescription: string;
}

/** renderSelectionTabHtml：渲染选中项 Tab HTML。 */
export function renderSelectionTabHtml(params: SelectionTabParams): string {
  const { selectedCell, hoveredCell, selectedTileType, selectedAuraValue, resourceSummary, selectedLayers, currentToolLabel, selectedEntityDescription } = params;
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">当前选区</div>
          <div class="editor-section-note">直接编辑当前坐标的分层数据；保存时仍会同步输出兼容 tiles。</div>
        </div>
      </div>
      <div class="map-form-grid compact">
        ${readonlyField('当前格', selectedCell ? `(${selectedCell.x}, ${selectedCell.y})` : '未选择')}
        ${readonlyField('悬停格', hoveredCell ? `(${hoveredCell.x}, ${hoveredCell.y})` : '无')}
        ${readonlyField('地块', selectedTileType ? TILE_TYPE_LABELS[selectedTileType] : '无')}
        ${readonlyField('无属性灵气', selectedAuraValue !== null ? formatAuraPointLabel(selectedAuraValue) : '无')}
        ${readonlyField('气机', resourceSummary)}
        ${readonlyField('当前工具', currentToolLabel)}
        ${readonlyField('选中对象', selectedEntityDescription)}
      </div>
      ${selectedCell && selectedLayers ? `
        <div class="map-form-grid compact map-cell-layer-editor" style="margin-top: 10px;">
          ${selectField('地形', `terrainRows.${selectedCell.y}.${selectedCell.x}`, selectedLayers.terrain, TERRAIN_SELECT_OPTIONS)}
          ${nullableSelectField('地表', `surfaceRows.${selectedCell.y}.${selectedCell.x}`, selectedLayers.surface ?? undefined, SURFACE_SELECT_OPTIONS)}
          ${nullableSelectField('结构', `structureRows.${selectedCell.y}.${selectedCell.x}`, selectedLayers.structure ?? undefined, STRUCTURE_SELECT_OPTIONS)}
          ${selectField('交互', `interactableRows.${selectedCell.y}.${selectedCell.x}.0`, selectedLayers.interactableKinds[0] ?? '', INTERACTABLE_SELECT_OPTIONS)}
          ${numberField('无属性灵气', `__cellAura.${selectedCell.x}.${selectedCell.y}`, selectedAuraValue ?? 0)}
          ${readonlyField('气机', resourceSummary)}
        </div>
      ` : ''}
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-map-action="pick-tile">用当前地块作画笔</button>
        <button class="small-btn" type="button" data-map-action="set-spawn">把当前格设为出生点</button>
        <button class="small-btn" type="button" data-map-action="move-selected">把选中对象移到当前格</button>
      </div>
    </section>
  `;
}

/** MetaTabParams：renderMetaTab 的参数。 */
interface MetaTabParams {
  draft: GmMapDocument;
  resizeWidth: number;
  resizeHeight: number;
  resizeFillTileType: string;
}

/** renderMetaTabHtml：渲染元数据 Tab HTML。 */
export function renderMetaTabHtml(params: MetaTabParams): string {
  const { draft, resizeWidth, resizeHeight, resizeFillTileType } = params;
  return `
    <section class="editor-section">
      <div class="editor-section-head">
        <div>
          <div class="editor-section-title">地图元信息</div>
          <div class="editor-section-note">名称、推荐境界、出生点与地图尺寸。</div>
        </div>
      </div>
      <div class="map-form-grid">
        ${textField('地图名称', 'name', draft.name)}
        ${selectField('路网域', 'routeDomain', draft.routeDomain ?? 'system', MAP_ROUTE_DOMAIN_OPTIONS)}
        ${numberField('推荐境界 Lv', 'mapLv', draft.mapLv)}
        ${readonlyField('地图 ID', draft.id)}
        ${numberField('出生点 X', 'spawnPoint.x', draft.spawnPoint.x)}
        ${numberField('出生点 Y', 'spawnPoint.y', draft.spawnPoint.y)}
        ${textField('描述', 'description', draft.description, 'wide')}
      </div>
      <div class="map-form-grid compact" style="margin-top: 10px;">
        <label class="map-field">
          <span>新宽度</span>
          <input data-map-ui="resizeWidth" type="number" min="1" value="${resizeWidth}" />
        </label>
        <label class="map-field">
          <span>新高度</span>
          <input data-map-ui="resizeHeight" type="number" min="1" value="${resizeHeight}" />
        </label>
        <label class="map-field">
          <span>扩展填充值</span>
          <select data-map-ui="resizeFill">
            ${PAINT_TILE_TYPES.map((tileType) => `
              <option value="${tileType}" ${resizeFillTileType === tileType ? 'selected' : ''}>${escapeHtml(TILE_TYPE_LABELS[tileType])}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="small-btn" type="button" data-map-action="resize">应用尺寸</button>
      </div>
    </section>
  `;
}
