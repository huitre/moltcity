// ============================================
// MOLTCITY - Pixi.js Initialization
// ============================================

import {
  GRID_SIZE,
  TILE_WIDTH,
  TILE_HEIGHT,
  WORLD_MIN_X,
  WORLD_MAX_X,
  WORLD_MIN_Y,
  WORLD_MAX_Y,
} from "../config.js";
import * as state from "../state.js";
import { cartToIso, isoToCart, clamp } from "../utils.js";

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

  // Cloud shadows container (at ground level, below buildings)
  const cloudShadowsContainer = new PIXI.Container();
  cloudShadowsContainer.zIndex = 650;
  worldContainer.addChild(cloudShadowsContainer);
  state.setCloudShadowsContainer(cloudShadowsContainer);

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
const DRAWABLE_TYPES = [
  "road",
  "residential",
  "offices",
  "industrial",
  "suburban",
];

export function setupInteractions(
  onTileClick,
  onTileHover,
  onDragStart,
  onDragMove,
  onDragEnd,
) {
  const { app, worldContainer } = state;

  // Drag state
  let isDragging = false;
  let isPendingDragDraw = false;
  let isInDragDraw = false;
  let startPos = { x: 0, y: 0 };
  let lastPos = { x: 0, y: 0 };

  // Make stage interactive
  app.stage.interactive = true;
  app.stage.hitArea = app.screen;

  // Mouse down - start drag or select
  app.stage.on("pointerdown", (e) => {
    startPos = { x: e.global.x, y: e.global.y };
    lastPos = { x: e.global.x, y: e.global.y };

    if (
      state.selectedBuildType &&
      DRAWABLE_TYPES.includes(state.selectedBuildType)
    ) {
      // Potential drag-draw — defer until threshold exceeded
      isPendingDragDraw = true;
      isDragging = false;
    } else {
      isDragging = true;
      isPendingDragDraw = false;
    }
  });

  // Mouse move - drag camera, drag-draw, or hover
  app.stage.on("pointermove", (e) => {
    const localPos = worldContainer.toLocal(e.global);
    const gridPos = isoToCart(localPos.x, localPos.y);

    if (isPendingDragDraw) {
      const dx = Math.abs(e.global.x - startPos.x);
      const dy = Math.abs(e.global.y - startPos.y);
      if (dx > 5 || dy > 5) {
        // Threshold exceeded: commit to drag-draw mode
        isPendingDragDraw = false;
        isInDragDraw = true;
        const startLocal = worldContainer.toLocal(startPos);
        const startGrid = isoToCart(startLocal.x, startLocal.y);
        if (onDragStart) onDragStart(startGrid.x, startGrid.y);
      }
      return;
    }

    if (isInDragDraw) {
      if (onDragMove) onDragMove(gridPos.x, gridPos.y, e.global);
      return;
    }

    if (isDragging) {
      const dx = e.global.x - lastPos.x;
      const dy = e.global.y - lastPos.y;

      // Move camera (with bounds scaled by zoom level)
      const s = worldContainer.scale.x;
      worldContainer.x = clamp(
        worldContainer.x + dx,
        -WORLD_MAX_X * s + app.screen.width / 2,
        -WORLD_MIN_X * s + app.screen.width / 2,
      );
      worldContainer.y = clamp(
        worldContainer.y + dy,
        -WORLD_MAX_Y * s + app.screen.height / 2,
        app.screen.height / 2,
      );

      lastPos = { x: e.global.x, y: e.global.y };
    } else if (onTileHover) {
      onTileHover(gridPos.x, gridPos.y, e.global);
    }
  });

  // Mouse up - end drag-draw, click, or camera pan
  app.stage.on("pointerup", (e) => {
    if (isInDragDraw) {
      if (onDragEnd) onDragEnd();
      isInDragDraw = false;
      isPendingDragDraw = false;
      return;
    }

    if (isPendingDragDraw) {
      // Never exceeded threshold — treat as single click
      isPendingDragDraw = false;
      const localPos = worldContainer.toLocal(e.global);
      const gridPos = isoToCart(localPos.x, localPos.y);
      if (onTileClick) onTileClick(gridPos.x, gridPos.y, e.global);
      return;
    }

    if (isDragging) {
      const dx = Math.abs(e.global.x - startPos.x);
      const dy = Math.abs(e.global.y - startPos.y);

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
          onTileClick(gridPos.x, gridPos.y, e.global);
        }
      }
    }
    isDragging = false;
  });

  app.stage.on("pointerupoutside", () => {
    if (isInDragDraw && onDragEnd) onDragEnd();
    isDragging = false;
    isInDragDraw = false;
    isPendingDragDraw = false;
  });

  // Mouse wheel zoom
  app.view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = clamp(worldContainer.scale.x * scaleFactor, 0.1, 4);

    // Zoom toward mouse position
    const mousePos = { x: e.clientX, y: e.clientY };
    const worldPos = worldContainer.toLocal(mousePos);

    worldContainer.scale.set(newScale);

    const newScreenPos = worldContainer.toGlobal(worldPos);
    worldContainer.x += mousePos.x - newScreenPos.x;
    worldContainer.y += mousePos.y - newScreenPos.y;
  });

  // ============================================
  // MOBILE TOUCH SUPPORT: Pinch to zoom + pan
  // ============================================
  
  let touchState = {
    isMultiTouch: false,
    initialDistance: 0,
    initialScale: 1,
    initialCenter: { x: 0, y: 0 },
    lastCenter: { x: 0, y: 0 },
    lastTouchCount: 0,
  };

  // Calculate distance between two touch points
  function getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Calculate center point between two touches
  function getTouchCenter(touch1, touch2) {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  }

  // Prevent default touch behaviors (scrolling, zooming page)
  app.view.addEventListener("touchstart", (e) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      touchState.isMultiTouch = true;
      touchState.initialDistance = getTouchDistance(e.touches[0], e.touches[1]);
      touchState.initialScale = worldContainer.scale.x;
      touchState.initialCenter = getTouchCenter(e.touches[0], e.touches[1]);
      touchState.lastCenter = touchState.initialCenter;
      
      // Cancel any drag-draw in progress
      if (isDragging) {
        isDragging = false;
      }
      if (isPendingDragDraw || isInDragDraw) {
        isPendingDragDraw = false;
        isInDragDraw = false;
        if (onDragEnd) onDragEnd();
      }
    }
    touchState.lastTouchCount = e.touches.length;
  }, { passive: false });

  app.view.addEventListener("touchmove", (e) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      
      // Calculate new scale based on pinch
      const scaleRatio = currentDistance / touchState.initialDistance;
      const newScale = clamp(touchState.initialScale * scaleRatio, 0.3, 2);
      
      // Apply zoom centered on pinch center
      const worldPos = worldContainer.toLocal(touchState.initialCenter);
      worldContainer.scale.set(newScale);
      const newScreenPos = worldContainer.toGlobal(worldPos);
      worldContainer.x += touchState.initialCenter.x - newScreenPos.x;
      worldContainer.y += touchState.initialCenter.y - newScreenPos.y;
      
      // Also apply pan based on center movement
      const dx = currentCenter.x - touchState.lastCenter.x;
      const dy = currentCenter.y - touchState.lastCenter.y;
      worldContainer.x = clamp(
        worldContainer.x + dx,
        -WORLD_MAX_X + app.screen.width / 2,
        -WORLD_MIN_X + app.screen.width / 2,
      );
      worldContainer.y = clamp(
        worldContainer.y + dy,
        -WORLD_MAX_Y + app.screen.height / 2,
        app.screen.height / 2,
      );
      
      touchState.lastCenter = currentCenter;
    }
  }, { passive: false });

  app.view.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) {
      touchState.isMultiTouch = false;
    }
    if (e.touches.length === 1 && touchState.lastTouchCount >= 2) {
      // Transitioning from multi-touch to single touch
      // Reset drag state to prevent jumps
      lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      startPos = lastPos;
    }
    touchState.lastTouchCount = e.touches.length;
  }, { passive: false });

  app.view.addEventListener("touchcancel", () => {
    touchState.isMultiTouch = false;
    touchState.lastTouchCount = 0;
  }, { passive: false });

  // Prevent iOS Safari bounce/zoom
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });
}
