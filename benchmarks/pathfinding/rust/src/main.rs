use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use serde::{Deserialize, Serialize};

const FNV_OFFSET: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;
const SCORE_INF: u32 = u32::MAX;
const PARENT_NONE: i32 = -1;

/// 网格点：与 TS 基线保持同一坐标语义。
#[derive(Clone, Copy, Deserialize, Serialize)]
struct Point {
    x: i32,
    y: i32,
}

/// 单次寻路约束：沿用 shared-next 的预算和 partial path 语义。
#[derive(Clone, Deserialize)]
struct SearchLimits {
    #[serde(rename = "maxExpandedNodes")]
    max_expanded_nodes: usize,
    #[serde(rename = "maxPathLength")]
    max_path_length: usize,
    #[serde(rename = "maxGoalDistance")]
    max_goal_distance: Option<i32>,
    #[serde(rename = "allowPartialPath")]
    allow_partial_path: Option<bool>,
}

/// 一条基准任务：当前旁路实现只接受单目标，但保留与 TS 相同的输入结构。
#[derive(Clone, Deserialize)]
struct BenchmarkTask {
    id: String,
    start: Point,
    goals: Vec<Point>,
    limits: SearchLimits,
}

/// 原始网格输入：来自 TS 编排脚本序列化的静态地图。
#[derive(Deserialize)]
struct GridInput {
    width: usize,
    height: usize,
    walkable: Vec<u8>,
    #[serde(rename = "traversalCost")]
    traversal_cost: Vec<u16>,
}

/// 一个场景批次：接近服务器一帧内收到的一批寻路请求。
#[derive(Deserialize)]
struct ScenarioBatchInput {
    name: String,
    tasks: Vec<BenchmarkTask>,
}

/// 整个 benchmark 输入：地图只加载一次，多个场景批次复用同一份静态预处理结果。
#[derive(Deserialize)]
struct BenchmarkInput {
    grid: GridInput,
    scenarios: Vec<ScenarioBatchInput>,
    iterations: usize,
    #[serde(rename = "warmupIterations")]
    warmup_iterations: usize,
}

/// 为 TS/Rust 结果对齐做的摘要结构，避免在 benchmark 里传完整路径细节。
#[derive(Clone, Serialize, Deserialize)]
struct ScenarioResultDigest {
    id: String,
    status: &'static str,
    reason: Option<&'static str>,
    complete: bool,
    #[serde(rename = "pathLength")]
    path_length: usize,
    #[serde(rename = "reachedGoal")]
    reached_goal: Option<Point>,
    #[serde(rename = "expandedNodes")]
    expanded_nodes: usize,
    #[serde(rename = "pathHash")]
    path_hash: String,
}

/// 统一吞吐统计，格式与 TS 侧输出一致，便于直接比较。
#[derive(Serialize, Clone)]
struct BenchmarkStats {
    implementation: &'static str,
    #[serde(rename = "totalElapsedMs")]
    total_elapsed_ms: f64,
    #[serde(rename = "avgIterationMs")]
    avg_iteration_ms: f64,
    #[serde(rename = "avgTaskMs")]
    avg_task_ms: f64,
    #[serde(rename = "minIterationMs")]
    min_iteration_ms: f64,
    #[serde(rename = "maxIterationMs")]
    max_iteration_ms: f64,
    #[serde(rename = "p50IterationMs")]
    p50_iteration_ms: f64,
    #[serde(rename = "p95IterationMs")]
    p95_iteration_ms: f64,
    #[serde(rename = "tasksPerSecond")]
    tasks_per_second: f64,
    #[serde(rename = "iterationMs")]
    iteration_ms: Vec<f64>,
}

/// 单个场景批次的输出。
#[derive(Serialize)]
struct ScenarioBatchOutput {
    name: String,
    verification: Vec<ScenarioResultDigest>,
    stats: BenchmarkStats,
}

/// 整个 suite 的输出。
#[derive(Serialize)]
struct BenchmarkOutput {
    scenarios: Vec<ScenarioBatchOutput>,
}

/// 每个格子的预处理邻接关系：避免热循环里再做边界判断和索引换算。
#[derive(Clone, Copy)]
struct NeighborEntry {
    index: u32,
    step_cost: u16,
}

