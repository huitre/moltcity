// ============================================
// MOLTCITY - Election System UI
// ============================================

import { API_URL } from '../config.js';
import * as state from '../state.js';

// Track if user has voted in current election
let hasVotedInCurrentElection = false;
let isLoading = false;

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.getElementById('election-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'election-toast';
  toast.className = `election-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Load election status from the server
 */
export async function loadElectionStatus() {
  try {
    const res = await fetch(`${API_URL}/api/election`, {
      headers: state.currentToken ? { 'Authorization': `Bearer ${state.currentToken}` } : {},
    });
    const data = await res.json();
    state.setCurrentElection(data.election);
    state.setElectionCandidates(data.candidates || []);
    state.setCurrentMayor(data.currentMayor);
    hasVotedInCurrentElection = data.hasVoted || false;
    renderElectionUI();
    renderMayorBanner();
  } catch (error) {
    console.error('Failed to load election status:', error);
  }
}

/**
 * Render the mayor banner
 */
export function renderMayorBanner() {
  const banner = document.getElementById('mayor-banner');
  const nameEl = document.getElementById('mayor-name');

  if (state.currentMayor) {
    if (nameEl) nameEl.textContent = state.currentMayor.name;
    if (banner) banner.style.display = 'block';
  } else {
    if (banner) banner.style.display = 'none';
  }
}

/**
 * Render the election UI panel
 */
export function renderElectionUI() {
  const panel = document.getElementById('election-panel');
  const phaseBadge = document.getElementById('election-phase-badge');
  const timeRemaining = document.getElementById('election-time-remaining');
  const candidateList = document.getElementById('candidate-list');
  const runBtn = document.getElementById('btn-run-for-mayor');

  const { currentElection, electionCandidates, currentUser } = state;

  if (!currentElection) {
    if (panel) panel.style.display = 'none';
    return;
  }

  if (panel) panel.style.display = 'block';

  // Phase badge
  if (phaseBadge) {
    phaseBadge.className = `phase-badge ${currentElection.status}`;
    phaseBadge.textContent = currentElection.status === 'nomination' ? 'Nomination Phase' : 'Voting Phase';
  }

  // Time remaining
  if (timeRemaining) {
    const endTime = currentElection.status === 'nomination'
      ? new Date(new Date(currentElection.nominationStart).getTime() + 72 * 60 * 60 * 1000)
      : (currentElection.votingEnd ? new Date(currentElection.votingEnd) : null);

    if (endTime) {
      const remaining = endTime - new Date();
      if (remaining > 0) {
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        timeRemaining.textContent = `${hours}h ${minutes}m remaining`;
      } else {
        timeRemaining.textContent = 'Ending soon...';
      }
    } else {
      timeRemaining.textContent = '';
    }
  }

  // Candidates list
  if (candidateList) {
    const isVotingPhase = currentElection.status === 'voting';
    const canVote = isVotingPhase && currentUser && !hasVotedInCurrentElection;

    candidateList.innerHTML = electionCandidates.map(candidate => `
      <div class="candidate-item">
        <div>
          <div class="candidate-name">${candidate.userName || 'Unknown'}</div>
          ${candidate.platform ? `<div class="candidate-platform">${candidate.platform}</div>` : ''}
        </div>
        ${isVotingPhase
          ? canVote
            ? `<button class="vote-btn" data-candidate-id="${candidate.id}">Vote</button>`
            : `<span class="vote-count">${hasVotedInCurrentElection ? 'Voted' : `${candidate.voteCount || 0} votes`}</span>`
          : `<span class="vote-count">${candidate.voteCount || 0} votes</span>`
        }
      </div>
    `).join('') || '<div style="color: #666; text-align: center; padding: 10px;">No candidates yet</div>';

    // Add vote button listeners
    candidateList.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => voteForCandidate(btn.dataset.candidateId));
    });
  }

  // Run button (only in nomination phase)
  if (runBtn) {
    const isAlreadyCandidate = currentUser && electionCandidates.some(c => c.userId === currentUser.userId);
    if (currentElection.status === 'nomination' && currentUser && !isAlreadyCandidate) {
      runBtn.style.display = 'inline-block';
    } else {
      runBtn.style.display = 'none';
    }
  }
}

/**
 * Show run for mayor modal
 */
export function runForMayor() {
  const modal = document.getElementById('run-for-mayor-modal');
  const overlay = document.getElementById('modal-overlay');
  if (modal) modal.style.display = 'block';
  if (overlay) overlay.style.display = 'block';
}

/**
 * Submit candidacy
 */
export async function submitCandidacy() {
  if (isLoading) return;

  const platformInput = document.getElementById('campaign-platform');
  const submitBtn = document.getElementById('btn-submit-candidacy');
  const platform = platformInput?.value.trim();

  isLoading = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
  }

  try {
    const res = await fetch(`${API_URL}/api/election/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.currentToken}`,
      },
      body: JSON.stringify({ platform: platform || undefined }),
    });

    if (!res.ok) {
      const error = await res.json();
      showToast(error.error || error.message || 'Failed to register as candidate', 'error');
      return;
    }

    // Close modal
    const modal = document.getElementById('run-for-mayor-modal');
    const overlay = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    if (platformInput) platformInput.value = '';

    showToast('You are now a candidate for Mayor!', 'success');
    await loadElectionStatus();
  } catch (error) {
    console.error('Failed to run for mayor:', error);
    showToast('Failed to register as candidate', 'error');
  } finally {
    isLoading = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register';
    }
  }
}

/**
 * Vote for a candidate
 */
export async function voteForCandidate(candidateId) {
  if (isLoading) return;

  if (!state.currentToken) {
    showToast('You must be logged in to vote', 'error');
    return;
  }

  if (hasVotedInCurrentElection) {
    showToast('You have already voted in this election', 'error');
    return;
  }

  // Find candidate name for confirmation
  const candidate = state.electionCandidates.find(c => c.id === candidateId);
  const candidateName = candidate?.userName || 'this candidate';

  if (!confirm(`Vote for ${candidateName}? You can only vote once per election.`)) {
    return;
  }

  // Find and disable the button
  const btn = document.querySelector(`.vote-btn[data-candidate-id="${candidateId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Voting...';
  }

  isLoading = true;

  try {
    const res = await fetch(`${API_URL}/api/election/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.currentToken}`,
      },
      body: JSON.stringify({ candidateId }),
    });

    if (!res.ok) {
      const error = await res.json();
      showToast(error.error || error.message || 'Failed to vote', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Vote';
      }
      return;
    }

    hasVotedInCurrentElection = true;
    showToast(`Your vote for ${candidateName} has been cast!`, 'success');
    await loadElectionStatus();
  } catch (error) {
    console.error('Failed to vote:', error);
    showToast('Failed to vote', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Vote';
    }
  } finally {
    isLoading = false;
  }
}

/**
 * Setup election UI event listeners
 */
export function setupElectionUI() {
  // Run for mayor button
  document.getElementById('btn-run-for-mayor')?.addEventListener('click', runForMayor);

  // Submit candidacy
  document.getElementById('btn-submit-candidacy')?.addEventListener('click', submitCandidacy);

  // Cancel candidacy modal
  document.getElementById('btn-cancel-candidacy')?.addEventListener('click', () => {
    const modal = document.getElementById('run-for-mayor-modal');
    const overlay = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  });
}
