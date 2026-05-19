/**
 * GM 运行时开关注册表
 *
 * 所有预置开关在此集中声明。后续新增开关只需在对应分组中添加一行即可，
 * 无需修改渲染逻辑或 HTML 模板。
 *
 * @example
 * // 新增一个开关：
 * { key: 'my_new_feature_enabled', label: '我的新功能', group: 'gameplay' }
 */

/** 单个开关的注册信息。 */
export interface RuntimeFlagEntry {
  /** 数据库中的 key，与服务端 runtime_flag 表对应。 */
  key: string;
  /** 面板中显示的中文标签。 */
  label: string;
  /** 所属分组 ID，用于 UI 分栏展示。 */
  group: string;
  /** 是否禁止通过面板删除（预置开关默认不可删除）。 */
  undeletable?: boolean;
}

/** 分组元信息。 */
export interface RuntimeFlagGroup {
  /** 分组唯一 ID。 */
  id: string;
  /** 分组显示名称。 */
  label: string;
  /** 排序权重，越小越靠前。 */
  order: number;
}

// ─── 分组定义 ─────────────────────────────────────────────────────────────────

export const FLAG_GROUPS: RuntimeFlagGroup[] = [
  { id: 'worker_pool', label: 'Worker Pool', order: 0 },
  { id: 'network', label: '网络', order: 10 },
  { id: 'gameplay', label: '玩法', order: 20 },
  { id: 'misc', label: '其他', order: 100 },
];

// ─── 预置开关 ─────────────────────────────────────────────────────────────────

export const PRESET_FLAGS: RuntimeFlagEntry[] = [
  // Worker Pool 系列
  { key: 'worker_pool_enabled', label: '总开关', group: 'worker_pool', undeletable: true },
  { key: 'worker_pool_aoi_envelope_enabled', label: 'AOI Envelope 编码', group: 'worker_pool', undeletable: true },
  { key: 'worker_pool_pathfinding_enabled', label: '寻路 Worker', group: 'worker_pool', undeletable: true },
  { key: 'worker_pool_fov_enabled', label: 'FOV 计算', group: 'worker_pool', undeletable: true },
  { key: 'worker_pool_instance_enabled', label: '实例 Tick 分片', group: 'worker_pool', undeletable: true },
  { key: 'worker_pool_persistence_enabled', label: '持久化序列化', group: 'worker_pool', undeletable: true },

  // 网络
  { key: 'gm_network_payload_capture_enabled', label: '网络载荷抓取', group: 'network', undeletable: true },

  // 玩法
  { key: 'combat_audit_enabled', label: '战斗审计日志', group: 'gameplay', undeletable: true },
];

/**
 * 将服务端返回的 flags 与注册表合并，生成最终渲染列表。
 * - 预置开关始终显示（即使服务端未设置）
 * - 服务端存在但注册表中没有的 key 归入 'misc' 分组
 */
export function mergeRuntimeFlags(
  serverFlags: Array<{ key: string; value: boolean }>,
): Array<RuntimeFlagEntry & { value: boolean; isPreset: boolean }> {
  const serverMap = new Map(serverFlags.map((f) => [f.key, f.value]));

  const result: Array<RuntimeFlagEntry & { value: boolean; isPreset: boolean }> = [];

  // 先放预置开关
  for (const preset of PRESET_FLAGS) {
    result.push({
      ...preset,
      value: serverMap.get(preset.key) ?? false,
      isPreset: true,
    });
    serverMap.delete(preset.key);
  }

  // 再放服务端有但注册表没有的
  for (const [key, value] of serverMap) {
    result.push({
      key,
      label: key,
      group: 'misc',
      value,
      isPreset: false,
    });
  }

  return result;
}

/**
 * 按分组整理开关列表，返回有序的分组数组。
 */
export function groupRuntimeFlags(
  flags: Array<RuntimeFlagEntry & { value: boolean; isPreset: boolean }>,
): Array<{ group: RuntimeFlagGroup; flags: Array<RuntimeFlagEntry & { value: boolean; isPreset: boolean }> }> {
  const groupMap = new Map<string, Array<RuntimeFlagEntry & { value: boolean; isPreset: boolean }>>();

  for (const flag of flags) {
    const list = groupMap.get(flag.group) ?? [];
    list.push(flag);
    groupMap.set(flag.group, list);
  }

  const sortedGroups = [...FLAG_GROUPS].sort((a, b) => a.order - b.order);
  const result: Array<{ group: RuntimeFlagGroup; flags: Array<RuntimeFlagEntry & { value: boolean; isPreset: boolean }> }> = [];

  for (const group of sortedGroups) {
    const list = groupMap.get(group.id);
    if (list && list.length > 0) {
      result.push({ group, flags: list });
      groupMap.delete(group.id);
    }
  }

  // 未在 FLAG_GROUPS 中声明的分组兜底
  for (const [id, list] of groupMap) {
    if (list.length > 0) {
      result.push({
        group: { id, label: id, order: 999 },
        flags: list,
      });
    }
  }

  return result;
}
