/**
 * 建筑定义解析只把稳定 defId 视为持久化身份。
 *
 * defHandle 由当前进程按目录顺序生成，只能在历史运行态确实缺少 defId 时作为兼容回退；
 * 一旦存在 defId，即使它无法解析，也不能再用可能已漂移的 handle 猜测另一种建筑。
 */
import type { CompiledBuildingCatalog, CompiledBuildingDef } from '@mud/shared';

export type BuildingDefinitionReference = {
  defId?: unknown;
  defHandle?: unknown;
};

export function resolveCompiledBuildingDefinition(
  catalog: CompiledBuildingCatalog | null | undefined,
  building: BuildingDefinitionReference | null | undefined,
): CompiledBuildingDef | null {
  if (!catalog || !building) {
    return null;
  }

  const defId = typeof building.defId === 'string' && building.defId.length > 0
    ? building.defId
    : '';
  if (defId) {
    return catalog.defById?.get(defId) ?? null;
  }

  const legacyHandle = building.defHandle;
  const numericHandle = Number(legacyHandle);
  if (Number.isInteger(numericHandle) && numericHandle > 0) {
    return catalog.defByHandle?.[numericHandle] ?? null;
  }

  // 极早期测试/运行态曾把定义 ID 写进 defHandle；仅在 defId 缺失时兼容读取。
  const legacyDefId = normalizeLegacyDefinitionId(legacyHandle);
  return legacyDefId ? catalog.defById?.get(legacyDefId) ?? null : null;
}

function normalizeLegacyDefinitionId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
