# 服务拆分模式约定

本文档定义项目中服务/模块拆分的统一模式，所有新代码必须遵循。

---

## 三种拆分模式

### 1. 纯函数 Helper 文件 (`.helpers.ts`)

**适用场景**：无状态、无依赖注入、纯计算逻辑

**命名**：`<domain>-<feature>.helpers.ts`

**特征**：
- 所有导出均为纯函数（相同输入 → 相同输出）
- 不持有任何状态
- 不依赖 NestJS 容器
- 可直接 import 使用

**示例**：
```typescript
// world-runtime-inventory-grant.helpers.ts
export function canGrantItem(inventory: InventorySlot[], itemId: string): boolean { ... }
export function computeGrantResult(inventory: InventorySlot[], item: ItemStack): GrantResult { ... }
```

---

### 2. 独立 NestJS Service (`@Injectable()`)

**适用场景**：有状态、需要依赖注入、需要生命周期管理

**命名**：`<Domain><Feature>Service`，文件名 `<domain>-<feature>.service.ts`

**特征**：
- 使用 `@Injectable()` 装饰器
- 通过构造函数注入依赖
- 可持有运行时状态
- 在 Module 中注册

**示例**：
```typescript
// player-inventory.service.ts
@Injectable()
export class PlayerInventoryService {
  constructor(private readonly playerRuntime: PlayerRuntimeService) {}
  grantItem(playerId: string, itemId: string, count: number): GrantResult { ... }
}
```

---

### 3. 薄编排 Facade Service

**适用场景**：协调多个子 service 的执行顺序，不包含业务规则

**命名**：`<Domain>FacadeService` 或 `<Domain>OrchestrationService`

**特征**：
- 方法体只做调用转发和顺序编排
- 不包含 if/else 业务判断（除了简单的 guard）
- 不直接操作数据结构
- 每个方法不超过 20 行

**示例**：
```typescript
// world-runtime-state-facade.service.ts
@Injectable()
export class WorldRuntimeStateFacadeService {
  async advanceFrame(): Promise<void> {
    this.orchestration.advanceFrame();
  }
}
```

---

## 拆分决策流程

```
需要拆分的逻辑
  │
  ├─ 是否需要依赖注入？
  │   ├─ 否 → 纯函数 Helper (.helpers.ts)
  │   └─ 是 ─┐
  │           ├─ 是否只做调用编排？
  │           │   ├─ 是 → Facade Service
  │           │   └─ 否 → 独立 Service
  │           └─ 是否有运行时状态？
  │               ├─ 是 → 独立 Service
  │               └─ 否 → 可选 Helper 或 Service
  └─ 是否是热路径纯计算？
      └─ 是 → 纯函数 Helper（便于 bench 和内联优化）
```

---

## 文件大小约束

| 阈值 | 动作 |
|------|------|
| > 1500 行 | CI warning，应考虑拆分 |
| > 3000 行 | CI error，必须拆分或加入 baseline |
| baseline 文件膨胀 | CI 失败，禁止继续增长 |

---

## 命名约定

| 模式 | 文件名 | 类名 |
|------|--------|------|
| Helper | `<domain>-<feature>.helpers.ts` | N/A（纯函数导出） |
| Service | `<domain>-<feature>.service.ts` | `<Domain><Feature>Service` |
| Facade | `<domain>-<feature>-facade.service.ts` | `<Domain><Feature>FacadeService` |
| Types | `<domain>-<feature>.types.ts` | N/A（类型导出） |

---

## 拆分后的导入规则

- 同层 service 之间可以互相注入
- Helper 文件可以被任何层导入
- Facade 只注入同域子 service，不跨域直接操作
- 禁止循环依赖：如果 A 注入 B，B 不能注入 A（使用 `forwardRef` 是代码异味）