/// 地图静态预处理结果：
/// 1. 保留原始 walkable 供起终点校验。
/// 2. 预存每个 index 对应的 x/y，消掉运行时取模和整除。
/// 3. 预存每个格子的最多 4 个邻接边，把热循环改成纯数组遍历。
#[derive(Clone)]
struct PreparedGrid {
    width: usize,
    height: usize,
    walkable: Vec<u8>,
    x_by_index: Vec<i32>,
    y_by_index: Vec<i32>,
    neighbors: Vec<[NeighborEntry; 4]>,
    neighbor_count: Vec<u8>,
}

/// 堆节点：open set 只需要 index 和 f-score。
#[derive(Clone, Copy)]
struct HeapNode {
    index: usize,
    score: u32,
}

/// 手写最小堆，保持与 TS 基线更接近的排序行为。
struct MinHeap {
    items: Vec<HeapNode>,
}

impl MinHeap {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            items: Vec::with_capacity(capacity),
        }
    }

    #[inline(always)]
    fn clear(&mut self) {
        self.items.clear();
    }

    #[inline(always)]
    fn push(&mut self, node: HeapNode) {
        self.items.push(node);
        self.bubble_up(self.items.len() - 1);
    }

    #[inline(always)]
    fn pop(&mut self) -> Option<HeapNode> {
        if self.items.is_empty() {
            return None;
        }
        let head = self.items[0];
        let tail = self.items.pop().unwrap();
        if !self.items.is_empty() {
            self.items[0] = tail;
            self.bubble_down(0);
        }
        Some(head)
    }

    #[inline(always)]
    fn len(&self) -> usize {
        self.items.len()
    }

    #[inline(always)]
    fn bubble_up(&mut self, mut index: usize) {
        while index > 0 {
            let parent = (index - 1) >> 1;
            if self.items[parent].score <= self.items[index].score {
                break;
            }
            self.items.swap(parent, index);
            index = parent;
        }
    }

    #[inline(always)]
    fn bubble_down(&mut self, mut index: usize) {
        let last = self.items.len().saturating_sub(1);
        loop {
            let left = (index << 1) + 1;
            let right = left + 1;
            let mut smallest = index;
            if left <= last && self.items[left].score < self.items[smallest].score {
                smallest = left;
            }
            if right <= last && self.items[right].score < self.items[smallest].score {
                smallest = right;
            }
            if smallest == index {
                break;
            }
            self.items.swap(index, smallest);
            index = smallest;
        }
    }
}

/// 成功结果：与 shared-next 的返回语义保持一致。
#[derive(Clone)]
struct SearchSuccess {
    path: Vec<Point>,
    expanded_nodes: usize,
    reached_goal: Point,
    complete: bool,
}

/// 失败结果：保留失败原因便于和 TS 基线做语义对齐。
#[derive(Clone)]
struct SearchFailure {
    reason: &'static str,
    expanded_nodes: usize,
}

#[derive(Clone)]
enum SearchResult {
    Success(SearchSuccess),
    Failed(SearchFailure),
}

/// 搜索工作区：数组复用到每次搜索，避免反复分配。
struct SearchWorkspace {
    g_score: Vec<u32>,
    parent: Vec<i32>,
    step_depth: Vec<i32>,
    closed: Vec<u8>,
    heap: MinHeap,
}

impl SearchWorkspace {
    fn new(total: usize) -> Self {
        Self {
            g_score: vec![SCORE_INF; total],
            parent: vec![PARENT_NONE; total],
            step_depth: vec![-1; total],
            closed: vec![0; total],
            heap: MinHeap::with_capacity(total),
        }
    }

    /// 每次搜索前复位工作区。当前地图规模下，顺序 fill 比复杂标记方案更稳定。
    fn begin_search(&mut self) {
        self.g_score.fill(SCORE_INF);
        self.parent.fill(PARENT_NONE);
        self.step_depth.fill(-1);
        self.closed.fill(0);
        self.heap.clear();
    }

    #[inline(always)]
    fn is_closed(&self, index: usize) -> bool {
        self.closed[index] == 1
    }

    #[inline(always)]
    fn close(&mut self, index: usize) {
        self.closed[index] = 1;
    }
}

