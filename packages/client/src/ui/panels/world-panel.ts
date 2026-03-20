import { ActionDef, manhattanDistance, MapMeta, PlayerState, QuestState, TechniqueRealm } from '@mud/shared';
import { preserveSelection } from '../selection-preserver';

interface VisibleEntity {
  id: string;
  wx: number;
  wy: number;
  name?: string;
  kind?: string;
  hp?: number;
  maxHp?: number;
}

interface WorldGuide {
  title: string;
  danger: number;
  recommendedRealm: string;
  route: string;
  mood: string;
  desc: string;
  resources: string[];
  threats: string[];
}

const TECH_REALM_LABELS: Record<TechniqueRealm, string> = {
  [TechniqueRealm.Entry]: '武学入门',
  [TechniqueRealm.Minor]: '后天圆熟',
  [TechniqueRealm.Major]: '先天凝意',
  [TechniqueRealm.Perfection]: '半步修真',
};

const TECH_REALM_NAME_BY_KEY: Record<string, string> = {
  Entry: TECH_REALM_LABELS[TechniqueRealm.Entry],
  Minor: TECH_REALM_LABELS[TechniqueRealm.Minor],
  Major: TECH_REALM_LABELS[TechniqueRealm.Major],
  Perfection: TECH_REALM_LABELS[TechniqueRealm.Perfection],
};

