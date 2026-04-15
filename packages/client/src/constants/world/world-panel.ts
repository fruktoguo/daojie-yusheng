/**
 * 世界面板文本与指引常量，供 UI 组件使用。
 */
import { TechniqueRealm } from '@mud/shared-next';

/** WorldGuide：世界指南条目。 */
export interface WorldGuide {
  title: string;
  recommendedRealm: string;
  route: string;
  mood: string;
  desc: string;
  resources: string[];
  threats: string[];
}

/** 各修行境界在界面中的展示名称。 */
export const TECH_REALM_LABELS: Record<TechniqueRealm, string> = {
  [TechniqueRealm.Entry]: '武学入门',
  [TechniqueRealm.Minor]: '后天圆熟',
  [TechniqueRealm.Major]: '先天凝意',
  [TechniqueRealm.Perfection]: '半步修真',
};

/** 按 key 直接映射到对应的标签，方便数据驱动配置。 */
export const TECH_REALM_NAME_BY_KEY: Record<string, string> = {
  Entry: TECH_REALM_LABELS[TechniqueRealm.Entry],
  Minor: TECH_REALM_LABELS[TechniqueRealm.Minor],
  Major: TECH_REALM_LABELS[TechniqueRealm.Major],
  Perfection: TECH_REALM_LABELS[TechniqueRealm.Perfection],
};

/** 各地图的引导信息，用于世界面板的标签与建议路线。 */
export const WORLD_GUIDE: Record<string, WorldGuide> = {
  yunlai_town: {
    title: '云来镇',
    recommendedRealm: '凡胎-锻骨',
    route: '镇中接主线，西北入青竹林，南门出荒野，北路可转灵脊岭。',
    mood: '武道起点',
    desc: '新的主城布局更紧凑，主线、补给、炼药与打铁都围着主路展开。',
    resources: ['主线任务', '基础补给', '镇内试手怪', '可搜索家具'],
    threats: ['零散鼠患', '夜间匪徒'],
  },
  qizhen_crossing: {
    title: '栖真渡',
    recommendedRealm: '练气一层-半步筑基',
    route: '北台接回渡阵，西去裂锋原，东分青萝谷与寒汐泽，南下赤陨庭。',
    mood: '前线渡城',
    desc: '主城改成三重错台加折线街巷，百工、静气、行修和旧渡口不再是几块平铺方盒。',
    resources: ['五行路口', '散修交易', '稳脉调息', '练气补给'],
    threats: ['外行修士混杂', '水线失足', '五行外图回压'],
  },
  bamboo_forest: {
    title: '青竹林',
    recommendedRealm: '易筋-养气',
    route: '主径推矿洞与遗迹，侧路进荒野，南下兽谷。',
    mood: '武侠过渡带',
    desc: '狼群、蛇妖与竹灵共生，是从江湖搏杀过渡到修行世界的门槛。',
    resources: ['狼牙', '蛇胆', '翠竹心', '步法残页'],
    threats: ['噬灵狼', '青鳞竹蛇', '刃竹螳'],
  },
  black_iron_mine: {
    title: '玄铁矿洞',
    recommendedRealm: '养气-玉衡',
    route: '推进钟乳深区，搜集矿材与信标核心。',
    mood: '资源高压区',
    desc: '矿脉灵气紊乱，材料密集，但补给和走位压力明显上升。',
    resources: ['玄铁矿块', '晶尘', '信标核心'],
    threats: ['矿魈', '晶背蝠'],
  },
  ancient_ruins: {
    title: '断碑遗迹',
    recommendedRealm: '瑶光-天权',
    route: '清理符阵看守，接通灵岭与天穹后段线。',
    mood: '仙道线索区',
    desc: '阵纹、碑灵与残篇并存，是正式触碰修仙叙事的区域。',
    resources: ['断纹石片', '魂墨', '遗迹钥石'],
    threats: ['石卫傀', '骨翎夜鸮', '符阵看守'],
  },
  beast_valley: {
    title: '噬魂兽谷',
    recommendedRealm: '玉衡-天璇',
    route: '先清外围，再压谷底王级目标和灵岭入口。',
    mood: '修仙高危战区',
    desc: '兽谷裂隙已显露灵灾本相，建议高补给、高功法成熟度再推进。',
    resources: ['血羽', '妖狼骨', '谷底核心', '逆鳞'],
    threats: ['裂齿妖狼', '血羽鸦', '裂渊狼主'],
  },
  wildlands: {
    title: '荒野',
    recommendedRealm: '凡胎-锻骨',
    route: '刷侧线材料，补足装备后回主线。',
    mood: '侧线练级区',
    desc: '野兽、匪徒与沼泽妖物混杂，适合补材料与做支线。',
    resources: ['彘牙', '泽鳞', '阴沼丝', '匪徒腰牌'],
    threats: ['獠牙野彘', '泽鳞蜥', '荒野匪徒'],
  },
  spirit_ridge: {
    title: '灵脊岭',
    recommendedRealm: '天玑-大宗师',
    route: '先做岭门试锋，再接天穹残宫。',
    mood: '升阶门槛区',
    desc: '这里已经不止是江湖争杀，更考验神识、心性与突破准备。',
    resources: ['岭兽爪', '霜华精粹', '灵岭行令'],
    threats: ['灵脊虎', '寒翎鹤', '守岭残魂'],
  },
  sky_ruins: {
    title: '天穹残宫',
    recommendedRealm: '宗师-叩仙门',
    route: '补齐天封核心，处理终局王级目标。',
    mood: '高段终局区',
    desc: '天宫已坠，但封印未绝，是当前版本最高危险层。',
    resources: ['星陨金', '天纹残页', '天封核心'],
    threats: ['天宫猎者', '残宫傀仪', '噬星兽'],
  },
};

/** 主界面兜底使用的地图推荐境界。 */
export const MAP_FALLBACK: Record<string, { recommendedRealm: string }> = {
  yunlai_town: { recommendedRealm: '凡胎-锻骨' },
  qizhen_crossing: { recommendedRealm: '练气一层-半步筑基' },
  bamboo_forest: { recommendedRealm: '易筋-养气' },
  wildlands: { recommendedRealm: '凡胎-锻骨' },
  black_iron_mine: { recommendedRealm: '养气-玉衡' },
  ancient_ruins: { recommendedRealm: '瑶光-天权' },
  beast_valley: { recommendedRealm: '玉衡-天璇' },
  spirit_ridge: { recommendedRealm: '天玑-大宗师' },
  sky_ruins: { recommendedRealm: '宗师-叩仙门' },
};