fn main() {
    let input_path = parse_input_path(env::args().collect());
    let raw = fs::read_to_string(&input_path).expect("failed to read benchmark input");
    let input: BenchmarkInput = serde_json::from_str(&raw).expect("invalid benchmark input");

    // 地图静态数据只预处理一次，后续所有批次都直接复用。
    let grid = prepare_grid(&input.grid);
    let blocked = vec![0u8; grid.width * grid.height];
    let mut workspace = SearchWorkspace::new(grid.width * grid.height);

    let scenarios = input
        .scenarios
        .iter()
        .map(|scenario| run_scenario(&grid, &blocked, scenario, input.iterations, input.warmup_iterations, &mut workspace))
        .collect();

    let output = BenchmarkOutput { scenarios };
    println!("{}", serde_json::to_string(&output).expect("failed to serialize output"));
}

fn parse_input_path(args: Vec<String>) -> PathBuf {
    let mut index = 1usize;
    while index < args.len() {
        if args[index] == "--input" {
            if index + 1 >= args.len() {
                panic!("--input requires a value");
            }
            return PathBuf::from(args[index + 1].clone());
        }
        index += 1;
    }
    panic!("missing --input");
}

/// 启动期地图预处理：把热循环里所有可提前做的工作都搬到这里。
fn prepare_grid(input: &GridInput) -> PreparedGrid {
    let total = input.width * input.height;
    let mut x_by_index = vec![0i32; total];
    let mut y_by_index = vec![0i32; total];
    let mut neighbors = vec![[NeighborEntry { index: 0, step_cost: 0 }; 4]; total];
    let mut neighbor_count = vec![0u8; total];

    for index in 0..total {
        x_by_index[index] = (index % input.width) as i32;
        y_by_index[index] = (index / input.width) as i32;
    }

    for index in 0..total {
        if input.walkable[index] != 1 {
            continue;
        }

        let x = x_by_index[index];
        let y = y_by_index[index];
        let mut count = 0usize;

        for (dx, dy) in [(0, -1), (0, 1), (1, 0), (-1, 0)] {
            let nx = x + dx;
            let ny = y + dy;
            if nx < 0 || nx >= input.width as i32 || ny < 0 || ny >= input.height as i32 {
                continue;
            }
            let next_index = to_index(nx, ny, input.width);
            if input.walkable[next_index] != 1 {
                continue;
            }
            neighbors[index][count] = NeighborEntry {
                index: next_index as u32,
                step_cost: input.traversal_cost[next_index],
            };
            count += 1;
        }

        neighbor_count[index] = count as u8;
    }

    PreparedGrid {
        width: input.width,
        height: input.height,
        walkable: input.walkable.clone(),
        x_by_index,
        y_by_index,
        neighbors,
        neighbor_count,
    }
}

/// 运行一个场景批次：先做正确性校验，再做预热和正式 benchmark。
fn run_scenario(
    grid: &PreparedGrid,
    blocked: &[u8],
    scenario: &ScenarioBatchInput,
    iterations: usize,
    warmup_iterations: usize,
    workspace: &mut SearchWorkspace,
) -> ScenarioBatchOutput {
    let verification = verify_tasks(grid, blocked, &scenario.tasks, workspace);

    for _ in 0..warmup_iterations {
        run_tasks(grid, blocked, &scenario.tasks, workspace);
    }

    let mut iteration_ms = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let started_at = Instant::now();
        run_tasks(grid, blocked, &scenario.tasks, workspace);
        iteration_ms.push(started_at.elapsed().as_secs_f64() * 1000.0);
    }

    ScenarioBatchOutput {
        name: scenario.name.clone(),
        verification,
        stats: build_stats("rust", &iteration_ms, scenario.tasks.len()),
    }
}

fn verify_tasks(
    grid: &PreparedGrid,
    blocked: &[u8],
    tasks: &[BenchmarkTask],
    workspace: &mut SearchWorkspace,
) -> Vec<ScenarioResultDigest> {
    tasks
        .iter()
        .map(|task| {
            let result = find_bounded_path_single_goal(
                grid,
                blocked,
                task.start.x,
                task.start.y,
                &task.goals,
                &task.limits,
                workspace,
            );
            build_digest(task.id.clone(), result)
        })
        .collect()
}

