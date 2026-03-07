// ============================================
// MOLTCITY - City Advisor Panel & Popup System
// SimCity 2000 Style Advisors
// ============================================

import * as api from '../api.js';

let advisorOpen = false;
let popupQueue = [];
let currentPopup = null;
let warningCheckInterval = null;
let lastWarningCheck = 0;
const WARNING_CHECK_INTERVAL = 60000; // Check every 60 seconds

// === Advisor Avatars (Pixel Art Generated) ===
const ADVISOR_COLORS = {
  mayor: { skin: '#f4d4b8', hair: '#4a3728', suit: '#2c3e50', accent: '#e74c3c' },
  finance: { skin: '#e8c4a8', hair: '#6b6b6b', suit: '#1a252f', accent: '#f1c40f' },
  urban: { skin: '#f0d0b8', hair: '#8b4513', suit: '#27ae60', accent: '#3498db' },
  utilities: { skin: '#ddb896', hair: '#2c1810', suit: '#e67e22', accent: '#ecf0f1' },
  safety: { skin: '#d4a574', hair: '#1a1a1a', suit: '#34495e', accent: '#c0392b' },
  education: { skin: '#f5e0c8', hair: '#5c3317', suit: '#8e44ad', accent: '#f39c12' }
};

// Avatar paths - use static files if available, fall back to generated
const AVATAR_PATHS = {
  mayor: '/assets/advisors/mayor.png',
  finance: '/assets/advisors/finance.png',
  urban: '/assets/advisors/urban.png',
  utilities: '/assets/advisors/utilities.png',
  safety: '/assets/advisors/safety.png',
  education: '/assets/advisors/education.png'
};

// Pre-generated avatar data URLs (fallback, will be populated on init)
const avatarCache = {};

/**
 * Generate a pixel art avatar for an advisor
 */
