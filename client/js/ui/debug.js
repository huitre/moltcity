// ============================================
// MOLTCITY - Debug Panel
// ============================================

import * as api from '../api.js';
import * as state from '../state.js';
import { render } from '../game.js';

function getPanel() {
  return document.getElementById('debug-panel');
}

export function openDebugPanel() {
  const panel = getPanel();
  if (!panel) return;

  const city = state.cityData;
  if (city) {
    document.getElementById('debug-treasury').value = Math.floor(city.stats?.treasury ?? 0);
    document.getElementById('debug-hour').value = city.time?.hour ?? 0;
    document.getElementById('debug-day').value = city.time?.day ?? 1;
    document.getElementById('debug-year').value = city.time?.year ?? 1;
  }

  // Read-only stats
  const pop = city?.stats?.population ?? 0;
  const officeCount = state.buildings.filter(b => b.type === 'offices' || b.type === 'office').length;
  document.getElementById('debug-population').textContent = pop.toLocaleString();
  document.getElementById('debug-offices').textContent = officeCount;

  panel.style.display = 'block';
}

export function closeDebugPanel() {
  const panel = getPanel();
  if (panel) panel.style.display = 'none';
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
    // Refresh the panel with new values
    openDebugPanel();
  } catch (e) {
    console.error('[Debug] Apply failed:', e.message);
    alert('Debug apply failed: ' + e.message);
  }
}

export function initDebugPanel() {
  const applyBtn = document.getElementById('debug-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', applyDebug);
  }

  // Ctrl+Shift+D toggles the panel
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      const panel = getPanel();
      if (panel && panel.style.display === 'block') {
        closeDebugPanel();
      } else {
        openDebugPanel();
      }
    }
  });
}
