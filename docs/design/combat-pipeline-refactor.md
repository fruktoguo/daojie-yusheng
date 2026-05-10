# 战斗管线重构设计

## 目标

将当前分散在 `world-runtime-basic-attack.service.ts`、`world-runtime-player-skill-dispatch.service.ts`、`player-combat.service.ts`、`combat-resolution.helpers.ts` 中的伤害结算逻辑，重构为**管线式架构**：把结算过程拆成独立的环节（纯函数），不同攻击类型和目标类型按需组合这些环节。

## 现状问题

1. **普通攻击和技能攻击走完全不同的代码路径**，共享逻辑靠复制而非复用
2. **普通攻击地块不经过伤害公式**（直接传 baseDamage），与打怪物/玩家的链路不一致
3. **技能攻击地块需要手动设置 realmLv/combatExp** 来绕过境界压制，属于 hack
4. 新增结算环节（如新 buff 类型、新减伤机制）需要在多处修改
5. 难以做伤害预览、战斗日志审计

## 设计方案

### 核心思路

- 一个 **mutable context** 对象贯穿整条管线，零分配
- 每个环节是一个 **纯函数**，读写 context
- 按攻击类型 × 目标类型 **静态组合** 环节调用，不做运行时注册
- 掉落、经验、表现等 **副作用** 在管线结算完成后触发，不属于管线

### Context 结构

```typescript
interface CombatResolveContext {
  // 输入
  attacker: CombatantState;
  target: CombatantState;
  baseDamage: number;
  damageKind: 'physical' | 'spell';
  element?: ElementKey;
  isBasicAttack: boolean;

  // 各环节写入
  hit: boolean;
  dodged: boolean;
  broken: boolean;
  resolved: boolean;
  crit: boolean;
  damage: number;
  rawDamage: number;
  realmGapMultiplier: number;
  combatExpDamageMultiplier: number;
  defenseReduction: number;
  formationMitigation: number;
}
```

### 结算环节

| # | 环节 | 职责 | 备注 |
|---|------|------|------|
| 1 | `resolveBaseDamage` | 计算基础伤害 | 普攻=攻击力，技能=公式 |
| 2 | `resolveBreakResolve` | 破防/化解判定 | 受双方 breakPower/resolvePower |
| 3 | `resolveHitDodge` | 命中/闪避判定 | 受战斗经验影响（双方都吃） |
| 4 | `resolveCrit` | 暴击判定 | 受 broken 状态加成 |
| 5 | `resolveDefense` | 防御减伤 | 受 resolved 状态加成 |
| 6 | `resolveElementBonus` | 五行伤害加成/减免 | |
| 7 | `resolveRealmGap` | 境界压制/加成 | 地块跳过 |
| 8 | `resolveCombatExpDamage` | 战斗经验伤害乘区 | 仅普攻 |
| 9 | `resolveFormationMitigation` | 阵法减伤 | 仅地块目标 |

### 链路组合

```typescript
// 普攻 → 怪物
function resolveBasicAttackToMonster(ctx: CombatResolveContext): void {
  resolveBreakResolve(ctx);
  resolveHitDodge(ctx);
  if (ctx.dodged) return;
  resolveCrit(ctx);
  resolveDefense(ctx);
  resolveElementBonus(ctx);
  resolveRealmGap(ctx);
  resolveCombatExpDamage(ctx);
}

// 普攻 → 玩家
function resolveBasicAttackToPlayer(ctx: CombatResolveContext): void {
  resolveBreakResolve(ctx);
  resolveHitDodge(ctx);
  if (ctx.dodged) return;
  resolveCrit(ctx);
  resolveDefense(ctx);
  resolveElementBonus(ctx);
  resolveRealmGap(ctx);
  resolveCombatExpDamage(ctx);
}

// 普攻 → 地块
function resolveBasicAttackToTile(ctx: CombatResolveContext): void {
  // 地块不闪避、无防御、无境界差，但流程统一
  resolveCrit(ctx);
  resolveCombatExpDamage(ctx);
}

// 技能 → 怪物
function resolveSkillToMonster(ctx: CombatResolveContext): void {
  resolveBreakResolve(ctx);
  resolveHitDodge(ctx);
  if (ctx.dodged) return;
  resolveCrit(ctx);
  resolveDefense(ctx);
  resolveElementBonus(ctx);
  resolveRealmGap(ctx);
  // 技能不吃战斗经验伤害乘区
}

// 技能 → 地块
function resolveSkillToTile(ctx: CombatResolveContext): void {
  resolveCrit(ctx);
  // 无防御、无境界、无战斗经验乘区
}

// 技能 → 玩家
function resolveSkillToPlayer(ctx: CombatResolveContext): void {
  resolveBreakResolve(ctx);
  resolveHitDodge(ctx);
  if (ctx.dodged) return;
  resolveCrit(ctx);
  resolveDefense(ctx);
  resolveElementBonus(ctx);
  resolveRealmGap(ctx);
}
```

### 副作用（管线外）

管线只负责计算最终伤害数值。以下逻辑在管线结算完成后执行：

- **扣血/扣耐久**：通过 adapter 模式（现有 `combat-outcome-apply-adapters.ts`）
- **掉落结算**：读取 `getTileDropConfig`，按 `appliedDamage` 计算概率
- **怪物击杀奖励**：经验、掉落物
- **战斗经验增长**
- **战斗表现**：特效、飘字、通知（`emitCombatPresentation`）
- **宗门扩展**：地块摧毁后触发

### CombatantState 统一

当前不同目标类型的属性获取方式不同。重构后统一为：

```typescript
interface CombatantState {
  numericStats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
  realmLv: number;
  combatExp: number;
}
```

- 玩家：从 `player.attrs` 读取
- 怪物：从 `monster.numericStats` 读取
- 地块：`numericStats` 全 0（physDef=0, dodge=0 等），`realmLv` = 攻击者 realmLv，`combatExp` = 攻击者 combatExp

### 性能约束

- context 对象复用，不在热路径上分配新对象
- 每个环节是纯函数，直接修改 context 字段
- 不使用动态注册、中间件模式或数组遍历
- 链路组合在编译期确定，IDE 可跳转

## 文件规划

| 文件 | 职责 |
|------|------|
| `combat-pipeline.ts` | context 类型定义 + 各环节纯函数 |
| `combat-pipeline-compose.ts` | 按攻击类型×目标类型组合的链路函数 |
| `world-runtime-combat-dispatch.service.ts` | 统一入口：构建 context → 跑管线 → 执行副作用 |

现有文件逐步迁移：
- `combat-resolution.helpers.ts` → 环节函数迁入 `combat-pipeline.ts`
- `world-runtime-basic-attack.service.ts` → 普攻分支迁入统一 dispatch
- `world-runtime-player-skill-dispatch.service.ts` → 技能分支迁入统一 dispatch
- `player-combat.service.ts` → 技能解析保留，伤害结算迁出

## 迁移策略

1. 先实现 `combat-pipeline.ts` 和 `combat-pipeline-compose.ts`，纯函数无副作用
2. 新建 `world-runtime-combat-dispatch.service.ts` 作为统一入口
3. 逐步把现有 `dispatchBasicAttackToMonster`、`dispatchBasicAttackToTile`、`dispatchCastSkillToTile` 等方法改为调用统一入口
4. 每步验证行为不变（smoke 测试）
5. 最后清理旧代码

## 不在本次重构范围

- 怪物技能结算（`castMonsterSkill`）——后续统一
- AOI/广播优化
- 持久化/审计链路
- 战斗表现层重构
