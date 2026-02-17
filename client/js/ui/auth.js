// ============================================
// MOLTCITY - Authentication UI
// ============================================

import { API_URL } from '../config.js';
import * as state from '../state.js';

let onAuthSuccessCallback = null;

/**
 * Set callback to run after successful authentication
 */
export function setOnAuthSuccess(callback) {
  onAuthSuccessCallback = callback;
}

/**
 * Check if user is authenticated
 */
export async function checkAuth() {
  const token = state.currentToken;
  if (!token) {
    showAuthModal();
    return false;
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      state.setCurrentUser(data.user);
      // Update balance display immediately from auth response
      if (data.balance !== undefined) {
        const balanceDisplay = document.getElementById("balance-display");
        if (balanceDisplay) balanceDisplay.textContent = `$${data.balance.toLocaleString()}`;
      }
      hideAuthModal();
      showUserInfo();
      if (onAuthSuccessCallback) {
        await onAuthSuccessCallback();
      }
      return true;
    } else {
      localStorage.removeItem("agentcity_token");
      state.setCurrentToken(null);
      showAuthModal();
      return false;
    }
  } catch (e) {
    console.error("Auth check failed:", e);
    showAuthModal();
    return false;
  }
}

/**
 * Show authentication modal
 */
export function showAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.style.display = "flex";
}

/**
 * Hide authentication modal
 */
export function hideAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.style.display = "none";
}

/**
 * Show authentication error message
 */
export function showAuthError(message) {
  const errorEl = document.getElementById("auth-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }
}

/**
 * Hide authentication error message
 */
export function hideAuthError() {
  const errorEl = document.getElementById("auth-error");
  if (errorEl) errorEl.classList.remove("visible");
}

/**
 * Show user info display
 */
export function showUserInfo() {
  const { currentUser } = state;
  if (currentUser) {
    const nameDisplay = document.getElementById("user-name-display");
    if (nameDisplay) nameDisplay.textContent = currentUser.name || currentUser.email;
    const userInfo = document.getElementById("user-info");
    if (userInfo) userInfo.style.display = "flex";

    // Show admin-only build options for admins and city mayors
    const isMayor = state.cityData && state.cityData.mayor === currentUser.id;
    if (currentUser.role === "admin" || isMayor) {
      document.body.classList.add("is-admin");
    } else {
      document.body.classList.remove("is-admin");
    }
  }
}

/**
 * Handle logout
 */
export async function handleLogout() {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.currentToken}` },
    });
  } catch (e) {
    // Ignore logout errors
  }

  localStorage.removeItem("agentcity_token");
  state.setCurrentToken(null);
  state.setCurrentUser(null);
  document.body.classList.remove("is-admin");
  const userInfo = document.getElementById("user-info");
  if (userInfo) userInfo.style.display = "none";
  showAuthModal();
}

/**
 * Handle Google login redirect
 */
export function handleGoogleLogin() {
  window.location.href = `${API_URL}/auth/google`;
}

/**
 * Handle login form submission
 */
export async function handleLogin(e) {
  e.preventDefault();
  hideAuthError();

  const email = document.getElementById("login-email")?.value;
  const password = document.getElementById("login-password")?.value;

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed");
    }

    state.setCurrentToken(data.token);
    localStorage.setItem("agentcity_token", data.token);
    await checkAuth();
  } catch (error) {
    showAuthError(error.message);
  }
}

/**
 * Handle signup form submission
 */
export async function handleSignup(e) {
  e.preventDefault();
  hideAuthError();

  const name = document.getElementById("signup-name")?.value;
  const email = document.getElementById("signup-email")?.value;
  const password = document.getElementById("signup-password")?.value;

  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Registration failed");
    }

    state.setCurrentToken(data.token);
    localStorage.setItem("agentcity_token", data.token);
    await checkAuth();
  } catch (error) {
    showAuthError(error.message);
  }
}

/**
 * Get current agent ID (user's linked agentId, userId, or wallet address)
 */
export function getCurrentAgentId() {
  const { currentUser, walletAddress } = state;
  if (currentUser?.agentId) return currentUser.agentId;
  if (currentUser?.id) return currentUser.id;
  if (walletAddress) return walletAddress;
  return "system";
}

/**
 * Setup authentication UI event listeners
 */
export function setupAuthUI() {
  // Check for stored token
  const storedToken = localStorage.getItem("agentcity_token");
  if (storedToken) {
    state.setCurrentToken(storedToken);
  }

  // Check for token in URL (from OAuth callback)
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get("token");
  if (tokenFromUrl) {
    state.setCurrentToken(tokenFromUrl);
    localStorage.setItem("agentcity_token", tokenFromUrl);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Tab switching
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.dataset.tab;

      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
      document.getElementById(`${targetTab}-form`)?.classList.add("active");

      hideAuthError();
    });
  });

  // Google login
  document.getElementById("google-login-btn")?.addEventListener("click", handleGoogleLogin);

  // Login form
  document.getElementById("login-form")?.addEventListener("submit", handleLogin);

  // Signup form
  document.getElementById("signup-form")?.addEventListener("submit", handleSignup);

  // Toggle between login and register
  document.getElementById("show-register-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    const loginForm = document.getElementById("login-form");
    const humanFormP = document.querySelector("#human-form > p");
    const registerForm = document.getElementById("register-form");
    if (loginForm) loginForm.style.display = "none";
    if (humanFormP) humanFormP.style.display = "none";
    if (registerForm) registerForm.classList.add("active");
    hideAuthError();
  });

  document.getElementById("show-login-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    const registerForm = document.getElementById("register-form");
    const loginForm = document.getElementById("login-form");
    const humanFormP = document.querySelector("#human-form > p");
    if (registerForm) registerForm.classList.remove("active");
    if (loginForm) loginForm.style.display = "block";
    if (humanFormP) humanFormP.style.display = "block";
    hideAuthError();
  });

  // Logout
  document.getElementById("btn-logout")?.addEventListener("click", handleLogout);
}
