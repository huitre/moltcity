// ============================================
// MOLTCITY - 3D Globe City Selector
// ============================================

import * as state from "../state.js";
import * as api from "../api.js";

let globeInstance = null;
let selectedPoint = null;
let isOpen = false;
let countriesGeoJson = null;

// Callbacks set by main.js
let onCityCreated = null;

// Zoom-transition state
let globeMode = null; // 'create' | 'zoom' | null
let fullyInGlobe = false;
let currentAltitude = 3.5;
const GLOBE_MIN_ALTITUDE = 2.5;
const GLOBE_MAX_ALTITUDE = 8;

/**
 * Register callback for after a city is created via the globe.
 * Receives (city) — caller should switchCity + rebuild UI.
 */
export function onGlobeCityCreated(fn) {
  onCityCreated = fn;
}

export function isGlobeOpen() {
  return isOpen;
}
export function isGlobeZoomMode() {
  return globeMode === "zoom";
}
export function isGlobeFullyActive() {
  return fullyInGlobe;
}

/**
 * Show the globe overlay for zoom transition (no create UI, oriented to current city).
 * @param {number} opacity 0–1
 */
export function showGlobeForZoom(opacity) {
  const overlay = document.getElementById("globe-overlay");
  if (!overlay) return;

  const clamped = Math.max(0, Math.min(1, opacity));

  if (!isOpen) {
    isOpen = true;
    globeMode = "zoom";
    overlay.style.display = "block";
    overlay.classList.add("zoom-mode");

    initGlobe();
    handleResize();
    loadCityPoints();
    clearSelection();

    // Orient globe to current city
    const currentCity = (state.citiesList || []).find(
      (c) => c.id === state.currentCityId,
    );
    if (currentCity?.latitude != null && currentCity?.longitude != null) {
      currentAltitude = 2.5;
      globeInstance.pointOfView(
        {
          lat: currentCity.latitude,
          lng: currentCity.longitude,
          altitude: currentAltitude,
        },
        0,
      );
    } else {
      currentAltitude = 2.5;
      globeInstance.pointOfView(
        { lat: 20, lng: 10, altitude: currentAltitude },
        0,
      );
    }

    // Disable all controls in zoom mode — we handle zoom ourselves
    if (globeInstance) {
      const controls = globeInstance.controls();
      controls.autoRotate = false;
      controls.enableRotate = false;
      controls.enableZoom = false;
      controls.enablePan = false;
    }
  }

  overlay.style.opacity = String(clamped);
  fullyInGlobe = clamped >= 1;

  // When fully opaque, enable pointer events so user can drag/rotate the globe
  if (fullyInGlobe) {
    overlay.style.pointerEvents = "auto";
    if (globeInstance) {
      const controls = globeInstance.controls();
      controls.enableRotate = true;
    }
  } else {
    overlay.style.pointerEvents = "";
    if (globeInstance) {
      const controls = globeInstance.controls();
      controls.enableRotate = false;
    }
  }
}

/**
 * Hide the globe from zoom transition.
 */
export function hideGlobeFromZoom() {
  if (!isOpen || globeMode !== "zoom") return;
  isOpen = false;
  globeMode = null;
  fullyInGlobe = false;

  const overlay = document.getElementById("globe-overlay");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "";
    overlay.classList.remove("zoom-mode");
    overlay.style.display = "none";
  }
}

/**
 * Forward wheel events to the globe camera when fully in globe mode.
 * Returns { shouldExit } — true when altitude bottoms out and user is scrolling in.
 */
export function handleGlobeWheel(deltaY) {
  if (!globeInstance) return { shouldExit: false };

  const step = deltaY > 0 ? 0.15 : -0.15;
  const newAlt = currentAltitude + step;
  console.log({ newAlt });

  // Already at minimum and trying to go lower → signal exit
  if (newAlt < GLOBE_MIN_ALTITUDE) {
    fullyInGlobe = false;
    // Reset pointer events so next wheel event goes to the canvas
    const overlay = document.getElementById("globe-overlay");
    if (overlay) overlay.style.pointerEvents = "";
    if (globeInstance) {
      const controls = globeInstance.controls();
      controls.enableRotate = false;
    }
    return { shouldExit: true };
  }

  currentAltitude = Math.min(GLOBE_MAX_ALTITUDE, newAlt);
  globeInstance.pointOfView({ altitude: currentAltitude }, 0);
  return { shouldExit: false };
}

/**
 * Initialize the globe (lazy — only on first open).
 */