const WORLD_GUIDE: Record<string, WorldGuide> = {
  spawn: {
    title: '云来镇',
    danger: 1,
    recommendedRealm: '锻体到后天',
    route: '镇中接主线，东门入青竹林，西路可走荒野。',
    mood: '武道起点',
    desc: '安全区，适合接主线、整理装备与切换修炼。',
    resources: ['主线任务', '基础补给', '镇内试手怪'],
    threats: ['零散鼠患'],
  },
  bamboo_forest: {
    title: '青竹林',
    danger: 2,
    recommendedRealm: '后天到先天',
    route: '主径推矿洞与遗迹，侧路进荒野，南下兽谷。',
    mood: '武侠过渡带',
    desc: '狼群、蛇妖与竹灵共生，是从江湖搏杀过渡到修行世界的门槛。',
    resources: ['狼牙', '蛇胆', '翠竹心', '步法残页'],
    threats: ['噬灵狼', '青鳞竹蛇', '刃竹螳'],
  },
  black_iron_mine: {
    title: '玄铁矿洞',
    danger: 3,
    recommendedRealm: '先天到练气前夜',
    route: '推进钟乳深区，搜集矿材与信标核心。',
    mood: '资源高压区',
    desc: '矿脉灵气紊乱，材料密集，但补给和走位压力明显上升。',
    resources: ['玄铁矿块', '晶尘', '信标核心'],
    threats: ['矿魈', '晶背蝠'],
  },
  ancient_ruins: {
    title: '断碑遗迹',
    danger: 3,
    recommendedRealm: '先天圆熟到练气启蒙',
    route: '清理符阵看守，接通灵岭与天穹后段线。',
    mood: '仙道线索区',
    desc: '阵纹、碑灵与残篇并存，是正式触碰修仙叙事的区域。',
    resources: ['断纹石片', '魂墨', '遗迹钥石'],
    threats: ['石卫傀', '骨翎夜鸮', '符阵看守'],
  },
  beast_valley: {
    title: '噬魂兽谷',
    danger: 5,
    recommendedRealm: '练气期',
    route: '先清外围，再压谷底王级目标和灵岭入口。',
    mood: '修仙高危战区',
    desc: '兽谷裂隙已显露灵灾本相，建议高补给、高功法成熟度再推进。',
    resources: ['血羽', '妖狼骨', '谷底核心', '逆鳞'],
    threats: ['裂齿妖狼', '血羽鸦', '裂渊狼主'],
  },
  wildlands: {
    title: '荒野',
    danger: 2,
    recommendedRealm: '后天到先天',
    route: '刷侧线材料，补足装备后回主线。',
    mood: '侧线练级区',
    desc: '野兽、匪徒与沼泽妖物混杂，适合补材料与做支线。',
    resources: ['彘牙', '泽鳞', '阴沼丝', '匪徒腰牌'],
    threats: ['獠牙野彘', '泽鳞蜥', '荒野匪徒'],
  },
  spirit_ridge: {
    title: '灵脊岭',
    danger: 4,
    recommendedRealm: '先天到练气',
    route: '先做岭门试锋，再接天穹残宫。',
    mood: '升阶门槛区',
    desc: '这里已经不止是江湖争杀，更考验神识、心性与突破准备。',
    resources: ['岭兽爪', '霜华精粹', '灵岭行令'],
    threats: ['灵脊虎', '寒翎鹤', '守岭残魂'],
  },
  sky_ruins: {
    title: '天穹残宫',
    danger: 5,
    recommendedRealm: '练气到筑基',
    route: '补齐天封核心，处理终局王级目标。',
    mood: '高段终局区',
    desc: '天宫已坠，但封印未绝，是当前版本最高危险层。',
    resources: ['星陨金', '天纹残页', '天封核心'],
    threats: ['天宫猎者', '残宫傀仪', '噬星兽'],
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dangerLabel(level: number): string {
  return `${'危'.repeat(Math.max(1, Math.min(level, 5)))} ${level}/5`;
}

function inferRealm(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  const highest = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!highest) return '凡俗武者';
  return TECH_REALM_LABELS[highest.realm] ?? '修行中';
}

function resolveRecommendedRealmLabel(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (/[^\x00-\x7F]/.test(raw)) return raw;
  const parts = raw.split('-').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  const labels = parts.map((part) => TECH_REALM_NAME_BY_KEY[part]);
  if (labels.some((label) => !label)) {
    return fallback;
  }
  return labels.join('到');
}

export class WorldPanel {
  private mapPane = document.getElementById('pane-map-intel')!;
  private nearbyPane = document.getElementById('pane-nearby')!;
  private suggestionPane = document.getElementById('pane-suggestions')!;
  private lastRenderSignature: string | null = null;

  update(input: {
    player: PlayerState;
    mapMeta: MapMeta | null;
    entities: VisibleEntity[];
    actions: ActionDef[];
    quests: QuestState[];
  }): void {
    const guide = WORLD_GUIDE[input.player.mapId] ?? {
      title: input.mapMeta?.name ?? input.player.mapId,
      danger: input.mapMeta?.dangerLevel ?? 1,
      recommendedRealm: input.mapMeta?.recommendedRealm ?? '未知',
      route: '继续探索当前区域',
      mood: '未知地域',
      desc: '该区域暂无卷宗记载，建议稳步试探。',
      resources: [],
      threats: [],
    };

    const danger = input.mapMeta?.dangerLevel ?? guide.danger;
    const recommend = resolveRecommendedRealmLabel(input.mapMeta?.recommendedRealm, guide.recommendedRealm);
    const cultivating = input.player.cultivatingTechId
      ? input.player.techniques.find((entry) => entry.techId === input.player.cultivatingTechId)
      : null;
    const currentQuest = input.quests.find((entry) => entry.status === 'ready')
      ?? input.quests.find((entry) => entry.status === 'active');
    const nearbyMonsters = input.entities
      .filter((entity) => entity.kind === 'monster')
      .map((entity) => ({
        ...entity,
        distance: manhattanDistance({ x: entity.wx, y: entity.wy }, input.player),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
    const nearbyNpcs = input.entities
      .filter((entity) => entity.kind === 'npc')
      .slice(0, 4);
    const quickActions = input.actions
      .filter((action) => action.cooldownLeft === 0)
      .slice(0, 6);

    const snapshot = {
      mapId: input.player.mapId,
      mapName: input.mapMeta?.name ?? '',
      danger,
      recommend,
      guide: {
        title: guide.title,
        route: guide.route,
        mood: guide.mood,
        desc: guide.desc,
        resources: guide.resources,
        threats: guide.threats,
      },
      playerRealmName: input.player.realmName ?? '',
      playerRealmStage: input.player.realmStage ?? '',
      cultivatingId: cultivating?.techId ?? null,
      cultivatingName: cultivating?.name ?? '',
      quest: currentQuest
        ? {
            id: currentQuest.id,
            status: currentQuest.status,
            progress: currentQuest.progress,
            required: currentQuest.required,
          }
        : null,
      nearbyMonsters: nearbyMonsters.map((monster) => ({
        id: monster.id ?? monster.name ?? '',
        distance: monster.distance,
        hp: monster.hp ?? 0,
        maxHp: monster.maxHp ?? 0,
      })),
      nearbyNpcs: nearbyNpcs.map((npc) => npc.id ?? npc.name ?? ''),
      quickActions: quickActions.map((action) => ({
        id: action.id,
        cooldown: action.cooldownLeft,
        name: action.name,
        desc: action.desc,
      })),
    };
    const signature = JSON.stringify(snapshot);
    if (signature === this.lastRenderSignature) {
      return;
    }
    this.lastRenderSignature = signature;

    const mapHtml = `
      <div class="world-hero compact">
        <div>
          <div class="world-kicker">${escapeHtml(guide.mood)}</div>
          <div class="world-title">${escapeHtml(input.mapMeta?.name ?? guide.title)}</div>
          <div class="world-desc">${escapeHtml(guide.desc)}</div>
        </div>
        <div class="world-danger">
          <div class="world-danger-label">区域危险</div>
          <div class="world-danger-value danger-${Math.min(danger, 5)}">${dangerLabel(danger)}</div>
          <div class="world-danger-sub">推荐境界：${escapeHtml(recommend)}</div>
        </div>
      </div>
      <div class="info-list">
        <div class="info-line"><span>当前阶段</span><strong>${escapeHtml(inferRealm(input.player))}</strong></div>
        <div class="info-line"><span>推进路线</span><strong>${escapeHtml(guide.route)}</strong></div>
        <div class="info-line"><span>主要资源</span><strong>${escapeHtml(guide.resources.join('、') || '暂无')}</strong></div>
        <div class="info-line"><span>主要威胁</span><strong>${escapeHtml(guide.threats.join('、') || '未知')}</strong></div>
        <div class="info-line"><span>当前修炼</span><strong>${escapeHtml(cultivating?.name ?? '未设定')}</strong></div>
      </div>
    `;

    const nearbyHtml = `
      ${nearbyMonsters.length === 0 && nearbyNpcs.length === 0 ? '<div class="empty-hint">附近暂时平静</div>' : ''}
      ${nearbyMonsters.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-title">附近威胁</div>
          <div class="entity-list">
            ${nearbyMonsters.map((monster) => `
              <div class="entity-card threat">
                <div>
                  <div class="entity-name">${escapeHtml(monster.name ?? monster.id)}</div>
                  <div class="entity-meta">距离 ${monster.distance} 格 · HP ${monster.hp ?? 0}/${monster.maxHp ?? 0}</div>
                </div>
                <div class="entity-hp">${monster.distance <= 2 ? '近身' : monster.distance <= 5 ? '逼近' : '远处'}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${nearbyNpcs.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-title">可交互人物</div>
          <div class="entity-list">
            ${nearbyNpcs.map((npc) => `
              <div class="entity-card ally">
                <div>
                  <div class="entity-name">${escapeHtml(npc.name ?? npc.id)}</div>
                  <div class="entity-meta">就在视野附近，可尝试接话或交任务</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    const suggestionHtml = `
      <div class="panel-section">
        <div class="panel-section-title">当前建议</div>
        <div class="info-list">
          <div class="info-line"><span>优先事项</span><strong>${escapeHtml(currentQuest?.title ?? '继续推进或补修炼')}</strong></div>
          <div class="info-line"><span>任务节点</span><strong>${escapeHtml(currentQuest ? `${currentQuest.targetName} ${currentQuest.progress}/${currentQuest.required}` : '暂无') }</strong></div>
        </div>
      </div>
      ${quickActions.length === 0 ? '<div class="empty-hint">当前没有可立即执行的行动</div>' : `
        <div class="action-suggestion-list">
          ${quickActions.map((action) => `
            <div class="suggestion-card">
              <div class="suggestion-title">${escapeHtml(action.name)}</div>
              <div class="suggestion-desc">${escapeHtml(action.desc)}</div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    preserveSelection(this.mapPane, () => {
      this.mapPane.innerHTML = mapHtml;
    });
    preserveSelection(this.nearbyPane, () => {
      this.nearbyPane.innerHTML = nearbyHtml;
    });
    preserveSelection(this.suggestionPane, () => {
      this.suggestionPane.innerHTML = suggestionHtml;
    });
  }

  clear(): void {
    this.mapPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.nearbyPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.suggestionPane.innerHTML = '<div class="empty-hint">尚未进入世界</div>';
    this.lastRenderSignature = null;
  }
}
