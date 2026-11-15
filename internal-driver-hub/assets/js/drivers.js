/* drivers.js — Driver Management (no vehicle or GPS tracking) */
(() => {
  const { esc, field, opts } = App;
  App.register({ id: 'drivers', title: 'Driver Management', icon: 'id-card', group: 'Operations', perms: ['drivers.view'], render });
  const AV_TONE = { Available: 'b-green', Busy: 'b-amber', 'Off Duty': 'b-gray', Inactive: 'b-red' };
  let filter = '', q = '';

  function render(el) {
    const manage = App.can('drivers.manage');
    el.innerHTML = `<div class="page-head"><div><h1>Drivers</h1><p>Internal drivers, their logins, WhatsApp settings and current workload.</p></div>
      <div class="toolbar">${manage ? '<button class="btn btn-primary" id="dv-add"><i data-lucide="user-plus"></i>Add driver</button>' : ''}</div></div>
      <div class="card"><div class="filters"><div class="search"><i data-lucide="search"></i><input class="input" id="dv-q" placeholder="Search name, employee ID, phone…" value="${esc(q)}"></div>
        <select class="input" id="dv-f">${opts([{ value: '', label: 'All drivers' }, 'Available', 'Busy', 'Off Duty', 'Inactive'], filter)}</select></div>
      <div id="dv-list">${App.skelRows(6)}</div></div>`;
    if (manage) el.querySelector('#dv-add').onclick = () => edit(null, () => load(el));
    el.querySelector('#dv-q').oninput = App.debounce(e => { q = e.target.value.toLowerCase(); paint(el); }, 200);
    el.querySelector('#dv-f').onchange = e => { filter = e.target.value; paint(el); };
    load(el);
  }
  let data = [];
  async function load(el) {
    try { data = await API.call('listDrivers'); App.state.lookups && (App.state.lookups.drivers = data); paint(el); }
    catch (e) { el.querySelector('#dv-list').innerHTML = `<div class="card-body"><div class="callout warn">${esc(e.message)}</div></div>`; }
  }
  function paint(el) {
    const box = el.querySelector('#dv-list'); if (!box) return;
    const rows = data.filter(d => (!filter || d.AvailabilityStatus === filter || (filter === 'Inactive' && d.ActiveStatus === 'Inactive')) &&
      (!q || [d.FullName, d.EmployeeID, d.Phone, d.DriverID].join(' ').toLowerCase().includes(q)));
    if (!rows.length) { box.innerHTML = App.empty(data.length ? 'No drivers match.' : 'No drivers yet. Add your first driver.', 'users'); App.icons(); return; }
    const manage = App.can('drivers.manage');
    box.innerHTML = `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Driver</th><th>Contact</th><th>Availability</th><th>WhatsApp</th><th>Open</th><th>Completed</th><th>Login</th>${manage ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map(d => `<tr>
        <td class="primary-cell"><div style="display:flex;gap:10px;align-items:center"><div class="avatar">${esc(d.FullName.split(' ').map(s => s[0]).slice(0, 2).join(''))}</div>
          <div><div class="cell-main">${esc(d.FullName)} ${d.IsSample === true || d.IsSample === 'TRUE' ? '<span class="tag-demo">DEMO</span>' : ''}</div><div class="small muted mono">${esc(d.DriverID)} · ${esc(d.EmployeeID)}</div></div></div></td>
        <td data-label="Contact" class="mono small">${esc(d.Phone)}${d.Department ? `<div class="muted" style="font-family:var(--font)">${esc(d.Department)}</div>` : ''}</td>
        <td data-label="Availability"><span class="badge ${AV_TONE[d.ActiveStatus === 'Inactive' ? 'Inactive' : d.AvailabilityStatus] || 'b-gray'}">${esc(d.ActiveStatus === 'Inactive' ? 'Inactive' : d.AvailabilityStatus)}</span></td>
        <td data-label="WhatsApp">${d.WhatsAppEnabled === true || d.WhatsAppEnabled === 'TRUE' ? `<span class="badge b-green plain">On</span> <span class="mono small muted">${esc(d.WhatsAppNumber)}</span>` : '<span class="badge b-gray plain">Off</span>'}</td>
        <td data-label="Open" class="num">${d.openTasks}</td><td data-label="Completed" class="num">${d.completedTasks}</td>
        <td data-label="Login">${d.hasLogin ? `<span class="mono small">${esc(d.username)}</span>` : '<span class="faint">—</span>'}</td>
        ${manage ? `<td style="text-align:right;white-space:nowrap"><button class="btn btn-sm" data-hist="${d.DriverID}" title="Request history"><i data-lucide="history"></i></button>
          <button class="btn btn-sm" data-pin="${d.DriverID}" title="Reset PIN"><i data-lucide="key-round"></i></button> <button class="btn btn-sm" data-edit="${d.DriverID}"><i data-lucide="pencil"></i>Edit</button></td>` : ''}</tr>`).join('')}
      </tbody></table></div>`;
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(data.find(d => d.DriverID === b.dataset.edit), () => load(el)));
    box.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => history(data.find(d => d.DriverID === b.dataset.hist)));
    box.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => {
      const d = data.find(x => x.DriverID === b.dataset.pin);
      if (!await App.confirmBox('Reset PIN', `Generate a new temporary PIN for ${d.FullName}? Their current sessions will be signed out.`, 'Reset PIN')) return;
      try { const r = await API.call('resetDriverPin', { driverId: d.DriverID }, { write: true }); App.showSecret('New driver PIN', `Share this securely with ${esc(d.FullName)}.`, r.username, r.pin); }
      catch (e) { App.toast(e.message, 'err'); }
    });
    App.icons();
  }

  function edit(d, done) {
    const isNew = !d; d = d || { WhatsAppEnabled: true, AvailabilityStatus: 'Available', ActiveStatus: 'Active' };
    const on = v => v === true || v === 'TRUE';
    App.openModal({ title: isNew ? 'Add driver' : 'Edit driver', sub: isNew ? 'A driver login is created automatically. Username = Employee ID.' : `<span class="mono">${esc(d.DriverID)}</span>`, wide: true,
      body: `<div class="grid g2">
        ${field('Full name', `<input class="input" name="FullName" value="${esc(d.FullName || '')}">`, { req: true })}
        ${field('Employee ID', `<input class="input mono" name="EmployeeID" value="${esc(d.EmployeeID || '')}">`, { req: true, hint: isNew ? 'Also the driver\'s sign-in username' : '' })}
        ${field('Mobile number', `<input class="input" name="Phone" inputmode="tel" value="${esc(d.Phone || '')}" placeholder="e.g. 5512 3456">`, { req: true })}
        ${field('WhatsApp number', `<input class="input" name="WhatsAppNumber" inputmode="tel" value="${esc(d.WhatsAppNumber || '')}" placeholder="Same as mobile if blank">`)}
        ${field('Department', `<input class="input" name="Department" value="${esc(d.Department || '')}">`)}
        ${field('Vehicle registration', `<input class="input mono" name="VehicleReg" value="${esc(d.VehicleReg || '')}">`, { hint: 'Reference only — no vehicle tracking' })}
        ${field('Availability', `<select class="input" name="AvailabilityStatus">${opts(['Available', 'Busy', 'Off Duty'], d.AvailabilityStatus)}</select>`)}
        ${isNew ? '' : field('Account status', `<select class="input" name="ActiveStatus">${opts(['Active', 'Inactive'], d.ActiveStatus)}</select>`, { hint: 'Inactive signs the driver out and blocks assignment' })}
        <label class="check span-2"><input type="checkbox" name="WhatsAppEnabled" ${on(d.WhatsAppEnabled) ? 'checked' : ''}> Send WhatsApp notifications to this driver</label></div>`,
      actions: [{ label: 'Cancel' }, { label: isNew ? 'Create driver' : 'Save changes', cls: 'btn-primary', onClick: async m => {
        const f = App.formData(m); if (!isNew) f.DriverID = d.DriverID;
        const r = await API.call('saveDriver', f, { write: true });
        done && done(); App.refreshLookups();
        if (r.pin) setTimeout(() => App.showSecret('Driver created', `Share these sign-in details securely with ${esc(r.driver.FullName)}.`, r.username, r.pin), 220);
        else App.toast('Driver saved');
      } }] });
  }

  async function history(d) {
    App.openDrawer(`<div class="drawer-head"><div style="flex:1"><h2>${esc(d.FullName)}</h2><div class="muted small">Request history</div></div><button class="btn btn-ghost btn-icon" onclick="App.closeDrawer()"><i data-lucide="x"></i></button></div><div class="drawer-body" id="hist">${App.skelRows(8)}</div>`);
    try {
      const r = await API.call('listRequests', { driverId: d.DriverID, pageSize: 100 });
      const done = r.rows.filter(x => x.Status === 'COMPLETED').length, open = r.rows.filter(x => !['COMPLETED', 'CANCELLED', 'FAILED / EXCEPTION'].includes(x.Status)).length;
      document.getElementById('hist').innerHTML = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="card kpi"><div class="kpi-label">Total</div><div class="kpi-value">${r.total}</div></div>
        <div class="card kpi tone-green"><div class="kpi-label">Completed</div><div class="kpi-value">${done}</div></div><div class="card kpi tone-amber"><div class="kpi-label">Open</div><div class="kpi-value">${open}</div></div></div>
        ${r.rows.map(x => `<div class="log-item" style="cursor:pointer" data-id="${esc(x.RequestID)}"><div style="flex:1"><span class="mono">${esc(x.RequestID)}</span> ${App.statusBadge(x.Status)}<div class="muted">${esc(x.RequestType)}</div></div><div class="small muted num">${App.fmtDT(x.CreatedAt)}</div></div>`).join('') || App.empty('No requests yet.')}
        <div class="small faint" style="margin-top:12px">Full performance analytics arrive with the KPI module (Phase 5).</div>`;
      document.querySelectorAll('#hist [data-id]').forEach(e => e.onclick = () => Requests.openDetail(e.dataset.id));
      App.icons();
    } catch (e) { App.toast(e.message, 'err'); }
  }
})();