function initGlobe() {
  if (globeInstance) return;

  const container = document.getElementById("globe-container");
  if (!container) return;

  globeInstance = Globe()
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#4ecdc4")
    .atmosphereAltitude(0.18)
    .showGlobe(true)
    .globeImageUrl("")
    // Points layer (existing cities)
    .pointsData([])
    .pointLat("lat")
    .pointLng("lng")
    .pointColor("color")
    .pointAltitude(0.01)
    .pointRadius("size")
    .pointLabel("label")
    // Rings layer (selected location)
    .ringsData([])
    .ringLat("lat")
    .ringLng("lng")
    .ringColor("color")
    .ringMaxRadius("maxR")
    .ringPropagationSpeed("speed")
    .ringRepeatPeriod("period")
    // Globe click (onPolygonClick needed because country polygons cover the surface)
    .onGlobeClick(handleGlobeClick)
    .onPolygonClick((_, ev, { lat, lng }) => handleGlobeClick({ lat, lng }))
    .onPointClick(handlePointClick)(container);

  // Style the globe surface — dark sphere
  const globeMaterial = globeInstance.globeMaterial();
  globeMaterial.color.set(0x0a0a1a);
  globeMaterial.emissive.set(0x050510);
  globeMaterial.emissiveIntensity = 0.4;

  // Enable auto-rotation
  const controls = globeInstance.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.enableDamping = true;

  // Set initial camera position
  globeInstance.pointOfView({ lat: 20, lng: 10, altitude: 2.5 });

  // Intercept wheel on globe container for altitude zoom in zoom mode
  container.addEventListener(
    "wheel",
    (e) => {
      if (globeMode === "zoom") {
        e.preventDefault();
        e.stopPropagation();
        if (fullyInGlobe) {
          handleGlobeWheel(e.deltaY);
        }
      }
    },
    { passive: false },
  );

  // Load world countries GeoJSON for polygon borders
  loadCountries();

  // Handle resize
  window.addEventListener("resize", handleResize);

  // Wire up UI buttons
  document.getElementById("globe-close").addEventListener("click", closeGlobe);
  document
    .getElementById("globe-confirm")
    .addEventListener("click", confirmCreation);
  document
    .getElementById("globe-cancel")
    .addEventListener("click", cancelSelection);

  // ESC key
  document.addEventListener("keydown", handleKeyDown);

  // Enter key in name input
  document
    .getElementById("globe-city-name")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmCreation();
    });
}

/**
 * Load world country polygons from topojson CDN.
 */
async function loadCountries() {
  try {
    const resp = await fetch(
      "https://unpkg.com/world-atlas@2/countries-110m.json",
    );
    const world = await resp.json();
    countriesGeoJson = topojson.feature(world, world.objects.countries);

    globeInstance
      .polygonsData(countriesGeoJson.features)
      .polygonCapColor(() => "rgba(20, 20, 40, 0.85)")
      .polygonSideColor(() => "rgba(78, 205, 196, 0.08)")
      .polygonStrokeColor(() => "#4ecdc4")
      .polygonAltitude(0.006);
  } catch (err) {
    console.warn("[Globe] Failed to load country borders:", err);
  }
}

/**
 * Open the globe overlay.
 */
export function openGlobe() {
  // If already open in zoom mode, switch to create mode
  if (isOpen && globeMode === "zoom") {
    globeMode = "create";
    fullyInGlobe = false;
    const overlay = document.getElementById("globe-overlay");
    overlay.classList.remove("zoom-mode");
    overlay.style.opacity = "";
    overlay.classList.add("visible");
    if (globeInstance) {
      const controls = globeInstance.controls();
      controls.autoRotate = true;
      controls.enableRotate = true;
      controls.enableZoom = false;
      controls.enablePan = false;
    }
    return;
  }
  if (isOpen) return;
  isOpen = true;
  globeMode = "create";

  const overlay = document.getElementById("globe-overlay");
  overlay.style.display = "block";
  overlay.style.opacity = "";
  // Trigger reflow then add visible class for transition
  overlay.offsetHeight;
  overlay.classList.add("visible");

  initGlobe();
  handleResize();
  loadCityPoints();
  clearSelection();

  // Restart auto-rotation
  if (globeInstance) {
    const controls = globeInstance.controls();
    controls.autoRotate = true;
    controls.enableRotate = true;
  }
}

/**
 * Close the globe overlay.
 */
export function closeGlobe() {
  if (!isOpen) return;
  isOpen = false;

  const wasZoomMode = globeMode === "zoom";
  globeMode = null;
  fullyInGlobe = false;

  const overlay = document.getElementById("globe-overlay");
  if (wasZoomMode) {
    overlay.style.opacity = "0";
    overlay.classList.remove("zoom-mode");
    overlay.style.display = "none";
  } else {
    overlay.style.opacity = "";
    overlay.classList.remove("visible");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 400);
  }

  clearSelection();
}

/**
 * Load existing cities as glowing pinpoints on the globe.
 */
