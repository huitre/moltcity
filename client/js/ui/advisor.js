// ============================================
// MOLTCITY - City Advisor Panel
// ============================================

import * as api from '../api.js';

let advisorOpen = false;

export function initAdvisor() {
  const btn = document.getElementById('tb-advisor');
  if (btn) {
    btn.addEventListener('click', toggleAdvisor);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'a' || e.key === 'A') {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      toggleAdvisor();
    }
  });
}

function toggleAdvisor() {
  if (advisorOpen) {
    closeAdvisor();
  } else {
    openAdvisor();
  }
}

async function openAdvisor() {
  const panel = document.getElementById('advisor-panel');
  if (!panel) return;

  panel.style.display = 'block';
  advisorOpen = true;

  // Show loading state
  const content = document.getElementById('advisor-content');
  if (content) content.innerHTML = '<div style="text-align:center;padding:20px;color:#999">Loading...</div>';

  try {
    const data = await api.getAdvisor();
    if (data.error) {
      if (content) content.innerHTML = `<div style="color:#e74c3c">${data.error}</div>`;
      return;
    }
    renderAdvisor(data);
  } catch (e) {
    if (content) content.innerHTML = `<div style="color:#e74c3c">Failed to load advisor data</div>`;
  }
}

function closeAdvisor() {
  const panel = document.getElementById('advisor-panel');
  if (panel) panel.style.display = 'none';
  advisorOpen = false;
}

// Make closeAdvisor available globally for inline onclick
window.closeAdvisor = closeAdvisor;

function renderAdvisor(data) {
  const content = document.getElementById('advisor-content');
  if (!content) return;

  let html = '';

  // --- Zoning section ---
  html += renderZoning(data.zoning);

  // --- Power section ---
  html += renderUtility('Power', data.power, 'unpowered');

  // --- Water section ---
  html += renderUtility('Water', data.water, 'noWater');

  // --- Tax section ---
  html += renderTaxes(data.taxes);

  content.innerHTML = html;
}

function severity(ratio, hasProblem) {
  if (hasProblem) return 'critical';
  if (ratio >= 1.2) return 'ok';
  if (ratio >= 1.0) return 'warning';
  return 'critical';
}

function severityDot(level) {
  const colors = { ok: '#2ecc71', warning: '#f39c12', critical: '#e74c3c' };
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors[level] || colors.ok};margin-right:6px"></span>`;
}

function renderZoning(z) {
  const level = z.recommendation ? 'warning' : 'ok';

  // Build stacked ratio bar
  const rPct = (z.current.residential * 100).toFixed(0);
  const oPct = (z.current.office * 100).toFixed(0);
  const iPct = (z.current.industrial * 100).toFixed(0);

  // Ideal markers
  const idealR = (z.ideal.residential * 100).toFixed(0);
  const idealO = (z.ideal.office * 100).toFixed(0);

  return `
    <div class="advisor-section">
      <div class="advisor-section-title">${severityDot(level)}Zoning Balance</div>
      <div class="advisor-bar-container">
        <div class="advisor-bar">
          <div class="advisor-bar-seg" style="width:${rPct}%;background:#2ecc71" title="Residential ${rPct}%"></div>
          <div class="advisor-bar-seg" style="width:${oPct}%;background:#3498db" title="Office ${oPct}%"></div>
          <div class="advisor-bar-seg" style="width:${iPct}%;background:#e67e22" title="Industrial ${iPct}%"></div>
        </div>
        <div class="advisor-bar-markers">
          <div class="advisor-bar-marker" style="left:${idealR}%" title="Ideal R/O split"></div>
          <div class="advisor-bar-marker" style="left:${+idealR + +idealO}%" title="Ideal O/I split"></div>
        </div>
      </div>
      <div class="advisor-bar-legend">
        <span><span style="color:#2ecc71">R</span> ${rPct}%</span>
        <span><span style="color:#3498db">O</span> ${oPct}%</span>
        <span><span style="color:#e67e22">I</span> ${iPct}%</span>
      </div>
      <div class="advisor-message ${level}">${z.message}</div>
    </div>
  `;
}

function renderUtility(name, u, problemKey) {
  const problemCount = u[problemKey] || 0;
  const level = severity(u.ratio, problemCount > 0);

  return `
    <div class="advisor-section">
      <div class="advisor-section-title">${severityDot(level)}${name}</div>
      <div class="advisor-stats">
        <span>Capacity: ${u.capacity.toLocaleString()}</span>
        <span>Demand: ${u.demand.toLocaleString()}</span>
        <span>Ratio: ${u.ratio === Infinity ? 'n/a' : u.ratio + 'x'}</span>
      </div>
      ${problemCount > 0 ? `<div class="advisor-warning">${problemCount} building${problemCount > 1 ? 's' : ''} without ${name.toLowerCase()}</div>` : ''}
      ${u.message ? `<div class="advisor-message ${level}">${u.message}</div>` : '<div class="advisor-message ok">All good</div>'}
    </div>
  `;
}

function renderTaxes(t) {
  const level = t.warnings.length > 0 ? 'critical' : 'ok';

  let warningsHtml = '';
  if (t.warnings.length > 0) {
    warningsHtml = t.warnings.map(w => `
      <div class="advisor-tax-warning">
        <strong>${w.zone}</strong> tax at ${w.rate}% (threshold: ${w.threshold}%)
        <div class="advisor-tax-effect">${w.effect}</div>
      </div>
    `).join('');
  } else {
    warningsHtml = '<div class="advisor-message ok">Tax rates are within safe limits</div>';
  }

  return `
    <div class="advisor-section">
      <div class="advisor-section-title">${severityDot(level)}Taxes</div>
      <div class="advisor-stats">
        <span><span style="color:#2ecc71">R</span>: ${t.rates.residential}%</span>
        <span><span style="color:#3498db">O</span>: ${t.rates.office}%</span>
        <span><span style="color:#e67e22">I</span>: ${t.rates.industrial}%</span>
      </div>
      ${warningsHtml}
    </div>
  `;
}
