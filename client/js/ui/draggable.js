// ============================================
// MOLTCITY - Draggable Panels
// ============================================

/**
 * Make an element draggable by its header
 * @param {HTMLElement} element - The panel element to make draggable
 * @param {HTMLElement} handle - The header element to use as drag handle
 */
export function makeDraggable(element, handle) {
  let isDragging = false;
  let startX, startY;
  let initialLeft, initialTop;

  // Ensure element has position for dragging
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'fixed';
  }

  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', startDrag);
  handle.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    // Don't drag if clicking on buttons
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

    isDragging = true;
    handle.style.cursor = 'grabbing';

    const rect = element.getBoundingClientRect();
    
    // Remove transform/bottom/right and use left/top positioning
    element.style.transform = 'none';
    element.style.left = rect.left + 'px';
    element.style.top = rect.top + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';

    if (e.type === 'mousedown') {
      startX = e.clientX;
      startY = e.clientY;
    } else {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    initialLeft = rect.left;
    initialTop = rect.top;

    // Bring to front
    element.style.zIndex = getHighestZIndex() + 1;

    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', stopDrag);

    e.preventDefault();
  }

  function drag(e) {
    if (!isDragging) return;

    let clientX, clientY;
    if (e.type === 'mousemove') {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    let newLeft = initialLeft + deltaX;
    let newTop = initialTop + deltaY;

    // Keep within viewport
    const rect = element.getBoundingClientRect();
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));

    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';

    e.preventDefault();
  }

  function stopDrag() {
    isDragging = false;
    handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('touchend', stopDrag);
  }
}

/**
 * Get the highest z-index of all draggable panels
 */
function getHighestZIndex() {
  const panels = document.querySelectorAll('.toolbar-popup, .panel, #leaderboard-panel, #election-panel');
  let highest = 9000;
  panels.forEach(p => {
    const z = parseInt(getComputedStyle(p).zIndex) || 0;
    if (z > highest) highest = z;
  });
  return highest;
}

/**
 * Wire up a panel by ID — use h3 as handle by default.
 */
function initPanel(id, handleSelector) {
  const el = document.getElementById(id);
  if (!el) return;
  const handle = el.querySelector(handleSelector || 'h3');
  if (handle) makeDraggable(el, handle);
}

/**
 * Initialize draggable panels (call after DOM is ready)
 */
export function initDraggablePanels() {
  // Fixed panels with h3 headers
  initPanel('advisor-panel');
  initPanel('building-info-panel');
  initPanel('admin-panel');
  initPanel('election-panel');

  // Leaderboard (header is built dynamically — use MutationObserver)
  const lb = document.getElementById('leaderboard-panel');
  if (lb) {
    const tryInit = () => {
      const header = lb.querySelector('.leaderboard-header');
      if (header && !header.dataset.draggable) {
        header.dataset.draggable = '1';
        makeDraggable(lb, header);
      }
    };
    tryInit();
    new MutationObserver(tryInit).observe(lb, { childList: true, subtree: true });
  }

  // Toolbar popups
  document.querySelectorAll('.toolbar-popup').forEach(popup => {
    const header = popup.querySelector('.popup-header');
    if (header) makeDraggable(popup, header);
  });
}
