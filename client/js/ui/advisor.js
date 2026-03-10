// ============================================
// MOLTCITY - City Advisor Panel & Popup System
// SimCity 2000 Style Advisors
// ============================================

import * as api from "../api.js";
import { makeDraggable } from "./draggable.js";

let advisorOpen = false;
let popupQueue = [];
let currentPopup = null;
let warningCheckInterval = null;
let lastWarningCheck = 0;
const WARNING_CHECK_INTERVAL = 60000; // Check every 60 seconds

// === Advisor Avatars (Pixel Art Generated) ===
const ADVISOR_COLORS = {
  mayor: {
    skin: "#f4d4b8",
    hair: "#4a3728",
    suit: "#2c3e50",
    accent: "#e74c3c",
  },
  finance: {
    skin: "#e8c4a8",
    hair: "#6b6b6b",
    suit: "#1a252f",
    accent: "#f1c40f",
  },
  urban: {
    skin: "#f0d0b8",
    hair: "#8b4513",
    suit: "#27ae60",
    accent: "#3498db",
  },
  utilities: {
    skin: "#ddb896",
    hair: "#2c1810",
    suit: "#e67e22",
    accent: "#ecf0f1",
  },
  safety: {
    skin: "#d4a574",
    hair: "#1a1a1a",
    suit: "#34495e",
    accent: "#c0392b",
  },
  education: {
    skin: "#f5e0c8",
    hair: "#5c3317",
    suit: "#8e44ad",
    accent: "#f39c12",
  },
};

// Avatar paths - use static files if available, fall back to generated
const AVATAR_PATHS = {
  mayor: "/client/assets/advisors/mayor.png",
  finance: "/client/assets/advisors/finance.png",
  urban: "/client/assets/advisors/urban.png",
  utilities: "/client/assets/advisors/utilities.png",
  safety: "/client/assets/advisors/safety.png",
  education: "/client/assets/advisors/education.png",
};

// Pre-generated avatar data URLs (fallback, will be populated on init)
const avatarCache = {};

/**
 * Generate a pixel art avatar for an advisor
 */
function generateAdvisorAvatar(advisorId, size = 64) {
  const colors = ADVISOR_COLORS[advisorId];
  if (!colors) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

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
    [6, 3],
    [7, 3],
    [8, 3],
    [9, 3],
    [5, 4],
    [6, 4],
    [7, 4],
    [8, 4],
    [9, 4],
    [10, 4],
    [4, 5],
    [5, 5],
    [6, 5],
    [7, 5],
    [8, 5],
    [9, 5],
    [10, 5],
    [11, 5],
    [4, 6],
    [5, 6],
    [6, 6],
    [7, 6],
    [8, 6],
    [9, 6],
    [10, 6],
    [11, 6],
    [4, 7],
    [5, 7],
    [6, 7],
    [7, 7],
    [8, 7],
    [9, 7],
    [10, 7],
    [11, 7],
    [4, 8],
    [5, 8],
    [6, 8],
    [7, 8],
    [8, 8],
    [9, 8],
    [10, 8],
    [11, 8],
    [5, 9],
    [6, 9],
    [7, 9],
    [8, 9],
    [9, 9],
    [10, 9],
    [6, 10],
    [7, 10],
    [8, 10],
    [9, 10],
  ];
  facePixels.forEach(([x, y]) => drawPx(x, y, colors.skin));

  // Hair (different styles per advisor)
  const hairStyles = {
    mayor: [
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
      [4, 3],
      [5, 3],
      [10, 3],
      [11, 3],
      [4, 4],
      [11, 4],
    ],
    finance: [
      [6, 2],
      [7, 2],
      [8, 2],
      [9, 2],
      [5, 3],
      [10, 3],
    ], // Balding
    urban: [
      [5, 1],
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
      [10, 1],
      [4, 2],
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
      [11, 2],
      [4, 3],
      [5, 3],
      [10, 3],
      [11, 3],
      [3, 4],
      [4, 4],
      [11, 4],
      [12, 4],
    ],
    utilities: [
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
      [4, 3],
      [5, 3],
      [10, 3],
      [11, 3],
      [4, 4],
      [4, 5],
      [11, 4],
      [11, 5],
    ],
    safety: [
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
      [5, 3],
      [10, 3],
    ], // Military cut
    education: [
      [5, 1],
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
      [10, 1],
      [4, 2],
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [9, 2],
      [10, 2],
      [11, 2],
      [3, 3],
      [4, 3],
      [5, 3],
      [10, 3],
      [11, 3],
      [12, 3],
      [3, 4],
      [12, 4],
      [3, 5],
      [12, 5],
      [3, 6],
      [12, 6],
    ],
  };
  (hairStyles[advisorId] || hairStyles.mayor).forEach(([x, y]) =>
    drawPx(x, y, colors.hair),
  );

  // Eyes
  drawPx(6, 6, "#2c3e50");
  drawPx(9, 6, "#2c3e50");
  // Eye whites
  drawPx(6, 5, "#ffffff");
  drawPx(9, 5, "#ffffff");

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
  drawPx(7, 9, "#c0392b");
  drawPx(8, 9, "#c0392b");

  // Suit/collar
  const suitPixels = [
    [5, 11],
    [6, 11],
    [7, 11],
    [8, 11],
    [9, 11],
    [10, 11],
    [4, 12],
    [5, 12],
    [6, 12],
    [7, 12],
    [8, 12],
    [9, 12],
    [10, 12],
    [11, 12],
    [3, 13],
    [4, 13],
    [5, 13],
    [6, 13],
    [7, 13],
    [8, 13],
    [9, 13],
    [10, 13],
    [11, 13],
    [12, 13],
    [2, 14],
    [3, 14],
    [4, 14],
    [5, 14],
    [6, 14],
    [7, 14],
    [8, 14],
    [9, 14],
    [10, 14],
    [11, 14],
    [12, 14],
    [13, 14],
    [1, 15],
    [2, 15],
    [3, 15],
    [4, 15],
    [5, 15],
    [6, 15],
    [7, 15],
    [8, 15],
    [9, 15],
    [10, 15],
    [11, 15],
    [12, 15],
    [13, 15],
    [14, 15],
  ];
  suitPixels.forEach(([x, y]) => drawPx(x, y, colors.suit));

  // Tie/accent
  drawPx(7, 11, colors.accent);
  drawPx(8, 11, colors.accent);
  drawPx(7, 12, colors.accent);
  drawPx(8, 12, colors.accent);
  drawPx(7, 13, colors.accent);
  drawPx(8, 13, colors.accent);

  return canvas.toDataURL("image/png");
}

function darkenColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max((num >> 16) - amt, 0);
  const G = Math.max(((num >> 8) & 0x00ff) - amt, 0);
  const B = Math.max((num & 0x0000ff) - amt, 0);
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

/**
 * Initialize all advisor avatars (generate fallbacks)
 */
function initAvatars() {
  Object.keys(ADVISOR_COLORS).forEach((id) => {
    // Generate fallback avatar in case static file doesn't load
    avatarCache[id] = generateAdvisorAvatar(id, 128);
  });
}

/**
 * Get avatar URL for an advisor (prefer static, fallback to generated)
 */
function getAvatarUrl(advisorId) {
  return AVATAR_PATHS[advisorId] || avatarCache[advisorId] || "";
}

// === Popup System ===

/**
 * Show an advisor popup
 */
export function showAdvisorPopup(popup) {
  if (!popup) return;

  // Don't stack duplicate popups (same advisor + same title)
  if (currentPopup && currentPopup.advisor === popup.advisor && currentPopup.title === popup.title) return;
  if (popupQueue.some((p) => p.advisor === popup.advisor && p.title === popup.title)) return;

  // If a popup is currently showing, queue this one
  if (currentPopup) {
    popupQueue.push(popup);
    return;
  }

  currentPopup = popup;

  // Get or create popup container
  let container = document.getElementById("advisor-popup-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "advisor-popup-container";
    document.body.appendChild(container);
  }

  // Get avatar (prefer static file, fallback to generated)
  const avatarUrl = getAvatarUrl(popup.advisor) || popup.avatarUrl || "";

  // Severity colors
  const severityColors = {
    info: "#3498db",
    success: "#27ae60",
    warning: "#f39c12",
    danger: "#e74c3c",
  };
  const borderColor = severityColors[popup.severity] || severityColors.info;

  // Build tips HTML
  let tipsHtml = "";
  if (popup.tips && popup.tips.length > 0) {
    tipsHtml = `
      <div class="advisor-popup-tips">
        <strong>💡 Tips:</strong>
        <ul>
          ${popup.tips.map((tip) => `<li>${tip}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  // Build actions HTML
  let actionsHtml = "";
  if (popup.actions && popup.actions.length > 0) {
    actionsHtml = popup.actions
      .map(
        (action) => `
      <button class="advisor-popup-btn ${action.primary ? "primary" : "secondary"}"
              onclick="window.handleAdvisorAction('${action.action}')">
        ${action.label}
      </button>
    `,
      )
      .join("");
  }
  if (popup.dismissable !== false) {
    actionsHtml += `<button class="advisor-popup-btn secondary" onclick="window.closeAdvisorPopup()">Close</button>`;
  }

  container.innerHTML = `
    <div class="advisor-popup" style="--popup-accent: ${borderColor}">
      <div class="advisor-portrait">
        <img src="${avatarUrl}" alt="${popup.advisorName}"
             onerror="this.parentElement.style.display='none'" />
      </div>
      <div class="advisor-dialog-wrap">
        <div class="advisor-nameplate">
          <div class="advisor-nameplate-inner">
            <span class="advisor-nameplate-name">${popup.advisorName}</span>
            <span class="advisor-nameplate-role">${popup.advisorTitle}</span>
          </div>
        </div>
        <div class="advisor-dialog">
          <div class="advisor-dialog-content">
            <h3 class="advisor-dialog-headline">${popup.title}</h3>
            <div class="advisor-dialog-message">${popup.message.replace(/\n/g, "<br>")}</div>
            ${tipsHtml}
          </div>
          <div class="advisor-dialog-actions">
            ${actionsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  container.style.display = "block";

  // Make popup draggable by nameplate
  const popupEl = container.querySelector(".advisor-popup");
  const handleEl = container.querySelector(".advisor-nameplate");
  if (popupEl && handleEl) {
    makeDraggable(popupEl, handleEl);
  }

  // Animate in
  setTimeout(() => {
    popupEl.classList.add("visible");
  }, 10);
}

/**
 * Close the current popup
 */
export function closeAdvisorPopup() {
  const container = document.getElementById("advisor-popup-container");
  if (!container) return;

  const popup = container.querySelector(".advisor-popup");
  if (popup) {
    popup.classList.remove("visible");
  }

  setTimeout(() => {
    container.style.display = "none";
    container.innerHTML = "";
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
    case "dismiss":
      closeAdvisorPopup();
      break;
    case "open_tutorial":
      // TODO: Open tutorial
      closeAdvisorPopup();
      break;
    case "open_budget":
      // TODO: Open budget panel
      closeAdvisorPopup();
      break;
    case "build_power_plant":
      closeAdvisorPopup();
      // Select power plant in build menu
      window.dispatchEvent(
        new CustomEvent("select-building", { detail: "power_plant" }),
      );
      break;
    case "build_water_tower":
      closeAdvisorPopup();
      window.dispatchEvent(
        new CustomEvent("select-building", { detail: "water_tower" }),
      );
      break;
    case "build_police_station":
      closeAdvisorPopup();
      window.dispatchEvent(
        new CustomEvent("select-building", { detail: "police_station" }),
      );
      break;
    case "zone_residential":
      closeAdvisorPopup();
      window.dispatchEvent(
        new CustomEvent("select-building", { detail: "residential" }),
      );
      break;
    case "zone_commercial":
      closeAdvisorPopup();
      window.dispatchEvent(
        new CustomEvent("select-building", { detail: "offices" }),
      );
      break;
    case "zone_industrial":
      closeAdvisorPopup();
      window.dispatchEvent(
        new CustomEvent("select-building", { detail: "industrial" }),
      );
      break;
    default:
      console.log("Unknown advisor action:", action);
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
    console.error("Failed to load welcome popup:", e);
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
      // Show all warnings, most severe first
      const sorted = result.warnings.sort((a, b) => {
        const order = { danger: 0, warning: 1, info: 2, success: 3 };
        return (order[a.severity] || 3) - (order[b.severity] || 3);
      });
      for (const warning of sorted) {
        showAdvisorPopup(warning);
      }
    }
  } catch (e) {
    console.error("Failed to check warnings:", e);
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
    console.error("Failed to load tip:", e);
  }
}

// === Original Advisor Panel (Enhanced) ===

export function initAdvisor() {
  // Generate avatars
  initAvatars();

  // Setup panel toggle
  const btn = document.getElementById("tb-advisor");
  if (btn) {
    btn.addEventListener("click", toggleAdvisor);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "a" || e.key === "A") {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.tagName === "SELECT"
      )
        return;
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
  const panel = document.getElementById("advisor-panel");
  if (!panel) return;

  panel.style.display = "block";
  advisorOpen = true;

  const content = document.getElementById("advisor-content");
  if (content)
    content.innerHTML =
      '<div style="text-align:center;padding:20px;color:#999">Loading...</div>';

  try {
    const data = await api.getAdvisor();
    if (data.error) {
      if (content)
        content.innerHTML = `<div style="color:#e74c3c">${data.error}</div>`;
      return;
    }
    renderAdvisor(data);
  } catch (e) {
    if (content)
      content.innerHTML = `<div style="color:#e74c3c">Failed to load advisor data</div>`;
  }
}

function closeAdvisor() {
  const panel = document.getElementById("advisor-panel");
  if (panel) panel.style.display = "none";
  advisorOpen = false;
}

window.closeAdvisor = closeAdvisor;

function renderAdvisor(data) {
  const content = document.getElementById("advisor-content");
  if (!content) return;

  let html = "";
  html += renderZoning(data.zoning);
  html += renderUtility("Power", data.power, "unpowered");
  html += renderUtility("Water", data.water, "noWater");
  html += renderTaxes(data.taxes);

  content.innerHTML = html;
}

function severity(ratio, hasProblem) {
  if (hasProblem) return "critical";
  if (ratio >= 1.2) return "ok";
  if (ratio >= 1.0) return "warning";
  return "critical";
}

function severityDot(level) {
  const colors = { ok: "#2ecc71", warning: "#f39c12", critical: "#e74c3c" };
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors[level] || colors.ok};margin-right:6px"></span>`;
}

function renderZoning(z) {
  const level = z.recommendation ? "warning" : "ok";
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
        <span>Ratio: ${u.ratio === Infinity ? "n/a" : u.ratio + "x"}</span>
      </div>
      ${problemCount > 0 ? `<div class="advisor-warning">${problemCount} building${problemCount > 1 ? "s" : ""} without ${name.toLowerCase()}</div>` : ""}
      ${u.message ? `<div class="advisor-message ${level}">${u.message}</div>` : '<div class="advisor-message ok">All good</div>'}
    </div>
  `;
}

function renderTaxes(t) {
  const level = t.warnings.length > 0 ? "critical" : "ok";

  let warningsHtml = "";
  if (t.warnings.length > 0) {
    warningsHtml = t.warnings
      .map(
        (w) => `
      <div class="advisor-tax-warning">
        <strong>${w.zone}</strong> tax at ${w.rate}% (threshold: ${w.threshold}%)
        <div class="advisor-tax-effect">${w.effect}</div>
      </div>
    `,
      )
      .join("");
  } else {
    warningsHtml =
      '<div class="advisor-message ok">Tax rates are within safe limits</div>';
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
  if (document.getElementById("advisor-popup-styles")) return;

  const style = document.createElement("style");
  style.id = "advisor-popup-styles";
  style.textContent = `
    /* === Persona-style Advisor Dialog === */

    #advisor-popup-container {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      z-index: 10000;
      pointer-events: none;
    }

    .advisor-popup {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      align-items: flex-end;
      gap: 0;
      transform: translateY(60px);
      opacity: 0;
      transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
      pointer-events: auto;
    }

    .advisor-popup.visible {
      transform: translateY(0);
      opacity: 1;
    }

    /* --- Portrait (left side, overlapping) --- */

    .advisor-portrait {
      flex-shrink: 0;
      z-index: 2;
      margin-right: -20px;
      display: flex;
      align-items: flex-end;
      position: relative;
      bottom: -3px;
    }

    .advisor-portrait img {
      width: 180px;
      height: auto;
      max-height: 280px;
      object-fit: contain;
      object-position: bottom;
      filter: drop-shadow(3px 4px 8px rgba(0, 0, 0, 0.7));
    }

    /* --- Dialog wrapper (right side) --- */

    .advisor-dialog-wrap {
      flex: 1;
      position: relative;
      min-width: 0;
    }

    /* --- Nameplate (angular tab above dialog) --- */

    .advisor-nameplate {
      display: inline-block;
      margin-bottom: -2px;
      margin-left: 8px;
      position: relative;
      z-index: 3;
      cursor: grab;
    }

    .advisor-nameplate:active {
      cursor: grabbing;
    }

    .advisor-nameplate-inner {
      background: var(--popup-accent, #3b82f6);
      padding: 7px 28px 7px 14px;
      clip-path: polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .advisor-nameplate-name {
      font-family: "Press Start 2P", monospace;
      font-size: 11px;
      color: #fff;
      text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
      white-space: nowrap;
    }

    .advisor-nameplate-role {
      font-family: "Press Start 2P", monospace;
      font-size: 6px;
      color: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* --- Dialog box --- */

    .advisor-dialog {
      background: linear-gradient(
        180deg,
        rgba(12, 18, 52, 0.94) 0%,
        rgba(8, 12, 38, 0.97) 100%
      );
      border: 2px solid rgba(80, 120, 220, 0.35);
      border-top: 2px solid var(--popup-accent, #3b82f6);
      position: relative;
      overflow: hidden;
    }

    /* Left accent bar */
    .advisor-dialog::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: linear-gradient(
        180deg,
        var(--popup-accent, #3b82f6) 0%,
        transparent 100%
      );
    }

    /* Bottom-right angular accent */
    .advisor-dialog::after {
      content: '';
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 40px;
      height: 24px;
      background: var(--popup-accent, #3b82f6);
      clip-path: polygon(100% 0, 100% 100%, 0 100%);
      opacity: 0.7;
    }

    /* Subtle scanline overlay */
    .advisor-dialog-content::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.03) 2px,
        rgba(0, 0, 0, 0.03) 4px
      );
      pointer-events: none;
      z-index: 1;
    }

    .advisor-dialog-content {
      padding: 18px 24px 10px;
      position: relative;
    }

    .advisor-dialog-headline {
      font-family: "Press Start 2P", monospace;
      font-size: 11px;
      color: #fff;
      margin: 0 0 14px;
      text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.6);
    }

    .advisor-dialog-message {
      font-family: "Press Start 2P", monospace;
      font-size: 9px;
      color: #c0cce0;
      line-height: 2.2;
    }

    /* --- Tips section --- */

    .advisor-popup-tips {
      margin-top: 14px;
      padding: 10px 14px;
      background: rgba(80, 120, 220, 0.08);
      border-left: 3px solid var(--popup-accent, #3b82f6);
    }

    .advisor-popup-tips strong {
      font-family: "Press Start 2P", monospace;
      font-size: 8px;
      color: var(--popup-accent, #3b82f6);
      display: block;
      margin-bottom: 8px;
    }

    .advisor-popup-tips ul {
      margin: 0;
      padding-left: 16px;
      color: #7a88a8;
      font-family: "Press Start 2P", monospace;
      font-size: 7px;
      line-height: 2.2;
    }

    .advisor-popup-tips li {
      margin: 2px 0;
    }

    /* --- Action buttons --- */

    .advisor-dialog-actions {
      display: flex;
      gap: 8px;
      padding: 8px 24px 14px;
      justify-content: flex-end;
      flex-wrap: wrap;
      position: relative;
      z-index: 2;
    }

    .advisor-popup-btn {
      font-family: "Press Start 2P", monospace;
      padding: 8px 16px;
      font-size: 8px;
      border: 2px solid;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }

    .advisor-popup-btn.primary {
      background: var(--popup-accent, #3b82f6);
      color: #fff;
      border-color: var(--popup-accent, #3b82f6);
      box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
    }

    .advisor-popup-btn.primary:hover {
      filter: brightness(1.25);
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
    }

    .advisor-popup-btn.secondary {
      background: rgba(255, 255, 255, 0.04);
      color: #7a88a8;
      border-color: rgba(255, 255, 255, 0.12);
    }

    .advisor-popup-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #c0cce0;
      border-color: rgba(255, 255, 255, 0.25);
    }

    /* --- Glow pulse on dialog border --- */

    @keyframes advisor-glow {
      0%, 100% { border-color: rgba(80, 120, 220, 0.35); }
      50% { border-color: rgba(80, 120, 220, 0.55); }
    }

    .advisor-popup.visible .advisor-dialog {
      animation: advisor-glow 3s ease-in-out infinite;
      animation-delay: 0.4s;
    }

    /* --- Responsive --- */

    @media (max-width: 640px) {
      .advisor-popup {
        bottom: 10px;
        left: 10px;
        right: 10px;
      }

      .advisor-portrait {
        margin-right: -12px;
      }

      .advisor-portrait img {
        width: 100px;
        max-height: 160px;
      }

      .advisor-nameplate-name {
        font-size: 9px;
      }

      .advisor-dialog-headline {
        font-size: 9px;
      }

      .advisor-dialog-message {
        font-size: 8px;
      }

      .advisor-dialog-content {
        padding: 14px 16px 8px;
      }

      .advisor-dialog-actions {
        padding: 6px 16px 12px;
      }
    }

    @media (max-width: 400px) {
      .advisor-portrait {
        display: none;
      }

      .advisor-popup {
        bottom: 8px;
        left: 8px;
        right: 8px;
      }
    }
  `;
  document.head.appendChild(style);
}

// === Event Listeners ===

// Listen for city creation to show welcome popup
window.addEventListener("city-created", () => {
  setTimeout(showWelcomePopup, 1000);
});

// Export for use in other modules
export { avatarCache, generateAdvisorAvatar };
