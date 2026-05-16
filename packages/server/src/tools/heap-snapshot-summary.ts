/**
 * V8 heap snapshot 流式解析工具。
 *
 * 用途：
 *   - V8 .heapsnapshot 文件在 GB 级时无法整体 JSON.parse；本模块按 chunk 流式扫描，
 *     仅抽取分析所需的少量字段（meta.node_fields / meta.node_types / nodes / strings），
 *     按 (type, name) 维度累加 count + self_size，输出 top N constructor 摘要。
 *   - 摘要 JSON ~ 50 KB，方便从 GM 控制台直接下载，不必把 GB 级 .heapsnapshot 搬下来。
 *
 * V8 heap snapshot JSON 结构（minified、顶层字段间带 `,\n` 换行）：
 *   {"snapshot":{"meta":{...},"node_count":N,"edge_count":M,"trace_function_count":K},
 *   "nodes":[t,n,id,sz,e,tr,d, ...],
 *   "edges":[...],
 *   "trace_function_infos":[...],
 *   "trace_tree":[...],
 *   "samples":[...],
 *   "locations":[...],
 *   "strings":["", "Array", "Object", ...]}
 *
 * 关键观察：
 *   - 顶层各字段之间都隔着 `,\n`，所以可以按文本/字节扫描定位每个根字段起点。
 *   - "nodes" 数组里只有整数和 `,`，没有任何嵌套；可以独立简化解析。
 *   - "strings" 数组里只有 JSON 字符串和 `,`，每个字符串可跨 chunk。
 *   - "edges" / "trace_*" / "samples" / "locations" 整段跳过。
 *
 * 解析流程（增量喂 chunk）：
 *   PRELUDE   先读 meta（同步，只需前 ~5 KB），落地 nodeFieldCount / nodeFieldNameIndex / nodeTypeNames
 *   NODES     按 token 流读入数字，每 nodeFieldCount 个一组累加到 statByKey
 *   COOLDOWN  跳过 edges 等大段直到遇到 `"strings":[`
 *   STRINGS   按 JSON 字符串读入到 stringPool（每条截断到 maxStringBytes）
 *   FINISH    用 stringPool[nameIdx] 还原构造函数名
 */

import { createReadStream, statSync, type ReadStream } from 'node:fs';

export interface HeapSnapshotConstructorStat {
  /** 显示名：业务类直接用 constructor 名；string/code 等内部类型按显示策略决定。 */
  name: string;
  /** V8 节点类型（hidden/array/string/object/code/closure/...）。 */
  nodeType: string;
  /** 该构造函数对应的节点数量。 */
  count: number;
  /** 该构造函数所有节点的 self_size 累加，单位 byte。 */
  selfSizeBytes: number;
  /** 原始 V8 name 字段值（截断到 maxStringBytes）；同一 nodeType 下不同 name 仍然是独立条目，保留 rawName 方便排查"哪 14 个不同的 (code) 节点是谁"。 */
  rawName?: string;
}

export interface HeapSnapshotSummary {
  generatedAtMs: number;
  parseDurationMs: number;
  snapshotFileBytes: number;
  declaredNodeCount: number;
  parsedNodeCount: number;
  parsedStringCount: number;
  totalSelfSizeBytes: number;
  topByBytes: HeapSnapshotConstructorStat[];
  topByCount: HeapSnapshotConstructorStat[];
}

export interface HeapSnapshotSummaryOptions {
  /** top N 大小。默认 60。 */
  topLimit?: number;
  /** stringPool 中单条字符串保留的最大字节数。默认 64。 */
  maxStringBytes?: number;
}

/**
 * 流式解析 V8 heap snapshot 文件，输出按 constructor 维度的统计摘要。
 */
