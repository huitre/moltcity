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
    
    // Remove transform and use left/top positioning
    element.style.transform = 'none';
    element.style.left = rect.left + 'px';
    element.style.top = rect.top + 'px';
    element.style.right = 'auto';

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
 * Get the highest z-index of all panels
 */
function getHighestZIndex() {
  const panels = document.querySelectorAll('.toolbar-popup, #advisor-panel, #activity-panel');
  let highest = 9000;
  panels.forEach(p => {
    const z = parseInt(getComputedStyle(p).zIndex) || 0;
    if (z > highest) highest = z;
  });
  return highest;
}

/**
 * Initialize draggable panels
 */
export function initDraggablePanels() {
  // Advisor panel
  const advisorPanel = document.getElementById('advisor-panel');
  if (advisorPanel) {
    const advisorHeader = advisorPanel.querySelector('h3');
    if (advisorHeader) makeDraggable(advisorPanel, advisorHeader);
  }

  // Activity panel
  const activityPanel = document.getElementById('activity-panel');
  if (activityPanel) {
    const activityHeader = activityPanel.querySelector('h3');
    if (activityHeader) makeDraggable(activityPanel, activityHeader);
  }

  // Toolbar popups
  document.querySelectorAll('.toolbar-popup').forEach(popup => {
    const header = popup.querySelector('.popup-header');
    if (header) makeDraggable(popup, header);
  });
}
