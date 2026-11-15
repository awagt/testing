/* driver-portal.js — mobile-first driver interface.
 * Phase 1+2: a simple task list so drivers can sign in and act on assignments.
 * Phase 3 replaces this with the full mobile portal (one-tap next step, photo proof, progress timeline). */
(() => {
  const { esc } = App;
  App.register({ id: 'driver', title: 'Driver Portal', icon: 'smartphone', group: 'My work', perms: ['driver.portal'], render });

  async function render(el) {
    el.innerHTML = `<div class="page-head"><div><h1>My tasks</h1><p>Hello ${esc(App.state.user.name.split(' ')[0])}. Tap a task to see details and update it.</p></div>
      <div class="seg" id="dp-av">${['Available', 'Busy', 'Off Duty'].map(s => `<button data-k="${s}" class="${(App.state.lookups || {}).myAvailability === s ? 'on' : ''}">${s}</button>`).join('')}</div></div><div id="dp-list">${App.skelRows(6)}</div>`;
    el.querySelectorAll('#dp-av button').forEach(b => b.onclick = async () => {
      try { await API.call('setMyAvailability', { status: b.dataset.k }, { write: true }); if (App.state.lookups) App.state.lookups.myAvailability = b.dataset.k; el.querySelectorAll('#dp-av button').forEach(x => x.classList.toggle('on', x === b)); App.toast('Status: ' + b.dataset.k); }
      catch (e) { App.toast(e.message, 'err'); }
    });
    try {
      const d = await API.call('listRequests', { status: 'OPEN', pageSize: 50 });
      const box = el.querySelector('#dp-list');
      if (!d.rows.length) { box.innerHTML = `<div class="card">${App.empty('No open tasks. New assignments will appear here.', 'coffee')}</div>`; App.icons(); return; }
      box.innerHTML = d.rows.map(r => {
        const next = r._actions.find(a => Requests.DRIVER_ACTIONS.includes(a));
        return `<div class="card" style="margin-bottom:12px"><div class="card-body" data-id="${esc(r.RequestID)}" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="mono cell-main">${esc(r.RequestID)}</span>${App.statusBadge(r.Status)}</div>
          <div class="muted small" style="margin:4px 0 10px">${esc(r.RequestType)}${r.Priority === 'Urgent' ? ' · <span class="urgent">URGENT</span>' : ''} · ${esc(r.PackageCount)} pkg</div>
          <div class="route"><span>${esc(r.SourceLocation === 'Customer' ? (r.DeliveryAddress || 'Customer') : r.SourceLocation)}</span><span class="to">${esc(r.DestinationLocation === 'Customer' ? (r.DeliveryAddress || 'Customer') : r.DestinationLocation)}</span></div>
          ${r.Instructions ? `<div class="small" style="margin-top:8px">${esc(r.Instructions)}</div>` : ''}</div>
          ${next ? `<div style="padding:0 16px 16px"><button class="btn btn-primary" style="width:100%;height:50px;font-size:15px" data-next="${esc(r.RequestID)}" data-a="${next}"><i data-lucide="${Requests.ACTIONS[next].icon}"></i>${Requests.ACTIONS[next].label}</button></div>` : ''}</div>`;
      }).join('');
      box.querySelectorAll('[data-id]').forEach(c => c.onclick = () => Requests.openDetail(c.dataset.id, () => render(el)));
      box.querySelectorAll('[data-next]').forEach(b => b.onclick = async () => { const r = d.rows.find(x => x.RequestID === b.dataset.next); if (await Requests.runAction(r, b.dataset.a)) render(el); });
      App.icons();
    } catch (e) { App.toast(e.message, 'err'); }
  }
})();
