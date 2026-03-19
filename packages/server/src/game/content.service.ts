import { Injectable } from '@nestjs/common';
import {
  Attributes,
  DEFAULT_INVENTORY_CAPACITY,
  EquipmentSlots,
  EQUIP_SLOTS,
  Inventory,
  ItemStack,
  PlayerRealmStage,
  SkillDef,
  TechniqueRealm,
} from '@mud/shared';

interface TechniqueTemplate {
  id: string;
  name: string;
  skills: SkillDef[];
  attrGrowth: Partial<Attributes>;
}

interface ItemTemplate extends Omit<ItemStack, 'count'> {
  learnTechniqueId?: string;
  healAmount?: number;
}

@Injectable()
export class ContentService {
  private readonly techniques = new Map<string, TechniqueTemplate>([
    ['qingmu_sword', {
      id: 'qingmu_sword',
      name: '青木剑诀',
      attrGrowth: { perception: 1, spirit: 1 },
      skills: [
        {
          id: 'skill.qingmu_slash',
          name: '青木斩',
          desc: '将灵气灌入剑锋，对近身妖物造成稳定伤害。',
          cooldown: 2,
          cost: 4,
          range: 1,
          power: 14,
          unlockRealm: TechniqueRealm.Entry,
          unlockPlayerRealm: PlayerRealmStage.Mortal,
        },
      ],
    }],
    ['redflame_art', {
      id: 'redflame_art',
      name: '赤焰诀',
      attrGrowth: { spirit: 1, comprehension: 1 },
      skills: [
        {
          id: 'skill.fire_talisman',
          name: '离火符',
          desc: '引燃符火，攻击三格内的目标。',
          cooldown: 3,
          cost: 7,
          range: 3,
          power: 18,
          unlockRealm: TechniqueRealm.Entry,
          unlockPlayerRealm: PlayerRealmStage.Meridian,
        },
      ],
    }],
    ['wind_step', {
      id: 'wind_step',
      name: '踏风步',
      attrGrowth: { perception: 2 },
      skills: [
        {
          id: 'skill.wind_edge',
          name: '风痕',
          desc: '借步法切入身位，对两格内目标打出轻快一击。',
          cooldown: 2,
          cost: 5,
          range: 2,
          power: 16,
          unlockRealm: TechniqueRealm.Entry,
          unlockPlayerRealm: PlayerRealmStage.BodyTempering,
        },
      ],
    }],
    ['thunder_palm', {
      id: 'thunder_palm',
      name: '惊雷掌',
      attrGrowth: { constitution: 1, spirit: 1 },
      skills: [
        {
          id: 'skill.thunder_palm',
          name: '惊雷掌',
          desc: '掌心引雷，重创近中距离目标。',
          cooldown: 4,
          cost: 9,
          range: 2,
          power: 24,
          unlockRealm: TechniqueRealm.Entry,
          unlockPlayerRealm: PlayerRealmStage.Innate,
        },
      ],
    }],
    ['stillheart', {
      id: 'stillheart',
      name: '止念诀',
      attrGrowth: { spirit: 1, comprehension: 2 },
      skills: [
        {
          id: 'skill.stillheart_seal',
          name: '止念印',
          desc: '以神识压迫敌念，对四格内目标造成强力打击。',
          cooldown: 5,
          cost: 12,
          range: 4,
          power: 30,
          unlockRealm: TechniqueRealm.Entry,
          unlockPlayerRealm: PlayerRealmStage.QiRefining,
        },
      ],
    }],
    ['iron_bone_art', {
      id: 'iron_bone_art',
      name: '铁骨功',
      attrGrowth: { constitution: 2, talent: 1 },
      skills: [
        {
          id: 'skill.iron_bone_strike',
          name: '铁骨崩拳',
          desc: '以内劲震骨，近身爆发伤害。',
          cooldown: 2,
          cost: 6,
          range: 1,
          power: 18,
          unlockRealm: TechniqueRealm.Entry,
        },
        {
          id: 'skill.iron_guard_roar',
          name: '震罡怒吼',
          desc: '鼓荡护体罡气，轰击中距离目标。',
          cooldown: 4,
          cost: 10,
          range: 2,
          power: 29,
          unlockRealm: TechniqueRealm.Minor,
        },
      ],
    }],
    ['cloud_blade', {
      id: 'cloud_blade',
      name: '流云刀谱',
      attrGrowth: { constitution: 1, perception: 1 },
      skills: [
        {
          id: 'skill.cloud_cut',
          name: '流云断',
          desc: '刀势如云，斩击两格内目标。',
          cooldown: 2,
          cost: 7,
          range: 2,
          power: 21,
          unlockRealm: TechniqueRealm.Entry,
        },
        {
          id: 'skill.dragon_turn',
          name: '回龙转锋',
          desc: '连环变招，重创三格内目标。',
          cooldown: 4,
          cost: 11,
          range: 3,
          power: 34,
          unlockRealm: TechniqueRealm.Major,
        },
      ],
    }],
    ['frost_sutra', {
      id: 'frost_sutra',
      name: '寒魄经',
      attrGrowth: { spirit: 1, talent: 1 },
      skills: [
        {
          id: 'skill.frost_mark',
          name: '霜痕',
          desc: '冰灵附刃，远距点杀目标。',
          cooldown: 3,
          cost: 8,
          range: 3,
          power: 24,
          unlockRealm: TechniqueRealm.Entry,
        },
        {
          id: 'skill.cold_moon_seal',
          name: '寒月印',
          desc: '凝寒印镇压四格内敌手。',
          cooldown: 5,
          cost: 12,
          range: 4,
          power: 36,
          unlockRealm: TechniqueRealm.Minor,
        },
      ],
    }],
    ['spirit_anchor', {
      id: 'spirit_anchor',
      name: '镇灵篇',
      attrGrowth: { spirit: 2, comprehension: 1 },
      skills: [
        {
          id: 'skill.anchor_pulse',
          name: '镇灵冲',
          desc: '神识冲击近中距离目标。',
          cooldown: 3,
          cost: 8,
          range: 2,
          power: 26,
          unlockRealm: TechniqueRealm.Entry,
        },
        {
          id: 'skill.soul_chain',
          name: '缚魄锁',
          desc: '以灵链拘束并重创四格内敌人。',
          cooldown: 5,
          cost: 14,
          range: 4,
          power: 40,
          unlockRealm: TechniqueRealm.Major,
        },
      ],
    }],
    ['starfall_spear', {
      id: 'starfall_spear',
      name: '陨星枪诀',
      attrGrowth: { constitution: 1, perception: 2 },
      skills: [
        {
          id: 'skill.starfall_thrust',
          name: '坠星刺',
          desc: '枪意贯空，穿刺三格内目标。',
          cooldown: 3,
          cost: 9,
          range: 3,
          power: 30,
          unlockRealm: TechniqueRealm.Entry,
        },
        {
          id: 'skill.meteor_break',
          name: '陨焰破',
          desc: '牵引星火猛击，粉碎远距强敌。',
          cooldown: 6,
          cost: 15,
          range: 4,
          power: 48,
          unlockRealm: TechniqueRealm.Major,
        },
      ],
    }],
  ]);

