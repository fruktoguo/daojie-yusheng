const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../..');
const {
  assertContentConfigDocument,
  validateContentConfigDocument,
} = require(path.join(rootDir, 'packages/shared/dist/index.js'));
const {
  isAtomicWriteTempFile,
  writeTextFileAtomically,
} = require('../lib/atomic-json-file.cjs');

const contentDir = path.join(rootDir, 'packages/server/data/content');
const localApiSource = fs.readFileSync(path.join(rootDir, 'packages/config-editor/local-api.cjs'), 'utf-8');
const criticalFiles = [
  'realm-levels.json',
  'breakthroughs.json',
  'realm-attr-baselines.json',
  'tongtian-tower.json',
];

for (const relativePath of criticalFiles) {
  const document = JSON.parse(fs.readFileSync(path.join(contentDir, relativePath), 'utf-8'));
  assert.deepEqual(validateContentConfigDocument(relativePath, document), [], `${relativePath} 应符合共享契约`);
  assert.doesNotThrow(() => assertContentConfigDocument(relativePath, document));
}

assert.match(
  localApiSource,
  /const parsed = JSON\.parse\(content\);\s+validateContentFileBeforeSave\(relativePath, parsed\);\s+writeTextFileAtomically/,
  '内容必须先通过完整校验，再进行原子替换',
);
assert.match(
  localApiSource,
  /if \(isAtomicWriteTempFile\(fullPath\)\) \{\s+return;/,
  '内容监听器必须忽略原子写入临时文件',
);

assert.throws(
  () => assertContentConfigDocument('realm-levels.json', { levels: {} }),
  /levels 必须是非空数组/,
);
assert.throws(
  () => assertContentConfigDocument('realm-levels.json', {
    levels: [
      { realmLv: 1, displayName: '一', name: '一', expToNext: 1 },
      { realmLv: 3, displayName: '三', name: '三', expToNext: 1 },
    ],
  }),
  /缺少 realmLv 2/,
);
assert.throws(
  () => assertContentConfigDocument('breakthroughs.json', { transitions: {} }),
  /transitions 必须是数组/,
);
assert.throws(
  () => assertContentConfigDocument('breakthroughs.json', {
    transitions: [{
      fromRealmLv: 1,
      toRealmLv: 2,
      requirements: [{ id: 'bad', type: 'technique', minRealm: 'Unknown' }],
    }],
  }),
  /minRealm 不是合法功法境界/,
);
assert.throws(
  () => assertContentConfigDocument('realm-attr-baselines.json', { levels: [{ realmLv: 1, singleAttr: 'bad' }] }),
  /singleAttr 必须是非负有限数值/,
);
assert.throws(
  () => assertContentConfigDocument('tongtian-tower.json', { width: 0 }),
  /width 必须是正整数/,
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-config-atomic-'));
try {
  const filePath = path.join(tempDir, 'config.json');
  fs.writeFileSync(filePath, '{"version":1}\n', 'utf-8');
  writeTextFileAtomically(filePath, '{"version":2}\n');
  assert.equal(fs.readFileSync(filePath, 'utf-8'), '{"version":2}\n');
  assert.equal(fs.readdirSync(tempDir).some((name) => isAtomicWriteTempFile(name)), false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('config-editor content-contract smoke ok');
