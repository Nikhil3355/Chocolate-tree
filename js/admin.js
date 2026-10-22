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

function updateMetrics() {
    const total = allOrders.length;
    let pending = 0;
    let delivered = 0;
    let revenue = 0;

    allOrders.forEach(o => {
        const s = (o.status || "").toLowerCase();
        if (s.includes("delivered") || s.includes("done")) {
            delivered++;
        } else {
            pending++;
        }
        const amt = parseFloat(o.amount) || 0;
        revenue += amt;
    });

    document.getElementById("metricTotal").innerText = total;
    document.getElementById("metricPending").innerText = pending;
    document.getElementById("metricDelivered").innerText = delivered;
    document.getElementById("metricRevenue").innerText = `₹${revenue.toLocaleString("en-IN")}`;
    document.getElementById("ordersCountBadge").innerText = pending > 0 ? pending : total;
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
        const orderStatus = (order.status || "Pending").toLowerCase();
        if (currentFilterStatus !== "all") {
            if (currentFilterStatus.toLowerCase() !== orderStatus) return false;
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
    const statusLower = statusRaw.toLowerCase();
    const isDelivered = statusLower.includes("delivered");
    const isConfirmed = statusLower.includes("confirmed");

    let statusBadgeClass = "pending";
    if (isDelivered) statusBadgeClass = "delivered";
    else if (isConfirmed) statusBadgeClass = "confirmed";

    const isHomeDelivery = String(o.fulfillmentType).toLowerCase().includes("delivery");
    const cleanPhone = String(o.customerPhone || "").replace(/[^0-9]/g, "");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.deliveryAddress || "")}`;
    const safeOrderJson = encodeURIComponent(JSON.stringify(o));

    return `
    <div class="order-card ${isDelivered ? 'delivered' : 'pending'}" id="order_${o.orderId}">
      <div class="card-top">
        <div>
          <div class="order-id-badge">
            <span>#${o.orderId || 'CT-ORD'}</span>
          </div>
          <div class="order-date">${formatDateTime(o.timestamp)}</div>
        </div>
        <span class="status-pill ${statusBadgeClass}">${statusRaw}</span>
      </div>

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
        
        ${o.messageOnCake && o.messageOnCake !== "None requested" && o.messageOnCake !== "No message" ? `
          <div class="message-tag">✍️ "${escapeHtml(o.messageOnCake)}"</div>
        ` : ''}

        <div class="delivery-box">
          <div><b>${isHomeDelivery ? '🛵 Home Delivery' : '🏬 Store Pickup'}:</b> ${escapeHtml(o.slot || 'Scheduled')}</div>
          ${isHomeDelivery ? `<div>📍 <i>${escapeHtml(o.deliveryAddress)}</i></div>` : ''}
        </div>
      </div>

      <div class="card-footer">
        <div>
          <div class="order-amount">₹${o.amount}</div>
          <div class="order-paymode">💳 ${escapeHtml(o.paymentMode || "Pending")}</div>
        </div>
      </div>

      <div class="card-buttons">
        <button class="btn-card btn-pdf" onclick="downloadAdminTaxPDF(decodeURIComponent('${safeOrderJson}'))">
          📄 Tax Bill
        </button>
        ${!isConfirmed && !isDelivered ? `
          <button class="btn-card btn-status mark-done" onclick="approveAndConfirmOrder('${o.orderId}', '${cleanPhone}', '${escapeHtml(o.customerName)}', '${escapeHtml(o.cakeName)}', '${o.amount}', '${escapeHtml(o.slot)}')">
            ✅ Approve Payment
          </button>
        ` : `
          <button class="btn-card btn-status ${isDelivered ? '' : 'mark-done'}" onclick="updateOrderStatusAction('${o.orderId}', '${isDelivered ? 'Confirmed' : 'Delivered'}', this)">
            ${isDelivered ? '↩️ Re-open' : '🚚 Mark Delivered'}
          </button>
        `}
      </div>
    </div>
  `;
}

// 1-Tap Action: Marks verified in Sheet and sends official WhatsApp confirmation to customer
async function approveAndConfirmOrder(orderId, phone, name, cakeName, amount, slot) {
    if (!confirm(`Confirm that payment of ₹${amount} for Order #${orderId} was received?`)) return;

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "updateOrderStatus",
                orderId: orderId,
                status: "Confirmed & Paid"
            })
        });

        // Update local state
        const match = allOrders.find(o => String(o.orderId) === String(orderId));
        if (match) match.status = "Confirmed & Paid";
        updateMetrics();
        applyOrderFilters();

        // Open WhatsApp to Customer with Official Confirmation Message
        const customerConfirmMsg =
            `Hello *${name}*! 👋\n\n` +
            `Your payment of *₹${amount}* for Order *#${orderId}* at *Chocolate Tree Cake Shop* is *RECEIVED & CONFIRMED*! ✅🎂\n\n` +
            `• *Cake:* ${cakeName}\n` +
            `• *Scheduled For:* ${slot}\n\n` +
            `Our chefs have started baking your fresh cake. If you need anything else, feel free to text us here!`;

        window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(customerConfirmMsg)}`, "_blank");
    } catch (err) {
        alert("Error updating order: " + err);
    }
}

async function updateOrderStatusAction(orderId, newStatus, btnElement) {
    if (!confirm(`Change Order #${orderId} status to "${newStatus}"?`)) return;

    const originalText = btnElement.innerText;
    btnElement.innerText = "Saving...";
    btnElement.disabled = true;

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "updateOrderStatus",
                orderId: orderId,
                status: newStatus
            })
        });

        const match = allOrders.find(o => String(o.orderId) === String(orderId));
        if (match) match.status = newStatus;

        updateMetrics();
        applyOrderFilters();
    } catch (err) {
        alert("Failed to update status on Google Sheet: " + err);
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

function sendCustomerWhatsApp(phone, name, orderId, cakeName, amount, slot) {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const msg =
        `Hello *${name}*,\n\n` +
        `Your order *#${orderId}* at *Chocolate Tree Cake Shop* is CONFIRMED! 🎂✨\n\n` +
        `• *Cake:* ${cakeName}\n` +
        `• *Total Bill:* ₹${amount}\n` +
        `• *Schedule:* ${slot}\n\n` +
        `Our kitchen is preparing your fresh cake. If you need any assistance, feel free to message us here!`;

    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
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
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMenu`);
        const json = await response.json();

        if (json.status === "success" && Array.isArray(json.menu) && json.menu.length > 0) {
            liveCatalog = defaultCatalogStructure.map(item => {
                const remote = json.menu.find(r => r.id === item.id);
                if (remote) {
                    return {
                        ...item,
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