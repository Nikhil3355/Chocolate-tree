let enteredPin = "";
let allOrders = [];
let liveCatalog = [];

function initSecurity() {
    const isAuth = sessionStorage.getItem("ct_admin_auth");
    if (isAuth === "true") {
        unlockAdminView();
    } else {
        document.getElementById("pinOverlay").style.display = "flex";
        document.getElementById("adminApp").style.display = "none";
    }
}

function enterPinDigit(digit) {
    if (enteredPin.length < 4) {
        enteredPin += digit;
        updatePinDots();
        if (enteredPin.length === 4) {
            verifyPin();
        }
    }
}

function clearPin() {
    enteredPin = "";
    updatePinDots();
    document.getElementById("pinError").innerText = "";
}

function backspacePin() {
    if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
        document.getElementById("pinError").innerText = "";
    }
}

function updatePinDots() {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`dot${i}`);
        if (i < enteredPin.length) {
            dot.classList.add("filled");
        } else {
            dot.classList.remove("filled");
        }
    }
}

function verifyPin() {
    if (enteredPin === DEFAULT_PIN) {
        sessionStorage.setItem("ct_admin_auth", "true");
        unlockAdminView();
    } else {
        document.getElementById("pinError").innerText = "Invalid PIN. Try again.";
        setTimeout(() => { clearPin(); }, 500);
    }
}

function unlockAdminView() {
    document.getElementById("pinOverlay").style.display = "none";
    document.getElementById("adminApp").style.display = "flex";
    initOrdersUi();
    syncStickyOffsets();
    loadInitialData();
}

function logoutAdmin() {
    sessionStorage.removeItem("ct_admin_auth");
    clearPin();
    document.getElementById("adminApp").style.display = "none";
    document.getElementById("pinOverlay").style.display = "flex";
}

function switchTab(tab) {
    document.getElementById("tabBtnOrders").classList.toggle("active", tab === "orders");
    document.getElementById("tabBtnMenu").classList.toggle("active", tab === "menu");
    document.getElementById("viewOrders").classList.toggle("active", tab === "orders");
    document.getElementById("viewMenu").classList.toggle("active", tab === "menu");

    if (tab === "menu" && liveCatalog.length === 0) {
        loadCatalogData();
    }
}

async function loadInitialData() {
    await refreshOrdersFeed();
    loadCatalogData();
}

