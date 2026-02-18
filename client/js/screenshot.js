// ============================================
// MOLTCITY - Screenshot Capture & Upload
// ============================================

import * as state from './state.js';

const CAPTURE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function startScreenshotCapture() {
  // Initial capture after 10s (let city fully render)
  setTimeout(captureAndUpload, 10_000);
  // Then every 5 minutes
  setInterval(captureAndUpload, CAPTURE_INTERVAL);
}

async function captureAndUpload() {
  const app = state.app;
  const cityId = state.currentCityId;
  if (!app || !cityId) return;

  try {
    const canvas = app.renderer.extract.canvas(app.stage);
    // Scale down to thumbnail (400px wide)
    const thumb = document.createElement('canvas');
    const scale = 400 / canvas.width;
    thumb.width = 400;
    thumb.height = Math.round(canvas.height * scale);
    const ctx = thumb.getContext('2d');
    ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);

    const blob = await new Promise(resolve => thumb.toBlob(resolve, 'image/jpeg', 0.8));

    const form = new FormData();
    form.append('file', blob, `${cityId}.jpg`);

    await fetch(`/api/cities/${cityId}/screenshot`, { method: 'POST', body: form });
  } catch (e) {
    // Silently ignore screenshot failures
  }
}
