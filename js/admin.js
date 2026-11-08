let enteredPin = "";
let allOrders = [];
let currentFilterStatus = "all";
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
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getOrders`);
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

function updateMetrics() {
    const total = allOrders.length;
    let pending = 0;
    let delivered = 0;
    let revenue = 0;
    let toVerify = 0;

    allOrders.forEach(o => {
        const stage = getOrderStage(o.status);
        if (stage === "delivered") delivered++;
        else pending++;
        if (stage === "submitted") toVerify++;
        // Sales count only confirmed or delivered orders
        if (stage === "confirmed" || stage === "delivered") {
            revenue += parseFloat(o.amount) || 0;
        }
    });

    document.getElementById("metricTotal").innerText = total;
    document.getElementById("metricPending").innerText = pending;
    document.getElementById("metricDelivered").innerText = delivered;
    document.getElementById("metricRevenue").innerText = `₹${revenue.toLocaleString("en-IN")}`;
    // Badge shows orders waiting for payment verification first
    document.getElementById("ordersCountBadge").innerText = toVerify > 0 ? toVerify : pending;
}

function setFilterStatus(status, btnElement) {
    currentFilterStatus = status;
    document.querySelectorAll(".chip-group .chip-btn").forEach(b => b.classList.remove("active"));
    if (btnElement) btnElement.classList.add("active");
    applyOrderFilters();
}

function applyOrderFilters() {
    const search = (document.getElementById("orderSearchInput").value || "").toLowerCase().trim();
    const container = document.getElementById("ordersContainer");

    const filtered = allOrders.filter(order => {
        const stage = getOrderStage(order.status);
        if (currentFilterStatus !== "all") {
            const want = currentFilterStatus.toLowerCase();
            const matches = want === "pending" ? (stage === "pending" || stage === "rejected") : stage === want;
            if (!matches) return false;
        }

        if (search) {
            const matchId = String(order.orderId || "").toLowerCase().includes(search);
            const matchName = String(order.customerName || "").toLowerCase().includes(search);
            const matchPhone = String(order.customerPhone || "").toLowerCase().includes(search);
            const matchCake = String(order.cakeName || "").toLowerCase().includes(search);
            return matchId || matchName || matchPhone || matchCake;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">No matching orders found.</div>`;
        return;
    }

    container.innerHTML = filtered.map(order => renderOrderCard(order)).join("");
}