  private readonly items = new Map<string, ItemTemplate>([
    ['book.qingmu_sword', {
      itemId: 'book.qingmu_sword',
      name: '《青木剑诀》',
      type: 'skill_book',
      desc: '记载基础御剑吐纳之法，使用后学会青木剑诀。',
      learnTechniqueId: 'qingmu_sword',
    }],
    ['book.redflame_art', {
      itemId: 'book.redflame_art',
      name: '《赤焰诀》',
      type: 'skill_book',
      desc: '残缺的火行法门，能御使离火符。',
      learnTechniqueId: 'redflame_art',
    }],
    ['book_wind_step', {
      itemId: 'book_wind_step',
      name: '《踏风步》',
      type: 'skill_book',
      desc: '轻身挪步之法，可在战斗中快速切入。',
      learnTechniqueId: 'wind_step',
    }],
    ['book_thunder_palm', {
      itemId: 'book_thunder_palm',
      name: '《惊雷掌》残卷',
      type: 'skill_book',
      desc: '残存雷纹的掌法札记，威力不俗。',
      learnTechniqueId: 'thunder_palm',
    }],
    ['book_stillheart', {
      itemId: 'book_stillheart',
      name: '《止念诀》',
      type: 'skill_book',
      desc: '收束心神、以念压敌的法门。',
      learnTechniqueId: 'stillheart',
    }],
    ['book.iron_bone_art', {
      itemId: 'book.iron_bone_art',
      name: '《铁骨功》',
      type: 'skill_book',
      desc: '武者锻体法门，强调硬桥硬马之道。',
      learnTechniqueId: 'iron_bone_art',
    }],
    ['book.cloud_blade', {
      itemId: 'book.cloud_blade',
      name: '《流云刀谱》',
      type: 'skill_book',
      desc: '从江湖刀法演化而来的灵动刀谱。',
      learnTechniqueId: 'cloud_blade',
    }],
    ['book.frost_sutra', {
      itemId: 'book.frost_sutra',
      name: '《寒魄经》',
      type: 'skill_book',
      desc: '引寒入脉的残篇，兼具杀伐与凝神。',
      learnTechniqueId: 'frost_sutra',
    }],
    ['book.spirit_anchor', {
      itemId: 'book.spirit_anchor',
      name: '《镇灵篇》',
      type: 'skill_book',
      desc: '古修遗留的御神法门，可压制异兽灵识。',
      learnTechniqueId: 'spirit_anchor',
    }],
    ['book.starfall_spear', {
      itemId: 'book.starfall_spear',
      name: '《陨星枪诀》',
      type: 'skill_book',
      desc: '残破星纹玉简中记载的高阶枪诀。',
      learnTechniqueId: 'starfall_spear',
    }],
    ['pill.minor_heal', {
      itemId: 'pill.minor_heal',
      name: '回春散',
      type: 'consumable',
      desc: '疗养筋骨，恢复少量气血。',
      healAmount: 20,
    }],
    ['minor_qi_pill', {
      itemId: 'minor_qi_pill',
      name: '小还灵丹',
      type: 'consumable',
      desc: '温养经脉，恢复较多气血。',
      healAmount: 36,
    }],
    ['major_qi_pill', {
      itemId: 'major_qi_pill',
      name: '大还灵丹',
      type: 'consumable',
      desc: '药力浑厚，适合中阶修士快速恢复。',
      healAmount: 62,
    }],
    ['pure_yang_pill', {
      itemId: 'pure_yang_pill',
      name: '纯阳丹',
      type: 'consumable',
      desc: '以烈阳药引炼制，可在恶战后快速回气。',
      healAmount: 90,
    }],
    ['frost_heart_paste', {
      itemId: 'frost_heart_paste',
      name: '寒心膏',
      type: 'consumable',
      desc: '寒性药膏，稳固经脉并恢复气血。',
      healAmount: 74,
    }],
    ['equip.rust_saber', {
      itemId: 'equip.rust_saber',
      name: '旧铁长刀',
      type: 'equipment',
      desc: '镇防旧库翻出的制式长刀。',
      equipSlot: 'weapon',
      equipStats: { physAtk: 6, hit: 2 },
    }],
    ['equip.hunter_cap', {
      itemId: 'equip.hunter_cap',
      name: '猎风帽',
      type: 'equipment',
      desc: '荒野猎户常用的轻便头具。',
      equipSlot: 'head',
      equipStats: { dodge: 3, crit: 1 },
    }],
    ['equip.leather_vest', {
      itemId: 'equip.leather_vest',
      name: '硬皮护衣',
      type: 'equipment',
      desc: '由粗皮与铜扣缝制的护身衣。',
      equipSlot: 'body',
      equipStats: { maxHp: 24, physDef: 4 },
    }],
    ['equip.step_boots', {
      itemId: 'equip.step_boots',
      name: '游侠靴',
      type: 'equipment',
      desc: '鞋底附有防滑纹路，适合野外奔袭。',
      equipSlot: 'legs',
      equipStats: { moveSpeed: 25, dodge: 2 },
    }],
    ['equip.black_iron_sword', {
      itemId: 'equip.black_iron_sword',
      name: '玄铁长剑',
      type: 'equipment',
      desc: '经矿洞灵铁锻造，兼具锋锐与韧性。',
      equipSlot: 'weapon',
      equipStats: { physAtk: 11, spellAtk: 4, hit: 4 },
    }],
    ['equip.miner_helmet', {
      itemId: 'equip.miner_helmet',
      name: '矿卫盔',
      type: 'equipment',
      desc: '旧矿卫制式铁盔，防护结实。',
      equipSlot: 'head',
      equipStats: { maxHp: 18, physDef: 6, resolvePower: 2 },
    }],
    ['equip.rune_robe', {
      itemId: 'equip.rune_robe',
      name: '断纹法袍',
      type: 'equipment',
      desc: '遗迹残纹织就的法袍，能稳固神识。',
      equipSlot: 'body',
      equipStats: { maxQi: 32, spellAtk: 7, spellDef: 5 },
    }],
    ['equip.cloud_boots', {
      itemId: 'equip.cloud_boots',
      name: '踏云履',
      type: 'equipment',
      desc: '鞋底镶有浮云阵纹，行走轻灵。',
      equipSlot: 'legs',
      equipStats: { moveSpeed: 40, dodge: 4, hit: 2 },
    }],
    ['equip.spirit_ring', {
      itemId: 'equip.spirit_ring',
      name: '凝灵戒',
      type: 'equipment',
      desc: '可缓慢聚拢逸散灵气的戒指。',
      equipSlot: 'accessory',
      equipStats: { maxQi: 28, qiRegenRate: 120, crit: 2 },
    }],
    ['equip.valley_fang_blade', {
      itemId: 'equip.valley_fang_blade',
      name: '裂齿妖刃',
      type: 'equipment',
      desc: '以妖狼獠牙打磨出的偏锋战刃。',
      equipSlot: 'weapon',
      equipStats: { physAtk: 13, spellAtk: 8, breakPower: 3 },
    }],
    ['equip.rift_guard_armor', {
      itemId: 'equip.rift_guard_armor',
      name: '裂隙镇守甲',
      type: 'equipment',
      desc: '兽谷旧镇守使战甲，残存阵纹庇护。',
      equipSlot: 'body',
      equipStats: { maxHp: 42, physDef: 8, spellDef: 5, resolvePower: 4 },
    }],
    ['equip.moonshadow_boots', {
      itemId: 'equip.moonshadow_boots',
      name: '月影履',
      type: 'equipment',
      desc: '夜行无声，适合高危区域机动。',
      equipSlot: 'legs',
      equipStats: { moveSpeed: 55, dodge: 6, crit: 3 },
    }],
    ['equip.celestial_crown', {
      itemId: 'equip.celestial_crown',
      name: '观星冠',
      type: 'equipment',
      desc: '破碎天宫遗留的仪礼冠冕。',
      equipSlot: 'head',
      equipStats: { maxQi: 36, spellDef: 8, hit: 3, viewRange: 1 },
    }],
    ['equip.starfall_spear', {
      itemId: 'equip.starfall_spear',
      name: '陨星枪',
      type: 'equipment',
      desc: '铭刻星砂纹路的重枪，杀伐极强。',
      equipSlot: 'weapon',
      equipStats: { physAtk: 16, spellAtk: 10, hit: 5, breakPower: 4 },
    }],
    ['equip.void_talisman', {
      itemId: 'equip.void_talisman',
      name: '空劫符坠',
      type: 'equipment',
      desc: '能压制杂念与心魔的古老符坠。',
      equipSlot: 'accessory',
      equipStats: { maxQi: 40, spellDef: 8, techniqueExpRate: 200, playerExpRate: 200 },
    }],
    ['mat.beast_bone', {
      itemId: 'mat.beast_bone',
      name: '妖兽骨',
      type: 'material',
      desc: '山野妖兽遗骨，可留作后用。',
    }],
    ['quest.miner_token', {
      itemId: 'quest.miner_token',
      name: '矿洞令牌',
      type: 'quest_item',
      desc: '证明你被允许深入矿洞与古修遗迹。',
    }],
    ['wolf_fang', { itemId: 'wolf_fang', name: '狼牙', type: 'material', desc: '噬灵狼的利牙。' }],
    ['serpent_gall', { itemId: 'serpent_gall', name: '竹蛇胆', type: 'material', desc: '青鳞竹蛇的胆囊。' }],
    ['black_iron_chunk', { itemId: 'black_iron_chunk', name: '玄铁矿块', type: 'material', desc: '可用于炼器的粗矿。' }],
    ['crystal_dust', { itemId: 'crystal_dust', name: '晶尘', type: 'material', desc: '晶背蝠掉落的微光粉末。' }],
    ['mine_signal_core', { itemId: 'mine_signal_core', name: '失落信标核心', type: 'quest_item', desc: '矿洞旧阵的核心部件。' }],
    ['rune_shard', { itemId: 'rune_shard', name: '断纹石片', type: 'material', desc: '遗迹傀儡体内剥落的残纹。' }],
    ['demon_wolf_bone', { itemId: 'demon_wolf_bone', name: '妖狼骨', type: 'material', desc: '兽谷妖狼的坚骨。' }],
    ['blood_feather', { itemId: 'blood_feather', name: '血羽', type: 'material', desc: '血羽鸦留下的邪异翎羽。' }],
    ['valley_core', { itemId: 'valley_core', name: '兽谷核心', type: 'quest_item', desc: '谷底裂隙孕出的异质核心。' }],
    ['spirit_iron_fragment', { itemId: 'spirit_iron_fragment', name: '灵铁碎片', type: 'material', desc: '蕴灵玄铁的碎片。' }],
    ['rat_tail', { itemId: 'rat_tail', name: '鼠尾', type: 'material', desc: '灰尾鼠的尾巴。' }],
    ['boar_tusk', { itemId: 'boar_tusk', name: '彘牙', type: 'material', desc: '獠牙野彘的尖牙。' }],
    ['lizard_scale', { itemId: 'lizard_scale', name: '泽鳞', type: 'material', desc: '泽鳞蜥脱落的鳞片。' }],
    ['bandit_insignia', { itemId: 'bandit_insignia', name: '匪徒腰牌', type: 'material', desc: '荒野匪徒身份的金属牌。' }],
    ['bamboo_heart', { itemId: 'bamboo_heart', name: '翠竹心', type: 'material', desc: '竹灵聚气形成的核心髓结。' }],
    ['spider_silk', { itemId: 'spider_silk', name: '阴沼丝', type: 'material', desc: '沼泽妖蛛吐出的坚韧蛛丝。' }],
    ['mantis_blade', { itemId: 'mantis_blade', name: '螳锋', type: 'material', desc: '刃螳前臂外骨，可作刀坯。' }],
    ['mine_crystal_core', { itemId: 'mine_crystal_core', name: '矿晶核', type: 'quest_item', desc: '矿洞深层晶簇凝结出的核心。' }],
    ['colossus_heart', { itemId: 'colossus_heart', name: '巨像核心', type: 'quest_item', desc: '矿脉巨像的驱动核心。' }],
    ['ruin_keystone', { itemId: 'ruin_keystone', name: '遗迹钥石', type: 'quest_item', desc: '可驱动古修阵门的钥石。' }],
    ['soul_ink', { itemId: 'soul_ink', name: '魂墨', type: 'material', desc: '古碑残魂凝结出的墨色灵液。' }],
    ['serpent_scale', { itemId: 'serpent_scale', name: '谷蛇逆鳞', type: 'material', desc: '兽谷异蛇的逆鳞碎片。' }],
    ['valley_emperor_fang', { itemId: 'valley_emperor_fang', name: '谷皇獠牙', type: 'quest_item', desc: '兽谷皇级妖兽的本命獠牙。' }],
    ['ridge_beast_claw', { itemId: 'ridge_beast_claw', name: '岭兽爪', type: 'material', desc: '灵岭猛兽留下的巨大爪痕骨。' }],
    ['frost_essence', { itemId: 'frost_essence', name: '霜华精粹', type: 'material', desc: '极寒灵气凝结的蓝白晶滴。' }],
    ['spirit_ridge_sigil', { itemId: 'spirit_ridge_sigil', name: '灵岭行令', type: 'quest_item', desc: '灵岭守关者留下的通行令符。' }],
    ['void_shard', { itemId: 'void_shard', name: '虚蚀碎片', type: 'material', desc: '虚空妖物躯壳剥落的暗晶。' }],
    ['star_metal', { itemId: 'star_metal', name: '星陨金', type: 'material', desc: '坠星坑深处采得的高纯灵金。' }],
    ['sky_pattern_page', { itemId: 'sky_pattern_page', name: '天纹残页', type: 'material', desc: '记录古天宫阵纹的残页。' }],
    ['sky_seal_core', { itemId: 'sky_seal_core', name: '天封核心', type: 'quest_item', desc: '封印天宫裂隙所需的核心组件。' }],
  ]);

