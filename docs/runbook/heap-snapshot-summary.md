# Heap Snapshot 摘要诊断

> 状态：已实装。
>
> 适用场景：正式服 RSS / old_space 异常增长，需要定位"哪类对象在涨"，但 GB 级 .heapsnapshot 文件无法直接下载到本机分析。

---

## 1. 解决的问题

V8 `writeHeapSnapshot` 输出的 .heapsnapshot 文件大小约 = heap_used 的 1.0~1.2 倍。3 GB heap → ~3 GB JSON。直接下载困难，本机 Chrome DevTools 加载也需要 16 GB+ 内存。

本工具在**服务端原地流式解析** .heapsnapshot 文件，按 `(node_type, constructor_name)` 维度统计：

- 每个 constructor 的节点数（count）
- 每个 constructor 所有节点的 self_size 累加（bytes）
- 与上一次摘要的 diff（哪个 constructor 在两次之间增长最多）

输出 ~50 KB 的 `.summary.json`，可以直接通过 GM HTTP 接口下载，不需要搬 GB 文件。

完整 retainer 链路（"是谁在持有这些对象"）仍需用 Chrome DevTools 分析完整 .heapsnapshot；本工具回答的是"涨在哪类对象"，先一步定位嫌疑域。

---

## 2. 接口

### 2.1 触发生成

```http
POST /api/gm/perf/memory/heap-snapshot
Authorization: Bearer <gm-token>
```

可选 query：

| 参数 | 取值 | 说明 |
|---|---|---|
| `deleteAfterSummary` | `1` / `true` | 解析完毕后立刻删除原 .heapsnapshot，仅保留 ~50 KB 的 .summary.json。默认保留原文件 |

返回：

```json
{
  "ok": true,
  "path": "/opt/server/.runtime/heap-snapshots/server-1778955813486-585877.heapsnapshot",
  "bytes": 247090000,
  "durationMs": 15892,
  "generatedAt": 1778955813486,
  "summaryPath": "/opt/server/.runtime/heap-snapshots/server-1778955813486-585877.heapsnapshot.summary.json",
  "summaryBytes": 48720,
  "summaryDurationMs": 1594,
  "summaryError": null,
  "summary": {
    "generatedAtMs": 1778955830980,
    "parseDurationMs": 1594,
    "snapshotFileBytes": 247090000,
    "declaredNodeCount": 941897,
    "parsedNodeCount": 941897,
    "parsedStringCount": 315705,
    "totalSelfSizeBytes": 60530000,
    "topByBytes": [ ... ],
    "topByCount": [ ... ],
    "diffSincePrevious": { ... }
  }
}
```

调用方可以直接消费返回的 `summary` 字段，无需再调 GET 端点。

注意事项：
- `writeHeapSnapshot` 本身会让 V8 短暂暂停（GB 级 heap 通常 5~30 秒）；解析阶段不暂停 V8 但占用 CPU
- 解析期间内存峰值约 50~200 MB（stringPool）；对已经 OOM 边缘的进程仍要谨慎

### 2.2 读取最近一次摘要

```http
GET /api/gm/perf/memory/heap-snapshot/summary
Authorization: Bearer <gm-token>
```

返回：

```json
{
  "ok": true,
  "fileName": "server-1778955813486-585877.heapsnapshot.summary.json",
  "bytes": 48720,
  "summary": { ... 与触发接口返回的 summary 字段同结构 ... }
}
```

如果尚未生成过 snapshot，返回：

```json
{ "ok": false, "reason": "no_summary_yet", "hint": "先 POST /api/gm/perf/memory/heap-snapshot 生成一次" }
```

---

## 3. 摘要 JSON 结构

```ts
interface HeapSnapshotSummary {
  generatedAtMs: number;          // 摘要生成时间
  parseDurationMs: number;        // 解析耗时
  snapshotFileBytes: number;      // 源 .heapsnapshot 文件大小
  declaredNodeCount: number;      // V8 写入时声明的节点总数
  parsedNodeCount: number;        // 实际解析到的节点总数（理论应等于 declared）
  parsedStringCount: number;      // 实际解析到的字符串数
  totalSelfSizeBytes: number;     // 所有节点 self_size 累加
  topByBytes: ConstructorStat[];  // 按 self_size 倒序前 N（默认 60）
  topByCount: ConstructorStat[];  // 按 count 倒序前 N
  diffSincePrevious?: {           // 与上一次 summary 的对比，仅在存在前一份时输出
    intervalMs: number;
    totalSelfSizeDeltaBytes: number;
    previousAtMs: number;
    previousFileName: string;
    topGrowingByBytes: Array<{ name: string; nodeType: string; countDelta: number; sizeDeltaBytes: number }>;
  };
}

interface ConstructorStat {
  name: string;       // 构造函数或类型名
  nodeType: string;   // V8 节点类型（hidden/array/string/object/code/closure/...）
  count: number;
  selfSizeBytes: number;
}
```

