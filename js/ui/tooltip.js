// ===== tooltip.js - Shared tooltip DOM primitives =====

export function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}
export function moveTooltip(e) {
  const tt = document.getElementById('tooltip');
  tt.style.left = (e.clientX + 14) + 'px';
  tt.style.top = (e.clientY + 14) + 'px';
}
export function attachTooltip(el, showFn) {
  el.addEventListener('mouseenter', showFn);
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('mousemove', moveTooltip);
}
