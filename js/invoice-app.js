// =====================================================================
//  Manual invoice maker (walk-in / offline orders)
// =====================================================================
const HISTORY_KEY = 'ct_invoices_v1';
const SIZE_LABELS = { pastry: 'Pastry', small: 'Small (~0.5 kg)', large: 'Large (~1.0 kg)' };

let invCatalog = JSON.parse(JSON.stringify(defaultCatalogStructure));
let items = [];

const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;

function toast(msg) {
  const t = $('toast');
  t.innerText = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Invoice numbers: PREFIX-YYMMDD-001 ----------
function seqKey(ymd) { return 'ct_inv_seq_' + ymd; }
function ymdOf(iso) { return iso.replace(/-/g, '').slice(2); }

function nextInvoiceNo(iso) {
  const ymd = ymdOf(iso);
  let n = 0;
  try { n = Number(localStorage.getItem(seqKey(ymd))) || 0; } catch (e) {}
  return `${BUSINESS.invoicePrefix}-${ymd}-${String(n + 1).padStart(3, '0')}`;
}

function bumpSequence(invoiceNo) {
  const m = String(invoiceNo).match(/-(\d{6})-(\d+)$/);
  if (!m) return;
  try {
    const cur = Number(localStorage.getItem(seqKey(m[1]))) || 0;
    if (Number(m[2]) > cur) localStorage.setItem(seqKey(m[1]), String(Number(m[2])));
  } catch (e) {}
}

// ---------- Menu quick add ----------
function renderCakeSelect() {
  const sel = $('qaCake');
  const keep = sel.value;
  const groups = {};
  invCatalog.forEach(c => { (groups[c.category] = groups[c.category] || []).push(c); });
  sel.innerHTML = Object.keys(groups).map(cat =>
    `<optgroup label="${esc(cat)}">${groups[cat].map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`
  ).join('');
  if (keep) sel.value = keep;
  onCakeChange();
}

function onCakeChange() {
  const cake = invCatalog.find(c => c.id === $('qaCake').value);
  const sel = $('qaSize');
  if (!cake) { sel.innerHTML = ''; return; }
  sel.innerHTML = ['pastry', 'small', 'large']
    .filter(k => cake.prices[k])
    .map(k => `<option value="${k}">${SIZE_LABELS[k]}  -  Rs. ${cake.prices[k]}</option>`).join('');
  const preferred = cake.prices.small ? 'small' : sel.options[0] && sel.options[0].value;
  if (preferred) sel.value = preferred;
}

async function loadLiveMenu() {
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMenu&_t=${Date.now()}`);
    const json = await res.json();
    if (json.status !== 'success') return;
    json.menu.forEach(r => {
      const c = invCatalog.find(x => x.id === r.id);
      if (c && r.prices) c.prices = r.prices;
    });
    renderCakeSelect();
  } catch (e) { /* offline: built-in prices are used */ }
}

function addQuickItem() {
  const cake = invCatalog.find(c => c.id === $('qaCake').value);
  const size = $('qaSize').value;
  if (!cake || !size) return toast('Pick a cake and size');
  items.push({ name: `${cake.name} (${SIZE_LABELS[size]})`, desc: '', qty: Math.max(1, num($('qaQty').value)), rate: cake.prices[size] });
  $('qaQty').value = 1;
  renderItems();
}

function addCustomItem() {
  items.push({ name: '', desc: '', qty: 1, rate: '' });
  renderItems();
  const inputs = document.querySelectorAll('.item-name');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeItem(i) { items.splice(i, 1); renderItems(); }

function onItemInput(i, field, value) {
  items[i][field] = value;
  const amt = $('amt_' + i);
  if (amt) amt.innerText = 'Rs. ' + (num(items[i].qty) * num(items[i].rate)).toLocaleString('en-IN');
  updateSummary();
}

function renderItems() {
  const box = $('itemsList');
  if (!items.length) {
    box.innerHTML = '<div class="empty-items">No items yet. Pick a cake above or add a custom item.</div>';
  } else {
    box.innerHTML = items.map((it, i) => `
      <div class="item-row">
        <input class="inp item-name" placeholder="Item name" value="${esc(it.name)}" oninput="onItemInput(${i}, 'name', this.value)" />
        <input class="inp" placeholder="Note, e.g. message on cake (optional)" value="${esc(it.desc)}" oninput="onItemInput(${i}, 'desc', this.value)" />
        <div class="item-bottom">
          <div><div class="mini-lbl">Qty</div><input type="number" class="inp" min="1" value="${esc(it.qty)}" oninput="onItemInput(${i}, 'qty', this.value)" /></div>
          <div><div class="mini-lbl">Rate (Rs.)</div><input type="number" class="inp" min="0" value="${esc(it.rate)}" oninput="onItemInput(${i}, 'rate', this.value)" /></div>
          <div class="item-amt" id="amt_${i}">Rs. ${(num(it.qty) * num(it.rate)).toLocaleString('en-IN')}</div>
          <button type="button" class="btn-del" onclick="removeItem(${i})" aria-label="Remove item">✕</button>
        </div>
      </div>`).join('');
  }
  updateSummary();
}

// ---------- Form state <-> DOM ----------
function readForm() {
  return {
    invoiceNo: $('invNo').value.trim(),
    date: $('invDate').value || todayISO(),
    name: $('custName').value.trim(),
    phone: $('custPhone').value.replace(/\D/g, '').slice(-10),
    address: $('custAddress').value.trim(),
    gstin: $('custGstin').value.trim().toUpperCase(),
    items: items.map(i => ({ name: i.name, desc: i.desc, qty: i.qty, rate: i.rate })),
    discType: $('discType').value,
    discValue: $('discValue').value,
    delivery: $('delivery').value,
    payMode: $('payMode').value,
    payStatus: $('payStatus').value,
    advance: $('advance').value,
    orderType: $('orderType').value,
    slot: $('slot').value.trim(),
    notes: $('notes').value.trim()
  };
}

function writeForm(f) {
  $('invNo').value = f.invoiceNo || '';
  $('invDate').value = f.date || todayISO();
  $('custName').value = f.name || '';
  $('custPhone').value = f.phone || '';
  $('custAddress').value = f.address || '';
  $('custGstin').value = f.gstin || '';
  items = (f.items || []).map(i => ({ ...i }));
  $('discType').value = f.discType || 'amount';
  $('discValue').value = f.discValue || '';
  $('delivery').value = f.delivery || '';
  $('payMode').value = f.payMode || 'Cash';
  $('payStatus').value = f.payStatus || 'full';
  $('advance').value = f.advance || '';
  $('orderType').value = f.orderType || 'Walk-in';
  $('slot').value = f.slot || '';
  $('notes').value = f.notes || '';
  onPayStatusChange(true);
  renderItems();
}

// Pure function: form state -> invoice object for the PDF engine
function invoiceFromForm(f) {
  const valid = f.items.filter(i => String(i.name).trim() && num(i.qty) > 0);
  const lines = valid.map(i => ({ name: i.name.trim(), desc: (i.desc || '').trim(), qty: num(i.qty), rate: num(i.rate) }));
  const subtotal = lines.reduce((s, i) => s + i.qty * i.rate, 0);
  const discount = f.discType === 'percent' ? subtotal * Math.min(num(f.discValue), 100) / 100 : num(f.discValue);

  const inv = {
    invoiceNo: f.invoiceNo || nextInvoiceNo(f.date),
    date: new Date(f.date + 'T12:00:00'),
    customer: { name: f.name || 'Walk-in Customer', phone: f.phone, address: f.address, gstin: f.gstin },
    meta: [['Type', f.orderType], ['Schedule', f.slot], ['Payment', f.payMode]],
    items: lines,
    discount: discount,
    deliveryCharge: num(f.delivery),
    paidAmount: 0,
    paymentMode: f.payMode,
    notes: f.notes
  };
  const grand = calcInvoiceTotals(inv).grand;
  inv.paidAmount = f.payStatus === 'full' ? grand : (f.payStatus === 'advance' ? num(f.advance) : 0);
  return inv;
}

function onPayStatusChange(silent) {
  $('advanceBlock').style.display = $('payStatus').value === 'advance' ? 'block' : 'none';
  if (!silent) updateSummary();
}

function updateSummary() {
  const inv = invoiceFromForm(readForm());
  const t = calcInvoiceTotals(inv);
  $('sumTotal').innerText = 'Rs. ' + t.grand.toLocaleString('en-IN');
  $('sumLabel').innerText = t.status === 'PAID' ? 'Total (paid)' : 'Total';
  $('sumSub').innerText = t.balance > 0 ? 'Balance due: Rs. ' + t.balance.toLocaleString('en-IN') : (t.gstOn ? `Incl. GST @ ${BUSINESS.gstRate}%` : '');
}

// ---------- Actions ----------
function prepareInvoice() {
  const f = readForm();
  const hasItem = f.items.some(i => String(i.name).trim() && num(i.qty) > 0 && num(i.rate) >= 0 && String(i.rate) !== '');
  if (!hasItem) { toast('Add at least one item with a rate'); return null; }
  if (!f.invoiceNo) { f.invoiceNo = nextInvoiceNo(f.date); $('invNo').value = f.invoiceNo; }
  const inv = invoiceFromForm(f);
  saveToHistory(f, inv);
  return inv;
}

function downloadManualInvoice() {
  const inv = prepareInvoice();
  if (!inv) return;
  try { downloadInvoicePDF(inv); } catch (e) { toast('Could not create the PDF: ' + e.message); }
}

async function shareManualInvoice() {
  const inv = prepareInvoice();
  if (!inv) return;
  const t = calcInvoiceTotals(inv);
  const msg = `*${BUSINESS.name}*\nInvoice ${inv.invoiceNo}\nTotal: Rs. ${t.grand}` +
    (t.balance > 0 ? `\nBalance due: Rs. ${t.balance}` : '\nPaid. Thank you!');
  try {
    const doc = buildInvoicePDF(inv);
    const file = new File([doc.output('blob')], invoiceFileName(inv), { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Invoice ' + inv.invoiceNo, text: msg });
      return;
    }
    // Computers and some browsers cannot share files: save the PDF and open WhatsApp with a text summary
    doc.save(invoiceFileName(inv));
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const phone = inv.customer.phone ? '91' + inv.customer.phone : '';
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  toast('PDF saved. Attach it in WhatsApp.');
}

// ---------- History ----------
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}

function saveToHistory(f, inv) {
  const t = calcInvoiceTotals(inv);
  const list = loadHistory().filter(h => h.form.invoiceNo !== f.invoiceNo);
  list.unshift({ form: f, total: t.grand, status: t.status, savedAt: Date.now() });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) {}
  bumpSequence(f.invoiceNo);
  renderHistory();
}

function renderHistory() {
  const list = loadHistory();
  const box = $('historyList');
  if (!list.length) { box.innerHTML = '<div class="h-empty">Invoices you create appear here.</div>'; return; }
  box.innerHTML = list.slice(0, 15).map(h => `
    <div class="h-card">
      <div class="h-top"><span>${esc(h.form.invoiceNo)}</span><span>Rs. ${h.total.toLocaleString('en-IN')}</span></div>
      <div class="h-sub">${esc(h.form.name || 'Walk-in Customer')} · ${esc(h.status)} · ${esc(h.form.date)}</div>
      <div class="h-actions">
        <button class="h-btn" onclick="redownload('${esc(h.form.invoiceNo)}')">📄 PDF</button>
        <button class="h-btn" onclick="editInvoice('${esc(h.form.invoiceNo)}')">✏️ Edit</button>
        <button class="h-btn del" onclick="deleteInvoice('${esc(h.form.invoiceNo)}')">🗑</button>
      </div>
    </div>`).join('');
}

function findSaved(no) { return loadHistory().find(h => h.form.invoiceNo === no); }

function redownload(no) {
  const h = findSaved(no);
  if (h) downloadInvoicePDF(invoiceFromForm(h.form));
}

function editInvoice(no) {
  const h = findSaved(no);
  if (!h) return;
  writeForm(h.form);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('Loaded ' + no + '. Download again to update it.');
}

function deleteInvoice(no) {
  if (!confirm('Delete invoice ' + no + ' from this list?')) return;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(loadHistory().filter(h => h.form.invoiceNo !== no))); } catch (e) {}
  renderHistory();
}

// ---------- Start ----------
function init() {
  const iso = todayISO();
  writeForm({ date: iso, invoiceNo: nextInvoiceNo(iso), items: [] });
  renderCakeSelect();
  renderHistory();
  loadLiveMenu();
  $('invDate').addEventListener('change', () => {
    // Keep the number in step with the date while it is still an unsaved suggestion
    const cur = $('invNo').value.trim();
    if (!cur || /-\d{6}-\d+$/.test(cur) && !findSaved(cur)) $('invNo').value = nextInvoiceNo($('invDate').value || todayISO());
  });
}

window.onload = init;