async function refreshOrdersFeed() {
    const container = document.getElementById("ordersContainer");
    container.innerHTML = `
    <div class="loader-wrap">
      <div class="spinner"></div>
      <div>Fetching live orders from Google Sheet...</div>
    </div>`;

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getOrders&_t=${Date.now()}`);
        const json = await response.json();

        if (json.status === "success" && Array.isArray(json.orders)) {
            allOrders = json.orders;
            updateMetrics();
            applyOrderFilters();
        } else {
            container.innerHTML = `<div class="empty-state">No orders received yet or sheet empty.</div>`;
        }
    } catch (err) {
        console.error("Error loading orders:", err);
        container.innerHTML = `
      <div class="empty-state" style="color:#b91c1c;">
        ⚠️ Could not connect to Google Sheet.<br>
        <small style="opacity:0.8;">Check internet or Apps Script deployment permissions.</small>
      </div>`;
    }
}

// =====================================================================
//  ORDERS FEED (compact rows, grouped by when the cake is needed)
// =====================================================================
let currentView = "active";
const expandedOrders = new Set();
let ordersUiReady = false;

// Maps the status text in the sheet to a stage
function getOrderStage(statusRaw) {
    const s = String(statusRaw || "").toLowerCase();
    if (s.includes("not received")) return "rejected";
    if (s.includes("delivered") || s.includes("done")) return "delivered";
    if (s.includes("confirmed") || s.includes("verified") || s.includes("paid")) return "confirmed";
    if (s.includes("submitted")) return "submitted";
    return "pending";
}

function isCodOrder(o) {
    return !String(o.paymentMode || "").toLowerCase().includes("upi");
}

function shortStatus(o) {
    const stage = getOrderStage(o.status);
    if (stage === "submitted") return "To verify";
    if (stage === "rejected") return "Payment not found";
    if (stage === "pending") return isCodOrder(o) ? "To confirm" : "Awaiting payment";
    if (stage === "confirmed") return "Confirmed";
    return "Delivered";
}

// ---------- Due date helpers (read from the slot text, e.g. "2026-11-10 (05 PM - 07 PM)") ----------
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function clockToDate(day, h, m, ap) {
    let hh = Number(h) % 12;
    if (/pm/i.test(ap)) hh += 12;
    const d = new Date(day);
    d.setHours(hh, Number(m || 0), 0, 0);
    return d;
}

function getDueInfo(o) {
    const slot = String(o.slot || "");
    const dm = slot.match(/(\d{4})-(\d{2})-(\d{2})/);
    let day;
    if (dm) {
        day = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]));
    } else {
        const t = new Date(o.timestamp);
        day = startOfDay(isNaN(t.getTime()) ? new Date() : t);
    }

    const times = [...slot.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi)];
    let start, end = null, hasTime = false;
    if (times.length) {
        hasTime = true;
        start = clockToDate(day, times[0][1], times[0][2], times[0][3]);
        end = times[1]
            ? clockToDate(day, times[1][1], times[1][2], times[1][3])
            : new Date(start.getTime() + 2 * 3600 * 1000);
    } else {
        start = new Date(day);
        start.setHours(23, 59, 0, 0);
    }
    return { day, start, end, hasTime };
}

function dayShort(day) {
    const diff = Math.round((startOfDay(day) - startOfDay(new Date())) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function dayHeading(day) {
    const nice = day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const short = dayShort(day);
    return short === nice ? nice : `${short} · ${nice}`;
}

function slotTimeText(o) {
    const m = String(o.slot || "").match(/\(([^)]*(?:AM|PM)[^)]*)\)/i);
    return m ? m[1].replace(/\b0(\d)/g, "$1") : "";
}

function urgencyTag(o, stage) {
    if (stage === "delivered") return "";
    const info = getDueInfo(o);
    const now = new Date();
    const today = startOfDay(now);
    if (startOfDay(info.day) < today) return `<span class="u-tag red">Overdue</span>`;
    if (startOfDay(info.day) > today || !info.hasTime) return "";
    if (now > info.end) return `<span class="u-tag red">Late</span>`;
    if (now >= info.start) return `<span class="u-tag red">Due now</span>`;
    const mins = Math.round((info.start - now) / 60000);
    const txt = mins < 60 ? `in ${mins} min` : (Math.round(mins / 60) === 1 ? "in 1 hr" : `in ${Math.round(mins / 60)} hrs`);
    const cls = mins <= 60 ? "red" : (mins <= 180 ? "amber" : "gray");
    return `<span class="u-tag ${cls}">⏰ ${txt}</span>`;
}

// ---------- Counts, strip and badge ----------
function viewMatches(o, view) {
    const stage = getOrderStage(o.status);
    if (view === "active") return stage !== "delivered";
    if (view === "today") return startOfDay(getDueInfo(o).day).getTime() === startOfDay(new Date()).getTime();
    if (view === "verify") return stage === "submitted";
    if (view === "delivered") return stage === "delivered";
    return true;
}

function updateMetrics() {
    const counts = { active: 0, today: 0, verify: 0, delivered: 0, all: allOrders.length };
    let sales = 0, salesToday = 0;
    const todayStart = startOfDay(new Date()).getTime();

    allOrders.forEach(o => {
        ["active", "today", "verify", "delivered"].forEach(v => { if (viewMatches(o, v)) counts[v]++; });
        const stage = getOrderStage(o.status);
        if (stage === "confirmed" || stage === "delivered") {
            const amt = parseFloat(o.amount) || 0;
            sales += amt;
            const placed = new Date(o.timestamp);
            if (!isNaN(placed.getTime()) && startOfDay(placed).getTime() === todayStart) salesToday += amt;
        }
    });

    Object.keys(counts).forEach(v => {
        const el = document.getElementById("cnt_" + v);
        if (el) el.innerText = counts[v];
    });

    const dateEl = document.getElementById("stripDate");
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
    const salesEl = document.getElementById("stripSales");
    if (salesEl) salesEl.innerHTML = `Sales <b>₹${sales.toLocaleString("en-IN")}</b> · Today <b>₹${salesToday.toLocaleString("en-IN")}</b>`;

    // Tab badge: orders waiting for payment verification first, otherwise all active orders
    document.getElementById("ordersCountBadge").innerText = counts.verify > 0 ? counts.verify : counts.active;
}

function setView(view, btnElement) {
    currentView = view;
    document.querySelectorAll("#chipGroup .chip-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    renderOrders();
    window.scrollTo({ top: 0 });
}

function applyOrderFilters() {
    renderOrders();
}

// ---------- Row rendering ----------
function primaryAction(o, stage) {
    const id = escapeHtml(o.orderId);
    const cod = isCodOrder(o);
    if (stage === "submitted") return `<button class="o-btn verify" data-act="verify" data-id="${id}">✅ Verify</button>`;
    if (stage === "pending" && cod) return `<button class="o-btn go" data-act="verify" data-id="${id}">✅ Confirm</button>`;
    if (stage === "pending" || stage === "rejected") return `<button class="o-btn ghost" data-act="remind" data-id="${id}">💬 Remind</button>`;
    if (stage === "confirmed") return `<button class="o-btn ok" data-act="deliver" data-id="${id}">🚚 Delivered</button>`;
    return `<button class="o-btn ghost" data-act="invoice" data-id="${id}">📄 Invoice</button>`;
}

function renderOrderRow(o) {
    const stage = getOrderStage(o.status);
    const id = escapeHtml(o.orderId);
    const cod = isCodOrder(o);
    const home = String(o.fulfillmentType || "").toLowerCase().includes("delivery");
    const cleanPhone = String(o.customerPhone || "").replace(/[^0-9]/g, "").slice(-10);
    const info = getDueInfo(o);
    const time = slotTimeText(o);
    const hasMsg = o.messageOnCake && !/^(none|no message)/i.test(o.messageOnCake);
    const hasCandles = o.candles && o.candles !== "No";
    const open = expandedOrders.has(String(o.orderId));

    // Details shown when the row is opened
    let note = "";
    if (stage === "submitted") {
        note = `<div class="verify-note">💰 Customer says they paid ₹${escapeHtml(o.amount)}. Check your UPI app or bank for note <b>Order-${id}</b>, then tap Verify.</div>`;
    } else if (stage === "rejected") {
        note = `<div class="verify-note warn">Payment marked as not received. Waiting for the customer to pay again or send proof.</div>`;
    } else if (stage === "pending" && !cod) {
        note = `<div class="verify-note muted">Customer has not tapped "I have paid" yet.</div>`;
    }

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.deliveryAddress || "")}`;
    let actions = `<a class="d-btn" href="tel:+91${cleanPhone}">📞 Call</a>
        <a class="d-btn" href="https://wa.me/91${cleanPhone}" target="_blank">💬 Chat</a>`;
    if (home && o.deliveryAddress) actions += `<a class="d-btn" href="${mapsUrl}" target="_blank">📍 Map</a>`;
    if (stage !== "delivered") actions += `<button class="d-btn" data-act="invoice" data-id="${id}">📄 Invoice</button>`;
    if (stage === "confirmed" || stage === "delivered") actions += `<button class="d-btn" data-act="resend" data-id="${id}">📩 Resend confirmation</button>`;
    if (!cod && (stage === "submitted" || stage === "pending")) actions += `<button class="d-btn red" data-act="reject" data-id="${id}">❌ Not received</button>`;
    if (stage === "delivered") actions += `<button class="d-btn" data-act="reopen" data-id="${id}">↩️ Re-open</button>`;

    return `
    <article class="o-row stage-${stage} ${open ? "open" : ""}" data-id="${id}">
      <div class="o-main">
        <div class="o-left">
          <div class="o-name"><span>${escapeHtml(o.customerName || "Customer")}</span><span class="o-chev">▼</span></div>
          <div class="o-cake">${escapeHtml(o.cakeName)} · ${escapeHtml(o.size || "Standard")}</div>
          <div class="o-meta">
            <span>${home ? "🛵 Delivery" : "🏬 Pickup"} · ${dayShort(info.day)}${time ? " · " + escapeHtml(time) : ""}</span>
          </div>
          <div class="o-meta">
            <span class="status-pill xs ${stage}">${shortStatus(o)}</span>
            ${urgencyTag(o, stage)}
            ${hasMsg ? '<span class="o-ico" title="Message on cake">✍️</span>' : ""}
            ${hasCandles ? '<span class="o-ico" title="Candles needed">🕯️</span>' : ""}
          </div>
        </div>
        <div class="o-right">
          <div class="o-amt">₹${escapeHtml(o.amount)}</div>
          ${primaryAction(o, stage)}
        </div>
      </div>

      <div class="o-details">
        ${note}
        <div class="d-row"><span class="d-k">Order</span><span>#${id} · ${formatDateTime(o.timestamp)}</span></div>
        <div class="d-row"><span class="d-k">Customer</span><span>${escapeHtml(o.customerName || "Customer")} · +91 ${cleanPhone.replace(/^(\d{5})(\d{5})$/, "$1 $2")}</span></div>
        <div class="d-row"><span class="d-k">${home ? "Deliver" : "Pickup"}</span><span>${escapeHtml(o.slot || "Scheduled")}</span></div>
        ${home ? `<div class="d-row"><span class="d-k">Address</span><span>${escapeHtml(o.deliveryAddress)}</span></div>` : ""}
        <div class="d-row"><span class="d-k">Payment</span><span>${escapeHtml(o.paymentMode || "Pending")}</span></div>
        ${hasMsg ? `<div class="message-tag">✍️ "${escapeHtml(o.messageOnCake)}"</div>` : ""}
        ${hasCandles ? `<div class="candle-tag">🕯️ Candles: ${escapeHtml(o.candles)}</div>` : ""}
        <div class="d-actions">${actions}</div>
      </div>
    </article>`;
}

