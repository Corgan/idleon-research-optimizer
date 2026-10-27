export const SITE_PAGES = [
  { href: 'combat-sim-calc.html', label: 'Combat Simulator', group: 'General', icon: '\u2694\uFE0F' },
  { href: 'statue-calc.html', label: 'Statue Calculator', group: 'General', icon: '\u{1F5FF}' },
  { href: 'shadow.html', label: 'Am I shadow banned?', group: 'General', icon: '?' },
  { href: 'endgame.html', label: 'Are you endgame?', group: 'General', icon: '?' },
  { href: 'fishing-calc.html', label: 'Fishing Calculator', group: 'World 2', icon: '\u{1F3A3}' },
  { href: 'killroy-calc.html', label: 'Killroy Calculator', group: 'World 2', icon: '\u{1F480}' },
  { href: 'cog-optimizer.html', label: 'Cog Board Optimizer', group: 'World 3', icon: '\u2699\uFE0F' },
  { href: 'worship-td-calc.html', label: 'Worship Tower Defense Simulator', group: 'World 3', icon: '\u{1F3F0}' },
  { href: 'ladle-calc.html', label: 'Ladle Optimizer', group: 'World 4', icon: '\u{1F944}' },
  { href: 'cooking-mastery-calc.html', label: 'Cooking Mastery', group: 'World 4', icon: '\u{1F373}' },
  { href: 'fountain-calc.html', label: 'Fountain Calculator', group: 'World 5', icon: '\u26F2' },
  { href: 'jar-calc.html', label: 'Jar Calculator', group: 'World 5', icon: '\u{1F3FA}' },
  { href: 'sailing-calc.html', label: 'Sailing Calculator', group: 'World 5', icon: '\u26F5' },
  { href: 'cglunko-calc.html', label: 'Cglunko Calculator', group: 'World 5', icon: '\u{1F48E}' },
  { href: 'coral-god-rank-calc.html', label: 'Coral God Rank Planner', group: 'World 5', icon: '\u{1F420}' },
  { href: 'monument-calc.html', label: 'Monument Calculator', group: 'World 5', icon: '\u{1F3DB}\uFE0F' },
  { href: 'opal-calc.html', label: 'Opal Optimizer', group: 'World 5', icon: '\u{1F48E}' },
  { href: 'sneaking-calc.html', label: 'Sneaking Optimizer', group: 'World 6', icon: '\u{1F977}' },
  { href: 'farming-calc.html', label: 'Farming Planner', group: 'World 6', icon: '\u{1F331}' },
  { href: 'clamworks-calc.html', label: 'Clamworks Calculator', group: 'World 7', icon: '\u{1F41A}' },
  { href: 'royal-guardian-calc.html', label: 'Royal Guardian Calculator', group: 'World 7', icon: '\u{1F451}' },
  { href: 'jelly-operator-calc.html', label: 'Jelly Operator Optimizer', group: 'World 7', icon: '\u{1F9EB}' },
  { href: 'research-optimizer-v2.html', label: 'Research Optimizer', group: 'World 7', icon: '\u{1F52C}' },
];

