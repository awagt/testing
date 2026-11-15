/* dashboard.js — Overview */
(() => {
  const { esc, fmtMin } = App;
  let charts = [];
  const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month']];
  let range = '7d', entity = '';

  App.register({ id: 'overview', title: 'Overview', icon: 'layout-dashboard', group: 'Operations', perms: ['dash.view'], render });

  function render(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><h1>Overview</h1><p>Live picture of internal driver requests.</p></div>
        <div class="toolbar">
          <div class="seg" id="ov-range">${RANGES.map(([k, l]) => `<button data-k="${k}" class="${k === range ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="seg" id="ov-ent">${[['', 'All'], ['Sports Corner', 'SPC'], ['Sports For Less', 'SFL']].map(([k, l]) => `<button data-k="${k}" class="${k === entity ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${App.can('req.create') ? '<a class="btn btn-primary" href="#/create"><i data-lucide="plus"></i>New request</a>' : ''}
        </div>
      </div>
      <div id="ov-body">${App.skelKpis(8)}<div class="dash-grid"><div class="sk" style="height:300px;border-radius:10px"></div><div class="sk" style="height:300px;border-radius:10px"></div></div></div>`;
    el.querySelectorAll('#ov-range button').forEach(b => b.onclick = () => { range = b.dataset.k; render(el); });
    el.querySelectorAll('#ov-ent button').forEach(b => b.onclick = () => { entity = b.dataset.k; render(el); });
    load(el);
  }

  async function load(el) {
    let d;
    try { d = await API.call('overview', { range, entity }); }
    catch (e) { el.querySelector('#ov-body').innerHTML = `<div class="callout warn"><i data-lucide="alert-triangle"></i>${esc(e.message)}</div>`; App.icons(); return; }
    const k = d.kpi;
    const card = (label, icon, value, sub = '', tone = '', link = '') =>
      `<div class="card kpi ${tone} ${link ? 'link' : ''}" ${link ? `data-link="${link}"` : ''}><div class="kpi-label"><i data-lucide="${icon}"></i>${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
    const body = el.querySelector('#ov-body');
    body.innerHTML = `
      <div class="kpis">
        ${card('Total requests', 'layers', k.total, 'Created in range', '', 'requests')}
        ${card('Unassigned', 'user-x', k.unassigned, 'Waiting for a driver', k.unassigned ? 'tone-amber' : '', 'requests/UNASSIGNED')}
        ${card('Assigned', 'user-check', k.assigned, 'Awaiting acceptance', '', 'requests/ASSIGNED')}
        ${card('In progress', 'truck', k.inProgress, 'Accepted → delivered', '', 'requests/OPEN')}
        ${card('Completed', 'check-circle-2', k.completed, 'In range', 'tone-green', 'requests/COMPLETED')}
        ${card('Overdue', 'alarm-clock', k.overdue, 'Past deadline / SLA', k.overdue ? 'tone-red' : '', 'requests/OVERDUE')}
        ${card('Cancelled', 'ban', k.cancelled, 'Excluded from KPIs')}
        ${card('Exceptions', 'alert-triangle', k.exceptions, 'Failed / exception', k.exceptions ? 'tone-red' : '', 'requests/FAILED / EXCEPTION')}
        ${card('Avg turnaround', 'timer', fmtMin(k.avgTurnaroundMin), 'Created → completed')}
        ${card('Avg collection', 'package-check', fmtMin(k.avgCollectionMin), 'Created → collected')}
        ${card('Avg delivery', 'package-open', fmtMin(k.avgDeliveryMin), 'Collected → delivered')}
        ${card('Active drivers', 'users', k.activeDrivers, `${k.availableDrivers} available · ${k.requestsPerDriver} req/driver`)}
      </div>
      <div class="dash-grid">
        <div class="card"><div class="card-head"><h2>Requests trend</h2><span class="small muted">Created vs completed per day</span></div><div class="card-body"><div class="chart-box"><canvas id="ch-trend"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h2>Status mix</h2><span class="small muted">Requests in range</span></div><div class="card-body"><div class="chart-box"><canvas id="ch-status"></canvas></div></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Needs attention</h2><span class="small muted">Unassigned, overdue and exceptions</span></div>
        ${d.attention.length ? `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Request</th><th>Type</th><th>Route</th><th>Status</th><th>Age</th></tr></thead><tbody>
          ${d.attention.map(r => `<tr class="click" data-id="${esc(r.RequestID)}">
            <td class="primary-cell"><span class="mono cell-main">${esc(r.RequestID)}</span> ${r.Priority === 'Urgent' ? '<span class="urgent"><i data-lucide="zap"></i>Urgent</span>' : ''} ${r.IsSample ? '<span class="tag-demo">DEMO</span>' : ''}</td>
            <td data-label="Type">${esc(r.RequestType)}</td>
            <td data-label="Route"><div class="route"><span>${esc(r.SourceLocation)}</span><span class="to">${esc(r.DestinationLocation)}</span></div></td>
            <td data-label="Status">${App.statusBadge(r.Status)} ${r.overdue ? '<span class="badge b-red">OVERDUE</span>' : ''}</td>
            <td data-label="Age" class="num muted">${App.ago(r.CreatedAt)}</td></tr>`).join('')}
        </tbody></table></div>` : App.empty('Nothing needs attention right now.', 'party-popper')}
      </div>
      <div class="small faint" style="margin-top:10px">Updated ${App.fmtDT(d.generatedAt)}${d.sampleIncluded ? ' · demo records included in view (excluded from completed-time KPIs where marked)' : ''}</div>`;
    body.querySelectorAll('[data-link]').forEach(c => c.onclick = () => (location.hash = '#/' + c.dataset.link));
    body.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => Requests.openDetail(tr.dataset.id));
    App.icons();
    drawCharts(d);
  }

  function drawCharts(d) {
    charts.forEach(c => c.destroy()); charts = [];
    if (!window.Chart) { setTimeout(() => drawCharts(d), 300); return; }
    const css = getComputedStyle(document.documentElement);
    const c = n => css.getPropertyValue(n).trim();
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.font.size = 11.5; Chart.defaults.color = c('--muted');
    const days = Object.keys(d.trend);
    const labels = days.map(s => new Date(s + 'T12:00:00+03:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    const grid = { color: c('--border'), drawTicks: false }, noGrid = { display: false };
    const t = document.getElementById('ch-trend');
    if (t) charts.push(new Chart(t, { type: 'line', data: { labels, datasets: [
      { label: 'Created', data: days.map(k => d.trend[k].created), borderColor: c('--primary'), backgroundColor: c('--primary-50'), fill: true, tension: .35, pointRadius: 2.5, borderWidth: 2 },
      { label: 'Completed', data: days.map(k => d.trend[k].completed), borderColor: c('--success'), tension: .35, pointRadius: 2.5, borderWidth: 2 }] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
        scales: { x: { grid: noGrid }, y: { beginAtZero: true, ticks: { precision: 0, padding: 8 }, grid, border: { display: false } } } } }));
    const s = document.getElementById('ch-status');
    const entries = Object.entries(d.byStatus).filter(([, v]) => v > 0);
    const tone = st => st === 'COMPLETED' ? c('--success') : st === 'FAILED / EXCEPTION' ? c('--danger') : st === 'CANCELLED' || st === 'NEW' ? c('--faint') : /COLLECTED|TRANSIT|DESTINATION/.test(st) ? c('--violet') : /WAY|PICKUP|DELIVERED/.test(st) ? c('--warning') : c('--primary');
    if (s) charts.push(new Chart(s, { type: 'bar', data: { labels: entries.map(([k]) => App.titleCase(k.replace(' / RECEIVED', '').replace(' / EXCEPTION', ''))),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: entries.map(([k]) => tone(k)), borderRadius: 4, barThickness: 14 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid, border: { display: false } }, y: { grid: noGrid } } } }));
  }
})();
