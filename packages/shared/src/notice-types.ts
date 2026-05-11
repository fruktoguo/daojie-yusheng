import type { ElementKey } from './numeric';
import type { SkillDamageKind } from './skill-types';

/** 通知消息类型。 */
export type NoticeKind = 'info' | 'success' | 'warn' | 'travel' | 'combat' | 'loot' | 'system' | 'chat' | 'grudge' | 'quest';

/** 战斗结算结果标签。 */
export type CombatResolutionLabel = 'dodged' | 'crit' | 'broken' | 'resolved';

/** 结构化战斗消息：单次命中的结算数据。 */
export interface CombatNoticeResolution {
  /** 是否闪避。 */
  dodged?: boolean;
  /** 原始伤害。 */
  rawDamage: number;
  /** 实际伤害。 */
  damage: number;
  /** 伤害类型。 */
  damageKind: SkillDamageKind;
  /** 元素。 */
  element?: ElementKey;
  /** 暴击。 */
  crit?: boolean;
  /** 破招。 */
  broken?: boolean;
  /** 拆招。 */
  resolved?: boolean;
}

/** 结构化战斗消息：阵法命中的结算数据。 */
export interface CombatNoticeFormationResolution {
  /** 原始伤害。 */
  rawDamage: number;
  /** 实际伤害。 */
  damage: number;
  /** 伤害类型。 */
  damageKind: SkillDamageKind;
  /** 元素。 */
  element?: ElementKey;
  /** 削减的灵力值。 */
  auraDamage: number;
}

/** 结构化战斗消息payload。 */
export interface CombatNoticePayload {
  /** 施法者标签（'你' 或怪物名）。 */
  caster: string;
  /** 目标标签（'你' 或目标名，可含HP信息）。 */
  target: string;
  /** 目标当前HP（用于显示百分比）。 */
  targetHp?: number;
  /** 目标最大HP。 */
  targetMaxHp?: number;
  /** 技能名（'攻击' 表示普攻）。 */
  skill: string;
  /** 伤害结算。 */
  resolution?: CombatNoticeResolution;
  /** 阵法结算（与resolution互斥）。 */
  formationResolution?: CombatNoticeFormationResolution;
  /** 是否击杀。 */
  killed?: boolean;
}

/** 胶囊渲染配置。 */
export interface NoticePillConfig {
  /** 对应 vars 中的 key。 */
  key: string;
  /** 胶囊样式：target（目标名）、skill（技能名）、damage（数值）。默认 target。 */
  style?: 'target' | 'skill' | 'damage';
  /** 胶囊颜色（仅 damage 样式生效）。 */
  color?: string;
  /** hover tooltip 标题。 */
  tooltipTitle?: string;
  /** hover tooltip 内容行。 */
  tooltipLines?: string[];
}

/** 结构化通知载荷：服务端只发数据，客户端负责文本拼接和渲染。 */
export interface StructuredNoticePayload {
  /** 语言包模板 key。 */
  key: string;
  /** 内插变量。 */
  vars?: Record<string, string | number>;
  /** 需要胶囊渲染的字段配置。 */
  pills?: NoticePillConfig[];
  /** 标签 badge 文本列表。 */
  badges?: string[];
}

/** 单条通知消息视图。 */
export interface NoticeItemView {
/**
 * id：ID标识。
 */

  id?: number;  
  /**
 * messageId：messageID标识。
 */

  messageId?: string;  
  /**
 * kind：kind相关字段。
 */

  kind: NoticeKind;  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * from：from相关字段。
 */

  from?: string;  
  /**
 * occurredAt：occurredAt相关字段。
 */

  occurredAt?: number;  
  /**
 * persistUntilAck：persistUntilAck相关字段。
 */

  persistUntilAck?: boolean;
  /** 技能施展批次ID，同一次施展的所有消息共享此ID。 */
  castId?: string;
  /** 结构化战斗数据，存在时客户端优先使用此字段渲染。 */
  combat?: CombatNoticePayload;
  /** 结构化通知数据，存在时客户端优先使用此字段渲染。 */
  structured?: StructuredNoticePayload;
}

/** 通知批次视图。 */
export interface NoticeView {
/**
 * items：集合字段。
 */

  items: NoticeItemView[];
}

/** 系统消息视图。 */
export interface SystemMessageView {
/**
 * id：ID标识。
 */

  id?: string;  
  /**
 * text：text名称或显示文本。
 */

  text: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: NoticeKind;  
  /**
 * from：from相关字段。
 */

  from?: string;  
  /**
 * occurredAt：occurredAt相关字段。
 */

  occurredAt?: number;  
  /**
 * persistUntilAck：persistUntilAck相关字段。
 */

  persistUntilAck?: boolean;  
  /**
 * floating：floating相关字段。
 */

  floating?: {  
  /**
 * x：x相关字段。
 */

    x: number;    
    /**
 * y：y相关字段。
 */

    y: number;    
    /**
 * text：text名称或显示文本。
 */

    text: string;    
    /**
 * color：color相关字段。
 */

    color?: string;
  };
  /** 结构化通知数据，存在时客户端优先使用此字段渲染。 */
  structured?: StructuredNoticePayload;
}