fn run_tasks(
    grid: &PreparedGrid,
    blocked: &[u8],
    tasks: &[BenchmarkTask],
    workspace: &mut SearchWorkspace,
) {
    for task in tasks {
        let _ = find_bounded_path_single_goal(
            grid,
            blocked,
            task.start.x,
            task.start.y,
            &task.goals,
            &task.limits,
            workspace,
        );
    }
}

fn build_digest(id: String, result: SearchResult) -> ScenarioResultDigest {
    match result {
        SearchResult::Failed(failure) => ScenarioResultDigest {
            id,
            status: "failed",
            reason: Some(failure.reason),
            complete: false,
            path_length: 0,
            reached_goal: None,
            expanded_nodes: failure.expanded_nodes,
            path_hash: hash_path(&[], None, Some(failure.reason)),
        },
        SearchResult::Success(success) => ScenarioResultDigest {
            id,
            status: "success",
            reason: None,
            complete: success.complete,
            path_length: success.path.len(),
            reached_goal: Some(success.reached_goal),
            expanded_nodes: success.expanded_nodes,
            path_hash: hash_path(
                &success.path,
                Some(success.reached_goal),
                if success.complete { None } else { Some("partial") },
            ),
        },
    }
}

/// 路径摘要哈希：控制输出体积，同时确保 TS/Rust 的路径结果完全一致。
fn hash_path(path: &[Point], reached_goal: Option<Point>, marker: Option<&str>) -> String {
    let mut hash = FNV_OFFSET;
    hash = fnv_update_string(hash, marker.unwrap_or("ok"));
    if let Some(goal) = reached_goal {
        hash = fnv_update_i32(hash, goal.x);
        hash = fnv_update_i32(hash, goal.y);
    } else {
        hash = fnv_update_i32(hash, -1);
        hash = fnv_update_i32(hash, -1);
    }
    for point in path {
        hash = fnv_update_i32(hash, point.x);
        hash = fnv_update_i32(hash, point.y);
    }
    format!("{hash:016x}")
}

fn fnv_update_string(mut current: u64, value: &str) -> u64 {
    for byte in value.as_bytes() {
        current ^= *byte as u64;
        current = current.wrapping_mul(FNV_PRIME);
    }
    current
}

fn fnv_update_i32(mut current: u64, value: i32) -> u64 {
    let normalized = value as u32;
    for shift in [0, 8, 16, 24] {
        current ^= ((normalized >> shift) & 0xff) as u64;
        current = current.wrapping_mul(FNV_PRIME);
    }
    current
}

fn build_stats(implementation: &'static str, iteration_ms: &[f64], task_count: usize) -> BenchmarkStats {
    let total_elapsed_ms: f64 = iteration_ms.iter().sum();
    let avg_iteration_ms = if iteration_ms.is_empty() {
        0.0
    } else {
        total_elapsed_ms / iteration_ms.len() as f64
    };
    let avg_task_ms = if iteration_ms.is_empty() || task_count == 0 {
        0.0
    } else {
        total_elapsed_ms / (iteration_ms.len() * task_count) as f64
    };
    let mut sorted = iteration_ms.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap());

    BenchmarkStats {
        implementation,
        total_elapsed_ms,
        avg_iteration_ms,
        avg_task_ms,
        min_iteration_ms: sorted.first().copied().unwrap_or(0.0),
        max_iteration_ms: sorted.last().copied().unwrap_or(0.0),
        p50_iteration_ms: percentile(&sorted, 0.5),
        p95_iteration_ms: percentile(&sorted, 0.95),
        tasks_per_second: if total_elapsed_ms > 0.0 {
            (task_count * iteration_ms.len()) as f64 * 1000.0 / total_elapsed_ms
        } else {
            0.0
        },
        iteration_ms: iteration_ms.to_vec(),
    }
}

fn percentile(sorted_values: &[f64], ratio: f64) -> f64 {
    if sorted_values.is_empty() {
        return 0.0;
    }
    let index = ((sorted_values.len() as f64 * ratio).floor() as usize).min(sorted_values.len() - 1);
    sorted_values[index]
}