  getStarterInventory(): Inventory {
    return {
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items: [
        this.createItem('book.qingmu_sword')!,
        this.createItem('pill.minor_heal', 3)!,
      ],
    };
  }

  createItem(itemId: string, count = 1): ItemStack | null {
    const item = this.items.get(itemId);
    if (!item) return null;
    return {
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      count,
      desc: item.desc,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs,
      equipStats: item.equipStats,
    };
  }

  normalizeItemStack(item: ItemStack): ItemStack {
    const normalized = this.createItem(item.itemId, item.count);
    if (!normalized) {
      return { ...item };
    }
    return normalized;
  }

  normalizeInventory(inventory: Inventory): Inventory {
    return {
      capacity: inventory.capacity,
      items: inventory.items.map((item) => this.normalizeItemStack(item)),
    };
  }

  normalizeEquipment(equipment: EquipmentSlots): EquipmentSlots {
    const normalized = { weapon: null, head: null, body: null, legs: null, accessory: null } as EquipmentSlots;
    for (const slot of EQUIP_SLOTS) {
      const item = equipment[slot];
      normalized[slot] = item ? this.normalizeItemStack(item) : null;
    }
    return normalized;
  }

  getItem(itemId: string): ItemTemplate | undefined {
    return this.items.get(itemId);
  }

  getTechnique(techniqueId: string): TechniqueTemplate | undefined {
    return this.techniques.get(techniqueId);
  }

  getSkill(skillId: string): SkillDef | undefined {
    for (const technique of this.techniques.values()) {
      const skill = technique.skills.find((entry) => entry.id === skillId);
      if (skill) return skill;
    }
    return undefined;
  }
}
