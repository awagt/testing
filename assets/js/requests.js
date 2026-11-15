/* requests.js — Create Request, All Requests, request detail drawer and the shared status-action forms */
const Requests = (() => {
  const { esc, field, opts, fmtDT } = App;
  const CONDITIONS = ['Good / sealed', 'Opened – good condition', 'Damaged packaging', 'Damaged product', 'Missing items', 'Wrong item', 'Other'];

  /* ======================= shared action definitions ======================= */
  const ACTIONS = {
    accept:       { label: 'Accept assignment', icon: 'check', primary: true },
    decline:      { label: 'Decline', icon: 'x', remarks: 'Reason for declining' },
    onTheWay:     { label: 'Confirm on the way', icon: 'navigation', primary: true },
    arrivePickup: { label: 'Arrived at pickup', icon: 'map-pin', primary: true },
    collect:      { label: 'Confirm collection', icon: 'package-check', primary: true, form: 'collect' },
    inTransit:    { label: 'Confirm in transit', icon: 'truck', primary: true },
    arriveDest:   { label: 'Arrived at destination', icon: 'flag', primary: true },
    handover:     { label: 'Confirm handover', icon: 'hand-helping', primary: true, form: 'handover' },
    complete:     { label: 'Complete request', icon: 'check-check', primary: true },
    receive:      { label: 'Confirm receipt', icon: 'clipboard-check', primary: true, form: 'receive' },
    exception:    { label: 'Report exception', icon: 'alert-triangle', danger: true, remarks: 'What went wrong?' },
    cancel:       { label: 'Cancel request', icon: 'ban', danger: true, remarks: 'Reason for cancellation' },
    reopen:       { label: 'Re-open for reassignment', icon: 'rotate-ccw', remarks: 'Why is it being re-opened?' },
    close:        { label: 'Close as failed', icon: 'archive', danger: true, remarks: 'Closing note' }
  };
  const DRIVER_ACTIONS = ['accept', 'onTheWay', 'arrivePickup', 'collect', 'inTransit', 'arriveDest', 'handover', 'complete'];
  const isReturn = r => /^Returns|^Refund/.test(r.RequestCategory);

  /** Opens the right form for an action; resolves with the updated request or null. */
  function runAction(r, action, after) {
    const a = ACTIONS[action];
    const me = App.state.user;
    const override = DRIVER_ACTIONS.includes(action) && me.driverId !== r.AssignedDriverID;
    let body = '';
    if (a.form === 'collect') {
      body += field('Actual collected quantity', `<input class="input" name="collectedQuantity" type="number" min="0" inputmode="numeric" value="${esc(r.ExpectedQuantity || r.PackageCount)}">`, { req: true, hint: `Expected: ${r.ExpectedQuantity || r.PackageCount}` });
      if (isReturn(r)) body += field('Product / packaging condition', `<select class="input" name="productCondition"><option value="">Select…</option>${opts(CONDITIONS)}</select>`, { req: true });
    }
    if (a.form === 'handover') {
      body += field('Recipient name', '<input class="input" name="recipientName">', { req: r.RequiresReceiving !== true && r.RequiresReceiving !== 'TRUE' });
      body += field('Receiving employee ID', '<input class="input" name="recipientEmployeeId">', { hint: 'Where the recipient is a staff member' });
      if (!(r.RequiresReceiving === true || r.RequiresReceiving === 'TRUE')) body += field('Quantity handed over', `<input class="input" name="receivedQuantity" type="number" min="0" value="${esc(r.CollectedQuantity || r.PackageCount)}">`);
      else body += '<div class="callout"><i data-lucide="info"></i><div>Receiving staff at the destination must confirm quantity and condition before this request is completed.</div></div>';
    }
    if (a.form === 'receive') {
      const exp = r.CollectedQuantity !== '' && r.CollectedQuantity !== undefined ? r.CollectedQuantity : (r.ExpectedQuantity || r.PackageCount);
      body += field('Received quantity', `<input class="input" name="receivedQuantity" type="number" min="0" value="${esc(exp)}">`, { req: true, hint: `Driver collected: ${exp}` });
      body += field('Received condition', `<select class="input" name="receivedCondition"><option value="">Select…</option>${opts(CONDITIONS)}</select>`, { req: true });
      body += '<label class="check"><input type="checkbox" name="discrepancy"> Report a discrepancy</label>';
    }
    const needRemarks = a.remarks || override;
    body += field(a.remarks || (override ? 'Admin override remarks' : 'Remarks'), '<textarea class="input" name="remarks" rows="2"></textarea>',
      { req: !!needRemarks, hint: override ? 'You are recording this on behalf of the driver. This is logged as an admin override.' : '' });
    return new Promise(resolve => {
      App.openModal({
        title: a.label, sub: `<span class="mono">${esc(r.RequestID)}</span> · ${esc(r.RequestType)}`, body,
        actions: [{ label: 'Back', onClick: () => resolve(null) }, { label: a.label, cls: a.danger ? 'btn-danger' : 'btn-primary', icon: a.icon, onClick: async m => {
          const f = App.formData(m);
          if (needRemarks && !f.remarks) { App.toast('Please enter remarks', 'err'); return false; }
          const { remarks, ...data } = f;
          const res = await API.call('updateStatus', { id: r.RequestID, action, expectedStatus: r.Status, remarks, data }, { write: true });
          App.toast(`${r.RequestID} → ${res.request.Status}`);
          resolve(res.request); after && after(res.request);
        } }]
      });
    });
  }

  /* ======================= CREATE ======================= */
  App.register({ id: 'create', title: 'Create Request', icon: 'square-plus', group: 'Operations', perms: ['req.create'], render: renderCreate });

  function renderCreate(el) {
    const lk = App.state.lookups || {};
    const cat = lk.catalogue || [];
    const st = { step: 1, Entity: 'Sports Corner', Priority: 'Normal', RequestCategory: '', RequestType: '', def: null, catDef: null, data: {} };
    el.innerHTML = `<div class="page-head"><div><h1>Create request</h1><p>Post an internal driver request. Only the fields relevant to the request type are shown.</p></div></div>
      <div class="card form-card"><div class="card-body"><div class="steps">
        <div class="st" data-s="1"><b>1</b>Type</div><div class="st" data-s="2"><b>2</b>Route &amp; items</div><div class="st" data-s="3"><b>3</b>Review</div></div>
        <div id="cr-step"></div></div><div class="form-foot"><button class="btn" id="cr-back"><i data-lucide="arrow-left"></i>Back</button>
        <button class="btn btn-primary" id="cr-next">Continue<i data-lucide="arrow-right"></i></button></div></div>`;
    const box = el.querySelector('#cr-step'), back = el.querySelector('#cr-back'), next = el.querySelector('#cr-next');
    let idemKey = API.uuid();

    function paintSteps() {
      el.querySelectorAll('.st').forEach(s => { const n = +s.dataset.s; s.classList.toggle('on', n === st.step); s.classList.toggle('done', n < st.step); });
      back.style.visibility = st.step === 1 ? 'hidden' : 'visible';
      next.innerHTML = st.step === 3 ? '<i data-lucide="send"></i>Submit request' : 'Continue<i data-lucide="arrow-right"></i>';
      App.icons();
    }

    function step1() {
      box.innerHTML = `<div class="grid">
        ${field('Business entity', `<div class="choice-row" data-k="Entity">${['Sports Corner', 'Sports For Less'].map(e => `<button type="button" class="choice ${st.Entity === e ? 'on' : ''}" data-v="${e}">${e}</button>`).join('')}</div>`, { req: true })}
        ${field('Request category', `<div class="choice-row" data-k="RequestCategory">${cat.map(c => `<button type="button" class="choice ${st.RequestCategory === c.category ? 'on' : ''}" data-v="${esc(c.category)}">${esc(c.category)}</button>`).join('')}</div>`, { req: true })}
        <div id="types"></div>
        ${field('Priority', `<div class="choice-row" data-k="Priority">${['Normal', 'Urgent'].map(p => `<button type="button" class="choice ${st.Priority === p ? 'on' : ''}" data-v="${p}">${p === 'Urgent' ? '⚡ ' : ''}${p}</button>`).join('')}</div>`)}
      </div>`;
      const paintTypes = () => {
        const c = cat.find(x => x.category === st.RequestCategory);
        box.querySelector('#types').innerHTML = c ? field('Request type', `<div class="choice-row" data-k="RequestType">${c.types.map(t => `<button type="button" class="choice ${st.RequestType === t.type ? 'on' : ''}" data-v="${esc(t.type)}">${esc(t.type)}</button>`).join('')}</div>`, { req: true }) : '';
        bind();
      };
      const bind = () => box.querySelectorAll('.choice-row').forEach(row => row.querySelectorAll('.choice').forEach(b => b.onclick = () => {
        const k = row.dataset.k; st[k] = b.dataset.v;
        row.querySelectorAll('.choice').forEach(x => x.classList.toggle('on', x === b));
        if (k === 'RequestCategory') { st.RequestType = ''; paintTypes(); }
      }));
      paintTypes();
    }

    function locOptions(kind) {
      const L = (lk.locations || []).filter(l => l.ActiveStatus !== 'Inactive' && (l.Entity === 'Both' || l.Entity === st.Entity));
      const want = kind === 'Store' ? 'Store' : kind === 'FC' ? 'Fulfilment Center' : null;
      return L.filter(l => !want || l.LocationType === want).map(l => ({ value: l.LocationName, label: l.LocationName, sub: l.LocationType + (l.IsSample === true || l.IsSample === 'TRUE' ? ' · demo' : '') }));
    }

    function step2() {
      const c = cat.find(x => x.category === st.RequestCategory), t = c.types.find(x => x.type === st.RequestType);
      st.catDef = c; st.def = t;
      const custSide = t.src === 'Customer' || t.dst === 'Customer', ret = !!c.isReturn, d = st.data;
      const kindLabel = k => k === 'FC' ? 'fulfilment center' : k === 'Store' ? 'store' : 'location';
      const locField = (name, label, kind) => kind === 'Customer'
        ? field(label, '<div class="input" style="display:flex;align-items:center;color:var(--muted)">Customer (address below)</div>')
        : field(label, `<input class="input" name="${name}" placeholder="Search ${kindLabel(kind)}…" value="${esc(d[name] || '')}" ${kind === 'Any' ? 'list="loc-all"' : ''}>`, { req: true, hint: kind === 'Any' ? 'Pick a location or type an address' : '' });
      box.innerHTML = `<datalist id="loc-all">${locOptions('Any').map(o => `<option value="${esc(o.value)}">`).join('')}</datalist>
        <div class="callout" style="margin-bottom:16px"><i data-lucide="info"></i><div><b>${esc(t.type)}</b> · ${esc(st.Entity)} · ${esc(st.Priority)} priority. Requested by <b>${esc(App.state.user.name)}</b>${App.state.user.employeeId ? ` (${esc(App.state.user.employeeId)})` : ''}.</div></div>
        <div class="grid g2">
          ${locField('SourceLocation', t.src === 'Customer' ? 'Collect from' : 'Source location', t.src)}
          ${locField('DestinationLocation', ret ? 'Return destination' : 'Destination location', t.dst)}
        </div>
        ${custSide ? `<div class="section-title">Customer</div><div class="grid g2">
          ${field('Customer name', `<input class="input" name="CustomerName" value="${esc(d.CustomerName || '')}">`, { req: true })}
          ${field('Customer contact number', `<input class="input" name="CustomerPhone" inputmode="tel" placeholder="e.g. 5512 3456" value="${esc(d.CustomerPhone || '')}">`, { req: true })}
          ${field(t.src === 'Customer' ? 'Collection address' : 'Delivery address', `<textarea class="input" name="DeliveryAddress" rows="2">${esc(d.DeliveryAddress || '')}</textarea>`, { req: true, cls: 'span-2' })}
          <label class="check span-2"><input type="checkbox" name="CustomerConsent" ${d.CustomerConsent ? 'checked' : ''}> Customer agreed to receive WhatsApp updates about this ${ret ? 'pickup' : 'delivery'}</label>
        </div>` : ''}
        ${ret ? `<div class="section-title">Return details</div><div class="grid g3">
          ${field('Original Magento Order ID', `<input class="input mono" name="OriginalOrderID" value="${esc(d.OriginalOrderID || '')}">`, { req: t.src === 'Customer' })}
          ${field('Return / RMA reference', `<input class="input mono" name="ReturnReference" value="${esc(d.ReturnReference || '')}">`)}
          ${field('Return reason', `<select class="input" name="ReturnReason"><option value="">Select…</option>${opts(lk.returnReasons || [], d.ReturnReason)}</select>`, { req: true })}
          ${field('Expected quantity', `<input class="input" type="number" min="1" name="ExpectedQuantity" value="${esc(d.ExpectedQuantity || 1)}">`, { req: true })}
          ${field('Expected product condition', `<select class="input" name="ExpectedCondition"><option value="">Not specified</option>${opts(CONDITIONS, d.ExpectedCondition)}</select>`)}
          ${field('Product SKU', `<input class="input mono" name="ProductSKU" value="${esc(d.ProductSKU || '')}">`)}
        </div>` : ''}
        <div class="section-title">Items</div><div class="grid g3">
          ${field('Number of packages', `<input class="input" type="number" min="1" name="PackageCount" value="${esc(d.PackageCount || 1)}">`, { req: true })}
          ${ret ? '' : field('Order ID', `<input class="input mono" name="OrderReference" value="${esc(d.OrderReference || '')}">`, { hint: 'Optional' })}
          ${ret ? '' : field('SKU', `<input class="input mono" name="ProductSKU" value="${esc(d.ProductSKU || '')}">`, { hint: 'Optional' })}
          ${field('Product details', `<textarea class="input" name="ItemDetails" rows="2">${esc(d.ItemDetails || '')}</textarea>`, { cls: 'span-2' })}
          ${field('Requested completion time', `<input class="input" type="datetime-local" name="RequestedDeadline" value="${esc(d.RequestedDeadline || '')}">`, { hint: 'Blank = SLA for priority' })}
          ${field('Special instructions', `<textarea class="input" name="Instructions" rows="2">${esc(d.Instructions || '')}</textarea>`, { cls: 'span-2' })}
          ${field('Additional remarks', `<textarea class="input" name="Remarks" rows="2">${esc(d.Remarks || '')}</textarea>`)}
        </div>`;
      ['SourceLocation', 'DestinationLocation'].forEach(n => {
        const kind = n === 'SourceLocation' ? t.src : t.dst, inp = box.querySelector(`[name="${n}"]`);
        if (inp && kind !== 'Any') { const cb = App.combo(inp, locOptions(kind), v => { inp.dataset.value = v; }); if (d[n]) { cb.set(d[n]); inp.dataset.value = d[n]; } else inp.dataset.value = ''; }
      });
      App.icons();
    }

    function collect2() {
      const f = App.formData(box);
      const t = st.def, custSide = t.src === 'Customer' || t.dst === 'Customer';
      const errs = [];
      const need = (k, label) => { if (!f[k]) { errs.push(label); const i = box.querySelector(`[name="${k}"]`); i && i.classList.add('invalid'); } };
      if (t.src !== 'Customer') need('SourceLocation', 'Source location');
      if (t.dst !== 'Customer') need('DestinationLocation', 'Destination');
      if (custSide) { need('CustomerName', 'Customer name'); need('CustomerPhone', 'Customer contact'); need('DeliveryAddress', 'Address'); }
      if (st.catDef.isReturn) { need('ReturnReason', 'Return reason'); need('ExpectedQuantity', 'Expected quantity'); if (t.src === 'Customer') need('OriginalOrderID', 'Original order ID'); }
      need('PackageCount', 'Number of packages');
      if (f.SourceLocation && f.SourceLocation === f.DestinationLocation) errs.push('Source and destination must differ');
      if (errs.length) { App.toast('Please complete: ' + errs.join(', '), 'err'); return false; }
      st.data = f; return true;
    }

    function step3() {
      const d = st.data, t = st.def;
      const row = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '';
      box.innerHTML = `<div class="review"><dl class="dl">${row('Entity', st.Entity)}${row('Category', st.RequestCategory)}${row('Type', st.RequestType)}${row('Priority', st.Priority)}
        ${row('From', t.src === 'Customer' ? 'Customer' : d.SourceLocation)}${row('To', t.dst === 'Customer' ? 'Customer' : d.DestinationLocation)}${row('Packages', d.PackageCount)}
        ${row('Deadline', d.RequestedDeadline ? fmtDT(d.RequestedDeadline + ':00+03:00') : 'SLA default')}</dl>
        <dl class="dl">${row('Customer', d.CustomerName)}${row('Contact', d.CustomerPhone)}${row('Address', d.DeliveryAddress)}${row('Original order', d.OriginalOrderID)}
        ${row('RMA', d.ReturnReference)}${row('Return reason', d.ReturnReason)}${row('Expected qty', d.ExpectedQuantity)}${row('Order ID', d.OrderReference)}${row('SKU', d.ProductSKU)}
        ${row('Items', d.ItemDetails)}${row('Instructions', d.Instructions)}</dl></div>`;
    }

    async function submit() {
      const d = { ...st.data, Entity: st.Entity, Priority: st.Priority, RequestCategory: st.RequestCategory, RequestType: st.RequestType };
      if (st.def.src === 'Customer') d.SourceLocation = 'Customer';
      if (st.def.dst === 'Customer') d.DestinationLocation = 'Customer';
      if (d.RequestedDeadline) d.RequestedDeadline = d.RequestedDeadline + ':00+03:00';
      const res = await API.call('createRequest', d, { write: true, idemKey });
      idemKey = API.uuid();
      App.openModal({ title: 'Request created', sub: `<span class="mono" style="font-size:15px;color:var(--text)">${esc(res.request.RequestID)}</span> is now waiting for driver assignment.`,
        actions: [{ label: 'Create another', onClick: () => renderCreate(el) }, { label: 'View request', cls: 'btn-primary', onClick: () => { location.hash = '#/requests'; setTimeout(() => openDetail(res.request.RequestID), 150); } }] });
    }

    back.onclick = () => { if (st.step === 2) { st.data = App.formData(box); } st.step--; show(); };
    next.onclick = () => App.withBusy(next, async () => {
      if (st.step === 1) { if (!st.RequestCategory || !st.RequestType) { App.toast('Select a category and request type', 'err'); return; } st.step = 2; }
      else if (st.step === 2) { if (!collect2()) return; st.step = 3; }
      else { await submit(); return; }
      show();
    });
    const show = () => { paintSteps(); ({ 1: step1, 2: step2, 3: step3 })[st.step](); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    show();
  }

  /* ======================= LIST ======================= */
  App.register({ id: 'requests', title: 'All Requests', icon: 'list-checks', group: 'Operations', perms: ['req.view.all', 'req.view.own', 'req.view.inbound', 'req.view.returns'], render: renderList });

  const F = { q: '', status: '', category: '', entity: '', range: '', page: 1 };
  function renderList(el, params) {
    if (params && params[0]) { F.status = params[0]; F.page = 1; }
    if (App.state.user.role === 'RECEIVER' && !params[0] && !F._init) { F.status = 'INBOUND'; F._init = 1; }
    const lk = App.state.lookups || {};
    const statuses = [{ value: '', label: 'All statuses' }, { value: 'OPEN', label: 'Open (not finished)' }, { value: 'UNASSIGNED', label: 'Unassigned' }, { value: 'OVERDUE', label: 'Overdue' },
      { value: 'INBOUND', label: 'Inbound / awaiting receipt' }].concat((lk.statuses || []).map(s => ({ value: s, label: App.titleCase(s) })));
    el.innerHTML = `<div class="page-head"><div><h1>${App.state.user.role === 'RECEIVER' ? 'Inbound to my location' : 'All requests'}</h1><p>Click a request to see its timeline and take action.</p></div>
      <div class="toolbar"><button class="btn" id="rq-csv"><i data-lucide="download"></i>Export CSV</button>${App.can('req.create') ? '<a class="btn btn-primary" href="#/create"><i data-lucide="plus"></i>New request</a>' : ''}</div></div>
      <div class="card"><div class="filters">
        <div class="search"><i data-lucide="search"></i><input class="input" id="rq-q" placeholder="Search ID, order, customer, SKU, driver…" value="${esc(F.q)}"></div>
        <select class="input" id="rq-status">${opts(statuses, F.status)}</select>
        <select class="input" id="rq-cat">${opts([{ value: '', label: 'All categories' }].concat((lk.catalogue || []).map(c => c.category)), F.category)}</select>
        <select class="input" id="rq-ent">${opts([{ value: '', label: 'Both entities' }, 'Sports Corner', 'Sports For Less'], F.entity)}</select>
        <select class="input" id="rq-range">${opts([{ value: '', label: 'Any date' }, { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: 'month', label: 'This month' }], F.range)}</select>
      </div><div id="rq-table">${App.skelRows(8)}</div></div>`;
    const reload = () => { F.page = 1; load(el); };
    el.querySelector('#rq-q').oninput = App.debounce(e => { F.q = e.target.value; reload(); }, 350);
    [['#rq-status', 'status'], ['#rq-cat', 'category'], ['#rq-ent', 'entity'], ['#rq-range', 'range']].forEach(([s, k]) => el.querySelector(s).onchange = e => { F[k] = e.target.value; reload(); });
    el.querySelector('#rq-csv').onclick = e => App.withBusy(e.currentTarget, exportCsv);
    load(el);
  }

  const query = (extra = {}) => ({ q: F.q, status: F.status, category: F.category, entity: F.entity, range: F.range, page: F.page, pageSize: 25, ...extra });

  async function load(el) {
    const box = el.querySelector('#rq-table'); if (!box) return;
    let d;
    try { d = await API.call('listRequests', query()); }
    catch (e) { box.innerHTML = `<div class="card-body"><div class="callout warn"><i data-lucide="alert-triangle"></i>${esc(e.message)}</div></div>`; App.icons(); return; }
    if (!d.rows.length) { box.innerHTML = App.empty('No requests match these filters.'); App.icons(); return; }
    const pages = Math.ceil(d.total / d.pageSize);
    box.innerHTML = `<div class="table-wrap"><table class="tbl responsive"><thead><tr><th>Request</th><th>Type</th><th>Route</th><th>Driver</th><th>Status</th><th>Created</th><th>Due</th></tr></thead><tbody>
      ${d.rows.map(r => `<tr class="click" data-id="${esc(r.RequestID)}">
        <td class="primary-cell"><div class="mono cell-main">${esc(r.RequestID)}</div><div class="small muted">${esc(r.Entity === 'Sports Corner' ? 'SPC' : 'SFL')}${r.Priority === 'Urgent' ? ' · <span class="urgent"><i data-lucide="zap"></i>Urgent</span>' : ''} ${r.IsSample === 'TRUE' || r.IsSample === true ? '<span class="tag-demo">DEMO</span>' : ''}</div></td>
        <td data-label="Type">${esc(r.RequestType)}</td>
        <td data-label="Route"><div class="route"><span>${esc(r.SourceLocation === 'Customer' ? r.CustomerName || 'Customer' : r.SourceLocation)}</span><span class="to">${esc(r.DestinationLocation === 'Customer' ? r.CustomerName || 'Customer' : r.DestinationLocation)}</span></div></td>
        <td data-label="Driver">${r.AssignedDriverName ? esc(r.AssignedDriverName) : '<span class="faint">Unassigned</span>'}</td>
        <td data-label="Status">${App.statusBadge(r.Status)}${r._overdue ? ' <span class="badge b-red">OVERDUE</span>' : ''}</td>
        <td data-label="Created" class="num muted">${fmtDT(r.CreatedAt)}</td>
        <td data-label="Due" class="num ${r._overdue ? '' : 'muted'}">${r.RequestedDeadline ? fmtDT(r.RequestedDeadline) : '<span class="faint">SLA</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="pager"><span>${d.total} request${d.total === 1 ? '' : 's'} · page ${d.page} of ${pages}</span>
        <div class="toolbar"><button class="btn btn-sm" id="pg-prev" ${d.page <= 1 ? 'disabled' : ''}><i data-lucide="chevron-left"></i></button><button class="btn btn-sm" id="pg-next" ${d.page >= pages ? 'disabled' : ''}><i data-lucide="chevron-right"></i></button></div></div>`;
    box.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openDetail(tr.dataset.id, () => load(el)));
    box.querySelector('#pg-prev').onclick = () => { F.page--; load(el); };
    box.querySelector('#pg-next').onclick = () => { F.page++; load(el); };
    App.icons();
  }

  async function exportCsv() {
    let all = [], page = 1, total = 0;
    do { const d = await API.call('listRequests', query({ page, pageSize: 100 })); all = all.concat(d.rows); total = d.total; page++; } while (all.length < total && page <= 50);
    const cols = ['RequestID', 'Entity', 'RequestCategory', 'RequestType', 'Priority', 'Status', 'SourceLocation', 'DestinationLocation', 'CustomerName', 'OrderReference', 'OriginalOrderID',
      'ReturnReference', 'ReturnReason', 'PackageCount', 'ExpectedQuantity', 'CollectedQuantity', 'ReceivedQuantity', 'AssignedDriverName', 'RequesterName', 'CreatedAt', 'AssignedAt', 'AcceptedAt',
      'CollectedAt', 'HandoverAt', 'ReceivedAt', 'CompletedAt', 'RequestedDeadline', 'DiscrepancyFlag', 'RefundStatus', 'ExceptionReason', 'IsSample'].map(k => ({ key: k, label: k, get: r => /At$|Deadline$/.test(k) ? fmtDT(r[k]) : r[k] }));
    App.csv(all, cols, `driver-requests-${new Date().toISOString().slice(0, 10)}.csv`);
    App.toast(`Exported ${all.length} rows`);
  }

  /* ======================= DETAIL DRAWER ======================= */
  const MILESTONES = [['CreatedAt', 'Request created'], ['AssignedAt', 'Driver assigned'], ['AcceptedAt', 'Accepted by driver'], ['OnTheWayAt', 'Driver on the way'],
    ['PickupArrivalAt', 'Arrived at pickup'], ['CollectedAt', 'Collected'], ['InTransitAt', 'In transit'], ['DestinationArrivalAt', 'Arrived at destination'],
    ['HandoverAt', 'Handed over'], ['ReceivedAt', 'Received / confirmed'], ['CompletedAt', 'Completed']];

  async function openDetail(id, onChange) {
    App.openDrawer(`<div class="drawer-head"><div style="flex:1"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-line" style="width:70%"></div></div></div><div class="drawer-body">${App.skelRows(10)}</div>`);
    let d;
    try { d = await API.call('getRequest', { id }); } catch (e) { App.closeDrawer(); App.toast(e.message, 'err'); return; }
    const r = d.request, yes = v => v === true || v === 'TRUE';
    const dlrow = (k, v, mono) => v !== '' && v !== undefined && v !== null ? `<dt>${esc(k)}</dt><dd class="${mono ? 'mono' : ''}">${esc(v)}</dd>` : '';
    const terminalBad = r.Status === 'CANCELLED' || r.Status === 'FAILED / EXCEPTION';
    let lastDone = -1; MILESTONES.forEach(([k], i) => { if (r[k]) lastDone = i; });
    const timeline = MILESTONES.filter(([k]) => r[k] || !terminalBad).filter(([k]) => k !== 'ReceivedAt' || yes(r.RequiresReceiving) || r.ReceivedAt).map(([k, label]) => {
      const i = MILESTONES.findIndex(m => m[0] === k);
      const cls = r[k] ? 'done' : (i === lastDone + 1 && !terminalBad ? 'current' : '');
      return `<li class="${cls}"><span class="dot"></span><div class="t-title">${label}</div><div class="t-meta num">${r[k] ? fmtDT(r[k]) : 'Pending'}</div></li>`;
    }).join('') + (r.Status === 'FAILED / EXCEPTION' ? `<li class="bad"><span class="dot"></span><div class="t-title">Exception</div><div class="t-meta">${fmtDT(r.ExceptionAt)} · ${esc(r.ExceptionReason)}</div></li>` : '')
      + (r.Status === 'CANCELLED' ? `<li class="bad"><span class="dot"></span><div class="t-title">Cancelled</div><div class="t-meta">${fmtDT(r.CancelledAt)}</div></li>` : '');
    const acts = r._actions.filter(a => a !== 'decline' || App.state.user.driverId === r.AssignedDriverID);
    const primary = acts.filter(a => ACTIONS[a].primary), secondary = acts.filter(a => !ACTIONS[a].primary);
    const D = App.openDrawer(`
      <div class="drawer-head"><div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="mono" style="font-size:15px;font-weight:600">${esc(r.RequestID)}</span>${App.statusBadge(r.Status)}
          ${r._overdue ? '<span class="badge b-red">OVERDUE</span>' : ''}${r.Priority === 'Urgent' ? '<span class="urgent"><i data-lucide="zap"></i>Urgent</span>' : ''}${yes(r.IsSample) ? '<span class="tag-demo">DEMO</span>' : ''}</div>
        <div class="muted" style="margin-top:4px">${esc(r.RequestType)} · ${esc(r.Entity)}</div></div>
        <button class="btn btn-ghost btn-icon" id="dr-close"><i data-lucide="x"></i></button></div>
      <div class="drawer-body">
        ${yes(r.DiscrepancyFlag) ? '<div class="callout warn" style="margin-bottom:14px"><i data-lucide="alert-triangle"></i><div>Quantity or condition discrepancy reported at receiving.</div></div>' : ''}
        ${r.Status === 'DELIVERED / RECEIVED' && yes(r.RequiresReceiving) ? '<div class="callout" style="margin-bottom:14px"><i data-lucide="clipboard-check"></i><div>Waiting for receiving staff at the destination to confirm quantity and condition.</div></div>' : ''}
        <dl class="dl">
          ${dlrow('From', r.SourceLocation === 'Customer' ? 'Customer' : r.SourceLocation)}${dlrow('To', r.DestinationLocation === 'Customer' ? 'Customer' : r.DestinationLocation)}
          ${dlrow('Driver', r.AssignedDriverName || 'Unassigned')}${dlrow('Requested by', r.RequesterName)}${dlrow('Due', r._dueAt ? fmtDT(r._dueAt) + (r.RequestedDeadline ? '' : ' (SLA)') : '')}
          ${dlrow('Customer', r.CustomerName)}${dlrow('Customer phone', r.CustomerPhone, true)}${dlrow('Address', r.DeliveryAddress)}
          ${dlrow('Order ID', r.OrderReference, true)}${dlrow('Original order', r.OriginalOrderID, true)}${dlrow('RMA reference', r.ReturnReference, true)}${dlrow('Return reason', r.ReturnReason)}
          ${dlrow('Packages', r.PackageCount)}${dlrow('Expected qty', r.ExpectedQuantity)}${dlrow('Collected qty', r.CollectedQuantity)}${dlrow('Received qty', r.ReceivedQuantity)}
          ${dlrow('Expected condition', r.ExpectedCondition)}${dlrow('Collected condition', r.ProductCondition)}${dlrow('Received condition', r.ReceivedCondition)}
          ${dlrow('Recipient', [r.RecipientName, r.RecipientEmployeeID].filter(Boolean).join(' · '))}
          ${dlrow('SKU', r.ProductSKU, true)}${dlrow('Items', r.ItemDetails)}${dlrow('Instructions', r.Instructions)}${dlrow('Collection remarks', r.CollectionRemarks)}
          ${r.RefundStatus ? `<dt>Refund status</dt><dd><span class="badge b-violet">${esc(r.RefundStatus)}</span>${r.RefundReference ? ` <span class="mono small">${esc(r.RefundReference)}</span>` : ''}<div class="small faint">Informational only. Physical collection ≠ refund approval.</div></dd>` : ''}
        </dl>
        ${r.Remarks ? `<div class="section-title">Remarks</div><div style="white-space:pre-wrap;font-size:13px">${esc(r.Remarks)}</div>` : ''}
        <div class="section-title">Milestones</div><ul class="timeline">${timeline}</ul>
        <div class="section-title">Activity</div>
        ${d.log.slice().reverse().map(l => `<div class="log-item"><div style="flex:1"><b>${esc(App.titleCase(l.Action.replace(/_/g, ' ')))}</b>${l.NewStatus && l.PreviousStatus !== l.NewStatus ? ` <span class="muted">→ ${esc(l.NewStatus)}</span>` : ''}
          <div class="muted">${esc(l.UserName)} · ${esc(App.roleLabel(l.Role))}${l.Remarks ? ' · ' + esc(l.Remarks) : ''}</div></div><div class="muted num small" style="white-space:nowrap">${fmtDT(l.Timestamp)}</div></div>`).join('') || '<div class="muted">No activity yet.</div>'}
      </div>
      <div class="drawer-foot" id="dr-foot">
        ${r._canAssign ? `<button class="btn btn-primary" data-x="assign"><i data-lucide="user-plus"></i>${r.AssignedDriverID ? 'Reassign driver' : 'Assign driver'}</button>` : ''}
        ${primary.map(a => `<button class="btn ${r._canAssign ? '' : 'btn-primary'}" data-a="${a}"><i data-lucide="${ACTIONS[a].icon}"></i>${ACTIONS[a].label}</button>`).join('')}
        ${secondary.map(a => `<button class="btn ${ACTIONS[a].danger ? 'btn-danger' : ''}" data-a="${a}"><i data-lucide="${ACTIONS[a].icon}"></i>${ACTIONS[a].label}</button>`).join('')}
        ${r._canRefund ? '<button class="btn" data-x="refund"><i data-lucide="receipt"></i>Refund status</button>' : ''}
        ${r._canCorrect ? '<button class="btn btn-ghost" data-x="correct"><i data-lucide="pencil-line"></i>Correct record</button>' : ''}
      </div>`);
    if (!D.querySelector('#dr-foot').children.length) D.querySelector('#dr-foot').remove();
    D.querySelector('#dr-close').onclick = () => App.closeDrawer();
    const refresh = () => { openDetail(id, onChange); onChange && onChange(); };
    D.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { const res = await runAction(r, b.dataset.a); if (res) refresh(); });
    const x = D.querySelector('[data-x="assign"]'); if (x) x.onclick = () => assignModal(r, refresh);
    const rf = D.querySelector('[data-x="refund"]'); if (rf) rf.onclick = () => refundModal(r, refresh);
    const co = D.querySelector('[data-x="correct"]'); if (co) co.onclick = () => correctModal(r, refresh);
  }

  function assignModal(r, done) {
    const drivers = ((App.state.lookups || {}).drivers || []).filter(d => d.ActiveStatus === 'Active' && d.DriverID !== r.AssignedDriverID);
    const m = App.openModal({
      title: r.AssignedDriverID ? 'Reassign driver' : 'Assign driver', sub: `<span class="mono">${esc(r.RequestID)}</span> · ${esc(r.SourceLocation)} → ${esc(r.DestinationLocation)}`,
      body: field('Driver', '<input class="input" id="as-drv" placeholder="Search drivers…">', { req: true, hint: 'Shows availability and current open tasks' }) +
            (r.AssignedDriverID ? '<div class="callout warn"><i data-lucide="info"></i><div>The current driver will lose access. Their earlier milestones stay in the activity log.</div></div>' : '') +
            field('Remarks', '<textarea class="input" name="remarks" rows="2"></textarea>'),
      actions: [{ label: 'Cancel' }, { label: 'Assign', cls: 'btn-primary', icon: 'user-check', onClick: async mm => {
        const driverId = cb.get(); if (!driverId) { App.toast('Select a driver', 'err'); return false; }
        const res = await API.call('assignDriver', { id: r.RequestID, driverId, expectedStatus: r.Status, remarks: mm.querySelector('[name=remarks]').value }, { write: true });
        App.toast(`Assigned to ${res.request.AssignedDriverName}`); if (res.warning) App.toast(res.warning, 'err', 5000);
        App.refreshLookups(); done();
      } }]
    });
    const cb = App.combo(m.querySelector('#as-drv'), drivers.map(d => ({ value: d.DriverID, label: d.FullName, sub: `${d.AvailabilityStatus} · ${d.openTasks} open` })));
  }

  function refundModal(r, done) {
    App.openModal({ title: 'Update refund status', sub: 'For reference only. This does not approve or process any payment.',
      body: field('Refund status', `<select class="input" name="refundStatus">${opts((App.state.lookups || {}).refundStatuses || [], r.RefundStatus)}</select>`) +
            field('Refund reference', `<input class="input mono" name="refundReference" value="${esc(r.RefundReference || '')}">`) + field('Remarks', '<textarea class="input" name="remarks" rows="2"></textarea>'),
      actions: [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-primary', onClick: async m => { await API.call('updateRefund', { id: r.RequestID, ...App.formData(m) }, { write: true }); App.toast('Refund status updated'); done(); } }] });
  }

  function correctModal(r, done) {
    const fields = ['CollectedAt', 'HandoverAt', 'ReceivedAt', 'CompletedAt', 'AssignedAt', 'AcceptedAt', 'OnTheWayAt', 'PickupArrivalAt', 'InTransitAt', 'DestinationArrivalAt', 'CollectedQuantity', 'ReceivedQuantity',
      'PackageCount', 'ExpectedQuantity', 'OrderReference', 'OriginalOrderID', 'ReturnReference', 'CustomerName', 'CustomerPhone', 'DeliveryAddress', 'ItemDetails', 'ProductSKU', 'Instructions', 'RequestedDeadline', 'Priority'];
    const m = App.openModal({ title: 'Audited correction', sub: 'The old value, new value, your name and reason are permanently logged.',
      body: field('Field', `<select class="input" name="field">${opts(fields)}</select>`) + '<div id="co-cur" class="small muted"></div>' +
            field('New value', '<input class="input" name="value" id="co-val">', { req: true }) + field('Reason for correction', '<textarea class="input" name="reason" rows="2"></textarea>', { req: true }),
      actions: [{ label: 'Cancel' }, { label: 'Save correction', cls: 'btn-primary', onClick: async mm => {
        const f = App.formData(mm); if (/At$|Deadline$/.test(f.field) && f.value) f.value = f.value + ':00+03:00';
        await API.call('correctRecord', { id: r.RequestID, ...f }, { write: true }); App.toast('Correction saved and logged'); done(); } }] });
    const sel = m.querySelector('[name=field]'), val = m.querySelector('#co-val');
    const sync = () => { const k = sel.value; val.type = /At$|Deadline$/.test(k) ? 'datetime-local' : /Quantity$|Count$/.test(k) ? 'number' : 'text'; val.value = ''; m.querySelector('#co-cur').textContent = 'Current: ' + (/At$|Deadline$/.test(k) ? fmtDT(r[k]) : r[k]) || '—'; };
    sel.onchange = sync; sync();
  }

  return { openDetail, runAction, ACTIONS, CONDITIONS, DRIVER_ACTIONS };
})();
