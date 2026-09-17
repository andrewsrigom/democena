export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export const requiredRoles = ['hook', 'product', 'proof', 'close'];

export function assertFixture(fixture, project, directory) {
  if (fixture.id !== directory) throw new Error(`${directory}: fixture.id must match its directory`);
  for (const field of ['name', 'kicker', 'headline', 'description', 'accent', 'background', 'surface', 'foreground', 'muted', 'panelTitle', 'panelNote']) {
    if (typeof fixture[field] !== 'string' || fixture[field].length === 0) throw new Error(`${directory}: fixture.${field} is required`);
  }
  if (!Array.isArray(fixture.nav) || fixture.nav.length < 3) throw new Error(`${directory}: fixture.nav needs at least three items`);
  if (!Array.isArray(fixture.metrics) || fixture.metrics.length !== 3) throw new Error(`${directory}: fixture.metrics needs exactly three items`);
  if (!Array.isArray(fixture.rows) || fixture.rows.length < 3) throw new Error(`${directory}: fixture.rows needs at least three items`);
  const bounds = fixture.panelBounds;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw new Error(`${directory}: fixture.panelBounds is required`);
  if (project.version !== 2 || project.video !== `captures/${directory}.mp4`) throw new Error(`${directory}: project must be a version 2 portable benchmark`);
  const roles = project.scenes?.map((scene) => scene.id);
  if (JSON.stringify(roles) !== JSON.stringify(requiredRoles)) throw new Error(`${directory}: project scenes must be hook, product, proof, close in order`);
  if (project.scenes.some((scene) => scene.type !== 'text' && scene.type !== 'outro' && scene.source?.freeze !== true)) {
    throw new Error(`${directory}: baseline product evidence must use the generated deterministic still`);
  }
  if (JSON.stringify(project.scenes.find((scene) => scene.id === 'proof')?.focus) !== JSON.stringify(bounds)) {
    throw new Error(`${directory}: proof focus must match fixture.panelBounds`);
  }
}

export function applicationHtml(fixture) {
  const dark = fixture.mode === 'dark';
  const rows = fixture.rows.map((row, index) => `
    <div class="row">
      <span class="row-icon">${String(index + 1).padStart(2, '0')}</span>
      <span class="row-copy"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.detail)}</small></span>
      <span class="state">${escapeHtml(row.state)}</span>
    </div>`).join('');
  const metrics = fixture.metrics.map((metric) => `
    <div class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><i></i></div>`).join('');
  const nav = fixture.nav.map((item, index) => `<span class="${index === 0 ? 'active' : ''}">${escapeHtml(item)}</span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{--accent:${fixture.accent};--bg:${fixture.background};--surface:${fixture.surface};--fg:${fixture.foreground};--muted:${fixture.muted};--border:${dark ? '#ffffff1f' : '#17213a1c'}}
    *{box-sizing:border-box}html,body{margin:0;width:1280px;height:800px;overflow:hidden;background:var(--bg);color:var(--fg);font-family:Arial,sans-serif}
    body:before{content:"";position:absolute;inset:-260px -180px auto auto;width:650px;height:650px;border-radius:50%;background:radial-gradient(circle,var(--accent) 0,transparent 68%);opacity:${dark ? '.14' : '.08'}}
    header{height:84px;display:flex;align-items:center;padding:0 58px;border-bottom:1px solid var(--border);gap:44px;position:relative}
    .brand{display:flex;align-items:center;gap:12px;font-size:23px;font-weight:750;letter-spacing:-.04em}.mark{width:28px;height:28px;border:7px solid var(--accent);border-radius:9px 16px 9px 16px;transform:rotate(-8deg)}
    nav{display:flex;gap:30px;color:var(--muted);font-size:14px}nav span{padding:32px 0 26px}nav .active{color:var(--fg);border-bottom:3px solid var(--accent)}
    .avatar{margin-left:auto;width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,var(--accent),var(--surface));border:1px solid var(--border)}
    main{padding:54px 58px 52px;position:relative}.kicker{font-size:12px;font-weight:800;letter-spacing:.16em;color:var(--accent);margin-bottom:16px}.headline{font-size:42px;line-height:1.05;letter-spacing:-.045em;max-width:700px;margin:0}.description{font-size:17px;line-height:1.5;color:var(--muted);max-width:650px;margin:17px 0 34px}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;width:760px}.metric{height:118px;padding:19px 20px;background:var(--surface);border:1px solid var(--border);border-radius:18px;box-shadow:0 15px 45px ${dark ? '#00000025' : '#2440640c'};position:relative;overflow:hidden}.metric span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.metric strong{display:block;font-size:28px;margin-top:12px;letter-spacing:-.04em}.metric i{position:absolute;left:20px;right:20px;bottom:14px;height:3px;background:linear-gradient(90deg,var(--accent) 68%,var(--border) 68%);border-radius:4px}
    .list{width:760px;margin-top:18px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:8px 18px}.row{height:61px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--border)}.row:last-child{border:0}.row-icon{width:29px;height:29px;border-radius:9px;background:${dark ? '#ffffff0c' : '#17213a08'};display:grid;place-items:center;color:var(--muted);font-size:10px}.row-copy{display:flex;flex-direction:column;gap:5px}.row-copy strong{font-size:14px}.row-copy small{font-size:11px;color:var(--muted)}.state{margin-left:auto;color:var(--accent);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
    .panel{position:absolute;left:${fixture.panelBounds.x}px;top:${fixture.panelBounds.y - 84}px;width:${fixture.panelBounds.width}px;height:${fixture.panelBounds.height}px;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:25px;box-shadow:0 24px 80px ${dark ? '#00000038' : '#24406418'}}.panel-top{display:flex;justify-content:space-between;align-items:center;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.09em}.pulse{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 7px color-mix(in srgb,var(--accent) 15%,transparent)}.panel h2{font-size:25px;letter-spacing:-.04em;margin:28px 0 10px}.panel p{font-size:13px;line-height:1.45;color:var(--muted);margin:0}.bar{height:7px;border-radius:8px;background:var(--border);margin-top:24px;overflow:hidden}.bar:after{content:"";display:block;width:88%;height:100%;background:var(--accent);border-radius:8px}
  </style></head><body><header><div class="brand"><span class="mark"></span>${escapeHtml(fixture.name)}</div><nav>${nav}</nav><span class="avatar"></span></header><main>
    <div class="kicker">${escapeHtml(fixture.kicker)}</div><h1 class="headline">${escapeHtml(fixture.headline)}</h1><p class="description">${escapeHtml(fixture.description)}</p>
    <div class="metrics">${metrics}</div><div class="list">${rows}</div>
    <aside class="panel"><div class="panel-top"><span>Status</span><i class="pulse"></i></div><h2>${escapeHtml(fixture.panelTitle)}</h2><p>${escapeHtml(fixture.panelNote)}</p><div class="bar"></div></aside>
  </main></body></html>`;
}