function sortByDue(list, dir) {
    const sign = dir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => sign * (getDueInfo(a).start - getDueInfo(b).start));
}

function sectionHtml(title, cls, list, rowsHtml) {
    return `<div class="sec-title ${cls || ""}">${title}<span class="n">${list.length}</span></div>${rowsHtml}`;
}

// Groups orders under day headings (Overdue first when asked)
function renderDayGroups(list, dir, withOverdue) {
    const today = startOfDay(new Date());
    const overdue = [];
    const groups = new Map();
    list.forEach(o => {
        const day = getDueInfo(o).day;
        if (withOverdue && day < today) { overdue.push(o); return; }
        const k = day.getTime();
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(o);
    });

    let html = "";
    if (overdue.length) {
        html += `<div class="day-title red">⚠️ Overdue<span class="n">${overdue.length}</span></div>` +
            sortByDue(overdue, "asc").map(renderOrderRow).join("");
    }
    const keys = [...groups.keys()].sort((a, b) => dir === "desc" ? b - a : a - b);
    keys.forEach(k => {
        const items = groups.get(k);
        html += `<div class="day-title">${dayHeading(new Date(k))}<span class="n">${items.length}</span></div>` +
            sortByDue(items, dir).map(renderOrderRow).join("");
    });
    return html;
}