---

## 4. 怎么读输出

### 4.1 一次性快照看绝对值

打开 `summary.topByBytes`，前几条通常是：

| name | nodeType | 含义 |
|---|---|---|
| `Object` | object | 业务字面量对象（最常见的内存来源） |
| `Array` | object | JS Array 实例 |
| `(object elements)` | array | 数组的元素存储区（隐藏的 V8 数据节点；与 Array 一一对应） |
| `(object properties)` | array | 对象的命名属性存储区 |
| `(string)` | string | 字面量字符串 |
| `(concatenated string)` | concatenated string | 由 `+` / 模板字符串拼接出来的长字符串（V8 会保留为 cons string，不复制底层） |
| `(closure)` | closure | 闭包（函数 + 捕获的作用域） |
| `(code)` | code | V8 编译出来的字节码 / 机器码 |
| `system / Map` | object shape | V8 内部的 hidden class 元数据 |
| `system / DescriptorArray` | object shape | hidden class 描述符 |
| `(hidden)` | hidden | V8 内部隐藏对象，通常是 hashmap 后端 |

业务类常见名字（举例）：

- `Map` / `Set` / `WeakMap`：JS 内置容器实例
- `(anonymous)` / `Function` / `(closure)` 内带具体函数名：闭包
- 自定义 class 或 service 的 constructor 名（如 `WorldRuntimeService` / `MapInstanceRuntime`）
- 直接的 NestJS 模块对象 / DI 元数据等

定位思路：
1. 看 `topByBytes` 前 5 条，哪些 nodeType=object 且 name 是业务类
2. 如果 `Object` count 异常多（百万级以上），说明业务字面量对象在累积
3. 如果 `(object elements)` 占比大，跟着看 `Array` 的 count——通常对应"几十万个元素的大数组"
4. 如果 `(concatenated string)` 占比大，说明有大量字符串拼接（日志、key 拼接、模板）没释放
5. 如果某个具体 class 名（如 `ProjectedMonsterEntry`）count 暴涨，定位到具体 cache 没清

### 4.2 用 diff 看增长

`diffSincePrevious.topGrowingByBytes` 是真正的"哪类对象在增长"答案。例如：

```json
{
  "intervalMs": 300000,
  "totalSelfSizeDeltaBytes": 1234567000,
  "topGrowingByBytes": [
    { "name": "Object", "nodeType": "object", "countDelta": 250000, "sizeDeltaBytes": 18000000 },
    { "name": "ProjectedMonsterEntry", "nodeType": "object", "countDelta": 95421, "sizeDeltaBytes": 47000000 },
    { "name": "(string)", "nodeType": "string", "countDelta": 320000, "sizeDeltaBytes": 12500000 },
    { "name": "Map", "nodeType": "object", "countDelta": 8, "sizeDeltaBytes": 80000 }
  ]
}
```

读法：
- `Object countDelta=250000` 表示 5 分钟里多产生了 25 万个未释放的字面量对象——这是泄漏嫌疑
- `ProjectedMonsterEntry` 这种业务类直接暴露**具体哪个 cache 没释放**
- `(string) countDelta=320000` 配合代码扫描通常能定位到"日志 / 通知拼接没限频"或"大量 key 字符串没释放"

### 4.3 推荐的诊断流程

1. **进程启动后立刻**点 GM "生成 Heap Snapshot"，得到 baseline summary
2. **跑预期会泄漏的场景** 5~30 分钟（玩家上线、bot 压测、特定操作流）
3. 再点一次 GM "生成 Heap Snapshot"，自动得到 diff
4. 看 `diffSincePrevious.topGrowingByBytes` 前 5 条
5. 如果出现具体业务类名 → 对应 cache / Map 没清；用 grep 查所有 `new ClassName` / `set(...)` 路径
6. 如果是 `Object` / `Array` / `(string)` 这种通用类型 → 进 Chrome DevTools 加载完整 .heapsnapshot 看 retainer 链路

