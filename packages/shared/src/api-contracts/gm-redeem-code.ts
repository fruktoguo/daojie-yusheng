/**
 * GM 兑换码领域契约。
 *
 * 包含兑换码组视图、单码视图、GM 创建/更新/追加兑换码组请求与响应，
 * 以及玩家端兑换码请求与结果。
 */
/** 兑换码组里的单个奖励条目。 */
export interface RedeemCodeGroupRewardItem {
/**
 * itemId：道具ID标识。
 */

  itemId: string;
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 兑换码组视图。 */
export interface RedeemCodeGroupView {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
  /**
 * totalCodeCount：数量或计量字段。
 */

  totalCodeCount: number;
  /**
 * usedCodeCount：数量或计量字段。
 */

  usedCodeCount: number;
  /**
 * activeCodeCount：数量或计量字段。
 */

  activeCodeCount: number;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: string;
}

/** 兑换码单码视图。 */
export interface RedeemCodeCodeView {
/**
 * id：ID标识。
 */

  id: string;
  /**
 * groupId：groupID标识。
 */

  groupId: string;
  /**
 * code：code相关字段。
 */

  code: string;
  /**
 * status：statu状态或数据块。
 */

  status: 'active' | 'used' | 'destroyed';
  /**
 * usedByPlayerId：usedBy玩家ID标识。
 */

  usedByPlayerId: string | null;
  /**
 * usedByRoleName：usedByRole名称名称或显示文本。
 */

  usedByRoleName: string | null;
  /**
 * usedAt：usedAt相关字段。
 */

  usedAt: string | null;
  /**
 * destroyedAt：destroyedAt相关字段。
 */

  destroyedAt: string | null;
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: string;
}

/** 兑换码组列表响应。 */
export interface GmRedeemCodeGroupListRes {
/**
 * groups：group相关字段。
 */

  groups: RedeemCodeGroupView[];
}

/** 兑换码组详情响应。 */
export interface GmRedeemCodeGroupDetailRes {
/**
 * group：group相关字段。
 */

  group: RedeemCodeGroupView;
  /**
 * codes：code相关字段。
 */

  codes: RedeemCodeCodeView[];
}

/** 创建兑换码组请求。 */
export interface GmCreateRedeemCodeGroupReq {
/**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
  /**
 * count：数量或计量字段。
 */

  count: number;
}

/** 更新兑换码组请求。 */
export interface GmUpdateRedeemCodeGroupReq {
/**
 * name：名称名称或显示文本。
 */

  name: string;
  /**
 * rewards：reward相关字段。
 */

  rewards: RedeemCodeGroupRewardItem[];
}

/** 创建兑换码组响应。 */
export interface GmCreateRedeemCodeGroupRes {
/**
 * group：group相关字段。
 */

  group: RedeemCodeGroupView;
  /**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 为指定兑换码组追加码数量的请求。 */
export interface GmAppendRedeemCodesReq {
/**
 * count：数量或计量字段。
 */

  count: number;
}

/** 追加兑换码后的响应。 */
export interface GmAppendRedeemCodesRes {
/**
 * group：group相关字段。
 */

  group: RedeemCodeGroupView;
  /**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 账户侧兑换码兑换请求。 */
export interface AccountRedeemCodesReq {
/**
 * codes：code相关字段。
 */

  codes: string[];
}

/** 单个兑换码的兑换结果。 */
export interface AccountRedeemCodeResult {
/**
 * code：code相关字段。
 */

  code: string;
  /**
 * ok：ok相关字段。
 */

  ok: boolean;
  /**
 * message：message相关字段。
 */

  message: string;
  /**
 * groupName：group名称名称或显示文本。
 */

  groupName?: string;
  /**
 * rewards：reward相关字段。
 */

  rewards?: RedeemCodeGroupRewardItem[];
}

/** 兑换码批量兑换响应。 */
export interface AccountRedeemCodesRes {
/**
 * results：结果相关字段。
 */

  results: AccountRedeemCodeResult[];
}