function emptyHtml(msg) {
    return `<div class="empty-state">${msg}</div>`;
}

function renderOrders() {
    const container = document.getElementById("ordersContainer");
    const search = (document.getElementById("orderSearchInput").value || "").toLowerCase().trim();

    // Searching looks through every order, whatever tab is selected
    if (search) {
        const results = allOrders.filter(o =>
            [o.orderId, o.customerName, o.customerPhone, o.cakeName].some(v => String(v || "").toLowerCase().includes(search)))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        container.innerHTML = results.length
            ? `<div class="sec-title">Search results<span class="n">${results.length}</span></div>` + results.map(renderOrderRow).join("")
            : emptyHtml("No orders match your search.");
        return;
    }

    const list = allOrders.filter(o => viewMatches(o, currentView));

    if (currentView === "active") {
        const verify = sortByDue(list.filter(o => getOrderStage(o.status) === "submitted"), "asc");
        const confirmCod = sortByDue(list.filter(o => getOrderStage(o.status) === "pending" && isCodOrder(o)), "asc");
        const prepare = list.filter(o => getOrderStage(o.status) === "confirmed");
        const waiting = sortByDue(list.filter(o => {
            const s = getOrderStage(o.status);
            return (s === "pending" && !isCodOrder(o)) || s === "rejected";
        }), "asc");

        let html = "";
        if (verify.length) html += sectionHtml("💰 To verify", "purple", verify, verify.map(renderOrderRow).join(""));
        if (confirmCod.length) html += sectionHtml("✋ New orders to confirm", "", confirmCod, confirmCod.map(renderOrderRow).join(""));
        if (prepare.length) html += `<div class="sec-title blue">🎂 To prepare &amp; deliver<span class="n">${prepare.length}</span></div>` + renderDayGroups(prepare, "asc", true);
        if (waiting.length) html += sectionHtml("⏳ Waiting for customer payment", "gray", waiting, waiting.map(renderOrderRow).join(""));
        container.innerHTML = html || emptyHtml("🎉 Nothing needs your attention right now.");
        return;
    }

    if (!list.length) {
        const msgs = { today: "No orders due today.", verify: "No payments waiting to be verified.", delivered: "No delivered orders yet.", all: "No orders yet." };
        container.innerHTML = emptyHtml(msgs[currentView] || "No orders.");
        return;
    }

    if (currentView === "verify") {
        container.innerHTML = sortByDue(list, "asc").map(renderOrderRow).join("");
    } else if (currentView === "today") {
        const open = sortByDue(list.filter(o => getOrderStage(o.status) !== "delivered"), "asc");
        const done = sortByDue(list.filter(o => getOrderStage(o.status) === "delivered"), "asc");
        container.innerHTML = open.map(renderOrderRow).join("") +
            (done.length ? `<div class="sec-title green">✅ Done today<span class="n">${done.length}</span></div>` + done.map(renderOrderRow).join("") : "");
    } else {
        container.innerHTML = renderDayGroups(list, "desc", false);
    }
}