### 4.4 解析速度参考

| heap_used | 文件大小 | 解析耗时 | 进程内存峰值 |
|---|---|---|---|
| 80 MB | 4 MB | ~150 ms | ~10 MB |
| 800 MB | 60 MB | ~1.6 秒 | ~30 MB |
| 2 GB | 240 MB | ~6 秒 | ~60 MB |
| 3 GB | 3 GB | ~80 秒 | ~200 MB |

---

## 5. 文件管理

### 5.1 落盘位置

服务端进程的 `.runtime/heap-snapshots/` 目录：
- `server-<ms>-<pid>.heapsnapshot`：原始 V8 heap snapshot
- `server-<ms>-<pid>.heapsnapshot.summary.json`：本工具输出的摘要 JSON

> 在 docker stack 部署下，路径是容器内 `/opt/server/.runtime/heap-snapshots/`（按当前 server Dockerfile 的 WORKDIR）。需要从容器拷出时：
>
> ```bash
> docker cp $(docker ps --filter name=daojie-yusheng_server --format '{{.ID}}'):/opt/server/.runtime/heap-snapshots/. ./heap-snapshots/
> ```

### 5.2 LRU 保留

每次 `writeHeapSnapshot` 完成后，自动清理超过保留份数的旧文件（按文件名时间戳前缀升序，删最旧的）。

环境变量：
- `SERVER_HEAP_SNAPSHOT_LRU_KEEP`：保留最近 N 份。默认 3。
- `SERVER_HEAP_SNAPSHOT_TOP_LIMIT`：摘要 topByBytes / topByCount 的长度。默认 60。

### 5.3 deleteAfterSummary

如果磁盘紧张，触发时带 `?deleteAfterSummary=1` 让服务端解析完毕立刻删除原 .heapsnapshot，仅保留 50 KB 摘要：

