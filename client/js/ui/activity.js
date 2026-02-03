// ============================================
// MOLTCITY - Activity Feed UI
// ============================================

import { API_URL } from '../config.js';
import * as state from '../state.js';

/**
 * Load recent activities from the server
 */
export async function loadActivities() {
  try {
    const res = await fetch(`${API_URL}/api/activities?limit=20`);
    const data = await res.json();
    state.activitiesLoaded.length = 0;
    state.activitiesLoaded.push(...(data.activities || []));
    renderActivities();
  } catch (error) {
    console.error('Failed to load activities:', error);
  }
}

/**
 * Render activities in the activity feed container
 */
export function renderActivities() {
  const container = document.getElementById('activity-list');
  if (!container) return;

  container.innerHTML = state.activitiesLoaded.map(activity => `
    <div class="activity-item ${activity.type}">
      <div class="activity-message">${activity.message}</div>
      <div class="activity-time">${formatTimeAgo(activity.createdAt)}</div>
    </div>
  `).join('');
}

/**
 * Add a new activity to the feed (from WebSocket)
 */
export function addActivity(activity) {
  state.activitiesLoaded.unshift(activity);
  if (state.activitiesLoaded.length > 20) {
    state.activitiesLoaded.pop();
  }
  renderActivities();
}

/**
 * Format a date as relative time ago
 */
export function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