// ---------- Clicks: open/close rows and run actions ----------
function initOrdersUi() {
    if (ordersUiReady) return;
    ordersUiReady = true;
    document.getElementById("ordersContainer").addEventListener("click", handleOrdersClick);
    syncStickyOffsets();
    window.addEventListener("resize", syncStickyOffsets);
}

// Keeps the search bar pinned right under the top bar, whatever its height
function syncStickyOffsets() {
    const bar = document.querySelector(".app-bar");
    if (bar) document.documentElement.style.setProperty("--appbar-h", bar.offsetHeight + "px");
}

function handleOrdersClick(e) {
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
        runOrderAction(actBtn.dataset.act, actBtn.dataset.id, actBtn);
        return;
    }
    if (e.target.closest("a")) return;           // call, chat and map links work normally
    if (e.target.closest(".o-details")) return;  // taps inside the details do not close the row
    const row = e.target.closest(".o-row");
    if (!row) return;
    const id = row.dataset.id;
    if (expandedOrders.has(id)) expandedOrders.delete(id); else expandedOrders.add(id);
    row.classList.toggle("open", expandedOrders.has(id));
}

function runOrderAction(act, id, btn) {
    const o = findOrder(id);
    if (!o) return;
    if (act === "verify") approveAndConfirmOrder(id);
    else if (act === "deliver") updateOrderStatusAction(id, "Delivered", btn);
    else if (act === "reopen") updateOrderStatusAction(id, isCodOrder(o) ? "Confirmed" : "Confirmed & Paid", btn);
    else if (act === "reject") rejectPayment(id);
    else if (act === "resend") notifyCustomer(id);
    else if (act === "invoice") downloadAdminTaxPDF(o);
    else if (act === "remind") remindPayment(id);
}

// Gentle WhatsApp reminder for orders still waiting for payment
function remindPayment(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    const msg =
        `Hello *${o.customerName}*,\n\n` +
        `Your order *#${o.orderId}* (${o.cakeName}) at *${SHOP_NAME}* is waiting for payment of *₹${o.amount}*.\n\n` +
        `Please pay to *${SHOP_UPI_ID}* with note *Order-${o.orderId}*, then open our website, tap *My order* and press *I have paid*.\n\n` +
        `Message us here if you need any help!`;
    window.open(whatsappUrl(o.customerPhone, msg), "_blank");
}

function findOrder(orderId) {
    return allOrders.find(o => String(o.orderId) === String(orderId));
}

function postStatus(orderId, status) {
    return fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateOrderStatus", orderId: orderId, status: status })
    });
}

function whatsappUrl(phone, msg) {
    const clean = String(phone || "").replace(/[^0-9]/g, "").slice(-10);
    return `https://wa.me/91${clean}?text=${encodeURIComponent(msg)}`;
}

