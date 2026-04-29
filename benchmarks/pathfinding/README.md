# 云来镇寻路基准

这个目录是旁路 benchmark，不接入现有 `packages/client`、`packages/server`、`packages/shared` 的运行链路，只在手动执行时编译和运行。

内容：

- `fixtures/maps/yunlai_town.json`：从 `packages/server/data/maps/yunlai_town.json` 复制出的地图夹具。
- `src/compare.ts`：TS 对照脚本，复用 `packages/shared/dist/index.js` 里的主线 A* 核心。
- `rust/`：独立 Rust A* 实现与 benchmark 二进制。
- `run.sh`：一键构建 shared 主包、编译 benchmark TS、编译 Rust release 并执行对比。

默认对比场景：

- `full_map_random`：全图随机点对
- `northwest_residential`：西北居民区
- `central_main_road`：镇中主路
- `east_gate_corridor`：东侧狭长出口
- `south_marsh`：南部沼泽/南门外
- `landmark_routes`：出生点、门户、关键建筑固定路线

执行：

```bash
./benchmarks/pathfinding/run.sh
```

自定义迭代次数和样本量：

```bash
./benchmarks/pathfinding/run.sh --iterations=20 --warmup=3 --samples=768 --seed=20260417
```

说明：

- TS 和 Rust 都在地图与任务生成之后再进入计时，避免把 JSON 解析和场景构造混进热路径。
- Rust 二进制会先做一次结果校验，再做预热和正式多轮 benchmark。
- 报表会输出每个区域的平均迭代耗时、p50/p95、QPS 和 Rust 相对 TS 的加速比。
