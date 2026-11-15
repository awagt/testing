/* admin.js — User Management, Activity Logs, Settings (locations, SLA, permissions, demo data) */
(() => {
  const { esc, field, opts, fmtDT } = App;

  /* ======================= USERS ======================= */
  App.register({ id: 'users', title: 'User Management', icon: 'users-round', group: 'Administration', perms: ['users.manage'], render: renderUsers });
  let users = [];
  async function renderUsers(el) {
    el.innerHTML = `<div class="page-head"><div><h1>Users</h1><p>Accounts and roles. Driver logins are managed from Driver Management.</p></div>
      <div class="toolbar"><button class="btn btn-primary" id="us-add"><i data-lucide="user-plus"></i>Add user</button></div></div>
      <div class="card"><div class="filters"><div class="search"><i data-lucide="search"></i><input class="input" id="us-q" placeholder="Search users…"></div></div><div id="us-list">${App.skelRows(6)}</div></div>`;
    el.querySelector('#us-add').onclick = () => editUser(null, () => renderUsers(el));
    try { users = await API.call('listUsers'); } catch (e) { App.toast(e.message, 'err'); return; }
    const paint = q => {
      const rows = users.filter(u => !q || [u.FullName, u.Username, u.EmployeeID, u.Role].join(' ').toLowerCase().includes(q));
      const locName = id => ((App.state.lookups || {}).locations || []).find(l => l.LocationID === id)?.LocationName || id;
      el.querySelector('#us-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>User</th><th>Role</th><th>Department / location</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
        ${rows.map(u => `<tr><td class="primary-cell"><div class="cell-main">${esc(u.FullName)} ${u.IsSample === true || u.IsSample === 'TRUE' ? '<span class="tag-demo">DEMO</span>' : ''}</div><div class="small muted mono">${esc(u.Username)}${u.EmployeeID ? ' · ' + esc(u.EmployeeID) : ''}</div></td>
          <td data-label="Role"><span class="badge plain ${u.Role === 'SUPER_ADMIN' ? 'b-violet' : u.Role === 'DRIVER' ? 'b-amber' : 'b-blue'}">${esc(App.roleLabel(u.Role))}</span></td>
          <td data-label="Dept / location">${esc(u.Department || '')}${u.LocationID ? `<div class="small muted">${esc(locName(u.LocationID))}</div>` : ''}</td>
          <td data-label="Status"><span class="badge ${u.Status === 'Active' ? 'b-green' : 'b-gray'}">${esc(u.Status)}</span>${u.MustChangePIN === true || u.MustChangePIN === 'TRUE' ? ' <span class="small faint">PIN change due</span>' : ''}</td>
          <td data-label="Last sign-in" class="num muted">${u.LastLogin ? fmtDT(u.LastLogin) : '—'}</td>
          <td style="text-align:right;white-space:nowrap">${u.Role === 'DRIVER' ? '<a class="btn btn-sm btn-ghost" href="#/drivers">Driver settings</a>' : `<button class="btn btn-sm" data-pin="${u.UserID}" title="Reset PIN"><i data-lucide="key-round"></i></button> <button class="btn btn-sm" data-edit="${u.UserID}"><i data-lucide="pencil"></i>Edit</button>`}</td></tr>`).join('')}
        </tbody></table></div>` : App.empty('No users found.');
      el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editUser(users.find(u => u.UserID === b.dataset.edit), () => renderUsers(el)));
      el.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => {
        const u = users.find(x => x.UserID === b.dataset.pin);
        if (!await App.confirmBox('Reset PIN', `Generate a new temporary PIN for ${u.FullName}? They will be signed out everywhere.`, 'Reset PIN')) return;
        try { const r = await API.call('resetUserPin', { userId: u.UserID }, { write: true }); App.showSecret('New PIN', `Share securely with ${esc(u.FullName)}.`, r.username, r.pin); } catch (e) { App.toast(e.message, 'err'); }
      });
      App.icons();
    };
    el.querySelector('#us-q').oninput = App.debounce(e => paint(e.target.value.toLowerCase()), 200);
    paint('');
  }

  function editUser(u, done) {
    const isNew = !u; u = u || { Status: 'Active', Role: 'REQUESTER' };
    const roles = Object.entries(App.ROLE_LABELS).filter(([k]) => k !== 'DRIVER').map(([value, label]) => ({ value, label }));
    const locs = ((App.state.lookups || {}).locations || []).map(l => ({ value: l.LocationID, label: `${l.LocationName} (${l.LocationType})` }));
    const m = App.openModal({ title: isNew ? 'Add user' : 'Edit user', wide: true, sub: isNew ? 'A temporary PIN is generated and shown once.' : '',
      body: `<div class="grid g2">
        ${field('Full name', `<input class="input" name="FullName" value="${esc(u.FullName || '')}">`, { req: true })}
        ${field('Username', `<input class="input mono" name="Username" autocapitalize="none" value="${esc(u.Username || '')}">`, { req: true })}
        ${field('Employee ID', `<input class="input mono" name="EmployeeID" value="${esc(u.EmployeeID || '')}">`)}
        ${field('Role', `<select class="input" name="Role" id="us-role">${opts(roles, u.Role)}</select>`, { req: true })}
        ${field('Department', `<input class="input" name="Department" value="${esc(u.Department || '')}">`)}
        ${field('Phone', `<input class="input" name="Phone" value="${esc(u.Phone || '')}">`)}
        ${field('Linked location', `<select class="input" name="LocationID"><option value="">None</option>${opts(locs, u.LocationID)}</select>`, { hint: 'Required for Receivers: they confirm handovers at this location' })}
        ${isNew ? '' : field('Status', `<select class="input" name="Status">${opts(['Active', 'Inactive'], u.Status)}</select>`)}
      </div><div class="small muted" id="us-role-help"></div>`,
      actions: [{ label: 'Cancel' }, { label: isNew ? 'Create user' : 'Save', cls: 'btn-primary', onClick: async mm => {
        const f = App.formData(mm); if (!isNew) f.UserID = u.UserID;
        const r = await API.call('saveUser', f, { write: true }); done();
        if (r.pin) setTimeout(() => App.showSecret('User created', `Share securely with ${esc(r.user.FullName)}.`, r.user.Username, r.pin), 220); else App.toast('User saved');
      } }] });
    const help = { SUPER_ADMIN: 'Full access including users, permissions and settings.', OPS_ADMIN: 'Create, assign and manage requests, drivers and locations; view KPIs and logs.',
      REQUESTER: 'Create requests and follow their own requests.', RECEIVER: 'Store / FC staff: confirm received quantity and condition at their linked location.',
      FINANCE: 'Finance / customer service: view returns and update refund status (informational).', VIEWER: 'Read-only dashboards and reports.' };
    const sync = () => (m.querySelector('#us-role-help').textContent = help[m.querySelector('#us-role').value] || '');
    m.querySelector('#us-role').onchange = sync; sync();
  }

  /* ======================= ACTIVITY LOGS ======================= */
  App.register({ id: 'logs', title: 'Activity Logs', icon: 'scroll-text', group: 'Administration', perms: ['logs.view'], render: renderLogs });
  const LF = { q: '', range: '7d', page: 1 };
  function renderLogs(el) {
    el.innerHTML = `<div class="page-head"><div><h1>Activity log</h1><p>Append-only audit trail of every action in the system.</p></div><div class="toolbar"><button class="btn" id="lg-csv"><i data-lucide="download"></i>Export CSV</button></div></div>
      <div class="card"><div class="filters"><div class="search"><i data-lucide="search"></i><input class="input" id="lg-q" placeholder="Search request ID, user, action…" value="${esc(LF.q)}"></div>
      <select class="input" id="lg-r">${opts([{ value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '', label: 'All time' }], LF.range)}</select></div><div id="lg-list">${App.skelRows(10)}</div></div>`;
    el.querySelector('#lg-q').oninput = App.debounce(e => { LF.q = e.target.value; LF.page = 1; load(); }, 350);
    el.querySelector('#lg-r').onchange = e => { LF.range = e.target.value; LF.page = 1; load(); };
    el.querySelector('#lg-csv').onclick = e => App.withBusy(e.currentTarget, async () => {
      const d = await API.call('listLogs', { ...LF, page: 1, pageSize: 200 });
      App.csv(d.rows, ['Timestamp', 'RequestID', 'UserName', 'Role', 'Action', 'PreviousStatus', 'NewStatus', 'Remarks', 'Details'].map(k => ({ key: k, label: k, get: r => k === 'Timestamp' ? fmtDT(r[k]) : r[k] })), 'activity-log.csv');
    });
    async function load() {
      const box = el.querySelector('#lg-list');
      try {
        const d = await API.call('listLogs', { ...LF, pageSize: 50 });
        const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
        box.innerHTML = d.rows.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Time</th><th>Action</th><th>Request</th><th>User</th><th>Status change</th><th>Remarks</th></tr></thead><tbody>
          ${d.rows.map(l => `<tr><td class="num muted" data-label="Time">${fmtDT(l.Timestamp)}</td><td class="primary-cell"><b>${esc(App.titleCase(l.Action.replace(/_/g, ' ')))}</b></td>
            <td data-label="Request">${l.RequestID ? `<a href="javascript:void 0" class="mono" data-id="${esc(l.RequestID)}">${esc(l.RequestID)}</a>` : '<span class="faint">—</span>'}</td>
            <td data-label="User">${esc(l.UserName)}<div class="small muted">${esc(App.roleLabel(l.Role))}</div></td>
            <td data-label="Status">${l.NewStatus ? `<span class="small">${esc(l.PreviousStatus || '—')} → ${esc(l.NewStatus)}</span>` : ''}</td>
            <td data-label="Remarks" class="small" style="max-width:340px">${esc(l.Remarks)}${l.Details ? `<details><summary class="faint" style="cursor:pointer">details</summary><code class="mono small" style="white-space:pre-wrap;word-break:break-all">${esc(l.Details)}</code></details>` : ''}</td></tr>`).join('')}
          </tbody></table></div><div class="pager"><span>${d.total} entries · page ${d.page} of ${pages}</span><div class="toolbar"><button class="btn btn-sm" id="lp" ${d.page <= 1 ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button><button class="btn btn-sm" id="ln" ${d.page >= pages ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button></div></div>` : App.empty('No activity in this period.');
        const lp = box.querySelector('#lp'), ln = box.querySelector('#ln');
        if (lp) { lp.onclick = () => { LF.page--; load(); }; ln.onclick = () => { LF.page++; load(); }; }
        box.querySelectorAll('[data-id]').forEach(a => a.onclick = () => Requests.openDetail(a.dataset.id));
        App.icons();
      } catch (e) { box.innerHTML = `<div class="card-body"><div class="callout warn">${esc(e.message)}</div></div>`; }
    }
    load();
  }

  /* ======================= SETTINGS ======================= */
  App.register({ id: 'settings', title: 'Settings', icon: 'settings', group: 'Administration', perms: ['settings.manage', 'locations.manage'], render: renderSettings });
  let tab = 'locations';
  function renderSettings(el) {
    const tabs = [['locations', 'Locations']].concat(App.can('settings.manage') ? [['sla', 'SLA & security'], ['perms', 'Role permissions'], ['demo', 'Demo data'], ['system', 'System']] : []);
    if (!tabs.find(t => t[0] === tab)) tab = 'locations';
    el.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Locations, service targets, permissions and system tools.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="st-body"></div>`;
    el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k; renderSettings(el); });
    const body = el.querySelector('#st-body');
    ({ locations: tabLocations, sla: tabSla, perms: tabPerms, demo: tabDemo, system: tabSystem })[tab](body);
    App.icons();
  }

  async function tabLocations(body) {
    body.innerHTML = `<div class="card"><div class="card-head"><div><h2>Stores, fulfilment centers and offices</h2><div class="small muted">Used for request source/destination, receiving confirmation and store WhatsApp notifications.</div></div>
      <button class="btn btn-primary btn-sm" id="lc-add"><i data-lucide="plus"></i>Add location</button></div><div id="lc-list">${App.skelRows(5)}</div></div>`;
    const load = async () => {
      const L = await API.call('listLocations', {});
      App.state.lookups && (App.state.lookups.locations = L.filter(l => l.ActiveStatus !== 'Inactive'));
      body.querySelector('#lc-list').innerHTML = L.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Location</th><th>Type</th><th>Entity</th><th>Contact</th><th>WhatsApp</th><th>Status</th><th></th></tr></thead><tbody>
        ${L.map(l => `<tr><td class="primary-cell"><div class="cell-main">${esc(l.LocationName)} ${l.IsSample === true || l.IsSample === 'TRUE' ? '<span class="tag-demo">DEMO</span>' : ''}</div><div class="small muted">${esc(l.Address)}</div></td>
          <td data-label="Type">${esc(l.LocationType)}</td><td data-label="Entity">${esc(l.Entity)}</td><td data-label="Contact">${esc(l.ContactPerson)}<div class="mono small muted">${esc(l.ContactPhone)}</div></td>
          <td data-label="WhatsApp">${l.WhatsAppEnabled === true || l.WhatsAppEnabled === 'TRUE' ? '<span class="badge b-green plain">On</span>' : '<span class="badge b-gray plain">Off</span>'}</td>
          <td data-label="Status"><span class="badge ${l.ActiveStatus === 'Inactive' ? 'b-gray' : 'b-green'}">${esc(l.ActiveStatus)}</span></td>
          <td style="text-align:right"><button class="btn btn-sm" data-e="${l.LocationID}"><i data-lucide="pencil"></i>Edit</button></td></tr>`).join('')}</tbody></table></div>`
        : App.empty('No locations yet. Add your stores and fulfilment center to start creating requests.', 'store');
      body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editLoc(L.find(l => l.LocationID === b.dataset.e), load));
      App.icons();
    };
    body.querySelector('#lc-add').onclick = () => editLoc(null, load);
    try { await load(); } catch (e) { App.toast(e.message, 'err'); }
  }

  function editLoc(l, done) {
    const isNew = !l; l = l || { LocationType: 'Store', Entity: 'Sports Corner', ActiveStatus: 'Active', WhatsAppEnabled: false };
    App.openModal({ title: isNew ? 'Add location' : 'Edit location', wide: true, body: `<div class="grid g2">
      ${field('Location name', `<input class="input" name="LocationName" value="${esc(l.LocationName || '')}" ${isNew ? '' : 'readonly'}>`, { req: true, hint: isNew ? 'Must be unique. Cannot be renamed later.' : 'Names are locked because requests reference them' })}
      ${field('Type', `<select class="input" name="LocationType">${opts(['Store', 'Fulfilment Center', 'Office', 'Other'], l.LocationType)}</select>`, { req: true })}
      ${field('Entity', `<select class="input" name="Entity">${opts(['Sports Corner', 'Sports For Less', 'Both'], l.Entity)}</select>`)}
      ${field('Address', `<input class="input" name="Address" value="${esc(l.Address || '')}">`)}
      ${field('Contact person', `<input class="input" name="ContactPerson" value="${esc(l.ContactPerson || '')}">`)}
      ${field('Contact phone', `<input class="input" name="ContactPhone" value="${esc(l.ContactPhone || '')}">`)}
      ${field('WhatsApp number', `<input class="input" name="WhatsAppNumber" value="${esc(l.WhatsAppNumber || '')}" placeholder="Same as contact if blank">`)}
      ${field('Status', `<select class="input" name="ActiveStatus">${opts(['Active', 'Inactive'], l.ActiveStatus)}</select>`)}
      <label class="check span-2"><input type="checkbox" name="WhatsAppEnabled" ${l.WhatsAppEnabled === true || l.WhatsAppEnabled === 'TRUE' ? 'checked' : ''}> Send store / receiving WhatsApp notifications to this location</label></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async m => { const f = App.formData(m); if (!isNew) f.LocationID = l.LocationID; await API.call('saveLocation', f, { write: true }); App.toast('Location saved'); done(); } }] });
  }

  let settingsCache = null;
  async function getSettings() { settingsCache = await API.call('getSettings'); return settingsCache; }

  async function tabSla(body) {
    body.innerHTML = App.skelRows(6);
    const s = (await getSettings()).settings;
    const keys = [['SLA_URGENT_HOURS', 'Urgent completion target (hours)'], ['SLA_NORMAL_HOURS', 'Normal completion target (hours)'], ['SLA_ASSIGN_MINUTES', 'Assignment target (minutes)'],
      ['SESSION_HOURS', 'Idle session expiry (hours, max 6)'], ['MAX_LOGIN_ATTEMPTS', 'Failed sign-ins before 15-min lockout'], ['LEADERBOARD_MIN_COMPLETED', 'Minimum completed requests to rank a driver']];
    body.innerHTML = `<div class="card form-card"><div class="card-body"><div class="grid g2">${keys.map(([k, l]) => field(l, `<input class="input" type="number" min="0" name="${k}" value="${esc((s[k] || {}).value || '')}">`, { hint: (s[k] || {}).description })).join('')}
      <label class="check span-2"><input type="checkbox" name="SHOW_SAMPLE" ${(s.SHOW_SAMPLE || {}).value !== 'FALSE' ? 'checked' : ''}> Show demo records in lists and dashboard (KPIs in Phase 5 always exclude them)</label></div></div>
      <div class="form-foot"><span></span><button class="btn btn-primary" id="sla-save"><i data-lucide="save"></i>Save settings</button></div></div>`;
    App.icons();
    body.querySelector('#sla-save').onclick = e => App.withBusy(e.currentTarget, async () => {
      const f = App.formData(body); f.SHOW_SAMPLE = f.SHOW_SAMPLE ? 'TRUE' : 'FALSE';
      const r = await API.call('saveSettings', { values: f }, { write: true }); App.toast(r.saved.length ? 'Saved: ' + r.saved.join(', ') : 'No changes');
    });
  }

  async function tabPerms(body) {
    body.innerHTML = App.skelRows(8);
    const S = await getSettings();
    let current = S.defaultPerms;
    try { const v = (S.settings.ROLE_PERMISSIONS || {}).value; if (v) current = { ...S.defaultPerms, ...JSON.parse(v) }; } catch (e) {}
    const roles = S.roles;
    const LABELS = { 'dash.view': 'View overview dashboard', 'req.create': 'Create requests', 'req.view.all': 'View all requests', 'req.view.own': 'View own requests', 'req.view.inbound': 'View inbound to own location',
      'req.view.returns': 'View return requests', 'req.assign': 'Assign / reassign drivers', 'req.cancel': 'Cancel any request', 'req.cancel.own': 'Cancel own request (before acceptance)', 'req.milestone': 'Driver milestone updates (own tasks)',
      'req.override': 'Record milestones on behalf of driver', 'req.exception': 'Report exceptions', 'req.receive': 'Receiving confirmation', 'req.correct': 'Audited record correction', 'refund.update': 'Update refund status',
      'drivers.view': 'View drivers', 'drivers.manage': 'Manage drivers & driver PINs', 'users.manage': 'Manage users & PINs', 'locations.manage': 'Manage locations', 'wa.view': 'View WhatsApp history', 'wa.manage': 'WhatsApp settings',
      'kpi.view': 'KPI & analytics', 'logs.view': 'Activity logs', 'settings.manage': 'System settings', 'driver.portal': 'Driver portal' };
    body.innerHTML = `<div class="card"><div class="card-head"><div><h2>Role permissions</h2><div class="small muted">Enforced on the server for every request. Changes apply at each user's next action.</div></div>
      <div class="toolbar"><button class="btn btn-sm" id="pm-reset">Reset to defaults</button><button class="btn btn-primary btn-sm" id="pm-save"><i data-lucide="save"></i>Save</button></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Permission</th>${roles.map(r => `<th style="text-align:center">${esc(App.roleLabel(r))}</th>`).join('')}</tr></thead><tbody>
      ${S.allPerms.map(p => `<tr><td>${esc(LABELS[p] || p)}<div class="mono small faint">${p}</div></td>${roles.map(r => `<td style="text-align:center"><input type="checkbox" data-r="${r}" data-p="${p}" ${current[r] && current[r].includes(p) ? 'checked' : ''} ${r === 'SUPER_ADMIN' && (p === 'settings.manage' || p === 'users.manage') ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
    App.icons();
    body.querySelector('#pm-save').onclick = e => App.withBusy(e.currentTarget, async () => {
      const o = {}; roles.forEach(r => (o[r] = []));
      body.querySelectorAll('input[data-r]').forEach(c => { if (c.checked) o[c.dataset.r].push(c.dataset.p); });
      await API.call('saveSettings', { values: { ROLE_PERMISSIONS: JSON.stringify(o) } }, { write: true }); App.toast('Permissions saved');
    });
    body.querySelector('#pm-reset').onclick = async () => {
      if (!await App.confirmBox('Reset permissions', 'Restore the default permission matrix for all roles?', 'Reset')) return;
      try { await API.call('saveSettings', { values: { ROLE_PERMISSIONS: '' } }, { write: true }); App.toast('Defaults restored'); tabPerms(body); } catch (e) { App.toast(e.message, 'err'); }
    };
  }

  function tabDemo(body) {
    body.innerHTML = `<div class="card form-card"><div class="card-body" style="display:grid;gap:14px">
      <div class="callout"><i data-lucide="flask-conical"></i><div>Demo data adds 4 locations, 2 drivers, 1 receiver and 5 requests, all prefixed <b>DEMO</b> and flagged <span class="mono">IsSample = TRUE</span>. They are clearly badged in the UI, never sent WhatsApp messages, and excluded from KPIs. Removing demo data deletes only rows flagged as sample. Production records are never touched.</div></div>
      <div class="toolbar"><button class="btn btn-primary" id="dm-load"><i data-lucide="database"></i>Load demo data</button><button class="btn btn-danger" id="dm-rm"><i data-lucide="trash-2"></i>Remove demo data</button></div><div id="dm-out"></div></div></div>`;
    App.icons();
    body.querySelector('#dm-load').onclick = e => App.withBusy(e.currentTarget, async () => {
      const r = await API.call('loadDemoData', {}, { write: true }); App.refreshLookups();
      body.querySelector('#dm-out').innerHTML = `<div class="section-title">Demo sign-ins (shown once)</div><table class="tbl"><thead><tr><th>Username</th><th>PIN</th><th>Role</th></tr></thead><tbody>${r.logins.map(l => `<tr><td class="mono">${esc(l.username)}</td><td class="mono">${esc(l.pin)}</td><td>${esc(l.role)}</td></tr>`).join('')}</tbody></table>`;
      App.toast('Demo data loaded');
    });
    body.querySelector('#dm-rm').onclick = async () => {
      if (!await App.confirmBox('Remove demo data', 'Delete all rows flagged IsSample = TRUE? Production data is not affected.', 'Remove', true)) return;
      try { const r = await API.call('removeDemoData', {}, { write: true }); App.refreshLookups(); App.toast('Removed: ' + Object.entries(r.removed).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')); } catch (e) { App.toast(e.message, 'err'); }
    };
  }

  function tabSystem(body) {
    body.innerHTML = `<div class="card form-card"><div class="card-body"><dl class="dl"><dt>API endpoint</dt><dd class="mono small">${esc(API.url())}</dd><dt>Connection test</dt><dd><button class="btn btn-sm" id="sy-ping"><i data-lucide="activity"></i>Run test</button> <span id="sy-res" class="small"></span></dd>
      <dt>Signed in as</dt><dd>${esc(App.state.user.name)} · ${esc(App.roleLabel(App.state.user.role))}</dd></dl>
      <div class="small muted" style="margin-top:14px">For a full connectivity check (ping, login, write, read) open <a href="api-test.html" target="_blank">api-test.html</a>.</div></div></div>`;
    App.icons();
    body.querySelector('#sy-ping').onclick = e => App.withBusy(e.currentTarget, async () => {
      const t = performance.now(); const r = await API.call('ping');
      body.querySelector('#sy-res').innerHTML = `<span class="badge b-green">OK</span> v${esc(r.version)} · ${Math.round(performance.now() - t)} ms round-trip`;
    });
  }
})();