// 1-tap: verify payment (or confirm COD order), update the sheet, open WhatsApp confirmation to the customer
function approveAndConfirmOrder(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    const isCOD = isCodOrder(o);
    const question = isCOD
        ? `Confirm Order #${orderId} (pay on pickup/delivery)?`
        : `Confirm that payment of ₹${o.amount} for Order #${orderId} was received?`;
    if (!confirm(question)) return;

    const newStatus = isCOD ? "Confirmed" : "Confirmed & Paid";
    postStatus(orderId, newStatus).catch(err => alert("Could not update the Google Sheet: " + err));

    o.status = newStatus;
    updateMetrics();
    applyOrderFilters();

    // Opened in the same tap so the browser does not block it
    window.open(whatsappUrl(o.customerPhone, buildConfirmMessage(o)), "_blank");
}

function buildConfirmMessage(o) {
    const isCOD = isCodOrder(o);
    return (
        `Hello *${o.customerName}*! 👋\n\n` +
        (isCOD
            ? `Your order *#${o.orderId}* at *${SHOP_NAME}* is *CONFIRMED*! 🎂\n\n`
            : `Your payment of *₹${o.amount}* for order *#${o.orderId}* at *${SHOP_NAME}* is *RECEIVED & CONFIRMED*! ✅🎂\n\n`) +
        `• *Cake:* ${o.cakeName} (${o.size})\n` +
        (o.candles && o.candles !== "No" ? `• *Candles:* ${o.candles}\n` : '') +
        `• *Scheduled For:* ${o.slot}\n` +
        (isCOD ? `• *To pay on ${String(o.fulfillmentType).toLowerCase().includes("delivery") ? "delivery" : "pickup"}:* ₹${o.amount}\n` : '') +
        `\nOpen our website and tap *My order* to see your order status and download your bill.\n` +
        `Our chefs are getting your cake ready. Message us here if you need anything!`
    );
}

// Customer says they paid but nothing arrived in the shop's account
function rejectPayment(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    if (!confirm(`Mark payment for Order #${orderId} as NOT received and message the customer?`)) return;

    postStatus(orderId, "Payment Not Received").catch(err => alert("Could not update the Google Sheet: " + err));
    o.status = "Payment Not Received";
    updateMetrics();
    applyOrderFilters();

    const msg =
        `Hello *${o.customerName}*,\n\n` +
        `We could not find your payment of *₹${o.amount}* for order *#${o.orderId}* yet.\n\n` +
        `If you have already paid, please send the UPI transaction ID or a screenshot here. ` +
        `Otherwise please pay to *${SHOP_UPI_ID}* with note *Order-${o.orderId}*.`;
    window.open(whatsappUrl(o.customerPhone, msg), "_blank");
}

// Re-send the confirmation message to a confirmed customer
function notifyCustomer(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    window.open(whatsappUrl(o.customerPhone, buildConfirmMessage(o)), "_blank");
}

