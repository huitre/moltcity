// ============================================
// MOLTCITY - Admin Panel (Debug / Camera / Vehicles / Sprites)
// ============================================

import * as api from '../api.js';
import * as state from '../state.js';
import { render } from '../game.js';
import { getWinSkew, setWinSkew, rebuildLights } from '../render/lighting.js';

let selectedBuilding = null;

function getPanel() {
  return document.getElementById('admin-panel');
}

// ── Tab switching ──────────────────────────────

function initTabs() {
  const tabs = document.querySelectorAll('#admin-panel .admin-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#admin-panel .admin-tab-content').forEach(c => c.classList.remove('active'));
      // Activate clicked tab
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// ── City tab (old debug panel) ─────────────────

export function setDebugSelectedBuilding(building) {
  const ZONE_TYPES = ['residential', 'offices', 'industrial', 'suburban'];
  const label = document.getElementById('debug-selected-building');
  if (!label) return;

  if (building && ZONE_TYPES.includes(building.type)) {
    selectedBuilding = building;
    label.textContent = `${building.name} (d${building.density || 1})`;
  } else {
    selectedBuilding = null;
    label.textContent = building ? 'Not a zone' : 'None';
  }
}

function populateCityTab() {
  const city = state.cityData;
  if (city) {
    document.getElementById('debug-treasury').value = Math.floor(city.stats?.treasury ?? 0);
    document.getElementById('debug-hour').value = city.time?.hour ?? 0;
    document.getElementById('debug-day').value = city.time?.day ?? 1;
    document.getElementById('debug-year').value = city.time?.year ?? 1;
  }

  const pop = city?.stats?.population ?? 0;
  const officeCount = state.buildings.filter(b => b.type === 'offices' || b.type === 'office').length;
  document.getElementById('debug-population').textContent = pop.toLocaleString();
  document.getElementById('debug-offices').textContent = officeCount;
}

async function applyDebug() {
  const treasury = parseFloat(document.getElementById('debug-treasury').value);
  const hour = parseInt(document.getElementById('debug-hour').value, 10);
  const day = parseInt(document.getElementById('debug-day').value, 10);
  const year = parseInt(document.getElementById('debug-year').value, 10);

  const params = {};
  if (!isNaN(treasury)) params.treasury = treasury;
  if (!isNaN(hour)) params.hour = hour;
  if (!isNaN(day)) params.day = day;
  if (!isNaN(year)) params.year = year;

  try {
    const result = await api.debugUpdateCity(params);
    if (result.city) {
      state.setCityData(result.city);
      render();
    }
    populateCityTab();
  } catch (e) {
    console.error('[Debug] Apply failed:', e.message);
    alert('Debug apply failed: ' + e.message);
  }
}

async function applyDensity(density) {
  if (!selectedBuilding) {
    alert('No zone building selected. Click a zone building first.');
    return;
  }

  try {
    await api.debugSetDensity(selectedBuilding.id, density);
    const buildingsResponse = await api.getBuildings();
    state.setBuildings(buildingsResponse.buildings || []);
    render();
    const updated = state.buildings.find(b => b.id === selectedBuilding.id);
    if (updated) setDebugSelectedBuilding(updated);
  } catch (e) {
    console.error('[Debug] Set density failed:', e.message);
    alert('Set density failed: ' + e.message);
  }
}

// ── Camera tab (tilt-shift) ────────────────────

function initTiltShiftControls() {
  const sliders = {
    'ts-blur': (v) => { if (state.tiltShiftFilter) state.tiltShiftFilter.blur = v; },
    'ts-gradient': (v) => { if (state.tiltShiftFilter) state.tiltShiftFilter.gradientBlur = v; },
    'ts-start-y': (v) => {
      // Use SCREEN coordinates (0 to screenWidth) for tilt-shift focus band
      if (state.tiltShiftFilter && state.app) {
        const screenWidth = state.app.screen.width;
        state.tiltShiftFilter.start = new PIXI.Point(0, v);
        state.tiltShiftFilter.end = new PIXI.Point(screenWidth, v);
      }
    },
  };

  for (const [id, apply] of Object.entries(sliders)) {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(id + '-val');
    if (!input) continue;

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (valSpan) valSpan.textContent = v;
      apply(v);
    });
  }

  const enabledCheckbox = document.getElementById('ts-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.addEventListener('change', () => {
      if (state.tiltShiftFilter) {
        state.tiltShiftFilter.enabled = enabledCheckbox.checked;
      }
    });
  }
}

function initMaskControls() {
  const cb = document.getElementById('mask-enabled');
  if (cb) {
    cb.checked = state.buildingMasksEnabled;
    cb.addEventListener('change', () => {
      state.setBuildingMasksEnabled(cb.checked);
      render();
    });
  }
}

