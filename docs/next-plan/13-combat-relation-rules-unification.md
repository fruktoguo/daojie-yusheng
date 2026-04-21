# 13 敌我判定规则统一化规划

目标：把“阵营”收口成统一的敌我关系判定器，由每个玩家的战斗设置决定目标关系；后续宗门、队伍、仇敌、盟友都只作为规则选项接入。

说明：

- 这份文档是 next 主线后续专项规划，不作为当前 `replace-ready` 的立即阻塞项。
- 这里的“阵营”不是固定 camp 表，而是运行时关系判定规则。

## 当前基线

- `packages/shared/src/automation-types.ts`
  - 已有 `hostile / friendly` 两组规则键。
- `packages/server/src/runtime/player/player-combat-config.helpers.ts`
  - 已有 `canPlayerDealDamageToPlayer()` 这类硬判定入口。
- `packages/server/src/runtime/world/world-runtime-auto-combat.service.ts`
  - 自动战斗自己筛目标。
- `packages/server/src/runtime/world/world-runtime-player-skill-dispatch.service.ts`
  - 技能派发自己判一次玩家目标能否攻击。
- `packages/server/src/runtime/world/world-runtime-basic-attack.service.ts`
  - 普攻链路也有自己的目标限制。

结论：

- 现在已经有规则表雏形。
- 但“手动技能 / 普攻 / 自动战斗”仍然在多个地方重复做敌我判定。

## 目标模型

统一的目标关系输出：

```ts
type CombatRelation = 'hostile' | 'friendly' | 'neutral' | 'blocked';
```

统一的关系解析结果：

```ts
interface CombatRelationResolution {
  relation: CombatRelation;
  matchedRules: string[];
  blockedReason?: string;
}
```

统一的输入对象：

- 施法者
- 目标
- 目标类型
  - `player`
  - `monster`
  - `tile`
- 当前地图上下文
- 玩家战斗设置中的规则表

统一后应满足：

- 自动战斗、强制攻击、普通攻击、技能释放都走同一个 relation resolver。
- `party / sect / retaliators / demonized_players / terrain` 都只是规则项。
- 后续加“队伍友伤”“宗门互斥”“黑名单玩家”时，不再改三四条战斗主链。

## 非目标

- 不在这一轮做固定阵营表或全服势力系统。
- 不在 shared 层硬编码宗门、队伍的具体数据来源。
- 不为了统一而改当前 PVP 规则数值语义。

## 任务

- [ ] 把当前 `CombatTargetingRules` 升级为真正的关系规则输入，而不只是筛选开关
- [ ] 新增统一 `resolveCombatRelation()` owner
- [ ] 把手动技能、普攻、自动战斗、强制攻击统一接到该 owner
- [ ] 给 `monster / tile / player` 定统一 target subject 结构
- [ ] 给 `party / sect / retaliators / demonized_players` 定 predicate 接口
- [ ] 保留当前 `allowAoePlayerHit / retaliatePlayerTargetId / 煞气入体` 语义，但收束到统一结果中
- [ ] 让 relation resolver 返回可解释的 `blockedReason`
- [ ] 给 action 面板、详情面板、强制攻击提示复用同一套关系说明
- [ ] 补 smoke，覆盖 auto battle / cast skill / basic attack / force attack 的一致性

## 执行顺序

### 第 1 批：先把关系解析纯函数定死

- [ ] 在 `packages/shared` 或 server runtime helper 中定义统一 relation 输出
- [ ] 先不改 UI，只先让 resolver 能回答“能否攻击”和“为什么”

### 第 2 批：收口 server 写路径

- [ ] 技能派发改用统一 relation resolver
- [ ] 普攻改用统一 relation resolver
- [ ] 自动战斗选目标也改用统一 relation resolver

### 第 3 批：把规则项扩成可生长结构

- [ ] 现有 `monster / terrain / all_players / non_hostile_players` 接成标准 predicate
- [ ] 预留 `party / sect` 真实接入点
- [ ] 允许后续追加更细的关系项而不改主判定框架

## 验证

最小验证：

- 同一个目标在手动技能、普攻、自动战斗里得到一致关系结论
- `allowAoePlayerHit` 打开和关闭时，玩家目标结果一致变化
- `retaliatePlayerTargetId` 和 `demonized_players` 仍按原语义工作
- 未来接 `party / sect` 时只需加 predicate，不需改 dispatch 主链

需要单独说明的风险：

- 如果只把“能不能打”统一，但“自动索敌优先级”仍各写一套，后面还会继续分叉。
- 如果把关系判定做成到处可随手改的布尔函数，后续新增规则项时会再次失控。