async function updateOrderStatusAction(orderId, newStatus, btnElement) {
    if (!confirm(`Change Order #${orderId} status to "${newStatus}"?`)) return;

    const originalText = btnElement.innerText;
    btnElement.innerText = "Saving...";
    btnElement.disabled = true;

    try {
        await postStatus(orderId, newStatus);

        const match = findOrder(orderId);
        if (match) match.status = newStatus;

        updateMetrics();
        applyOrderFilters();
    } catch (err) {
        alert("Failed to update status on Google Sheet: " + err);
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

function downloadAdminTaxPDF(orderJsonStr) {
    try {
        const data = typeof orderJsonStr === "string" ? JSON.parse(orderJsonStr) : orderJsonStr;
        // Layout and business details live in js/invoice.js and js/config.js
        downloadInvoicePDF(orderToInvoice(data));
    } catch (err) {
        alert("Could not generate PDF: " + err.message);
    }
}

async function loadCatalogData() {
    const container = document.getElementById("catalogEditorContainer");
    container.innerHTML = `
    <div class="loader-wrap">
      <div class="spinner"></div>
      <div>Fetching live menu prices from Sheet...</div>
    </div>`;

    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMenu&_t=${Date.now()}`);
        const json = await response.json();

        if (json.status === "success" && Array.isArray(json.menu) && json.menu.length > 0) {
            liveCatalog = defaultCatalogStructure.map(item => {
                const remote = json.menu.find(r => r.id === item.id);
                if (remote) {
                    return {
                        ...item,
                        image: remote.image ? remote.image : item.image,
                        hasCustomPhoto: !!remote.image,
                        prices: remote.prices || item.prices,
                        inStock: remote.inStock !== undefined ? remote.inStock : item.inStock
                    };
                }
                return item;
            });
        } else {
            liveCatalog = JSON.parse(JSON.stringify(defaultCatalogStructure));
        }
        renderCatalogEditor();
    } catch (err) {
        console.warn("Using offline catalog structure:", err);
        liveCatalog = JSON.parse(JSON.stringify(defaultCatalogStructure));
        renderCatalogEditor();
    }
}

function renderCatalogEditor() {
    const container = document.getElementById("catalogEditorContainer");
    const categories = [
        "Chocolate Specialty",
        "Premium Cake",
        "Kunafa Special",
        "Indian Fusion",
        "Fresh & Fruity"
    ];

    let html = "";
    categories.forEach(cat => {
        const items = liveCatalog.filter(c => c.category === cat);
        if (items.length > 0) {
            html += `<div class="menu-cat-title">${cat} (${items.length})</div>`;
            items.forEach(cake => {
                const isStock = cake.inStock !== false;
                html += `
          <div class="catalog-item-card ${isStock ? '' : 'sold-out'}" id="card_${cake.id}">
            <div class="cat-item-header">
              <div class="cat-item-name">${escapeHtml(cake.name)}</div>
              <div class="switch-wrap ${isStock ? 'active' : ''}" onclick="toggleCakeStock('${cake.id}')">
                <div class="toggle-slider"></div>
                <span class="stock-text" id="stockText_${cake.id}">${isStock ? 'In Stock' : 'Sold Out'}</span>
              </div>
            </div>

            <div class="photo-row">
              <img class="photo-thumb" id="thumb_${cake.id}" src="${escapeHtml(cake.image)}" alt="" />
              <div class="photo-actions">
                <label class="btn-photo">
                  📷 Change Photo
                  <input type="file" accept="image/*" hidden onchange="changeCakePhoto('${cake.id}', this)" />
                </label>
                <button type="button" class="btn-photo-reset" id="resetBtn_${cake.id}" style="${cake.hasCustomPhoto ? '' : 'display:none;'}" onclick="resetCakePhoto('${cake.id}')">↩️ Default</button>
                <div class="photo-msg" id="photoMsg_${cake.id}"></div>
              </div>
            </div>

            <div class="price-inputs-grid">
              <div class="price-input-box">
                <label>Pastry (₹)</label>
                <input 
                  type="number" 
                  id="price_pastry_${cake.id}" 
                  value="${cake.prices.pastry !== null ? cake.prices.pastry : ''}" 
                  placeholder="N/A" 
                  class="price-field"
                  ${cake.prices.pastry === null ? 'disabled' : ''}
                />
              </div>
              <div class="price-input-box">
                <label>${cat.includes('Kunafa') ? 'Medium (₹)' : 'Small (₹)'}</label>
                <input 
                  type="number" 
                  id="price_small_${cake.id}" 
                  value="${cake.prices.small !== null ? cake.prices.small : ''}" 
                  placeholder="Price" 
                  class="price-field"
                />
              </div>
              <div class="price-input-box">
                <label>Large (₹)</label>
                <input 
                  type="number" 
                  id="price_large_${cake.id}" 
                  value="${cake.prices.large !== null ? cake.prices.large : ''}" 
                  placeholder="N/A" 
                  class="price-field"
                  ${cake.prices.large === null ? 'disabled' : ''}
                />
              </div>
            </div>
          </div>
        `;
            });
        }
    });

    container.innerHTML = html;
}

// ================= CAKE PHOTO UPLOAD =================
// Shrinks the photo on the phone first so the upload is small and fast
function resizeImageToBase64(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the photo"));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("This file is not a valid image"));
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function setPhotoMsg(cakeId, msg, isError) {
    const el = document.getElementById(`photoMsg_${cakeId}`);
    if (!el) return;
    el.innerText = msg;
    el.style.color = isError ? "#b91c1c" : "#15803d";
}

async function fetchSavedImage(cakeId) {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMenu&_t=${Date.now()}`);
    const json = await res.json();
    const item = (json.menu || []).find(m => m.id === cakeId);
    return item && item.image ? item.image : "";
}

// Sends a photo action to Apps Script and returns its JSON reply.
// Returns null if the browser blocks reading the reply (the request still went through).
async function postPhotoAction(payload) {
    const opts = {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    };
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, opts);
        return await res.json();
    } catch (err) {
        await fetch(GOOGLE_SCRIPT_URL, { ...opts, mode: "no-cors" });
        return null;
    }
}

