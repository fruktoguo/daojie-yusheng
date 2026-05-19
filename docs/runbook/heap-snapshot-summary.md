# Heap Snapshot 摘要诊断

解决正式服 RSS/old_space 异常增长时"哪类对象在涨"的定位问题，无需下载 GB 级 .heapsnapshot 文件。

## 工作原理

服务端原地流式解析 .heapsnapshot，按 `(node_type, constructor_name)` 统计 count 和 self_size，输出 ~50 KB 的 `.summary.json`。两次摘要之间自动计算 diff。

局限：不解析 retainer 链路（"谁在持有"需要 Chrome DevTools 加载完整文件）。

## 接口

### 触发生成

```bash
curl -X POST 'http://127.0.0.1:11922/api/gm/perf/memory/heap-snapshot' \
  -H "Authorization: Bearer $GM_TOKEN"

# 磁盘紧张时，解析完立刻删除原文件
curl -X POST 'http://127.0.0.1:11922/api/gm/perf/memory/heap-snapshot?deleteAfterSummary=1' \
  -H "Authorization: Bearer $GM_TOKEN"
```

### 读取最近摘要

```bash
curl 'http://127.0.0.1:11922/api/gm/perf/memory/heap-snapshot/summary' \
  -H "Authorization: Bearer $GM_TOKEN"
```

## 注意事项

- `writeHeapSnapshot` 会让 V8 暂停（GB 级 heap 5~30 秒），不要在战斗高峰触发
- 解析期内存峰值约 50~200 MB，OOM 边缘的进程要谨慎
- 并发触发会串行排队，每次都落新文件，LRU 自动清旧

## 诊断流程

1. 启动后立刻触发一次，得到 baseline
2. 跑预期泄漏场景 5~30 分钟
3. 再触发一次，自动得到 diff
4. 看 `summary.diffSincePrevious.topGrowingByBytes` 前 5 条

### 读 diff 输出

- 具体业务类名（如 `ProjectedMonsterEntry`）→ 对应 cache/Map 没清
- `Object` count 暴涨 → 业务字面量对象累积
- `(object elements)` 占比大 → 大数组在累积
- `(concatenated string)` 占比大 → 字符串拼接没释放

### 下一步

- 业务类名：grep `new ClassName` / `set(...)` 路径
- 通用类型：下载完整 .heapsnapshot 到 Chrome DevTools 看 retainer

## 实战示例

```bash
# 1. baseline
curl -X POST 'http://127.0.0.1:11922/api/gm/perf/memory/heap-snapshot' \
  -H "Authorization: Bearer $GM_TOKEN" -o /tmp/baseline.json

# 2. 等待 5 分钟

# 3. after（自动 diff）
curl -X POST 'http://127.0.0.1:11922/api/gm/perf/memory/heap-snapshot' \
  -H "Authorization: Bearer $GM_TOKEN" -o /tmp/after.json

# 4. 读 diff
python3 -c "
import json
d = json.load(open('/tmp/after.json'))
diff = d['summary']['diffSincePrevious']
print(f'interval={diff[\"intervalMs\"]/1000:.0f}s delta={diff[\"totalSelfSizeDeltaBytes\"]/1048576:.0f} MB')
for it in diff['topGrowingByBytes'][:10]:
    print(f'  {it[\"name\"]:40} +{it[\"countDelta\"]:>10}  +{it[\"sizeDeltaBytes\"]/1048576:>8.2f} MB')
"
```

## 文件管理

- 落盘位置：容器内 `/opt/server/.runtime/heap-snapshots/`
- LRU 保留：`SERVER_HEAP_SNAPSHOT_LRU_KEEP`（默认 3）
- Top 长度：`SERVER_HEAP_SNAPSHOT_TOP_LIMIT`（默认 60）

```bash
# 从容器拷出
docker cp $(docker ps --filter name=daojie-yusheng_server --format '{{.ID}}'):/opt/server/.runtime/heap-snapshots/. ./heap-snapshots/
```

## 解析速度参考

| heap_used | 文件大小 | 解析耗时 |
|---|---|---|
| 80 MB | 4 MB | ~150 ms |
| 800 MB | 60 MB | ~1.6 秒 |
| 2 GB | 240 MB | ~6 秒 |
| 3 GB | 3 GB | ~80 秒 |