/// 单目标 A*：
/// 1. 与 TS 基线保持相同的 budget / partial path 语义。
/// 2. 热循环只做数组读取、比较和堆操作。
/// 3. 这是当前“校验通过”的最快版本；更激进的堆/初始化版本会改变路径 tie-breaking。
fn find_bounded_path_single_goal(
    grid: &PreparedGrid,
    blocked: &[u8],
    start_x: i32,
    start_y: i32,
    goals: &[Point],
    limits: &SearchLimits,
    workspace: &mut SearchWorkspace,
) -> SearchResult {
    if start_x < 0 || start_x >= grid.width as i32 || start_y < 0 || start_y >= grid.height as i32 {
        return failed("invalid_goal", 0);
    }

    let goal = match validate_single_goal(grid, blocked, goals) {
        Some(point) => point,
        None => return failed("invalid_goal", 0),
    };

    let start_index = to_index(start_x, start_y, grid.width);
    let goal_index = to_index(goal.x, goal.y, grid.width);
    if start_index == goal_index {
        return SearchResult::Success(SearchSuccess {
            path: Vec::new(),
            expanded_nodes: 0,
            reached_goal: goal,
            complete: true,
        });
    }

    if let Some(max_goal_distance) = limits.max_goal_distance {
        if manhattan_distance(start_x, start_y, goal.x, goal.y) > max_goal_distance {
            return failed("target_too_far", 0);
        }
    }

    workspace.begin_search();
    workspace.g_score[start_index] = 0;
    workspace.step_depth[start_index] = 0;
    workspace.heap.push(HeapNode {
        index: start_index,
        score: heuristic(start_x, start_y, goal.x, goal.y),
    });

    let allow_partial_path = limits.allow_partial_path.unwrap_or(false);
    let mut expanded_nodes = 0usize;
    let mut best_partial_index: usize = usize::MAX;
    let mut best_partial_goal = Point { x: 0, y: 0 };
    let mut best_partial_heuristic = SCORE_INF;
    let mut best_partial_cost = SCORE_INF;

    while workspace.heap.len() > 0 {
        let current = workspace.heap.pop().unwrap();
        if workspace.is_closed(current.index) {
            continue;
        }
        workspace.close(current.index);
        expanded_nodes += 1;

        if current.index == goal_index {
            let path = reconstruct_path(
                &workspace.parent,
                &grid.x_by_index,
                &grid.y_by_index,
                goal_index,
                start_index,
                workspace.step_depth[goal_index],
            );
            if path.len() > limits.max_path_length {
                if allow_partial_path {
                    return SearchResult::Success(SearchSuccess {
                        path: truncate_path(path, limits.max_path_length),
                        expanded_nodes,
                        reached_goal: goal,
                        complete: false,
                    });
                }
                return failed("path_too_long", expanded_nodes);
            }
            return SearchResult::Success(SearchSuccess {
                path,
                expanded_nodes,
                reached_goal: goal,
                complete: true,
            });
        }

        let current_x = grid.x_by_index[current.index];
        let current_y = grid.y_by_index[current.index];
        let current_heuristic = heuristic(current_x, current_y, goal.x, goal.y);
        if allow_partial_path
            && workspace.step_depth[current.index] > 0
            && (current_heuristic < best_partial_heuristic
                || (current_heuristic == best_partial_heuristic
                    && workspace.g_score[current.index] < best_partial_cost))
        {
            best_partial_index = current.index;
            best_partial_goal = Point {
                x: current_x,
                y: current_y,
            };
            best_partial_heuristic = current_heuristic;
            best_partial_cost = workspace.g_score[current.index];
        }

        if expanded_nodes > limits.max_expanded_nodes {
            if allow_partial_path && best_partial_index != usize::MAX {
                return build_partial_success(
                    workspace,
                    grid,
                    best_partial_index,
                    start_index,
                    best_partial_goal,
                    expanded_nodes,
                    limits.max_path_length,
                );
            }
            return failed("step_limit", expanded_nodes);
        }

        let current_score = workspace.g_score[current.index];
        let current_depth = workspace.step_depth[current.index];
        let neighbor_count = grid.neighbor_count[current.index] as usize;
        let neighbors = &grid.neighbors[current.index];

        for slot in 0..neighbor_count {
            relax_neighbor(
                workspace,
                grid,
                blocked,
                current.index,
                current_score,
                current_depth,
                neighbors[slot],
                goal.x,
                goal.y,
            );
        }
    }

    if allow_partial_path && best_partial_index != usize::MAX {
        return build_partial_success(
            workspace,
            grid,
            best_partial_index,
            start_index,
            best_partial_goal,
            expanded_nodes,
            limits.max_path_length,
        );
    }

    failed("no_path", expanded_nodes)
}