async function changeCakePhoto(cakeId, input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    const cake = liveCatalog.find(c => c.id === cakeId);
    if (!cake) return;

    try {
        setPhotoMsg(cakeId, "⏳ Uploading photo...", false);
        const base64 = await resizeImageToBase64(file, 900);
        const before = cake.hasCustomPhoto ? cake.image : "";

        const reply = await postPhotoAction({ action: "updateCakePhoto", id: cakeId, imageBase64: base64, mimeType: "image/jpeg" });
        if (reply && reply.status !== "success") throw new Error("Server said: " + (reply.message || "unknown error"));

        const saved = (reply && reply.imageUrl) || await fetchSavedImage(cakeId);
        if (!saved || saved === before) throw new Error("Photo was not saved. Check the Apps Script update.");

        cake.image = saved;
        cake.hasCustomPhoto = true;
        document.getElementById(`thumb_${cakeId}`).src = saved;
        document.getElementById(`resetBtn_${cakeId}`).style.display = "";
        setPhotoMsg(cakeId, "✅ Photo updated. Customers will see it now.", false);
    } catch (err) {
        setPhotoMsg(cakeId, "❌ " + err.message, true);
    }
}

async function resetCakePhoto(cakeId) {
    if (!confirm("Go back to the original photo for this cake?")) return;
    const cake = liveCatalog.find(c => c.id === cakeId);
    if (!cake) return;

    try {
        setPhotoMsg(cakeId, "⏳ Resetting...", false);
        const reply = await postPhotoAction({ action: "updateCakePhoto", id: cakeId, imageUrl: "" });
        if (reply && reply.status !== "success") throw new Error("Server said: " + (reply.message || "unknown error"));
        const original = defaultCatalogStructure.find(c => c.id === cakeId);
        cake.image = original ? original.image : cake.image;
        cake.hasCustomPhoto = false;
        document.getElementById(`thumb_${cakeId}`).src = cake.image;
        document.getElementById(`resetBtn_${cakeId}`).style.display = "none";
        setPhotoMsg(cakeId, "✅ Original photo restored.", false);
    } catch (err) {
        setPhotoMsg(cakeId, "❌ " + err.message, true);
    }
}


function toggleCakeStock(cakeId) {
    const cake = liveCatalog.find(c => c.id === cakeId);
    if (!cake) return;

    cake.inStock = !cake.inStock;
    const card = document.getElementById(`card_${cakeId}`);
    const text = document.getElementById(`stockText_${cakeId}`);
    const switchWrap = card.querySelector(".switch-wrap");

    if (cake.inStock) {
        card.classList.remove("sold-out");
        switchWrap.classList.add("active");
        text.innerText = "In Stock";
    } else {
        card.classList.add("sold-out");
        switchWrap.classList.remove("active");
        text.innerText = "Sold Out";
    }
}

async function saveCatalogChanges() {
    const btn = document.getElementById("btnSaveCatalog");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span>⏳ Updating Google Sheet...</span>";
    btn.disabled = true;

    const payloadItems = liveCatalog.map(cake => {
        const pastryVal = document.getElementById(`price_pastry_${cake.id}`)?.value;
        const smallVal = document.getElementById(`price_small_${cake.id}`)?.value;
        const largeVal = document.getElementById(`price_large_${cake.id}`)?.value;

        return {
            id: cake.id,
            pastry: pastryVal !== "" && !isNaN(pastryVal) ? Number(pastryVal) : null,
            small: smallVal !== "" && !isNaN(smallVal) ? Number(smallVal) : null,
            large: largeVal !== "" && !isNaN(largeVal) ? Number(largeVal) : null,
            inStock: cake.inStock !== false
        };
    });

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "updatePrices",
                items: payloadItems
            })
        });
        alert("✅ Cake Prices & Stock updated successfully in Google Sheet!");
    } catch (err) {
        alert("Failed to update catalog: " + err);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDateTime(val) {
    if (!val) return "Today";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val).substring(0, 16);
    return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}

window.onload = initSecurity;