function generateAdvisorAvatar(advisorId, size = 64) {
  const colors = ADVISOR_COLORS[advisorId];
  if (!colors) return null;
  
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  const px = size / 16; // Pixel size for 16x16 grid
  
  // Helper to draw a pixel
  const drawPx = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * px, y * px, px, px);
  };
  
  // Background (transparent)
  ctx.clearRect(0, 0, size, size);
  
  // Draw face shape (oval)
  const facePixels = [
    [6,3], [7,3], [8,3], [9,3],
    [5,4], [6,4], [7,4], [8,4], [9,4], [10,4],
    [4,5], [5,5], [6,5], [7,5], [8,5], [9,5], [10,5], [11,5],
    [4,6], [5,6], [6,6], [7,6], [8,6], [9,6], [10,6], [11,6],
    [4,7], [5,7], [6,7], [7,7], [8,7], [9,7], [10,7], [11,7],
    [4,8], [5,8], [6,8], [7,8], [8,8], [9,8], [10,8], [11,8],
    [5,9], [6,9], [7,9], [8,9], [9,9], [10,9],
    [6,10], [7,10], [8,10], [9,10],
  ];
  facePixels.forEach(([x, y]) => drawPx(x, y, colors.skin));
  
  // Hair (different styles per advisor)
  const hairStyles = {
    mayor: [[5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [4,3], [5,3], [10,3], [11,3], [4,4], [11,4]],
    finance: [[6,2], [7,2], [8,2], [9,2], [5,3], [10,3]], // Balding
    urban: [[5,1], [6,1], [7,1], [8,1], [9,1], [10,1], [4,2], [5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [11,2], [4,3], [5,3], [10,3], [11,3], [3,4], [4,4], [11,4], [12,4]],
    utilities: [[5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [4,3], [5,3], [10,3], [11,3], [4,4], [4,5], [11,4], [11,5]],
    safety: [[5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [5,3], [10,3]], // Military cut
    education: [[5,1], [6,1], [7,1], [8,1], [9,1], [10,1], [4,2], [5,2], [6,2], [7,2], [8,2], [9,2], [10,2], [11,2], [3,3], [4,3], [5,3], [10,3], [11,3], [12,3], [3,4], [12,4], [3,5], [12,5], [3,6], [12,6]]
  };
  (hairStyles[advisorId] || hairStyles.mayor).forEach(([x, y]) => drawPx(x, y, colors.hair));
  
  // Eyes
  drawPx(6, 6, '#2c3e50');
  drawPx(9, 6, '#2c3e50');
  // Eye whites
  drawPx(6, 5, '#ffffff');
  drawPx(9, 5, '#ffffff');
  
  // Eyebrows
  drawPx(5, 5, colors.hair);
  drawPx(6, 4, colors.hair);
  drawPx(9, 4, colors.hair);
  drawPx(10, 5, colors.hair);
  
  // Nose
  drawPx(7, 7, darkenColor(colors.skin, 20));
  drawPx(8, 7, darkenColor(colors.skin, 20));
  drawPx(7, 8, darkenColor(colors.skin, 30));
  
  // Mouth
  drawPx(7, 9, '#c0392b');
  drawPx(8, 9, '#c0392b');
  
  // Suit/collar
  const suitPixels = [
    [5,11], [6,11], [7,11], [8,11], [9,11], [10,11],
    [4,12], [5,12], [6,12], [7,12], [8,12], [9,12], [10,12], [11,12],
    [3,13], [4,13], [5,13], [6,13], [7,13], [8,13], [9,13], [10,13], [11,13], [12,13],
    [2,14], [3,14], [4,14], [5,14], [6,14], [7,14], [8,14], [9,14], [10,14], [11,14], [12,14], [13,14],
    [1,15], [2,15], [3,15], [4,15], [5,15], [6,15], [7,15], [8,15], [9,15], [10,15], [11,15], [12,15], [13,15], [14,15],
  ];
  suitPixels.forEach(([x, y]) => drawPx(x, y, colors.suit));
  
  // Tie/accent
  drawPx(7, 11, colors.accent);
  drawPx(8, 11, colors.accent);
  drawPx(7, 12, colors.accent);
  drawPx(8, 12, colors.accent);
  drawPx(7, 13, colors.accent);
  drawPx(8, 13, colors.accent);
  
  return canvas.toDataURL('image/png');
}

function darkenColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max((num >> 16) - amt, 0);
  const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
  const B = Math.max((num & 0x0000FF) - amt, 0);
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

/**
 * Initialize all advisor avatars (generate fallbacks)
 */
function initAvatars() {
  Object.keys(ADVISOR_COLORS).forEach(id => {
    // Generate fallback avatar in case static file doesn't load
    avatarCache[id] = generateAdvisorAvatar(id, 128);
  });
}

/**
 * Get avatar URL for an advisor (prefer static, fallback to generated)
 */
function getAvatarUrl(advisorId) {
  return AVATAR_PATHS[advisorId] || avatarCache[advisorId] || '';
}

// === Popup System ===

/**
 * Show an advisor popup
 */
export function showAdvisorPopup(popup) {
  if (!popup) return;
  
  // If a popup is currently showing, queue this one
  if (currentPopup) {
    popupQueue.push(popup);
    return;
  }
  
  currentPopup = popup;
  
  // Get or create popup container
  let container = document.getElementById('advisor-popup-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'advisor-popup-container';
    document.body.appendChild(container);
  }
  
  // Get avatar (prefer static file, fallback to generated)
  const avatarUrl = getAvatarUrl(popup.advisor) || popup.avatarUrl || '';
  
  // Severity colors
  const severityColors = {
    info: '#3498db',
    success: '#27ae60',
    warning: '#f39c12',
    danger: '#e74c3c'
  };
  const borderColor = severityColors[popup.severity] || severityColors.info;
  
  // Build tips HTML
  let tipsHtml = '';
  if (popup.tips && popup.tips.length > 0) {
    tipsHtml = `
      <div class="advisor-popup-tips">
        <strong>💡 Conseils :</strong>
        <ul>
          ${popup.tips.map(tip => `<li>${tip}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // Build actions HTML
  let actionsHtml = '';
  if (popup.actions && popup.actions.length > 0) {
    actionsHtml = popup.actions.map(action => `
      <button class="advisor-popup-btn ${action.primary ? 'primary' : 'secondary'}" 
              onclick="window.handleAdvisorAction('${action.action}')">
        ${action.label}
      </button>
    `).join('');
  }
  if (popup.dismissable !== false) {
    actionsHtml += `<button class="advisor-popup-btn secondary" onclick="window.closeAdvisorPopup()">Fermer</button>`;
  }
  
  container.innerHTML = `
    <div class="advisor-popup" style="border-color: ${borderColor}">
      <div class="advisor-popup-header" style="background: ${borderColor}">
        <img src="${avatarUrl}" alt="${popup.advisorName}" class="advisor-popup-avatar" />
        <div class="advisor-popup-info">
          <div class="advisor-popup-name">${popup.advisorName}</div>
          <div class="advisor-popup-title">${popup.advisorTitle}</div>
        </div>
      </div>
      <div class="advisor-popup-body">
        <h3 class="advisor-popup-headline">${popup.title}</h3>
        <div class="advisor-popup-message">${popup.message.replace(/\n/g, '<br>')}</div>
        ${tipsHtml}
      </div>
      <div class="advisor-popup-actions">
        ${actionsHtml}
      </div>
    </div>
  `;
  
  container.style.display = 'flex';
  
  // Animate in
  setTimeout(() => {
    container.querySelector('.advisor-popup').classList.add('visible');
  }, 10);
}

/**
 * Close the current popup
 */
export function closeAdvisorPopup() {
  const container = document.getElementById('advisor-popup-container');
  if (!container) return;
  
  const popup = container.querySelector('.advisor-popup');
  if (popup) {
    popup.classList.remove('visible');
  }
  
  setTimeout(() => {
    container.style.display = 'none';
    container.innerHTML = '';
    currentPopup = null;
    
    // Show next popup in queue
    if (popupQueue.length > 0) {
      const nextPopup = popupQueue.shift();
      showAdvisorPopup(nextPopup);
    }
  }, 300);
}

/**
 * Handle popup action buttons
 */
export function handleAdvisorAction(action) {
  switch (action) {
    case 'dismiss':
      closeAdvisorPopup();
      break;
    case 'open_tutorial':
      // TODO: Open tutorial
      closeAdvisorPopup();
      break;
    case 'open_budget':
      // TODO: Open budget panel
      closeAdvisorPopup();
      break;
    case 'build_power_plant':
      closeAdvisorPopup();
      // Select power plant in build menu
      window.dispatchEvent(new CustomEvent('select-building', { detail: 'power_plant' }));
      break;
    case 'build_water_tower':
      closeAdvisorPopup();
      window.dispatchEvent(new CustomEvent('select-building', { detail: 'water_tower' }));
      break;
    case 'build_police_station':
      closeAdvisorPopup();
      window.dispatchEvent(new CustomEvent('select-building', { detail: 'police_station' }));
      break;
    case 'zone_residential':
      closeAdvisorPopup();
      window.dispatchEvent(new CustomEvent('select-building', { detail: 'residential' }));
      break;
    case 'zone_commercial':
      closeAdvisorPopup();
      window.dispatchEvent(new CustomEvent('select-building', { detail: 'offices' }));
      break;
    case 'zone_industrial':
      closeAdvisorPopup();
      window.dispatchEvent(new CustomEvent('select-building', { detail: 'industrial' }));
      break;
    default:
      console.log('Unknown advisor action:', action);
      closeAdvisorPopup();
  }
}

// Make functions available globally
window.closeAdvisorPopup = closeAdvisorPopup;
window.handleAdvisorAction = handleAdvisorAction;

// === Welcome Popup ===

/**
 * Show welcome popup when city is created
 */
export async function showWelcomePopup() {
  try {
    const popup = await api.getAdvisorWelcome();
    if (popup && !popup.error) {
      showAdvisorPopup(popup);
    }
  } catch (e) {
    console.error('Failed to load welcome popup:', e);
  }
}

// === Warning Check System ===

/**
 * Check for warnings and show popup if needed
 */
export async function checkWarnings() {
  const now = Date.now();
  if (now - lastWarningCheck < WARNING_CHECK_INTERVAL) return;
  lastWarningCheck = now;
  
  try {
    const result = await api.getAdvisorWarnings();
    if (result && result.warnings && result.warnings.length > 0) {
      // Show the most severe warning
      const sorted = result.warnings.sort((a, b) => {
        const order = { danger: 0, warning: 1, info: 2, success: 3 };
        return (order[a.severity] || 3) - (order[b.severity] || 3);
      });
      showAdvisorPopup(sorted[0]);
    }
  } catch (e) {
    console.error('Failed to check warnings:', e);
  }
}

/**
 * Start periodic warning checks
 */
export function startWarningChecks() {
  if (warningCheckInterval) return;
  
  // Check immediately
  setTimeout(checkWarnings, 5000); // Wait 5s after init
  
  // Then check periodically
  warningCheckInterval = setInterval(checkWarnings, WARNING_CHECK_INTERVAL);
}

/**
 * Stop periodic warning checks
 */
export function stopWarningChecks() {
  if (warningCheckInterval) {
    clearInterval(warningCheckInterval);
    warningCheckInterval = null;
  }
}

// === Tip of the Day ===

/**
 * Show a random tip
 */
export async function showTipOfTheDay() {
  try {
    const popup = await api.getAdvisorTip();
    if (popup && !popup.error) {
      showAdvisorPopup(popup);
    }
  } catch (e) {
    console.error('Failed to load tip:', e);
  }
}

// === Original Advisor Panel (Enhanced) ===

export function initAdvisor() {
  // Generate avatars
  initAvatars();
  
  // Setup panel toggle
  const btn = document.getElementById('tb-advisor');
  if (btn) {
    btn.addEventListener('click', toggleAdvisor);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'a' || e.key === 'A') {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      toggleAdvisor();
    }
  });
  
  // Start warning checks
  startWarningChecks();
  
  // Inject popup styles
  injectPopupStyles();
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

window.closeAdvisor = closeAdvisor;

function renderAdvisor(data) {
  const content = document.getElementById('advisor-content');
  if (!content) return;

  let html = '';
  html += renderZoning(data.zoning);
  html += renderUtility('Power', data.power, 'unpowered');
  html += renderUtility('Water', data.water, 'noWater');
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
  const rPct = (z.current.residential * 100).toFixed(0);
  const oPct = (z.current.office * 100).toFixed(0);
  const iPct = (z.current.industrial * 100).toFixed(0);
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

// === Popup Styles ===

function injectPopupStyles() {
  if (document.getElementById('advisor-popup-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'advisor-popup-styles';
  style.textContent = `
    #advisor-popup-container {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(2px);
    }
    
    .advisor-popup {
      background: #1a1a2e;
      border-radius: 12px;
      border: 3px solid #3498db;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      transform: scale(0.9) translateY(20px);
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    
    .advisor-popup.visible {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    
    .advisor-popup-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 12px;
    }
    
    .advisor-popup-avatar {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      background: #0d0d1a;
    }
    
    .advisor-popup-info {
      flex: 1;
    }
    
    .advisor-popup-name {
      font-size: 18px;
      font-weight: bold;
      color: #fff;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
    }
    
    .advisor-popup-title {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .advisor-popup-body {
      padding: 16px 20px;
      background: #16213e;
    }
    
    .advisor-popup-headline {
      margin: 0 0 12px 0;
      font-size: 20px;
      color: #ecf0f1;
    }
    
    .advisor-popup-message {
      color: #bdc3c7;
      line-height: 1.6;
      font-size: 14px;
    }
    
    .advisor-popup-tips {
      margin-top: 16px;
      padding: 12px;
      background: rgba(52, 152, 219, 0.15);
      border-radius: 8px;
      border-left: 3px solid #3498db;
    }
    
    .advisor-popup-tips strong {
      color: #3498db;
      display: block;
      margin-bottom: 8px;
    }
    
    .advisor-popup-tips ul {
      margin: 0;
      padding-left: 20px;
      color: #95a5a6;
    }
    
    .advisor-popup-tips li {
      margin: 4px 0;
    }
    
    .advisor-popup-actions {
      display: flex;
      gap: 10px;
      padding: 16px 20px;
      background: #0f0f23;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    
    .advisor-popup-btn {
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .advisor-popup-btn.primary {
      background: #3498db;
      color: white;
    }
    
    .advisor-popup-btn.primary:hover {
      background: #2980b9;
      transform: translateY(-1px);
    }
    
    .advisor-popup-btn.secondary {
      background: #34495e;
      color: #ecf0f1;
    }
    
    .advisor-popup-btn.secondary:hover {
      background: #4a6278;
    }
    
    /* Severity-specific header colors */
    .advisor-popup[style*="border-color: #27ae60"] .advisor-popup-header { background: linear-gradient(135deg, #27ae60, #1e8449); }
    .advisor-popup[style*="border-color: #f39c12"] .advisor-popup-header { background: linear-gradient(135deg, #f39c12, #d68910); }
    .advisor-popup[style*="border-color: #e74c3c"] .advisor-popup-header { background: linear-gradient(135deg, #e74c3c, #c0392b); }
  `;
  document.head.appendChild(style);
}

// === Event Listeners ===

// Listen for city creation to show welcome popup
window.addEventListener('city-created', () => {
  setTimeout(showWelcomePopup, 1000);
});

// Export for use in other modules
export { avatarCache, generateAdvisorAvatar };
