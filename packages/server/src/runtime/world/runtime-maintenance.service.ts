/**
 * 运行时维护模式检测服务
 * 通过环境变量判断当前是否处于维护/恢复状态，阻止正常 tick 推进
 */
import { Injectable } from '@nestjs/common';

/** 维护模式状态检测，读取多个环境变量判断是否激活 */
@Injectable()
export class RuntimeMaintenanceService {
  /** 检查运行时是否处于维护/恢复激活状态 */
  isRuntimeMaintenanceActive(): boolean {
    return readBooleanEnv('SERVER_RUNTIME_MAINTENANCE')
      || readBooleanEnv('RUNTIME_MAINTENANCE')
      || readBooleanEnv('SERVER_RUNTIME_RESTORE_ACTIVE');
  }
}

function readBooleanEnv(key: string): boolean {
  const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
