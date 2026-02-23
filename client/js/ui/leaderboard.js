// ============================================
// MOLTCITY - Leaderboard UI
// ============================================

import { API_URL } from '../config.js';
import * as state from '../state.js';

let leaderboardVisible = false;

/**
 * Fetch leaderboard data from API
 */
export async function fetchLeaderboard(sort = 'netWorth', limit = 10) {
  try {
    const res = await fetch(`${API_URL}/api/leaderboard?sort=${sort}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch leaderboard');
    return await res.json();
  } catch (e) {
    console.error('[Leaderboard] Error:', e);
    return null;
  }
}

/**
 * Format currency display
 */
function formatMoney(amount) {
  amount = Math.ceil(amount);
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Render leaderboard HTML
 */
export function renderLeaderboard(data) {
  if (!data || !data.leaderboard) return '';

  const { leaderboard, totals, sortBy } = data;

  const rows = leaderboard.map(entry => `
    <tr class="${entry.id === state.currentUser?.agentId ? 'current-user' : ''}">
      <td class="rank">${entry.rank}</td>
      <td class="name">
        ${entry.avatar ? `<img src="${entry.avatar}" class="avatar" />` : '<span class="avatar-placeholder">🤖</span>'}
        ${entry.name}
      </td>
      <td class="net-worth">${formatMoney(entry.netWorth)}</td>
      <td class="buildings">${entry.buildingCount}</td>
      <td class="population">${entry.populationCount}</td>
    </tr>
  `).join('');

  return `
    <div class="leaderboard-header">
      <h3>🏆 Leaderboard</h3>
      <div class="leaderboard-tabs">
        <button class="lb-tab ${sortBy === 'netWorth' ? 'active' : ''}" data-sort="netWorth">Net Worth</button>
        <button class="lb-tab ${sortBy === 'buildings' ? 'active' : ''}" data-sort="buildings">Buildings</button>
        <button class="lb-tab ${sortBy === 'population' ? 'active' : ''}" data-sort="population">Population</button>
      </div>
    </div>
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Net Worth</th>
          <th>🏠</th>
          <th>👥</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="leaderboard-footer">
      <span>${totals.totalPlayers} players</span>
      <span>${totals.totalBuildings} buildings</span>
      <span>${totals.totalPopulation} citizens</span>
    </div>
  `;
}

/**
 * Toggle leaderboard panel visibility
 */
export async function toggleLeaderboard() {
  const panel = document.getElementById('leaderboard-panel');
  if (!panel) return;

  leaderboardVisible = !leaderboardVisible;

  if (leaderboardVisible) {
    panel.style.display = 'block';
    await refreshLeaderboard();
  } else {
    panel.style.display = 'none';
  }
}

/**
 * Refresh leaderboard data
 */
export async function refreshLeaderboard(sort = 'netWorth') {
  const panel = document.getElementById('leaderboard-panel');
  const content = document.getElementById('leaderboard-content');
  if (!panel || !content) return;

  content.innerHTML = '<div class="loading">Loading...</div>';

  const data = await fetchLeaderboard(sort, 10);
  if (data) {
    content.innerHTML = renderLeaderboard(data);
    setupLeaderboardTabs();
  } else {
    content.innerHTML = '<div class="error">Failed to load leaderboard</div>';
  }
}

/**
 * Setup tab click handlers
 */
function setupLeaderboardTabs() {
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const sort = tab.dataset.sort;
      await refreshLeaderboard(sort);
    });
  });
}

/**
 * Setup leaderboard UI
 */
export function setupLeaderboard() {
  const btn = document.getElementById('btn-leaderboard');
  if (btn) {
    btn.addEventListener('click', toggleLeaderboard);
  }
}
