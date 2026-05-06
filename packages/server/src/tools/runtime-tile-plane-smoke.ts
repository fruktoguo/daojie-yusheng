// @ts-nocheck
"use strict";

const assert = require("node:assert/strict");
const { StructureType, SurfaceType, TerrainType, TileType } = require("@mud/shared");
const { RuntimeTilePlane } = require("../runtime/map/runtime-tile-plane");

function main() {
  const plane = new RuntimeTilePlane(2, 4);
  assert.equal(plane.has(0, 0), false);
  assert.equal(plane.getHandle(0, 0), 0);

  const first = plane.activateCell(0, 0, TileType.Floor);
  assert.equal(first, 0);
  assert.equal(plane.has(0, 0), true);
  assert.equal(plane.getHandle(0, 0), 1);
  assert.equal(plane.getTileType(first), TileType.Floor);
  assert.equal(plane.getTerrain(first), TerrainType.Floor);
  assert.equal(plane.getSurface(first), SurfaceType.Floor);
  assert.equal(plane.getStructure(first), null);
  assert.equal(plane.isWalkable(first), true);

  const duplicate = plane.activateCell(0, 0, TileType.Stone);
  assert.equal(duplicate, first);
  assert.equal(plane.getTileType(first), TileType.Floor);

  const negative = plane.activateCell(-17, 9, TileType.Stone);
  assert.ok(negative > first);
  assert.equal(plane.getX(negative), -17);
  assert.equal(plane.getY(negative), 9);
  assert.equal(plane.has(-17, 9), true);
  assert.equal(plane.getTerrain(negative), TerrainType.StoneGround);
  assert.equal(plane.getStructure(negative), StructureType.Stone);
  assert.equal(plane.isWalkable(negative), false);

  const layered = plane.activateCell(8, 8, TileType.Grass);
  assert.equal(plane.getTileType(layered), TileType.Grass);
  assert.equal(plane.getTerrain(layered), TerrainType.Grass);
  assert.equal(plane.setStructureTileType(layered, TileType.Wall), true);
  assert.equal(plane.getTileType(layered), TileType.Wall);
  assert.equal(plane.getTerrain(layered), TerrainType.Grass);
  assert.equal(plane.getStructure(layered), StructureType.Wall);
  assert.equal(plane.isWalkable(layered), false);
  assert.equal(plane.setStructure(layered, null), true);
  assert.equal(plane.getTileType(layered), TileType.Grass);
  assert.equal(plane.getTerrain(layered), TerrainType.Grass);

  const paved = plane.activateCell(9, 8, TileType.Mud);
  assert.equal(plane.setSurfaceTileType(paved, TileType.Road), true);
  assert.equal(plane.getTileType(paved), TileType.Road);
  assert.equal(plane.getTerrain(paved), TerrainType.Mud);
  assert.equal(plane.getSurface(paved), SurfaceType.Road);

  const contextual = RuntimeTilePlane.fromTemplate({
    width: 3,
    height: 3,
    terrainRows: [",,,", ",#,", ",,,"],
  });
  const contextualWall = contextual.getCellIndex(1, 1);
  assert.equal(contextual.getTileType(contextualWall), TileType.Wall);
  assert.equal(contextual.getTerrain(contextualWall), TerrainType.Grass);
  assert.equal(contextual.getStructure(contextualWall), StructureType.Wall);

  for (let i = 0; i < 128; i += 1) {
    plane.activateCell(i * 3 - 200, i * 5 + 100, i % 2 === 0 ? TileType.Floor : TileType.Wall);
  }
  assert.equal(plane.has(-200, 100), true);
  assert.equal(plane.has(181, 735), true);
  assert.equal(plane.has(999, 999), false);

  console.log("runtime-tile-plane-smoke passed");
}

main();