export async function summarizeHeapSnapshot(
  filePath: string,
  options: HeapSnapshotSummaryOptions = {},
): Promise<HeapSnapshotSummary> {
  const topLimit = clampInt(options.topLimit, 60, 1, 500);
  const maxStringBytes = clampInt(options.maxStringBytes, 64, 8, 256);

  const startMs = Date.now();
  const stream = createReadStream(filePath, { highWaterMark: 1 << 20 });
  const parser = new Parser({ maxStringBytes });

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => {
      try {
        parser.feed(chunk as Buffer);
      } catch (err) {
        stream.destroy(err as Error);
        reject(err);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      try {
        parser.end();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });

  const fileBytes = await getFileSize(stream).catch(() => 0);
  const parseDurationMs = Date.now() - startMs;

  const stats = parser.buildStats();
  const totalSelfSizeBytes = stats.reduce((s, e) => s + e.selfSizeBytes, 0);

  const topByBytes = stats.slice().sort((a, b) => {
    if (b.selfSizeBytes !== a.selfSizeBytes) {
      return b.selfSizeBytes - a.selfSizeBytes;
    }
    return b.count - a.count;
  }).slice(0, topLimit);

  const topByCount = stats.slice().sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.selfSizeBytes - a.selfSizeBytes;
  }).slice(0, topLimit);

  return {
    generatedAtMs: Date.now(),
    parseDurationMs,
    snapshotFileBytes: fileBytes,
    declaredNodeCount: parser.declaredNodeCount,
    parsedNodeCount: parser.parsedNodeCount,
    parsedStringCount: parser.stringPool.length,
    totalSelfSizeBytes,
    topByBytes,
    topByCount,
  };
}

/** 计算两份 summary 之间的 constructor 维度差异。 */
export function diffHeapSnapshotSummaries(
  previous: HeapSnapshotSummary,
  current: HeapSnapshotSummary,
  topLimit = 30,
): {
  intervalMs: number;
  totalSelfSizeDeltaBytes: number;
  topGrowingByBytes: Array<{ name: string; nodeType: string; countDelta: number; sizeDeltaBytes: number }>;
} {
  const merge = (s: HeapSnapshotSummary) => {
    const map = new Map<string, HeapSnapshotConstructorStat>();
    for (const e of s.topByBytes) {
      map.set(`${e.nodeType}::${e.name}`, e);
    }
    for (const e of s.topByCount) {
      if (!map.has(`${e.nodeType}::${e.name}`)) {
        map.set(`${e.nodeType}::${e.name}`, e);
      }
    }
    return map;
  };
  const prev = merge(previous);
  const curr = merge(current);
  const allKeys = new Set<string>([...prev.keys(), ...curr.keys()]);
  const deltas: Array<{ name: string; nodeType: string; countDelta: number; sizeDeltaBytes: number }> = [];
  for (const key of allKeys) {
    const p = prev.get(key);
    const c = curr.get(key);
    deltas.push({
      name: c?.name ?? p?.name ?? '?',
      nodeType: c?.nodeType ?? p?.nodeType ?? '?',
      countDelta: (c?.count ?? 0) - (p?.count ?? 0),
      sizeDeltaBytes: (c?.selfSizeBytes ?? 0) - (p?.selfSizeBytes ?? 0),
    });
  }
  deltas.sort((a, b) => b.sizeDeltaBytes - a.sizeDeltaBytes);
  return {
    intervalMs: Math.max(0, current.generatedAtMs - previous.generatedAtMs),
    totalSelfSizeDeltaBytes: current.totalSelfSizeBytes - previous.totalSelfSizeBytes,
    topGrowingByBytes: deltas.slice(0, topLimit),
  };
}

async function getFileSize(stream: ReadStream): Promise<number> {
  const path = stream.path;
  if (typeof path !== 'string') {
    return 0;
  }
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const num = Math.trunc(Number(value));
  if (!Number.isFinite(num) || num <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(max, num));
}

/** 把字符串截到 32 字符，避免 topByBytes 的 name 字段过长污染输出。 */
function truncateForDisplay(text: string, max = 32): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

// ---------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------

/** 解析阶段。 */
type ParserPhase =
  | 'prelude'   // 累积前置 chunk，等待 nodes 数组开始
  | 'nodes'     // 流式读 nodes 数组的整数
  | 'cooldown'  // 跳过 edges/trace_*/samples/locations，等待 strings 数组开始
  | 'strings'   // 流式读 strings 数组里的 JSON 字符串
  | 'done';     // strings 数组结束，后面忽略