/// 邻接边松弛：邻接关系和步进代价已经在地图预处理中准备好。
#[inline(always)]
fn relax_neighbor(
    workspace: &mut SearchWorkspace,
    grid: &PreparedGrid,
    blocked: &[u8],
    current_index: usize,
    current_score: u32,
    current_depth: i32,
    neighbor: NeighborEntry,
    goal_x: i32,
    goal_y: i32,
) {
    let next_index = neighbor.index as usize;
    if workspace.is_closed(next_index) || blocked[next_index] == 1 {
        return;
    }

    let step_cost = neighbor.step_cost as u32;
    if step_cost == 0 {
        return;
    }

    let next_score = current_score.saturating_add(step_cost);
    if next_score >= workspace.g_score[next_index] {
        return;
    }

    workspace.g_score[next_index] = next_score;
    workspace.parent[next_index] = current_index as i32;
    workspace.step_depth[next_index] = current_depth + 1;
    workspace.heap.push(HeapNode {
        index: next_index,
        score: next_score.saturating_add(heuristic(
            grid.x_by_index[next_index],
            grid.y_by_index[next_index],
            goal_x,
            goal_y,
        )),
    });
}

fn build_partial_success(
    workspace: &SearchWorkspace,
    grid: &PreparedGrid,
    goal_index: usize,
    start_index: usize,
    goal: Point,
    expanded_nodes: usize,
    max_path_length: usize,
) -> SearchResult {
    let full_path = reconstruct_path(
        &workspace.parent,
        &grid.x_by_index,
        &grid.y_by_index,
        goal_index,
        start_index,
        workspace.step_depth[goal_index],
    );
    SearchResult::Success(SearchSuccess {
        path: truncate_path(full_path, max_path_length),
        expanded_nodes,
        reached_goal: goal,
        complete: false,
    })
}

#[inline(always)]
fn truncate_path(mut path: Vec<Point>, max_path_length: usize) -> Vec<Point> {
    if path.len() > max_path_length {
        path.truncate(max_path_length);
    }
    path
}

/// 路径回溯：直接读取预存坐标数组，避免重复做 `%` 和 `/`。
fn reconstruct_path(
    parent: &[i32],
    x_by_index: &[i32],
    y_by_index: &[i32],
    goal_index: usize,
    start_index: usize,
    path_len_hint: i32,
) -> Vec<Point> {
    let capacity = path_len_hint.max(0) as usize;
    let mut path = Vec::with_capacity(capacity);
    let mut current = goal_index as i32;
    while current != start_index as i32 && current != PARENT_NONE {
        let current_index = current as usize;
        path.push(Point {
            x: x_by_index[current_index],
            y: y_by_index[current_index],
        });
        current = parent[current_index];
    }
    path.reverse();
    path
}

fn failed(reason: &'static str, expanded_nodes: usize) -> SearchResult {
    SearchResult::Failed(SearchFailure {
        reason,
        expanded_nodes,
    })
}

/// 单目标校验：这里显式保持 benchmark 版“单目标特化”的约束。
#[inline(always)]
fn validate_single_goal(grid: &PreparedGrid, blocked: &[u8], goals: &[Point]) -> Option<Point> {
    if goals.len() != 1 {
        return None;
    }
    let goal = goals[0];
    if goal.x < 0 || goal.x >= grid.width as i32 || goal.y < 0 || goal.y >= grid.height as i32 {
        return None;
    }
    let goal_index = to_index(goal.x, goal.y, grid.width);
    if grid.walkable[goal_index] != 1 || blocked[goal_index] == 1 {
        return None;
    }
    Some(goal)
}

#[inline(always)]
fn heuristic(x: i32, y: i32, goal_x: i32, goal_y: i32) -> u32 {
    manhattan_distance(x, y, goal_x, goal_y) as u32
}

#[inline(always)]
fn manhattan_distance(x1: i32, y1: i32, x2: i32, y2: i32) -> i32 {
    (x1 - x2).abs() + (y1 - y2).abs()
}

#[inline(always)]
fn to_index(x: i32, y: i32, width: usize) -> usize {
    y as usize * width + x as usize
}
