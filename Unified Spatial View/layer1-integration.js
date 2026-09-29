/*
  Optional Layer 1 bridge.
  Include this once on the Layer 1 page when its markup cannot be edited directly.
  A direct <a href=".../Unified Spatial View/index.html"> remains preferred.

  The production destination is this package's index.html. The city mode is the
  default, so no transitional route or legacy map page is required.
*/
(() => {
  const script = document.currentScript;
  if (!script) return;
  const target = new URL('./index.html', script.src).href;
  const matches = el => /unified\s+(?:spatial\s+view|gis\s+map)/i.test(el?.textContent || '');

  function normalizeControls(root = document) {
    for (const el of root.querySelectorAll?.('a, button, [role="button"]') || []) {
      if (matches(el) && el.tagName === 'A') el.setAttribute('href', target);
    }
  }

  normalizeControls();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => normalizeControls(), {once:true});

  // Capture the activation so legacy Layer 1 click handlers cannot send the user
  // through an obsolete intermediate map. This also covers controls added later.
  document.addEventListener('click', event => {
    const control = event.target.closest?.('a, button, [role="button"]');
    if (!matches(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(target);
  }, true);
})();
