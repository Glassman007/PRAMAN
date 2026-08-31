/*
  Optional Layer 1 bridge.
  Include this once on the Layer 1 page:
    <script src="./layer2_unified_gis/layer1-integration.js"></script>

  It finds a control whose visible text contains "Unified GIS Map" and navigates
  to the Layer 2 screen. A direct <a href> is still preferred when you can edit
  the Layer 1 markup.
*/
(() => {
  const target = './layer2_unified_gis/index.html';
  const candidates = [...document.querySelectorAll('a, button, [role="button"]')];
  const control = candidates.find(el => /unified\s+gis\s+map/i.test(el.textContent || ''));
  if (!control) return;

  if (control.tagName === 'A') {
    control.setAttribute('href', target);
    return;
  }

  control.addEventListener('click', event => {
    event.preventDefault();
    window.location.href = target;
  });
})();
