
// nav-enhancements.js — set aria-current/data-active on section chips
(function(){
  const nav = document.getElementById('sectionNav');
  if (!nav) return;

  function setActiveChip(chip){
    if (!chip) return;
    nav.querySelectorAll('.chip').forEach(c => {
      c.removeAttribute('aria-current');
      if (c.dataset) delete c.dataset.active;
    });
    chip.setAttribute('aria-current', 'true');
    chip.dataset.active = 'true';
  }

  // Delegated click: when user switches section, reflect active state
  nav.addEventListener('click', function(e){
    const chip = e.target.closest('.chip');
    if (!chip) return;
    // Let the app's own handler run first, then mark active
    requestAnimationFrame(() => setActiveChip(chip));
  }, true);

  // When nav content is (re)rendered by app, ensure one chip is marked active
  const obs = new MutationObserver(() => {
    const already = nav.querySelector('.chip[aria-current="true"]');
    const first = nav.querySelector('.chip');
    if (!already && first) setActiveChip(first);
  });
  obs.observe(nav, { childList: true, subtree: true });

  // Initialize once in case chips are already there
  const initChip = nav.querySelector('.chip[aria-current="true"]') || nav.querySelector('.chip');
  if (initChip) setActiveChip(initChip);
})();


// === Chip order override (2025-11-07) ===
(function(){
  const DESIRED = ['bldg','staging','fire','water','electric','gas','elevators','hazmat','ems','other'];
  const nav = document.getElementById('sectionNav');
  if (!nav) return;

  function normalizeKey(el){
    const d = el.dataset || {};
    if (d.color) return d.color.toLowerCase();
    if (d.id) return d.id.toLowerCase();
    return (el.textContent || '').trim().toLowerCase();
  }

  function indexFor(el){
    const key = normalizeKey(el);
    const i = DESIRED.indexOf(key);
    return i >= 0 ? i : (DESIRED.length + 1); // unknowns go to the end
  }

  function reorder(){
    const chips = Array.from(nav.querySelectorAll('.chip'));
    if (chips.length <= 1) return;
    const frag = document.createDocumentFragment();
    chips.sort((a,b)=> indexFor(a) - indexFor(b)).forEach(ch => frag.appendChild(ch));
    nav.appendChild(frag);
  }

  reorder();
  const obs = new MutationObserver(reorder);
  obs.observe(nav, { childList: true });
})();

