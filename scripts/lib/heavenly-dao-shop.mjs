import fs from 'node:fs';
import path from 'node:path';

function evaluateConstantExpression(sourcePath, exportName) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const match = source.match(new RegExp(`export const ${exportName} = ([\\s\\S]*?)(?: as const)?;`));
  if (!match) {
    throw new Error(`Unable to find exported constant ${exportName} in ${sourcePath}`);
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

export function loadHeavenlyDaoShopConstants(repoRoot) {
  const sourcePath = path.join(repoRoot, 'packages/shared/src/constants/gameplay/market.ts');
  const items = evaluateConstantExpression(sourcePath, 'HEAVENLY_DAO_SHOP_ITEMS');
  const currencyItemId = evaluateConstantExpression(sourcePath, 'HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID');
  if (!Array.isArray(items)) {
    throw new Error('HEAVENLY_DAO_SHOP_ITEMS must be an array');
  }
  if (typeof currencyItemId !== 'string' || !currencyItemId.trim()) {
    throw new Error('HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID must be a non-empty string');
  }
  return {
    currencyItemId,
    items: items
      .map((entry) => ({
        itemId: typeof entry?.itemId === 'string' ? entry.itemId.trim() : '',
        count: Number.isInteger(entry?.count) ? Number(entry.count) : 1,
        price: Number.isInteger(entry?.price) ? Number(entry.price) : 0,
      }))
      .filter((entry) => entry.itemId && entry.count > 0 && entry.price > 0),
  };
}
