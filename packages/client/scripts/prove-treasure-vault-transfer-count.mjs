/** 宝库指定数量存取的边界与 UI 接线证明。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

function loadTransferCountModule() {
  const sourcePath = path.join(clientRoot, 'src/ui/treasure-vault-transfer-count.ts');
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('exports', 'module', output);
  execute(module.exports, module);
  return module.exports;
}

const { normalizeTreasureVaultTransferCount } = loadTransferCountModule();

assert.equal(normalizeTreasureVaultTransferCount('100', 500), 100, '合法指定数量必须原样保留');
assert.equal(normalizeTreasureVaultTransferCount(7.9, 500), 7, '存取数量必须取整数');
assert.equal(normalizeTreasureVaultTransferCount(0, 500), 1, '指定数量下界必须为 1');
assert.equal(normalizeTreasureVaultTransferCount(-8, 500), 1, '负数不得进入存取意图');
assert.equal(normalizeTreasureVaultTransferCount(501, 500), 500, '指定数量不得超过当前堆叠');
assert.equal(normalizeTreasureVaultTransferCount('', 500), 1, '提交空输入时必须收敛到安全下界');
assert.equal(normalizeTreasureVaultTransferCount('not-a-number', 500), 1, '非法输入不得产生 NaN 载荷');
assert.equal(normalizeTreasureVaultTransferCount(10, 0), 1, '异常可用数量不得放大资产意图');

const socialPanel = read('src/ui/panels/social-panel.ts');
const modalCss = read('src/styles/ui-modal.css');

assert.match(socialPanel, /selectedDepositCounts = new Map<string, number>\(\)/, '批量存入必须逐堆叠保存数量草稿');
assert.match(socialPanel, /data-vault-deposit-count/, '存入选择器必须提供数量输入');
assert.match(socialPanel, /count: normalizeTreasureVaultTransferCount\([\s\S]*?selectedDepositCounts\.get\(entry\.itemInstanceId\)/, '存入载荷必须使用玩家指定数量');
assert.match(socialPanel, /data-vault-detail-withdraw-count/, '宝库物品详情必须提供取出数量输入');
assert.match(socialPanel, /data-vault-detail-withdraw="custom"/, '宝库物品详情必须提供指定数量取出命令');
assert.match(socialPanel, /this\.callbacks\?\.onWithdraw\(item\.storageItemId, count\)/, '取出命令必须透传归一化后的数量');
assert.doesNotMatch(socialPanel, />取出一个</, '旧的一次点击取一个入口不得继续成为唯一部分取出方式');
assert.match(modalCss, /\.treasure-vault-deposit-item\s*\{[\s\S]*?grid-template-rows: minmax\(74px, 1fr\) 32px;/, '数量控件必须预留稳定高度，选择时不得推动网格布局');
assert.match(modalCss, /@media \(max-width: 760px\)[\s\S]*?\.treasure-vault-withdraw-quantity\s*\{\s*grid-template-columns: 1fr;/, '指定数量取出必须有手机布局');

console.log(JSON.stringify({ ok: true, case: 'treasure-vault-transfer-count' }, null, 2));