function renderOrderCard(o) {
    const statusRaw = (o.status || "Pending Verification").trim();
    const stage = getOrderStage(statusRaw);
    const isDelivered = stage === "delivered";
    const isConfirmed = stage === "confirmed";
    const isCOD = isCodOrder(o);

    const isHomeDelivery = String(o.fulfillmentType).toLowerCase().includes("delivery");
    const cleanPhone = String(o.customerPhone || "").replace(/[^0-9]/g, "");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.deliveryAddress || "")}`;
    const safeOrderJson = encodeURIComponent(JSON.stringify(o));
    const oid = escapeHtml(o.orderId);

    let verifyNote = "";
    if (stage === "submitted") {
        verifyNote = `<div class="verify-note">💰 Customer says they paid ₹${escapeHtml(o.amount)}. Check your UPI app or bank for note <b>Order-${oid}</b>, then tap Verify.</div>`;
    } else if (stage === "rejected") {
        verifyNote = `<div class="verify-note warn">Payment marked as not received. Waiting for the customer to pay again or send proof.</div>`;
    } else if (stage === "pending" && !isCOD) {
        verifyNote = `<div class="verify-note muted">Customer has not tapped "I have paid" yet.</div>`;
    }

    let buttons = `
        <button class="btn-card btn-pdf" onclick="downloadAdminTaxPDF(decodeURIComponent('${safeOrderJson}'))">📄 Tax Bill</button>`;

    if (isDelivered) {
        buttons += `
        <button class="btn-card btn-status" onclick="updateOrderStatusAction('${oid}', '${isCOD ? "Confirmed" : "Confirmed & Paid"}', this)">↩️ Re-open</button>`;
    } else if (isConfirmed) {
        buttons += `
        <button class="btn-card btn-wa" onclick="notifyCustomer('${oid}')">💬 WhatsApp</button>
        <button class="btn-card btn-status mark-done" onclick="updateOrderStatusAction('${oid}', 'Delivered', this)">🚚 Mark Delivered</button>`;
    } else {
        buttons += `
        <button class="btn-card btn-status mark-done" onclick="approveAndConfirmOrder('${oid}')">${isCOD ? "✅ Confirm Order" : "✅ Verify &amp; Confirm"}</button>`;
        if (!isCOD && stage !== "rejected") {
            buttons += `
        <button class="btn-card btn-reject" onclick="rejectPayment('${oid}')">❌ Not Received</button>`;
        }
    }

    return `
    <div class="order-card ${stage}" id="order_${oid}">
      <div class="card-top">
        <div>
          <div class="order-id-badge">
            <span>#${oid || 'CT-ORD'}</span>
          </div>
          <div class="order-date">${formatDateTime(o.timestamp)}</div>
        </div>
        <span class="status-pill ${stage}">${escapeHtml(statusRaw)}</span>
      </div>

      ${verifyNote}

      <div class="customer-box">
        <div class="cust-name">👤 ${escapeHtml(o.customerName || "Customer")}</div>
        <div class="cust-phone">📞 +91 ${cleanPhone}</div>
        <div class="quick-actions">
          <a href="tel:+91${cleanPhone}" class="action-link link-call">📞 Call</a>
          ${isHomeDelivery ? `<a href="${mapsUrl}" target="_blank" class="action-link link-map">📍 Map</a>` : ''}
        </div>
      </div>

      <div class="order-spec">
        <div class="spec-row">
          <span class="cake-highlight">🎂 ${escapeHtml(o.cakeName)}</span>
          <b>(${escapeHtml(o.size || "Standard")})</b>
        </div>

        ${o.messageOnCake && o.messageOnCake !== "None requested" && o.messageOnCake !== "No message" && o.messageOnCake !== "No message requested" ? `
          <div class="message-tag">✍️ "${escapeHtml(o.messageOnCake)}"</div>
        ` : ''}

        <div class="delivery-box">
          <div><b>${isHomeDelivery ? '🛵 Home Delivery' : '🏬 Store Pickup'}:</b> ${escapeHtml(o.slot || 'Scheduled')}</div>
          ${isHomeDelivery ? `<div>📍 <i>${escapeHtml(o.deliveryAddress)}</i></div>` : ''}
        </div>
      </div>

      <div class="card-footer">
        <div>
          <div class="order-amount">₹${escapeHtml(o.amount)}</div>
          <div class="order-paymode">💳 ${escapeHtml(o.paymentMode || "Pending")}</div>
        </div>
      </div>

      <div class="card-buttons">${buttons}
      </div>
    </div>
  `;
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
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "pt", format: "a4" });

        doc.setFillColor(35, 18, 11);
        doc.rect(0, 0, 595, 85, "F");

        doc.setTextColor(255, 119, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.text("CHOCOLATE TREE CAKE SHOP", 40, 40);

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Cakes • Chocolates • Ice Cream | Phone: +91 85540 34632", 40, 60);
        doc.text("GSTIN: [To Be Updated Upon Request]", 40, 74);

        doc.setTextColor(50, 50, 50);
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.text("TAX INVOICE / ORDER RECEIPT", 40, 120);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Invoice No: INV-${data.orderId}`, 40, 140);
        doc.text(`Date: ${formatDateTime(data.timestamp)}`, 40, 155);
        doc.text(`Payment Mode: ${data.paymentMode || 'Paid / Verified'}`, 40, 170);

        doc.text(`Customer: ${data.customerName || 'Walk-in'}`, 320, 140);
        doc.text(`Contact: +91 ${data.customerPhone || 'N/A'}`, 320, 155);
        doc.text(`Fulfillment: ${data.fulfillmentType || 'Store Pickup'}`, 320, 170);
        doc.text(`Schedule: ${data.slot || 'Ready'}`, 320, 185);
        if (data.deliveryAddress && data.deliveryAddress !== "Store Pickup Counter") {
            doc.text(`Address: ${String(data.deliveryAddress).substring(0, 36)}`, 320, 200);
        }

        doc.setFillColor(245, 240, 235);
        doc.rect(40, 225, 515, 24, "F");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("Description", 50, 241);
        doc.text("Size", 260, 241);
        doc.text("Message on Cake", 340, 241);
        doc.text("Total", 500, 241);

        doc.setFont("helvetica", "normal");
        doc.text(String(data.cakeName || "Custom Cake"), 50, 268);
        doc.text(String(data.size || "Standard"), 260, 268);
        doc.text(String(data.messageOnCake || "None").substring(0, 20), 340, 268);
        doc.text(`Rs. ${data.amount}.00`, 500, 268);

        doc.line(40, 290, 555, 290);
        doc.setFont("helvetica", "bold");
        doc.text("Total Amount Payable:", 340, 318);
        doc.setFontSize(14);
        doc.setTextColor(230, 92, 0);
        doc.text(`Rs. ${data.amount}.00`, 500, 318);

        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(130, 130, 130);
        doc.text("Terms & Conditions:", 40, 380);
        doc.text("1. Please keep cakes refrigerated below 5°C.", 40, 395);
        doc.text("2. Please present this bill or Order ID during pickup / delivery handoff.", 40, 410);
        doc.text("Thank you for choosing Chocolate Tree Cake Shop!", 190, 460);

        doc.save(`Invoice_${data.orderId}.pdf`);
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

        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "updateCakePhoto", id: cakeId, imageBase64: base64, mimeType: "image/jpeg" })
        });

        const saved = await fetchSavedImage(cakeId);
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
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "updateCakePhoto", id: cakeId, imageUrl: "" })
        });
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