#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  addCraftElementVector,
  computeFivePhaseElementMatch,
  createEmptyCraftElementVector,
} = require('../packages/shared/dist');

const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function collectItems() {
  const itemById = new Map();
  const contentRoot = path.join(repoRoot, 'packages/server/data/content/items');
  for (const realmDir of fs.readdirSync(contentRoot)) {
    const realmPath = path.join(contentRoot, realmDir);
    if (!fs.statSync(realmPath).isDirectory()) continue;
    for (const fileName of fs.readdirSync(realmPath)) {
      if (!fileName.endsWith('.json')) continue;
      const entries = JSON.parse(fs.readFileSync(path.join(realmPath, fileName), 'utf8'));
      for (const item of Array.isArray(entries) ? entries : []) {
        if (typeof item?.itemId === 'string') {
          itemById.set(item.itemId, item);
        }
      }
    }
  }
  return itemById;
}

function buildElementsForIngredients(recipe, itemById) {
  const elements = createEmptyCraftElementVector();
  for (const ingredient of recipe.ingredients ?? []) {
    const item = itemById.get(ingredient.itemId);
    assert.ok(item, `missing ingredient item: ${ingredient.itemId}`);
    addCraftElementVector(elements, item.materialValues?.elements, ingredient.count ?? 1);
  }
  return elements;
}

function buildTargetElements(recipe, itemById) {
  const elements = createEmptyCraftElementVector();
  const mainIngredients = Array.isArray(recipe.mainIngredients) && recipe.mainIngredients.length > 0
    ? recipe.mainIngredients
    : (recipe.ingredients ?? []).filter((ingredient) => ingredient?.role === 'main');
  for (const ingredient of mainIngredients) {
    const item = itemById.get(ingredient.itemId);
    assert.ok(item, `missing main ingredient item: ${ingredient.itemId}`);
    addCraftElementVector(elements, item.materialValues?.elements, ingredient.count ?? 1);
  }
  addCraftElementVector(elements, recipe.requiredAuxElements, 1);
  return elements;
}

const itemById = collectItems();
let checked = 0;
const failures = [];

for (const kind of ['alchemy', 'forging']) {
  const recipes = readJson(`packages/server/data/content/${kind}/recipes.json`);
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const inputElements = buildElementsForIngredients(recipe, itemById);
    const targetElements = buildTargetElements(recipe, itemById);
    const match = computeFivePhaseElementMatch(inputElements, targetElements);
    checked += 1;
    try {
      assert.deepEqual(inputElements, targetElements);
      assert.equal(match.baseElementSuccessRate, 1);
    } catch {
      failures.push({
        kind,
        recipeId: recipe.recipeId,
        outputItemId: recipe.outputItemId,
        inputElements,
        targetElements,
        baseElementSuccessRate: match.baseElementSuccessRate,
      });
    }
  }
}

assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));

console.log(`[proof:craft-default-fivephase-recipes] ok checked=${checked}`);