export function mountSiteNav() {
  if (document.getElementById('site-nav')) return;
  const host = document.createElement('div');
  host.id = 'site-nav';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{display:block;width:100%;flex-shrink:0;text-align:left;color:#eee;font:14px 'Segoe UI',system-ui,sans-serif}
      *{box-sizing:border-box}
      [hidden]{display:none!important}
      a,button,input{font:inherit}
      a{color:inherit;text-decoration:none}
      button{cursor:pointer}
      a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid #4dd0e1;outline-offset:2px}
      .bar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:#16213e;border-bottom:1px solid #33415b}
      .bar a,.bar button,.close{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:6px 10px;border:1px solid #52617d;border-radius:5px;background:#1a1a2e;color:#eee;line-height:1.25}
      .bar .nav-icon{flex:0 0 auto;font-size:16px;line-height:1}
      .bar a:hover,.bar button:hover,.close:hover{background:#0f3460;border-color:#4dd0e1}
      dialog{position:fixed;inset:0 auto 0 0;margin:0;width:min(340px,calc(100vw - 24px));max-width:none;height:100%;height:100dvh;max-height:none;padding:0;border:0;border-right:1px solid #52617d;background:#16213e;color:#eee;overflow:hidden}
      dialog::backdrop{background:rgb(0 0 0 / .6)}
      .drawer{display:flex;flex-direction:column;height:100%;min-height:0}
      .heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px}
      h2{font-size:18px;margin:0;color:#4dd0e1}
      .search{padding:0 16px 12px}
      label{display:block;margin-bottom:6px;color:#c0c0d4;font-size:13px}
      input{width:100%;padding:9px;border:1px solid #52617d;border-radius:5px;background:#1a1a2e;color:#eee}
      nav{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 12px 16px}
      nav a{display:flex;align-items:center;gap:10px;padding:10px;border-radius:5px;overflow-wrap:anywhere}
      .nav-icon{flex:0 0 24px;text-align:center;font-size:18px;line-height:1.3}
      .nav-label{min-width:0}
      nav a:hover{background:#0f3460}
      nav a[aria-current="page"]{background:#0f3460;color:#4dd0e1;box-shadow:inset 3px 0 #4dd0e1}
      h3{display:inline-block;margin:18px 10px 5px;padding:4px 8px;border-radius:4px;font-size:12px;letter-spacing:.04em}
      h3[data-world="General"]{background:#78909c44;color:#b0bec5}
      h3[data-world="World 2"]{background:#0288d144;color:#81d4fa}
      h3[data-world="World 3"]{background:#2e7d3244;color:#66bb6a}
      h3[data-world="World 4"]{background:#8e24aa44;color:#ce93d8}
      h3[data-world="World 5"]{background:#5c6bc044;color:#9fa8da}
      h3[data-world="World 6"]{background:#ef535044;color:#ef9a9a}
      h3[data-world="World 7"]{background:#ff980044;color:#ffcc80}
      .empty{margin:12px 10px;color:#c0c0d4}
    </style>
    <div class="bar">
      <button type="button" id="toggle" aria-haspopup="dialog" aria-controls="drawer" aria-expanded="false">&#9776; Explore</button>
      <a href="index.html" class="home"><span class="nav-icon" aria-hidden="true">&#8962;</span><span class="nav-label">Home</span></a>
    </div>
    <dialog id="drawer" aria-labelledby="nav-title">
      <div class="drawer">
        <div class="heading">
          <h2 id="nav-title">Calculators &amp; Optimizers</h2>
          <button type="button" class="close" aria-label="Close navigation">Close</button>
        </div>
        <div class="search">
          <label for="nav-search">Find a calculator</label>
          <input id="nav-search" type="search" autocomplete="off" autofocus>
        </div>
        <nav aria-label="Site navigation">
          <a href="index.html" class="home"><span class="nav-icon" aria-hidden="true">&#8962;</span><span class="nav-label">Home</span></a>
        </nav>
      </div>
    </dialog>`;

  const dialog = root.querySelector('dialog');
  const toggle = root.getElementById('toggle');
  const search = root.querySelector('input');
  const nav = root.querySelector('nav');
  const current = location.pathname.split('/').pop() || 'index.html';
  const groups = new Map();
  const entries = [];
  for (const page of SITE_PAGES) {
    if (!groups.has(page.group)) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = page.group;
      heading.dataset.world = page.group;
      section.appendChild(heading);
      nav.appendChild(section);
      groups.set(page.group, section);
    }
    const link = document.createElement('a');
    link.href = page.href;
    const icon = document.createElement('span');
    icon.className = 'nav-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = page.icon;
    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = page.label;
    link.append(icon, label);
    if (page.href === current) link.setAttribute('aria-current', 'page');
    groups.get(page.group).appendChild(link);
    entries.push({ link, text: `${page.label} ${page.group}`.toLowerCase() });
  }
  if (current === 'index.html') {
    for (const home of root.querySelectorAll('.home')) home.setAttribute('aria-current', 'page');
  }
  const empty = document.createElement('p');
  empty.className = 'empty';
  empty.textContent = 'No matching calculators.';
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  nav.appendChild(empty);

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let matches = 0;
    for (const entry of entries) {
      entry.link.hidden = !entry.text.includes(query);
      if (!entry.link.hidden) matches++;
    }
    for (const section of groups.values()) {
      section.hidden = ![...section.querySelectorAll('a')].some(link => !link.hidden);
    }
    empty.hidden = matches !== 0;
  });
  toggle.addEventListener('click', () => {
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  });
  root.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    // Search inputs otherwise consume Escape before the native dialog can close.
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus({ preventScroll: true });
  });
  document.body.prepend(host);
}

if (typeof document !== 'undefined') mountSiteNav();
