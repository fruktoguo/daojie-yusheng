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
  for (const ingredient of recipe.mainIngredients ?? []) {
    const item = itemById.get(ingredient.itemId);
    assert.ok(item, `missing main ingredient item: ${ingredient.itemId}`);
    addCraftElementVector(elements, item.materialValues?.elements, ingredient.count ?? 1);
  }
  addCraftElementVector(elements, recipe.requiredAuxElements, 1);
  return elements;
}

const recipes = readJson('packages/server/data/content/forging/recipes.json');
const recipe = recipes.find((entry) => entry?.recipeId === 'forging.foundation_turtle_spell_robe');
assert.ok(recipe, 'missing forging.foundation_turtle_spell_robe');

const itemById = collectItems();
const inputElements = buildElementsForIngredients(recipe, itemById);
const targetElements = buildTargetElements(recipe, itemById);
assert.deepEqual(inputElements, targetElements);

const match = computeFivePhaseElementMatch(inputElements, targetElements);
assert.equal(match.baseElementSuccessRate, 1);
assert.deepEqual(targetElements, {
  metal: 29,
  wood: 30,
  water: 189,
  fire: 0,
  earth: 42,
});

console.log('[proof:turtle-spell-robe-forging-recipe] ok');
