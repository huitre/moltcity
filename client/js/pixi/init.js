// ============================================
// MOLTCITY - Pixi.js Initialization
// ============================================

import { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Y, WORLD_MAX_Y } from '../config.js';
import * as state from '../state.js';
import { cartToIso, isoToCart, clamp } from '../utils.js';

/**
 * Initialize the Pixi.js application
 */
export async function initPixi() {
  const app = new PIXI.Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x87ceeb,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.getElementById("game-container").appendChild(app.view);
  state.setApp(app);

  // Create world container for camera movement
  const worldContainer = new PIXI.Container();
  worldContainer.sortableChildren = true;
  app.stage.addChild(worldContainer);
  state.setWorldContainer(worldContainer);

  // Center on grid
  const centerIso = cartToIso(GRID_SIZE / 2, GRID_SIZE / 2);
  worldContainer.x = app.screen.width / 2 - centerIso.x;
  worldContainer.y = app.screen.height / 4 - centerIso.y;

  // Layer ordering (ascending):
  // tiles(100), waterpipes(200) are created in render()
  // sceneLayer(700) is persistent — holds roads, powerlines, buildings, vehicles, pedestrians
  // birds(800), clouds(900) are permanent containers

  // Scene layer — persistent, depth-sorted container for all gameplay objects
  const sceneLayer = new PIXI.Container();
  sceneLayer.sortableChildren = true;
  sceneLayer.zIndex = 700;
  worldContainer.addChild(sceneLayer);
  state.setSceneLayer(sceneLayer);

  // Birds container
  const birdsContainer = new PIXI.Container();
  birdsContainer.zIndex = 800;
  worldContainer.addChild(birdsContainer);
  state.setBirdsContainer(birdsContainer);

  // Clouds container
  const cloudsContainer = new PIXI.Container();
  cloudsContainer.zIndex = 900;
  worldContainer.addChild(cloudsContainer);
  state.setCloudsContainer(cloudsContainer);

  // Day/night overlay (screen space - stays fixed on screen, above everything)
  const dayNightOverlay = new PIXI.Graphics();
  dayNightOverlay.zIndex = 20000;
  app.stage.addChild(dayNightOverlay);
  state.setDayNightOverlay(dayNightOverlay);

  // Handle window resize
  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
  });

  return app;
}

/**
 * Setup mouse/keyboard interactions
 */
export function setupInteractions(onTileClick, onTileHover) {
  const { app, worldContainer } = state;

  // Drag state
  let isDragging = false;
  let lastPos = { x: 0, y: 0 };

  // Make stage interactive
  app.stage.interactive = true;
  app.stage.hitArea = app.screen;

  // Mouse down - start drag or select
  app.stage.on("pointerdown", (e) => {
    isDragging = true;
    lastPos = { x: e.global.x, y: e.global.y };
  });

  // Mouse move - drag camera or hover
  app.stage.on("pointermove", (e) => {
    const localPos = worldContainer.toLocal(e.global);
    const gridPos = isoToCart(localPos.x, localPos.y);

    if (isDragging) {
      const dx = e.global.x - lastPos.x;
      const dy = e.global.y - lastPos.y;

      // Move camera (with bounds)
      worldContainer.x = clamp(
        worldContainer.x + dx,
        -WORLD_MAX_X + app.screen.width / 2,
        -WORLD_MIN_X + app.screen.width / 2
      );
      worldContainer.y = clamp(
        worldContainer.y + dy,
        -WORLD_MAX_Y + app.screen.height / 2,
        -WORLD_MIN_Y + app.screen.height / 2
      );

      lastPos = { x: e.global.x, y: e.global.y };
    } else if (onTileHover) {
      onTileHover(gridPos.x, gridPos.y, e.global);
    }
  });

  // Mouse up - end drag or click
  app.stage.on("pointerup", (e) => {
    if (isDragging) {
      const dx = Math.abs(e.global.x - lastPos.x);
      const dy = Math.abs(e.global.y - lastPos.y);

      // If barely moved, treat as click
      if (dx < 5 && dy < 5) {
        const localPos = worldContainer.toLocal(e.global);
        const gridPos = isoToCart(localPos.x, localPos.y);

        if (
          gridPos.x >= 0 &&
          gridPos.x < GRID_SIZE &&
          gridPos.y >= 0 &&
          gridPos.y < GRID_SIZE &&
          onTileClick
        ) {
          onTileClick(gridPos.x, gridPos.y);
        }
      }
    }
    isDragging = false;
  });

  app.stage.on("pointerupoutside", () => {
    isDragging = false;
  });

  // Mouse wheel zoom
  app.view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = clamp(worldContainer.scale.x * scaleFactor, 0.3, 2);

    // Zoom toward mouse position
    const mousePos = { x: e.clientX, y: e.clientY };
    const worldPos = worldContainer.toLocal(mousePos);

    worldContainer.scale.set(newScale);

    const newScreenPos = worldContainer.toGlobal(worldPos);
    worldContainer.x += mousePos.x - newScreenPos.x;
    worldContainer.y += mousePos.y - newScreenPos.y;
  });
}
