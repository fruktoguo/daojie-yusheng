/**
 * 启动期断言：所有模板 Registry 加载后必须 `Object.isFrozen` 为真。
 *
 * 触发点：在 `audit:boundaries` 链路下作为冷路径运行。失败时 exit 1，
 * 日志包含 registry / id / unfrozenPath，便于精确定位泄漏点。
 *
 * 注意：仅做 sample 检查（每个 registry 取 listIds().slice(0, 8)），不全表扫，
 *      避免 audit 自身在 5000 玩家口径下引入不必要的 IO 成本。
 */
import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

interface RegistryProbe {
  name: string;
  listIds(): readonly string[];
  getRef(id: string): unknown;
}

interface UnfrozenPath {
  registry: string;
  id: string;
  path: string[];
}

const SUBSTRUCTURE_KEYS = [
  'attrs',
  'stats',
  'equipAttrs',
  'formula',
  'qiProjection',
  'shopItems',
  'quests',
  'drops',
  'lootPools',
  'rewards',
  'baseAttrs',
  'baseNumericStats',
  'ratioDivisors',
  'statFormula',
  'initialBuffs',
  'skills',
  'consumeBuffs',
  'effects',
];

function probeRef(probe: RegistryProbe, sampleLimit = 8): UnfrozenPath[] {
  const out: UnfrozenPath[] = [];
  const ids = probe.listIds().slice(0, sampleLimit);
  for (const id of ids) {
    let template: any;
    try {
      template = probe.getRef(id);
    } catch (error) {
      out.push({
        registry: probe.name,
        id,
        path: [`getRef threw: ${(error as Error)?.message ?? String(error)}`],
      });
      continue;
    }
    if (!template || typeof template !== 'object') {
      continue;
    }
    if (!Object.isFrozen(template)) {
      out.push({ registry: probe.name, id, path: ['<root>'] });
      continue;
    }
    for (const key of SUBSTRUCTURE_KEYS) {
      const value = template[key];
      if (!value || typeof value !== 'object') {
        continue;
      }
      if (!Object.isFrozen(value)) {
        out.push({ registry: probe.name, id, path: [key] });
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => {
          if (entry && typeof entry === 'object' && !Object.isFrozen(entry)) {
            out.push({ registry: probe.name, id, path: [`${key}[${index}]`] });
          }
        });
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (process.env.RUNTIME_FREEZE_TEMPLATES === '0') {
    process.stdout.write('audit-registry-frozen: skipped (RUNTIME_FREEZE_TEMPLATES=0)\n');
    process.exit(0);
  }

  const contentRepository = new ContentTemplateRepository();
  contentRepository.onModuleInit();
  const mapRepository = new MapTemplateRepository();
  mapRepository.onModuleInit();

  const probes: RegistryProbe[] = [
    {
      name: 'item',
      listIds: () => Array.from((contentRepository as any).itemTemplates.keys()),
      getRef: (id) => (contentRepository as any).itemTemplates.get(id),
    },
    {
      name: 'technique',
      listIds: () => Array.from((contentRepository as any).techniqueTemplates.keys()),
      getRef: (id) => (contentRepository as any).techniqueTemplates.get(id),
    },
    {
      name: 'skill',
      listIds: () => Array.from((contentRepository as any).skillTemplatesById.keys()),
      getRef: (id) => (contentRepository as any).skillTemplatesById.get(id),
    },
    {
      name: 'buff',
      listIds: () => contentRepository.buffRegistry.listIds(),
      getRef: (id) => contentRepository.buffRegistry.getRef(id),
    },
    {
      name: 'formation',
      listIds: () => Array.from((contentRepository as any).formationTemplates.keys()),
      getRef: (id) => (contentRepository as any).formationTemplates.get(id),
    },
    {
      name: 'monster',
      listIds: () => Array.from((contentRepository as any).monsterRuntimeTemplates.keys()),
      getRef: (id) => (contentRepository as any).monsterRuntimeTemplates.get(id),
    },
    {
      name: 'npc',
      listIds: () => mapRepository.npcRegistry.listIds(),
      getRef: (id) => mapRepository.npcRegistry.getRef(id),
    },
    {
      name: 'container',
      listIds: () => mapRepository.containerRegistry.listIds(),
      getRef: (id) => mapRepository.containerRegistry.getRef(id),
    },
    {
      name: 'landmark',
      listIds: () => mapRepository.landmarkRegistry.listIds(),
      getRef: (id) => mapRepository.landmarkRegistry.getRef(id),
    },
    {
      name: 'quest',
      listIds: () => mapRepository.questRegistry.listIds(),
      getRef: (id) => {
        const source = mapRepository.questRegistry.getQuestSource(id);
        return source;
      },
    },
  ];

  const failures: UnfrozenPath[] = [];
  for (const probe of probes) {
    failures.push(...probeRef(probe));
  }

  if (failures.length === 0) {
    process.stdout.write(
      `audit-registry-frozen: ${probes.length} registries x sample 模板均冻结。\n`,
    );
    process.exit(0);
  }
  process.stderr.write(`audit-registry-frozen: ${failures.length} 处未冻结：\n`);
  for (const failure of failures) {
    process.stderr.write(
      `  registry=${failure.registry} id=${failure.id} unfrozen=${failure.path.join('.')}\n`,
    );
  }
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`audit-registry-frozen: ${(error as Error)?.stack ?? String(error)}\n`);
  process.exit(1);
});