function initWindowLightControls() {
  const slider = document.getElementById('win-skew');
  const valSpan = document.getElementById('win-skew-val');
  if (!slider) return;

  slider.value = getWinSkew();
  if (valSpan) valSpan.textContent = getWinSkew();

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    if (valSpan) valSpan.textContent = v;
    setWinSkew(v);
    rebuildLights();
  });
}

function initOffsetSlider(id, getter, setter) {
  const slider = document.getElementById(id);
  const valSpan = document.getElementById(id + '-val');
  if (!slider) return;

  slider.value = getter();
  if (valSpan) valSpan.textContent = getter();

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    if (valSpan) valSpan.textContent = v;
    setter(v);
    render();
  });
}

const TL_DIRS = ['north', 'south', 'east', 'west'];

function initOffsetControls() {
  // Per-direction traffic light offsets
  for (const dir of TL_DIRS) {
    initOffsetSlider(`tl-${dir}-x`,
      () => state.trafficLightOffsets[dir].x,
      (v) => state.setTrafficLightOffset(dir, 'x', v));
    initOffsetSlider(`tl-${dir}-y`,
      () => state.trafficLightOffsets[dir].y,
      (v) => state.setTrafficLightOffset(dir, 'y', v));
  }
  // Street lamp offsets
  initOffsetSlider('sl-off-x', () => state.streetLampOffsetX, state.setStreetLampOffsetX);
  initOffsetSlider('sl-off-y', () => state.streetLampOffsetY, state.setStreetLampOffsetY);
}

function populateOffsetControls() {
  const set = (id, val) => {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(id + '-val');
    if (input) input.value = val;
    if (valSpan) valSpan.textContent = val;
  };
  for (const dir of TL_DIRS) {
    set(`tl-${dir}-x`, state.trafficLightOffsets[dir].x);
    set(`tl-${dir}-y`, state.trafficLightOffsets[dir].y);
  }
  set('sl-off-x', state.streetLampOffsetX);
  set('sl-off-y', state.streetLampOffsetY);
}

function populateTiltShiftTab() {
  const f = state.tiltShiftFilter;
  if (!f) return;

  const set = (id, val) => {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(id + '-val');
    if (input) input.value = val;
    if (valSpan) valSpan.textContent = val;
  };

  set('ts-blur', Math.round(f.blur));
  set('ts-gradient', Math.round(f.gradientBlur));
  set('ts-start-y', Math.round(f.start.y));

  const cb = document.getElementById('ts-enabled');
  if (cb) cb.checked = f.enabled;
}

function initSmokeControls() {
  initOffsetSlider('smoke-off-x', () => state.smokeOffsetX, state.setSmokeOffsetX);
  initOffsetSlider('smoke-off-y', () => state.smokeOffsetY, state.setSmokeOffsetY);

  const cb = document.getElementById('smoke-markers');
  if (cb) {
    cb.checked = state.showSmokeMarkers;
    cb.addEventListener('change', () => {
      state.setShowSmokeMarkers(cb.checked);
      render();
    });
  }
}

function populateSmokeControls() {
  const set = (id, val) => {
    const input = document.getElementById(id);
    const valSpan = document.getElementById(id + '-val');
    if (input) input.value = val;
    if (valSpan) valSpan.textContent = val;
  };
  set('smoke-off-x', state.smokeOffsetX);
  set('smoke-off-y', state.smokeOffsetY);

  const cb = document.getElementById('smoke-markers');
  if (cb) cb.checked = state.showSmokeMarkers;
}

function populateWindowLightTab() {
  const slider = document.getElementById('win-skew');
  const valSpan = document.getElementById('win-skew-val');
  if (slider) slider.value = getWinSkew();
  if (valSpan) valSpan.textContent = getWinSkew();
}

// ── Open / Close ───────────────────────────────

export function openAdminPanel(tab) {
  const panel = getPanel();
  if (!panel) return;

  populateCityTab();
  populateTiltShiftTab();
  populateWindowLightTab();
  populateOffsetControls();
  populateSmokeControls();

  panel.style.display = 'block';

  // Switch to requested tab if specified
  if (tab) {
    const tabBtn = document.querySelector(`#admin-panel .admin-tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.click();
  }
}

export function closeAdminPanel() {
  const panel = getPanel();
  if (panel) panel.style.display = 'none';
}

// Keep old names for backward compatibility
export { openAdminPanel as openDebugPanel };
export { closeAdminPanel as closeDebugPanel };

// ── Init ───────────────────────────────────────

export function initDebugPanel() {
  initTabs();
  initTiltShiftControls();
  initMaskControls();
  initWindowLightControls();
  initOffsetControls();
  initSmokeControls();

  const applyBtn = document.getElementById('debug-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', applyDebug);
  }

  document.querySelectorAll('.debug-density-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const density = parseInt(btn.dataset.density, 10);
      applyDensity(density);
    });
  });

  // Ctrl+Shift+D toggles the admin panel
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      const panel = getPanel();
      if (panel && panel.style.display === 'block') {
        closeAdminPanel();
      } else {
        openAdminPanel();
      }
    }
  });
}