class Parser {
  /** 解析进度元数据。 */
  declaredNodeCount = 0;
  parsedNodeCount = 0;
  nodeFieldCount = 7;
  nodeFieldIndex = { type: 0, name: 1, selfSize: 3 };
  nodeTypeNames: string[] = [
    'hidden', 'array', 'string', 'object', 'code', 'closure',
    'regexp', 'number', 'native', 'synthetic',
    'concatenated string', 'sliced string', 'symbol', 'bigint',
    'object shape', 'wasm object',
  ];

  /** 字符串池（type=2/10/11 节点的 name 也来自这里；用 index 还原构造名）。 */
  readonly stringPool: string[] = [];
  private readonly maxStringBytes: number;

  /** 节点统计：key = `${typeIdx}|${nameIdx}`。 */
  private readonly statByKey = new Map<string, { typeIdx: number; nameIdx: number; count: number; sizeBytes: number }>();

  /** 字节缓冲（未消费部分）。使用 Buffer<any> 兼容 Node 不同版本下 Buffer 泛型差异。 */
  private buf: Buffer = Buffer.alloc(0);
  /** 当前阶段。 */
  private phase: ParserPhase = 'prelude';
  /** 当前 nodes tuple 已读字段数（只在 phase=nodes 时使用）。 */
  private nodeTupleSlot = 0;
  /** 当前 nodes tuple 各字段值。 */
  private readonly nodeTuple = new Array<number>(16).fill(0);
  /** prelude 阶段是否已经解析了 meta。 */
  private metaParsed = false;
  /** strings 阶段读到一半的字符串状态。 */
  private stringStarted = false;
  private stringTruncated = false;
  private stringBytes: number[] = [];

  constructor(opts: { maxStringBytes: number }) {
    this.maxStringBytes = opts.maxStringBytes;
  }

  feed(chunk: Buffer): void {
    if (this.phase === 'done') {
      return;
    }
    // Node 不同版本下 ReadStream 给出的 Buffer 泛型可能是 ArrayBufferLike，
    // 这里通过 Buffer.from 复制一次确保类型兼容；性能影响可忽略（chunk 通常 <= 1 MB）。
    const incoming = Buffer.from(chunk.buffer as ArrayBufferLike, chunk.byteOffset, chunk.byteLength);
    this.buf = this.buf.length === 0 ? incoming : Buffer.concat([this.buf, incoming]);
    this.advance(false);
  }

  end(): void {
    this.advance(true);
    this.phase = 'done';
  }

  buildStats(): HeapSnapshotConstructorStat[] {
    const stats: HeapSnapshotConstructorStat[] = [];
    for (const entry of this.statByKey.values()) {
      const nodeType = this.nodeTypeNames[entry.typeIdx] ?? `type_${entry.typeIdx}`;
      const rawName = this.stringPool[entry.nameIdx] ?? '';
      // 显示策略：
      //   - object / closure / *Array / Map / Set 等：rawName 即 constructor 名（如 'Object'/'Array'/'_TstNode'），直接用
      //   - string 类节点的 rawName 是字符串内容字面量（V8 截断版），合并到 '(string)' 等占位避免暴露字面量内容；
      //     单条字符串过大时（rawName 截断后非空）保留 rawName 前缀，方便排查"那条几百 KB 的字符串到底是什么"
      //   - code / hidden / synthetic：rawName 通常是函数名 / 内部 tag，保留原值，更便于诊断；为空时给占位
      const isAnonymousType = nodeType === 'string'
        || nodeType === 'concatenated string'
        || nodeType === 'sliced string';
      const fallbackPlaceholder = `(${nodeType})`;
      let name: string;
      if (isAnonymousType) {
        // V8 在某些 meta 节点会把 name 字段直接设为 nodeType 字符串自身（"concatenated string"）
        // 或者带括号的占位（"(concatenated string)"）；此时不要拼出冗余字符串，直接用占位符。
        const isMetaName = !rawName || rawName === nodeType || rawName === fallbackPlaceholder;
        name = isMetaName ? fallbackPlaceholder : `${fallbackPlaceholder}: ${truncateForDisplay(rawName)}`;
      } else if (nodeType === 'code' || nodeType === 'hidden' || nodeType === 'synthetic') {
        name = rawName ? rawName : fallbackPlaceholder;
      } else {
        name = rawName || fallbackPlaceholder;
      }
      stats.push({
        name,
        nodeType,
        count: entry.count,
        selfSizeBytes: entry.sizeBytes,
        rawName: rawName || undefined,
      });
    }
    return stats;
  }

