export const SITE_PAGES = [
  { href: 'stats-all.html', label: 'All Stats Dashboard', group: 'General' },
  { href: 'damage-calc.html', label: 'Damage Breakdown', group: 'General' },
  { href: 'drop-rate-calc.html', label: 'Drop Rate Calculator', group: 'General' },
  { href: 'coin-multi-calc.html', label: 'Coin Multiplier Calculator', group: 'General' },
  { href: 'statue-calc.html', label: 'Statue Calculator', group: 'General' },
  { href: 'pickle-calc.html', label: 'BoneJoePickle Calculator', group: 'General' },
  { href: 'shadow.html', label: 'Am I shadow banned?', group: 'General' },
  { href: 'endgame.html', label: 'Are you endgame?', group: 'General' },
  { href: 'fishing-calc.html', label: 'Fishing Calculator', group: 'World 2' },
  { href: 'cog-optimizer.html', label: 'Cog Board Optimizer', group: 'World 3' },
  { href: 'worship-td-calc.html', label: 'Worship Tower Defense', group: 'World 3' },
  { href: 'ladle-calc.html', label: 'Ladle Optimizer', group: 'World 4' },
  { href: 'cooking-mastery-calc.html', label: 'Cooking Mastery', group: 'World 4' },
  { href: 'fountain-calc.html', label: 'Fountain Calculator', group: 'World 5' },
  { href: 'jar-calc.html', label: 'Jar Calculator', group: 'World 5' },
  { href: 'sailing-calc.html', label: 'Sailing Calculator', group: 'World 5' },
  { href: 'cglunko-calc.html', label: 'Cglunko Calculator', group: 'World 5' },
  { href: 'coral-god-rank-calc.html', label: 'Coral God Rank Planner', group: 'World 5' },
  { href: 'monument-calc.html', label: 'Monument Calculator', group: 'World 5' },
  { href: 'opal-calc.html', label: 'Opal Optimizer', group: 'World 5' },
  { href: 'sneaking-calc.html', label: 'Sneaking Optimizer', group: 'World 6' },
  { href: 'farming-calc.html', label: 'Farming Planner', group: 'World 6' },
  { href: 'clamworks-calc.html', label: 'Clamworks Calculator', group: 'World 7' },
  { href: 'royal-guardian-calc.html', label: 'Royal Guardian Calculator', group: 'World 7' },
  { href: 'jelly-operator-calc.html', label: 'Jelly Operator Optimizer', group: 'World 7' },
  { href: 'research-optimizer-v2.html', label: 'Research Optimizer', group: 'World 7' },
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
      .bar a,.bar button,.close{padding:6px 10px;border:1px solid #52617d;border-radius:5px;background:#1a1a2e;color:#eee}
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
      nav a{display:block;padding:10px;border-radius:5px;overflow-wrap:anywhere}
      nav a:hover{background:#0f3460}
      nav a[aria-current="page"]{background:#0f3460;color:#4dd0e1;box-shadow:inset 3px 0 #4dd0e1}
      h3{margin:18px 10px 5px;font-size:12px;color:#c0c0d4;text-transform:uppercase;letter-spacing:.08em}
      .empty{margin:12px 10px;color:#c0c0d4}
    </style>
    <div class="bar">
      <button type="button" id="toggle" aria-haspopup="dialog" aria-controls="drawer" aria-expanded="false">&#9776; Explore</button>
      <a href="index.html" class="home">Home</a>
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
          <a href="index.html" class="home">Home</a>
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
      section.appendChild(heading);
      nav.appendChild(section);
      groups.set(page.group, section);
    }
    const link = document.createElement('a');
    link.href = page.href;
    link.textContent = page.label;
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
