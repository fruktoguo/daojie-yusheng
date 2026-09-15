/**
 * 认证与账号领域契约。
 *
 * 包含玩家注册/登录/令牌刷新、显示名可用性检查、账号自助修改（密码/显示名/角色名）
 * 以及通用 BasicOkRes 响应。这些类型不依赖 GM 管理端上下文。
 */

export const AUTH_REGISTER_ACTIVATION_REQUIRED_CODE = 'REGISTRATION_ACTIVATION_REQUIRED';

/** 注册请求 */
export interface AuthRegisterReq {
/**
 * accountName：account名称名称或显示文本。
 */

  accountName: string;
  /**
 * password：password相关字段。
 */

  password: string;
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
  /**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
  /** 邀请码，来自注册页可选输入或邀请链接预填。 */
  invitationCode?: string;
  /** 同 IP 已注册时要求输入的激活码。 */
  activationCode?: string;
}

/** 登录请求 */
export interface AuthLoginReq {
/**
 * loginName：login名称名称或显示文本。
 */

  loginName: string;
  /**
 * password：password相关字段。
 */

  password: string;
}

/** 刷新令牌请求 */
export interface AuthRefreshReq {
/**
 * refreshToken：refreshToken标识。
 */

  refreshToken: string;
  /**
 * deviceId：客户端设备标识。
 */
  deviceId?: string;
}

/** 令牌响应 */
export interface AuthTokenRes {
/**
 * accessToken：accessToken标识。
 */

  accessToken: string;
  /**
 * refreshToken：refreshToken标识。
 */

  refreshToken: string;
}

/** 显示名可用性检查响应 */
export interface DisplayNameAvailabilityRes {
/**
 * available：available相关字段。
 */

  available: boolean;
  /**
 * message：message相关字段。
 */

  message?: string;
}

/** 修改密码请求 */
export interface AccountUpdatePasswordReq {
/**
 * currentPassword：currentPassword相关字段。
 */

  currentPassword: string;
  /**
 * newPassword：newPassword相关字段。
 */

  newPassword: string;
}

/** 修改显示名请求 */
export interface AccountUpdateDisplayNameReq {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
}

/** 修改显示名后的回包。 */
export interface AccountUpdateDisplayNameRes {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;
}

/** 修改角色名请求 */
export interface AccountUpdateRoleNameReq {
/**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
}

/** 修改角色名后的回包。 */
export interface AccountUpdateRoleNameRes {
/**
 * roleName：role名称名称或显示文本。
 */

  roleName: string;
}

/** 通用成功回包。 */
export interface BasicOkRes {
/**
 * ok：ok相关字段。
 */

  ok: true;
}