  // -------- 主推进 --------

  private advance(atEnd: boolean): void {
    while (true) {
      switch (this.phase) {
        case 'prelude': {
          if (!this.runPrelude(atEnd)) {
            return;
          }
          break;
        }
        case 'nodes': {
          if (!this.runNodes(atEnd)) {
            return;
          }
          break;
        }
        case 'cooldown': {
          if (!this.runCooldown(atEnd)) {
            return;
          }
          break;
        }
        case 'strings': {
          if (!this.runStrings(atEnd)) {
            return;
          }
          break;
        }
        case 'done':
        default:
          return;
      }
    }
  }

  // -------- PRELUDE: 解析 meta + 找 nodes 数组开头 --------

  /** 返回 true 表示阶段切换到 nodes，false 表示需要更多 chunk。 */
  private runPrelude(atEnd: boolean): boolean {
    if (!this.metaParsed) {
      const headerEnd = this.findNodesArrayStart();
      if (headerEnd < 0) {
        // 数据还没到，等下批
        if (atEnd) {
          throw new Error('heap snapshot 文件不完整：未找到 "nodes":[');
        }
        return false;
      }
      // 把 [0, headerEnd) 段视为前置 JSON（含 snapshot 对象 + 中间 ,\n + "nodes":[），
      // 可以在这一段里用普通 JSON.parse 提取 meta
      const preludeText = this.buf.toString('utf8', 0, headerEnd);
      this.parseMetaFromPrelude(preludeText);
      this.metaParsed = true;
      // bufferOffset 推进到 nodes 数组的第一个数字位置
      this.buf = this.buf.subarray(headerEnd);
    }
    this.phase = 'nodes';
    return true;
  }

  /** 在 buf 内寻找 `"nodes":[` 的下一个字节位置；若没找到返回 -1。 */
  private findNodesArrayStart(): number {
    const needle = Buffer.from('"nodes":[');
    const idx = this.buf.indexOf(needle);
    if (idx < 0) {
      return -1;
    }
    return idx + needle.length;
  }

