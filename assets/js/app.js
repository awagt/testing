/* app.js — shell, router, permission-aware navigation and shared UI helpers */
const App = (() => {
  const state = { user: null, perms: [], lookups: null, route: null, modules: [] };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const can = p => state.perms.includes(p);
  const canAny = list => list.some(can);
  const icons = () => window.lucide && lucide.createIcons();
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- module registry ---------- */
  // { id, title, icon, group, perms:[any of], render(el, params), phase? }
  function register(m) { state.modules.push(m); }
  const visibleModules = () => state.modules.filter(m => !m.perms || canAny(m.perms));

  function buildNav() {
    const groups = {};
    visibleModules().filter(m => !m.hidden).forEach(m => (groups[m.group] = groups[m.group] || []).push(m));
    $('#nav').innerHTML = Object.entries(groups).map(([g, ms]) => `<div class="nav-label">${esc(g)}</div>` +
      ms.map(m => `<a href="#/${m.id}" data-id="${m.id}" title="${esc(m.title)}"><i data-lucide="${m.icon}"></i><span>${esc(m.title)}</span>${m.phase ? `<span class="soon">P${m.phase}</span>` : ''}</a>`).join('')).join('');
    icons();
  }

  function route() {
    const [id, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    const mods = visibleModules();
    const m = mods.find(x => x.id === id) || mods.find(x => !x.hidden);
    if (!m) { $('#view').innerHTML = '<div class="empty">No modules are available for your role.</div>'; return; }
    if (m.id !== id) { history.replaceState(null, '', '#/' + m.id); }
    state.route = m;
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.id === m.id));
    $('#crumb').textContent = m.title;
    document.title = m.title + ' · Driver Hub';
    $('#shell').classList.remove('nav-open');
    closeDrawer();
    const view = $('#view');
    view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
    view.innerHTML = '';
    try { m.render(view, rest.map(decodeURIComponent)); } catch (e) { console.error(e); view.innerHTML = `<div class="callout warn">${esc(e.message)}</div>`; }
    icons();
  }

  /* ---------- lifecycle ---------- */
  async function start() {
    bindShell();
    if (!/^https:\/\/|^http:\/\/localhost/.test(API.url())) { showLogin(); $('#login-error').classList.remove('hidden'); $('#login-error').textContent = 'Setup needed: add your Apps Script Web App URL to assets/js/config.js'; return; }
    const ok = await Auth.restore();
    ok ? enter() : showLogin();
  }
  function showLogin() { $('#shell').classList.add('hidden'); $('#login').classList.remove('hidden'); icons(); setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) $('#lg-user').focus(); }, 50); }

  async function enter() {
    $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden');
    $('#me-name').textContent = state.user.name;
    $('#me-role').textContent = roleLabel(state.user.role);
    $('#me-avatar').textContent = state.user.name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    try { localStorage.getItem('idh.collapsed') === '1' && $('#shell').classList.add('collapsed'); } catch (e) {}
    buildNav();
    try { state.lookups = await API.call('bootstrap'); } catch (e) { toast(e.message, 'err'); state.lookups = { locations: [], drivers: [], catalogue: [] }; }
    window.addEventListener('hashchange', route);
    route();
    if (state.mustChangePIN) Auth.changePinModal(true);
  }

  async function refreshLookups() { try { state.lookups = await API.call('bootstrap'); } catch (e) {} }

  function bindShell() {
    $('#nav-toggle').onclick = () => $('#shell').classList.toggle('nav-open');
    $('#collapse-toggle').onclick = () => { const c = $('#shell').classList.toggle('collapsed'); try { localStorage.setItem('idh.collapsed', c ? '1' : '0'); } catch (e) {} };
    $('#theme-btn').onclick = () => {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t; try { localStorage.setItem('idh.theme', t); } catch (e) {}
      if (state.route) route();
    };
    $('#refresh-btn').onclick = () => { refreshLookups(); route(); };
    $('#overlay').onclick = () => { closeDrawer(); closeModal(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); else closeDrawer(); } });
  }

  /* ---------- formatting ---------- */
  const ROLE_LABELS = { SUPER_ADMIN: 'Super Admin', OPS_ADMIN: 'Operations Admin', REQUESTER: 'Requester', DRIVER: 'Driver', RECEIVER: 'Receiver', FINANCE: 'Finance / CS', VIEWER: 'Viewer' };
  const roleLabel = r => ROLE_LABELS[r] || r;
  const dtf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const df = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDT = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? esc(v) : dtf.format(d).replace(',', ''); };
  const fmtD = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? esc(v) : df.format(d); };
  const fmtMin = m => { if (m === null || m === undefined || isNaN(m)) return '—'; m = Math.round(m); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); if (h < 48) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm'; return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'; };
  const ago = v => { if (!v) return ''; const m = (Date.now() - new Date(v)) / 60000; return fmtMin(m) + ' ago'; };
  const STATUS_TONE = { 'NEW': 'b-gray', 'ASSIGNED': 'b-blue', 'ACCEPTED': 'b-blue', 'DRIVER ON THE WAY': 'b-amber', 'ARRIVED AT PICKUP': 'b-amber', 'COLLECTED': 'b-violet',
    'IN TRANSIT': 'b-violet', 'ARRIVED AT DESTINATION': 'b-violet', 'DELIVERED / RECEIVED': 'b-amber', 'COMPLETED': 'b-green', 'CANCELLED': 'b-gray', 'FAILED / EXCEPTION': 'b-red' };
  const statusBadge = s => `<span class="badge ${STATUS_TONE[s] || 'b-gray'}">${esc(s === 'DELIVERED / RECEIVED' ? 'DELIVERED' : s)}</span>`;
  const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  /* ---------- toast ---------- */
  function toast(msg, kind = 'ok', ms = 3600) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = `<i data-lucide="${kind === 'err' ? 'alert-circle' : 'check-circle-2'}"></i><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el); icons();
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, ms);
  }

  /* ---------- overlay / drawer / modal ---------- */
  // Overlay is visible exactly when a drawer or modal is open.
  function syncOverlay() {
    const o = $('#overlay'), on = $('#drawer').classList.contains('show') || $('#modal').classList.contains('show');
    if (on) { o.classList.remove('hidden'); requestAnimationFrame(() => o.classList.add('show')); }
    else { o.classList.remove('show'); setTimeout(() => { if (!$('#drawer').classList.contains('show') && !$('#modal').classList.contains('show')) o.classList.add('hidden'); }, 200); }
  }
  function openDrawer(html) { const d = $('#drawer'); d.innerHTML = html; d.classList.add('show'); d.setAttribute('aria-hidden', 'false'); syncOverlay(); icons(); return d; }
  function closeDrawer() { const d = $('#drawer'); if (!d.classList.contains('show')) return; d.classList.remove('show'); d.setAttribute('aria-hidden', 'true'); syncOverlay(); }
  let modalLocked = false, modalGen = 0;
  function openModal({ title, sub = '', body = '', actions = [], locked = false, wide = false }) {
    const m = $('#modal');
    modalGen++;
    modalLocked = locked;
    m.style.width = wide ? 'min(720px, calc(100vw - 24px))' : '';
    m.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="modal-body">${body}</div>
      <div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}" type="button">${a.icon ? `<i data-lucide="${a.icon}"></i>` : ''}${esc(a.label)}</button>`).join('')}</div>`;
    m.classList.remove('hidden'); m.classList.add('show'); syncOverlay(); icons();
    $$('.modal-foot .btn', m).forEach(b => b.onclick = async () => {
      const a = actions[+b.dataset.i];
      if (!a.onClick) return closeModal(true);
      const res = await withBusy(b, () => a.onClick(m));
      if (res !== false) closeModal(true);
    });
    const first = $('input,select,textarea', m); if (first) setTimeout(() => { if (!m.contains(document.activeElement)) first.focus(); }, 60);
    return m;
  }
  function closeModal(force) {
    if (modalLocked && !force) return;
    const m = $('#modal'), gen = modalGen; m.classList.remove('show'); setTimeout(() => { if (gen === modalGen) m.classList.add('hidden'); }, 180);
    syncOverlay();
  }
  function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
    return new Promise(res => openModal({ title, sub: esc(text), actions: [
      { label: 'Cancel', onClick: () => res(false) }, { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => res(true) }] }));
  }
  function showSecret(title, intro, username, pin) {
    openModal({ title, sub: intro, body: `<div class="field"><label>Username</label><div class="input mono" style="display:flex;align-items:center">${esc(username)}</div></div>
      <div class="field"><label>Temporary PIN</label><div class="secret-box">${esc(pin)}</div><div class="hint">Shown only once. The user must change it at first sign-in.</div></div>`,
      actions: [{ label: 'Copy', icon: 'copy', onClick: () => { navigator.clipboard && navigator.clipboard.writeText(`Username: ${username}\nPIN: ${pin}`); toast('Copied'); return false; } },
                { label: 'Done', cls: 'btn-primary' }], locked: true });
  }

  /** Disable a button and show a spinner while an async task runs. Prevents double submission. */
  async function withBusy(btn, fn) {
    if (btn.dataset.busy) return false;
    btn.dataset.busy = '1'; const html = btn.innerHTML; btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>' + (btn.textContent.trim() ? 'Working…' : '');
    try { return await fn(); }
    catch (e) { toast(e.message, 'err', 5000); return false; }
    finally { delete btn.dataset.busy; btn.disabled = false; btn.innerHTML = html; icons(); }
  }

  /* ---------- skeletons / empty ---------- */
  const skelKpis = n => `<div class="kpis">${'<div class="sk sk-kpi"></div>'.repeat(n)}</div>`;
  const skelRows = n => `<div class="card-body">${Array.from({ length: n }, (_, i) => `<div class="sk sk-line" style="width:${70 + (i * 13) % 30}%"></div>`).join('')}</div>`;
  const empty = (msg, icon = 'inbox') => `<div class="empty"><i data-lucide="${icon}"></i><div>${esc(msg)}</div></div>`;

  /* ---------- searchable combobox ---------- */
  // options: [{value, label, sub}] ; returns {get, set}
  function combo(input, options, onChange) {
    const wrap = document.createElement('div'); wrap.className = 'combo';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    input.setAttribute('autocomplete', 'off');
    const list = document.createElement('div'); list.className = 'combo-list hidden'; wrap.appendChild(list);
    let value = '', active = -1, shown = [];
    const render = () => {
      const q = input.value.toLowerCase().trim();
      shown = options.filter(o => !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q)).slice(0, 50);
      list.innerHTML = shown.length ? shown.map((o, i) => `<div class="combo-opt ${i === active ? 'active' : ''}" data-i="${i}"><span>${esc(o.label)}</span><small>${esc(o.sub || '')}</small></div>`).join('') : '<div class="combo-empty">No matches</div>';
      list.classList.remove('hidden');
    };
    const pick = o => { value = o ? o.value : ''; input.value = o ? o.label : ''; input.classList.remove('invalid'); list.classList.add('hidden'); onChange && onChange(value, o); };
    input.addEventListener('focus', () => { active = -1; render(); });
    input.addEventListener('input', () => { value = ''; active = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, shown.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (shown[active]) { pick(shown[active]); e.preventDefault(); } }
      else if (e.key === 'Escape') list.classList.add('hidden');
    });
    list.addEventListener('mousedown', e => { const el = e.target.closest('.combo-opt'); if (el) { e.preventDefault(); pick(shown[+el.dataset.i]); } });
    input.addEventListener('blur', () => setTimeout(() => { list.classList.add('hidden'); if (!value) { const exact = options.find(o => o.label.toLowerCase() === input.value.toLowerCase().trim()); exact ? pick(exact) : (input.value = ''); } }, 120));
    return { get: () => value, set: v => pick(options.find(o => o.value === v)), setOptions: o => { options = o; } };
  }

  /* ---------- forms ---------- */
  function formData(root) {
    const o = {};
    $$('[name]', root).forEach(el => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.dataset.value !== undefined ? el.dataset.value : el.value.trim();
    });
    return o;
  }
  const field = (label, inner, { req, hint, cls = '' } = {}) => `<div class="field ${cls}"><label>${esc(label)}${req ? '<span class="req">*</span>' : ''}</label>${inner}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
  const opts = (list, sel) => list.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

  function csv(rows, cols, filename) {
    const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = [cols.map(c => q(c.label)).join(',')].concat(rows.map(r => cols.map(c => q(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function placeholder(el, { icon, title, text, phase }) {
    el.innerHTML = `<div class="card placeholder"><div class="ic"><i data-lucide="${icon}"></i></div><h2>${esc(title)}</h2>
      <p class="muted" style="max-width:520px;margin:8px auto 0">${esc(text)}</p><div style="margin-top:14px"><span class="badge b-blue plain">Arrives in Phase ${phase}</span></div></div>`;
  }

  return { state, $, $$, esc, can, canAny, icons, debounce, register, start, enter, showLogin, route, refreshLookups, roleLabel, fmtDT, fmtD, fmtMin, ago,
           statusBadge, titleCase, toast, openDrawer, closeDrawer, openModal, closeModal, confirmBox, showSecret, withBusy, skelKpis, skelRows, empty, combo,
           formData, field, opts, csv, placeholder, ROLE_LABELS };
})();