```bash
curl -X POST 'http://server/api/gm/perf/memory/heap-snapshot?deleteAfterSummary=1' \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. 局限与注意事项

| 局限 | 说明 |
|---|---|
| 不解析 retainer | 摘要只回答"哪类对象多"，不回答"是谁在持有它们"。后者必须用 Chrome DevTools 加载完整 .heapsnapshot 看 retainer tree |
| 字符串截断 | stringPool 单条最长保留 64 字节，避免巨型字符串撑爆解析期内存。这意味着 constructor 名超过 64 字节会被截断，目前 V8 输出的 constructor 名都很短，不影响 |
| nodeType 维度 | 同名跨 nodeType 的统计是独立的（例如 `Array` 在 type=object 和 type=array 下都会出现）。读输出时注意 nodeType 字段 |
| 进程暂停 | V8 `writeHeapSnapshot` 本身会让 JS 主线程暂停若干秒；GB 级 heap 上要慎用，不要在战斗高峰期触发 |
| 并发触发 | 现版本不做互斥；同时多次触发会串行排队（V8 内部锁），但每个调用都会落一份新的 snapshot 文件，LRU 会自动清旧 |

---

## 7. 实施细节

> 给运维 / 后续维护参考。

### 7.1 流式解析架构

`packages/server/src/tools/heap-snapshot-summary.ts` 中 `Parser` 类按 4 个阶段推进，每喂一段 chunk 都按当前阶段处理：

| 阶段 | 输入边界 | 工作 |
|---|---|---|
| `prelude` | `{` 起始 → `"nodes":[` | 累积前置 chunk，用正则从 prelude 文本里抽 `node_count` / `node_fields` / `node_types[0]` |
| `nodes` | `"nodes":[` 之后 → 第一个 `]` | 按字节扫描数字 token，每 `nodeFieldCount` 个一组 commit 到 `statByKey` |
| `cooldown` | `]` 之后 → `"strings":[` | indexOf 跳过 edges / trace_* / samples / locations，保留尾部 needle.length-1 字节防止跨 chunk 漏匹配 |
| `strings` | `"strings":[` 之后 → 第一个 `]` | 流式读 JSON 字符串到 stringPool（截断 maxStringBytes） |
| `done` | strings 数组结束 | 后续 chunk 全部丢弃 |

### 7.2 关键设计决策

- **不构建对象图、不解析 edges**：只统计 self_size 和 count，避免 O(N²) 内存
- **prelude 用正则提取 meta**：避免实现完整 JSON parser；正则只从 prelude 段（< 5 KB）抽 `node_count` / `node_fields` / `node_types[0]` 三个简单结构，足够稳定
- **stringPool 截断**：单条 64 字节够分辨 constructor 名；type=string 节点本身的 name 也被截断但不影响（`(string)` 维度统一汇总）
- **buf 复用**：每 chunk 末尾保留未消费部分，next chunk concat；nodes 阶段用 `scanNumberEnd` 区分"数字结束"与"buffer 末尾未结束"，跨 chunk 安全

### 7.3 测试

单元级：
- `packages/server/dist/tools/heap-snapshot-summary.js` 可独立 require 测试
- `node` 内置的 `v8.writeHeapSnapshot()` 即可生成测试 fixture
- 已在 dev 机上验证：4 MB 文件 149 ms / 62 MB 文件 1.6 秒；diff 准确识别人为创建的 200K BigBoy-like 对象

集成级：
- `pnpm --filter @mud/server compile` 通过
- `pnpm verify:quick` 通过
- `pnpm verify:building` 通过
- `node packages/server/dist/tools/server-memory-retention-smoke.js` 全部 proof 通过

---

## 8. 实战示例

### 场景：正式服 5 分钟 RSS 涨 1.5 GB，定位元凶

```bash
# 1. 启动后立刻打 baseline
curl -X POST 'http://server:11922/api/gm/perf/memory/heap-snapshot' \
  -H "Authorization: Bearer $GM_TOKEN" \
  -o /tmp/baseline-resp.json

# 2. 让玩家进来 5 分钟跑业务

# 3. 打 after，自动得到 diff
curl -X POST 'http://server:11922/api/gm/perf/memory/heap-snapshot' \
  -H "Authorization: Bearer $GM_TOKEN" \
  -o /tmp/after-resp.json

# 4. 读 after 的 summary.diffSincePrevious.topGrowingByBytes
python3 -c "
import json
d = json.load(open('/tmp/after-resp.json'))
diff = d['summary']['diffSincePrevious']
print(f'interval={diff[\"intervalMs\"]/1000:.0f}s totalDelta={diff[\"totalSelfSizeDeltaBytes\"]/1048576:.0f} MB')
for it in diff['topGrowingByBytes'][:10]:
    print(f'  {it[\"name\"]:40} {it[\"nodeType\"]:20} +{it[\"countDelta\"]:>10}  +{it[\"sizeDeltaBytes\"]/1048576:>8.2f} MB')
"
```

输出例：

```
interval=305s totalDelta=1450 MB
  Object                                   object               +840000  +90.20 MB
  (object elements)                        array                +900000  +780.50 MB
  (concatenated string)                    concatenated string  +200000  +35.20 MB
  Array                                    object               +900000  +28.50 MB
  ProjectedMonsterEntry                    object               +12500   +14.30 MB
  Map                                      object               +0       +0.00 MB
```

读出来：
- `(object elements) +780 MB` 是大头，指向 90 万个数组的 elements 区——通常是某些**没限长的数组**在累积
- `Object +840k` 进一步暗示业务字面量积累
- `ProjectedMonsterEntry +12500` 直接告诉你"projector cache 中怪物投影涨了 12500 个，约 14 MB"

下一步：
1. grep 业务源码 `new Array` / `.push(`，看哪些 push 没对应的 splice/clear
2. grep `ProjectedMonsterEntry`，定位具体 cache 写入点，确认 lifecycle 清理
3. 必要时下载完整 .heapsnapshot.gz（gzip 后 ~150 MB）到本机 Chrome DevTools 看 retainer

---

## 9. 关联文档

- [内存克隆问题修复计划](./内存克隆问题修复计划.md)：详细记录 P0~P3 cache 修复
- [内存问题OOM现场报告-2026-05-16](./内存问题OOM现场报告-2026-05-16.md)：上次 OOM 现场分析
- [分身宠物机器人系统设计](../design/systems/分身宠物机器人系统设计.md)：bot 压测基线设计（M5 阶段使用本工具采集 RSS / GC / heap diff 基线）