  /**
   * 从 [0, headerEnd) 之间的文本（包含完整 snapshot 对象）抽取 meta。
   * 这段里带有 `{"snapshot":{...},\n"nodes":[`，去掉末尾 `,\n"nodes":[` 就是合法的 JSON 子串
   * `{"snapshot":{...}}`，但 V8 实际写出的中间空格不固定；为鲁棒起见我们用正则 + JSON.parse 局部抽取。
   */
  private parseMetaFromPrelude(text: string): void {
    // 找 "node_count":N
    const nodeCountMatch = /"node_count"\s*:\s*(\d+)/.exec(text);
    if (nodeCountMatch) {
      this.declaredNodeCount = Math.max(0, Math.trunc(Number(nodeCountMatch[1]) || 0));
    }
    // 找 "node_fields":[ ... ]
    const fieldsMatch = /"node_fields"\s*:\s*(\[[^\]]*\])/.exec(text);
    if (fieldsMatch) {
      try {
        const arr = JSON.parse(fieldsMatch[1]);
        if (Array.isArray(arr) && arr.length > 0 && arr.every((x) => typeof x === 'string')) {
          this.nodeFieldCount = arr.length;
          this.nodeFieldIndex = {
            type: arr.indexOf('type'),
            name: arr.indexOf('name'),
            selfSize: arr.indexOf('self_size'),
          };
          if (this.nodeFieldIndex.type < 0) { this.nodeFieldIndex.type = 0; }
          if (this.nodeFieldIndex.name < 0) { this.nodeFieldIndex.name = 1; }
          if (this.nodeFieldIndex.selfSize < 0) { this.nodeFieldIndex.selfSize = 3; }
        }
      } catch {
        // 保留默认
      }
    }
    // 找 "node_types":[ [ ... ], ...]
    const typesMatch = /"node_types"\s*:\s*\[\s*(\[[^\]]*\])/.exec(text);
    if (typesMatch) {
      try {
        const arr = JSON.parse(typesMatch[1]);
        if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
          this.nodeTypeNames = arr.slice();
        }
      } catch {
        // 保留默认
      }
    }
  }

  // -------- NODES --------

  private runNodes(atEnd: boolean): boolean {
    let i = 0;
    const len = this.buf.length;
    while (i < len) {
      // 跳过空白 / 分隔符 / `,`
      const b = this.buf[i];
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x2c) {
        i += 1;
        continue;
      }
      if (b === 0x5d /* `]` */) {
        // nodes 数组结束
        i += 1;
        this.flushPartialTuple();
        this.buf = this.buf.subarray(i);
        this.phase = 'cooldown';
        return true;
      }
      // 期待数字（V8 self_size / id 都是非负整数；我们也容忍 - 号容错）
      const numEnd = this.scanNumberEnd(i);
      if (numEnd < 0) {
        // 数字未结束（buffer 末尾），等下批 chunk
        this.buf = this.buf.subarray(i);
        if (atEnd) {
          throw new Error('heap snapshot nodes 数组未正常关闭');
        }
        return false;
      }
      const raw = this.buf.toString('utf8', i, numEnd);
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new Error(`nodes 数组解析到非数字 token "${raw}"`);
      }
      this.nodeTuple[this.nodeTupleSlot] = num;
      this.nodeTupleSlot += 1;
      if (this.nodeTupleSlot >= this.nodeFieldCount) {
        this.commitNodeTuple();
        this.nodeTupleSlot = 0;
      }
      i = numEnd;
    }
    // 全部 chunk 已消费完；若没遇到 `]`，等下批
    this.buf = this.buf.subarray(i);
    if (atEnd) {
      throw new Error('heap snapshot 在 nodes 数组中提前结束');
    }
    return false;
  }

  /** 从 i 开始扫描一个 JSON 数字 token，返回数字结束的下一个位置；若 buffer 末尾无终止符返回 -1。 */
  private scanNumberEnd(start: number): number {
    let i = start;
    if (i < this.buf.length && this.buf[i] === 0x2d /* `-` */) {
      i += 1;
    }
    let any = false;
    while (i < this.buf.length) {
      const b = this.buf[i];
      const isDigit = b >= 0x30 && b <= 0x39;
      const isPart = isDigit || b === 0x2e || b === 0x65 || b === 0x45 || b === 0x2b || b === 0x2d;
      if (!isPart) {
        return any ? i : -1;
      }
      any = true;
      i += 1;
    }
    // 走到 buffer 末尾，token 可能未结束
    return -1;
  }

  private commitNodeTuple(): void {
    const typeIdx = Math.trunc(this.nodeTuple[this.nodeFieldIndex.type] ?? 0);
    const nameIdx = Math.trunc(this.nodeTuple[this.nodeFieldIndex.name] ?? 0);
    const selfSize = Math.max(0, Math.trunc(this.nodeTuple[this.nodeFieldIndex.selfSize] ?? 0));
    const key = `${typeIdx}|${nameIdx}`;
    const stat = this.statByKey.get(key);
    if (stat) {
      stat.count += 1;
      stat.sizeBytes += selfSize;
    } else {
      this.statByKey.set(key, { typeIdx, nameIdx, count: 1, sizeBytes: selfSize });
    }
    this.parsedNodeCount += 1;
  }

  private flushPartialTuple(): void {
    // 不完整的 tuple 直接丢弃；V8 输出正常情况不会出现（nodes 数量 = nodeFieldCount 的整数倍）
    this.nodeTupleSlot = 0;
  }

  // -------- COOLDOWN: 跳过 edges/trace_*/samples/locations，等待 strings 数组 --------

  private runCooldown(atEnd: boolean): boolean {
    const needle = Buffer.from('"strings":[');
    const idx = this.buf.indexOf(needle);
    if (idx < 0) {
      // 需要更多 chunk；保留 buffer 末尾 needle.length 字节防止跨 chunk 漏匹配
      const keepFromEnd = needle.length - 1;
      if (this.buf.length > keepFromEnd) {
        this.buf = this.buf.subarray(this.buf.length - keepFromEnd);
      }
      if (atEnd) {
        // 走到文件末尾仍没找到 "strings"
        this.phase = 'done';
        return true;
      }
      return false;
    }
    this.buf = this.buf.subarray(idx + needle.length);
    this.phase = 'strings';
    return true;
  }

  // -------- STRINGS --------

  private runStrings(atEnd: boolean): boolean {
    let i = 0;
    const len = this.buf.length;
    while (i < len) {
      const b = this.buf[i];

      if (this.stringStarted) {
        // 处于一个 JSON 字符串中，找下一个未转义的 `"` 关闭
        if (b === 0x5c /* `\` */) {
          if (i + 1 >= len) {
            // 转义不完整，等下批
            this.buf = this.buf.subarray(i);
            return atEnd ? this.failStringTruncated() : false;
          }
          const next = this.buf[i + 1];
          i += 2;
          if (this.stringTruncated) {
            if (next === 0x75 /* `u` */) {
              if (i + 4 > len) {
                this.buf = this.buf.subarray(i - 2);
                return atEnd ? this.failStringTruncated() : false;
              }
              i += 4;
            }
            continue;
          }
          switch (next) {
            case 0x22: this.appendStringByte(0x22); break;
            case 0x5c: this.appendStringByte(0x5c); break;
            case 0x2f: this.appendStringByte(0x2f); break;
            case 0x62: this.appendStringByte(0x08); break;
            case 0x66: this.appendStringByte(0x0c); break;
            case 0x6e: this.appendStringByte(0x0a); break;
            case 0x72: this.appendStringByte(0x0d); break;
            case 0x74: this.appendStringByte(0x09); break;
            case 0x75: {
              if (i + 4 > len) {
                this.buf = this.buf.subarray(i - 2);
                return atEnd ? this.failStringTruncated() : false;
              }
              const hex = this.buf.toString('utf8', i, i + 4);
              const codeUnit = parseInt(hex, 16);
              if (Number.isFinite(codeUnit)) {
                const utf8 = Buffer.from(String.fromCharCode(codeUnit), 'utf8');
                for (const byte of utf8) {
                  this.appendStringByte(byte);
                }
              }
              i += 4;
              break;
            }
            default: this.appendStringByte(next); break;
          }
          continue;
        }
        if (b === 0x22 /* `"` */) {
          // 字符串结束
          this.stringPool.push(Buffer.from(this.stringBytes).toString('utf8'));
          this.stringBytes = [];
          this.stringStarted = false;
          this.stringTruncated = false;
          i += 1;
          continue;
        }
        if (!this.stringTruncated) {
          this.appendStringByte(b);
        }
        i += 1;
        continue;
      }

      // 不在字符串中：跳过空白、`,`，遇到 `"` 进入字符串，遇到 `]` 结束 strings 数组
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x2c) {
        i += 1;
        continue;
      }
      if (b === 0x5d /* `]` */) {
        i += 1;
        this.buf = this.buf.subarray(i);
        this.phase = 'done';
        return true;
      }
      if (b === 0x22 /* `"` */) {
        i += 1;
        this.stringStarted = true;
        this.stringTruncated = false;
        this.stringBytes = [];
        continue;
      }
      // 遇到不预期字节，直接抛
      throw new Error(`strings 数组解析期间遇到非预期字节 0x${b.toString(16)}`);
    }
    this.buf = this.buf.subarray(i);
    if (atEnd) {
      throw new Error('heap snapshot strings 数组未正常关闭');
    }
    return false;
  }

  private appendStringByte(byte: number): void {
    if (this.stringBytes.length >= this.maxStringBytes) {
      this.stringTruncated = true;
      return;
    }
    this.stringBytes.push(byte);
  }

  private failStringTruncated(): never {
    throw new Error('heap snapshot strings 数组在末尾被截断');
  }
}
