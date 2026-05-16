#!/usr/bin/env node
/**
 * 离线分析 V8 heap snapshot 文件，按 V8 节点 type / constructor (type+name) 聚合，
 * 输出可读文本摘要，避免依赖 Chrome DevTools 或 VSCode 扩展（这两者在 400MB+ 文件上常崩）。
 *
 * 用法（建议显式提高 Node 堆上限以承载大 snapshot）：
 *   node --max-old-space-size=8192 scripts/analyze-heap-snapshot.mjs <file.heapsnapshot>
 *
 * 输出维度：
 *   - 文件元信息 / 节点总数 / self_size 总和
 *   - 按 V8 节点 type 聚合（hidden/array/string/object/code/closure/...）
 *   - 按 constructor (type + name) 聚合 Top 100（按 totalSelfSize 倒序）
 *   - 大字符串 Top 50（前 200 字符截断）
 *   - 大 array Top 50（带 edge_count）
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filePath = process.argv[2];
if (!filePath) {
    console.error('用法: node --max-old-space-size=8192 scripts/analyze-heap-snapshot.mjs <file.heapsnapshot>');
    process.exit(1);
}

const fullPath = resolve(filePath);
console.error(`[1/3] 读取 ${fullPath} ...`);
const t0 = Date.now();
const text = readFileSync(fullPath, 'utf8');
console.error(`      读取完成: ${(text.length / 1024 / 1024).toFixed(1)} MB，耗时 ${Date.now() - t0} ms`);

console.error('[2/3] JSON.parse ...');
const t1 = Date.now();
const data = JSON.parse(text);
console.error(`      JSON.parse 完成，耗时 ${Date.now() - t1} ms`);

console.error('[3/3] 聚合 ...');
const t2 = Date.now();

const meta = data?.snapshot?.meta;
const nodeFields = Array.isArray(meta?.node_fields) ? meta.node_fields : [];
const nodeTypes = Array.isArray(meta?.node_types?.[0]) ? meta.node_types[0] : [];
const fieldsPerNode = nodeFields.length || 7;
const typeIdx = nodeFields.indexOf('type');
const nameIdx = nodeFields.indexOf('name');
const selfSizeIdx = nodeFields.indexOf('self_size');
const edgeCountIdx = nodeFields.indexOf('edge_count');

const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
const strings = Array.isArray(data?.strings) ? data.strings : [];
const totalNodes = Math.floor(nodes.length / fieldsPerNode);

const byType = new Map();
const byCtor = new Map();
const stringTop = [];
const arrayTop = [];
const STRING_TOP_LIMIT = 50;
const ARRAY_TOP_LIMIT = 50;
const STRING_MIN_BYTES = 1024;
const ARRAY_MIN_BYTES = 1024;
let stringTopThreshold = 0;
let arrayTopThreshold = 0;
let totalSelfSize = 0;

for (let i = 0; i < nodes.length; i += fieldsPerNode) {
    const t = String(nodeTypes[Number(nodes[i + typeIdx])] ?? 'unknown');
    const nameStr = String(strings[Number(nodes[i + nameIdx])] ?? '');
    const selfSize = Number(nodes[i + selfSizeIdx]) || 0;
    const edgeCount = edgeCountIdx >= 0 ? Number(nodes[i + edgeCountIdx]) || 0 : 0;
    totalSelfSize += selfSize;
    let tBucket = byType.get(t);
    if (!tBucket) {
        tBucket = { count: 0, totalSelfSize: 0 };
        byType.set(t, tBucket);
    }
    tBucket.count += 1;
    tBucket.totalSelfSize += selfSize;
    const ctorKey = t + '#' + nameStr;
    let cBucket = byCtor.get(ctorKey);
    if (!cBucket) {
        cBucket = { type: t, name: nameStr, count: 0, totalSelfSize: 0 };
        byCtor.set(ctorKey, cBucket);
    }
    cBucket.count += 1;
    cBucket.totalSelfSize += selfSize;
    if ((t === 'string' || t === 'concatenated string' || t === 'sliced string') && selfSize >= STRING_MIN_BYTES && selfSize > stringTopThreshold) {
        pushTop(stringTop, { selfSize, value: nameStr }, STRING_TOP_LIMIT);
        if (stringTop.length >= STRING_TOP_LIMIT) {
            stringTopThreshold = stringTop[stringTop.length - 1].selfSize;
        }
    }
    if (t === 'array' && selfSize >= ARRAY_MIN_BYTES && selfSize > arrayTopThreshold) {
        pushTop(arrayTop, { selfSize, name: nameStr, edgeCount }, ARRAY_TOP_LIMIT);
        if (arrayTop.length >= ARRAY_TOP_LIMIT) {
            arrayTopThreshold = arrayTop[arrayTop.length - 1].selfSize;
        }
    }
}
console.error(`      聚合完成，耗时 ${Date.now() - t2} ms`);
console.error('');

console.log('=== Heap Snapshot 文本摘要 ===');
console.log(`文件: ${fullPath}`);
console.log(`节点总数: ${totalNodes}`);
console.log(`self_size 总和: ${formatBytes(totalSelfSize)}`);
console.log('');

console.log('--- 按 V8 节点 type 聚合 ---');
console.log('  ' + 'type'.padEnd(28) + '  ' + 'count'.padStart(10) + '  ' + 'totalSelfSize'.padStart(14) + '  percent');
const typeRows = [...byType.entries()]
    .map(([type, b]) => ({ type, count: b.count, totalSelfSize: b.totalSelfSize }))
    .sort((a, b) => b.totalSelfSize - a.totalSelfSize);
for (const r of typeRows) {
    const pct = totalSelfSize > 0 ? (r.totalSelfSize / totalSelfSize * 100).toFixed(2) + '%' : '-';
    console.log('  ' + r.type.padEnd(28) + '  ' + String(r.count).padStart(10) + '  ' + formatBytes(r.totalSelfSize).padStart(14) + '  ' + pct);
}
console.log('');

console.log('--- 按 constructor (type + name) 聚合 Top 100 (按 totalSelfSize 倒序) ---');
console.log('  #    totalSelfSize    count        avg  type            name');
const ctorRows = [...byCtor.values()]
    .sort((a, b) => b.totalSelfSize - a.totalSelfSize)
    .slice(0, 100);
ctorRows.forEach((r, i) => {
    const avg = r.count > 0 ? r.totalSelfSize / r.count : 0;
    console.log(
        (i + 1).toString().padStart(3) + '  ' +
        formatBytes(r.totalSelfSize).padStart(13) + '  ' +
        String(r.count).padStart(7) + '  ' +
        formatBytes(avg).padStart(9) + '  ' +
        r.type.padEnd(14) + '  ' +
        truncate(r.name, 80),
    );
});
console.log('');

console.log('--- 大字符串 Top 50 (按 self_size 倒序，内容截断 200 字符) ---');
if (stringTop.length === 0) {
    console.log('  (无)');
} else {
    stringTop.forEach((r, i) => {
        console.log((i + 1).toString().padStart(3) + '  ' + formatBytes(r.selfSize).padStart(11) + '  ' + JSON.stringify(truncate(r.value, 200)));
    });
}
console.log('');

console.log('--- 大 array Top 50 (按 self_size 倒序) ---');
if (arrayTop.length === 0) {
    console.log('  (无)');
} else {
    arrayTop.forEach((r, i) => {
        console.log(
            (i + 1).toString().padStart(3) + '  ' +
            formatBytes(r.selfSize).padStart(11) +
            '  edges=' + String(r.edgeCount).padStart(7) +
            '  name=' + JSON.stringify(truncate(r.name, 80)),
        );
    });
}
console.log('');
console.log('=== 报告结束 ===');

function pushTop(arr, item, limit) {
    arr.push(item);
    arr.sort((a, b) => b.selfSize - a.selfSize);
    if (arr.length > limit) arr.length = limit;
}

function truncate(s, max) {
    const text = typeof s === 'string' ? s : '';
    if (text.length <= max) return text;
    return text.slice(0, max) + '…(+' + (text.length - max) + ')';
}

function formatBytes(b) {
    const n = Number(b) || 0;
    if (n < 1024) return n.toFixed(0) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(2) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