function loadCityPoints() {
  if (!globeInstance) return;

  const cities = state.citiesList || [];
  const points = cities
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      lat: c.latitude,
      lng: c.longitude,
      color: c.id === state.currentCityId ? "#ffd700" : "#4ecdc4",
      size: c.id === state.currentCityId ? 0.5 : 0.35,
      label: `<div style="font-family:'Press Start 2P',monospace;font-size:9px;color:#ffd700;text-shadow:0 0 6px rgba(78,205,196,0.8);padding:4px 8px;background:rgba(0,0,0,0.7);border:1px solid #4ecdc4;border-radius:2px">${c.name}</div>`,
      cityId: c.id,
      cityName: c.name,
    }));

  globeInstance.pointsData(points);
}

/**
 * Handle click on the globe surface — place a marker.
 */
function handleGlobeClick({ lat, lng }) {
  // Ignore clicks in zoom mode (browse only)
  if (globeMode === "zoom") return;

  // Stop auto-rotation when user interacts
  const controls = globeInstance.controls();
  controls.autoRotate = false;

  selectedPoint = { lat, lng };

  // Show pulsing ring at selected location
  globeInstance.ringsData([
    {
      lat,
      lng,
      color: () => "#ffd700",
      maxR: 3,
      speed: 2,
      period: 1500,
    },
  ]);

  // Update coordinates display
  const coordsEl = document.getElementById("globe-coords");
  coordsEl.textContent = `${Math.abs(lat).toFixed(2)}\u00B0${lat >= 0 ? "N" : "S"}  ${Math.abs(lng).toFixed(2)}\u00B0${lng >= 0 ? "E" : "W"}`;

  // Show the city panel
  const panel = document.getElementById("globe-city-panel");
  panel.style.display = "block";
  panel.offsetHeight;
  panel.classList.add("visible");

  // Focus name input
  const nameInput = document.getElementById("globe-city-name");
  nameInput.value = "";
  nameInput.focus();

  // Enable confirm button
  document.getElementById("globe-confirm").disabled = false;
  document.getElementById("globe-confirm").textContent = "FOUND CITY";
}

/**
 * Handle click on an existing city pinpoint.
 */
function handlePointClick(point) {
  if (!point || !point.cityId) return;
  // Navigate to clicked city
  closeGlobe();
  if (onCityCreated) {
    // Reuse callback — it handles switchCity
    onCityCreated({ id: point.cityId, name: point.cityName, _switch: true });
  }
}

/**
 * Confirm city creation at selected point.
 */
async function confirmCreation() {
  if (!selectedPoint) return;

  const nameInput = document.getElementById("globe-city-name");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const confirmBtn = document.getElementById("globe-confirm");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "FOUNDING...";

  try {
    const result = await api.createCity(
      name,
      selectedPoint.lat,
      selectedPoint.lng,
    );
    const city = result.city || result;

    // Update cities list in state
    state.setCitiesList([...state.citiesList, city]);

    // Zoom into the new city location
    globeInstance.pointOfView(
      { lat: selectedPoint.lat, lng: selectedPoint.lng, altitude: 1.2 },
      1000,
    );

    // Refresh points to show the new city
    loadCityPoints();

    // Wait for zoom animation, then close and switch
    setTimeout(() => {
      closeGlobe();
      if (onCityCreated) {
        onCityCreated(city);
      }
    }, 1200);
  } catch (err) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "FOUND CITY";
    // Show error in coords area
    const coordsEl = document.getElementById("globe-coords");
    coordsEl.textContent = err.message || "Failed to create city";
    coordsEl.style.color = "#ff6b6b";
    setTimeout(() => {
      coordsEl.style.color = "";
    }, 3000);
  }
}

/**
 * Cancel the current selection.
 */
function cancelSelection() {
  clearSelection();
}

/**
 * Clear selected point and hide panel.
 */
function clearSelection() {
  selectedPoint = null;
  if (globeInstance) {
    globeInstance.ringsData([]);
  }
  const panel = document.getElementById("globe-city-panel");
  if (panel) {
    panel.classList.remove("visible");
    setTimeout(() => {
      panel.style.display = "none";
    }, 300);
  }
}

/**
 * Handle window resize.
 */
function handleResize() {
  if (globeInstance && isOpen) {
    globeInstance.width(window.innerWidth);
    globeInstance.height(window.innerHeight);
  }
}

/**
 * Handle ESC key.
 */
function handleKeyDown(e) {
  if (e.key === "Escape" && isOpen) {
    if (globeMode === "zoom") {
      hideGlobeFromZoom();
      return;
    }
    if (selectedPoint) {
      cancelSelection();
    } else {
      closeGlobe();
    }
  }
}
