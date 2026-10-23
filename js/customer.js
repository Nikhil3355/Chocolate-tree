let fulfillmentType = 'pickup';
let paymentMethod = 'UPI';
let cakeCatalog = defaultCatalogStructure; // Inherited from js/data.js
let activeCategory = 'All';
let selectedCake = null;
let selectedSize = 'small';

// 1. Initialize Page
function init() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const pDate = document.getElementById('pickupDate');
    const dDate = document.getElementById('deliveryDate');
    if (pDate) { pDate.value = tomorrowStr; pDate.min = todayStr; }
    if (dDate) { dDate.value = tomorrowStr; dDate.min = todayStr; }

    renderCakeGrid();
    fetchLiveMenu();
}

// 2. Fetch Live Prices and Stock from Sheet
async function fetchLiveMenu() {
    try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMenu&_t=${Date.now()}`);
        const json = await response.json();
        if (json.status === "success" && Array.isArray(json.menu) && json.menu.length > 0) {
            json.menu.forEach(remoteItem => {
                const local = cakeCatalog.find(c => c.id === remoteItem.id);
                if (local) {
                    if (remoteItem.prices) local.prices = remoteItem.prices;
                    if (remoteItem.image) local.image = remoteItem.image;
                    local.inStock = (remoteItem.inStock === true || String(remoteItem.inStock).trim().toUpperCase() === "TRUE");
                }
            });
            document.getElementById('menuCountBadge').innerText = `${cakeCatalog.length} Varieties (Live)`;
        }
    } catch (e) {
        console.warn("Using offline catalog fallback:", e);
        document.getElementById('menuCountBadge').innerText = `${cakeCatalog.length} Varieties`;
    } finally {
        renderCakeGrid();
    }
}

// 3. Category Filter
function filterCategory(cat, btn) {
    activeCategory = cat;
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderCakeGrid();
}

// 4. Render Grid of Cards
function renderCakeGrid() {
    const container = document.getElementById('cakeGridContainer');
    if (!container) return;

    const filtered = (activeCategory === 'All')
        ? cakeCatalog
        : cakeCatalog.filter(c => c.category === activeCategory);

    if (filtered.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #794d35; font-size: 13px;">No cakes found in this category.</div>`;
        return;
    }

    container.innerHTML = filtered.map(cake => {
        const isStock = (cake.inStock === true || String(cake.inStock).trim().toUpperCase() === "TRUE");
        const startingPrice = cake.prices.small || cake.prices.pastry || cake.prices.large || 0;

        return `
      <div class="cake-card ${isStock ? '' : 'sold-out'}">
        <div class="card-img-wrap">
          <img src="${cake.image}" alt="${escapeHtml(cake.name)}" loading="lazy" />
          <span class="card-pill-tag">100% Eggless</span>
          ${!isStock ? `<span class="card-sold-banner">SOLD OUT</span>` : ''}
        </div>

        <div class="card-content">
          <div>
            <div class="card-category">${escapeHtml(cake.category)}</div>
            <h3 class="card-title">${escapeHtml(cake.name)}</h3>
            <p class="card-desc">${escapeHtml(cake.desc)}</p>
          </div>

          <div class="card-footer">
            <div class="card-price-info">
              <span class="card-price-label">Starts From</span>
              <span class="card-price-value">₹${startingPrice}</span>
            </div>
            <button 
              type="button" 
              class="btn-card-order ${isStock ? '' : 'disabled'}" 
              onclick="${isStock ? `openCheckoutDrawer('${cake.id}')` : ''}"
              ${!isStock ? 'disabled' : ''}
            >
              ${isStock ? 'Order Now' : 'Sold Out'}
            </button>
          </div>
        </div>
      </div>
    `;
    }).join('');
}

// 5. Open Slide-Up Checkout Drawer
function openCheckoutDrawer(cakeId) {
    const cake = cakeCatalog.find(c => c.id === cakeId);
    if (!cake) return;

    selectedCake = cake;
    // Default to small if available, else first available
    if (cake.prices.small) selectedSize = 'small';
    else if (cake.prices.pastry) selectedSize = 'pastry';
    else selectedSize = 'large';

    document.getElementById('drawerCakeTitle').innerText = cake.name;
    document.getElementById('drawerCakeDesc').innerText = cake.desc;
    document.getElementById('drawerCakeImg').src = cake.image;

    renderDrawerWeightPills();
    updateDrawerBill();

    // Reset inputs
    document.getElementById('cakeMessage').value = '';

    // Slide drawer up
    document.getElementById('checkoutDrawerOverlay').classList.add('open');
    document.body.style.overflow = 'hidden'; // Stop background scroll
}

function closeCheckoutDrawer(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('checkoutDrawerOverlay').classList.remove('open');
    document.body.style.overflow = 'auto';
}

function renderDrawerWeightPills() {
    if (!selectedCake) return;
    const container = document.getElementById('drawerWeightContainer');
    container.innerHTML = '';

    const sizeDefs = [
        { key: 'pastry', label: 'Pastry', approx: '1 Slice', price: selectedCake.prices.pastry },
        { key: 'small', label: (selectedCake.category.includes('Kunafa') ? 'Medium' : 'Small'), approx: (selectedCake.category.includes('Kunafa') ? '~0.75 kg' : '~0.5 kg'), price: selectedCake.prices.small },
        { key: 'large', label: 'Large', approx: '~1.0 kg', price: selectedCake.prices.large }
    ];

    sizeDefs.forEach(def => {
        const hasPrice = def.price !== null && def.price !== undefined;
        const isActive = hasPrice && selectedSize === def.key;

        const btn = document.createElement('div');
        btn.className = `size-btn ${isActive ? 'active' : ''} ${!hasPrice ? 'disabled' : ''}`;
        btn.innerHTML = `
      <div class="size-name">${def.label}</div>
      <div class="size-approx">${def.approx}</div>
      <div class="size-price">${hasPrice ? '₹' + def.price : 'N/A'}</div>
    `;

        if (hasPrice) {
            btn.onclick = () => {
                selectedSize = def.key;
                renderDrawerWeightPills();
                updateDrawerBill();
            };
        }
        container.appendChild(btn);
    });
}

function updateDrawerBill() {
    if (!selectedCake) return;
    const currentPrice = selectedCake.prices[selectedSize] || selectedCake.prices.small || 0;
    document.getElementById('drawerBillDisplay').innerText = `₹${currentPrice}`;
}

// 6. Fulfillment & Payment Mode Toggles
function setFulfillment(type) {
    fulfillmentType = type;
    if (type === 'pickup') {
        document.getElementById('btnPickup').classList.add('active');
        document.getElementById('btnDelivery').classList.remove('active');
        document.getElementById('pickupScheduleBlock').style.display = 'grid';
        document.getElementById('deliveryAddressBlock').style.display = 'none';
    } else {
        document.getElementById('btnDelivery').classList.add('active');
        document.getElementById('btnPickup').classList.remove('active');
        document.getElementById('pickupScheduleBlock').style.display = 'none';
        document.getElementById('deliveryAddressBlock').style.display = 'flex';
    }
}

function setPaymentMode(mode) {
    paymentMethod = mode;
    document.getElementById('payModeUPI').className = `pay-card ${mode === 'UPI' ? 'active' : ''}`;
    document.getElementById('payModeCOD').className = `pay-card ${mode === 'COD' ? 'active' : ''}`;
    document.getElementById('submitBtn').innerHTML = mode === 'UPI'
        ? '<span>⚡ PLACE ORDER VIA UPI</span>'
        : '<span>📦 CONFIRM ORDER (PAY ON DELIVERY)</span>';
}

// 7. Validation & Order Submission
function validateAndExtractPayload() {
    const name = document.getElementById("customerName").value.trim();
    const phone = document.getElementById("customerPhone").value.trim();
    const cakeMsg = document.getElementById("cakeMessage").value.trim() || "No message requested";

    if (!name) {
        alert("Please enter your full name.");
        document.getElementById("customerName").focus();
        return null;
    }

    if (!phone || phone.length < 10) {
        alert("Please enter a valid 10-digit mobile number.");
        document.getElementById("customerPhone").focus();
        return null;
    }

    let slotInfo = "";
    let fullAddress = "Store Pickup Counter";

    if (fulfillmentType === 'pickup') {
        const pDate = document.getElementById("pickupDate").value;
        const pTime = document.getElementById("pickupTime").value;
        slotInfo = `${pDate} (${pTime})`;
    } else {
        const dDate = document.getElementById("deliveryDate").value;
        fullAddress = document.getElementById("deliveryAddress").value.trim();
        if (!fullAddress || fullAddress.length < 8) {
            alert("Please enter your complete delivery address with landmark and area.");
            document.getElementById("deliveryAddress").focus();
            return null;
        }
        slotInfo = `${dDate} (Home Delivery)`;
    }

    const sizeLabel = selectedSize === 'pastry' ? 'Pastry' : (selectedSize === 'small' ? 'Small (~0.5 kg)' : 'Large (~1.0 kg)');
    const currentPrice = selectedCake.prices[selectedSize] || selectedCake.prices.small;
    const orderId = "CT-" + Math.floor(100000 + Math.random() * 900000);

    return {
        action: "createOrder",
        orderId: orderId,
        customerName: name,
        customerPhone: phone,
        cakeName: selectedCake.name,
        size: sizeLabel,
        amount: currentPrice,
        messageOnCake: cakeMsg,
        fulfillmentType: fulfillmentType === 'pickup' ? 'Store Pickup' : 'Home Delivery',
        deliveryAddress: fullAddress,
        slot: slotInfo,
        paymentMode: paymentMethod === 'UPI' ? 'Instant UPI' : 'Pay on Delivery / Pickup'
    };
}

async function handleOrderPlacement() {
    const payload = validateAndExtractPayload();
    if (!payload) return;

    const btn = document.getElementById("submitBtn");
    const originalText = btn.innerHTML;
    btn.innerHTML = "<span>⏳ Processing...</span>";
    btn.disabled = true;

    // 1. Non-blocking log to Google Sheet
    try {
        fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).catch(err => console.warn("Background sheet sync:", err));
    } catch (e) {
        console.warn("Sheet write non-blocking call:", e);
    }

    // 2. Safe PDF generation
    try {
        if (window.jspdf && window.jspdf.jsPDF) {
            generateTaxInvoicePDF(payload);
        }
    } catch (pdfErr) {
        console.warn("PDF generation error:", pdfErr);
    }

    // 3. Format WhatsApp Ticket for Bakery Owner
    const isUPI = (paymentMethod === 'UPI');
    const waOrderText =
        `Hello *Chocolate Tree Cake Shop*! 🎂\n\n` +
        `I would like to place an order:\n` +
        `-----------------------------------------\n` +
        `🧾 *Booking ID:* ${payload.orderId}\n` +
        `👤 *Name:* ${payload.customerName}\n` +
        `📞 *Phone:* +91 ${payload.customerPhone}\n` +
        `🎂 *Cake:* ${payload.cakeName}\n` +
        `⚖️ *Size:* ${payload.size}\n` +
        `✍️ *Message on Cake:* "${payload.messageOnCake}"\n` +
        `🚚 *Fulfillment:* ${payload.fulfillmentType}\n` +
        (payload.fulfillmentType === 'Home Delivery' ? `📍 *Address:* ${payload.deliveryAddress}\n` : '') +
        `📅 *Schedule:* ${payload.slot}\n` +
        `💰 *Total Amount:* ₹${payload.amount}\n` +
        `💳 *Payment Method:* ${isUPI ? 'Instant UPI' : 'Pay on Delivery / Pickup'}\n` +
        `-----------------------------------------\n` +
        (isUPI ? `📸 *I have initiated payment via UPI. Please confirm my order!*` : `Please confirm my order booking!`);

    const waUrl = `https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(waOrderText)}`;

    // 4. Launch Payment or WhatsApp
    if (isUPI) {
        const note = `Order-${payload.orderId}`;
        const upiUrl = `upi://pay?pa=${encodeURIComponent(SHOP_UPI_ID)}&pn=${encodeURIComponent(SHOP_NAME)}&am=${payload.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (isMobile) {
            window.location.href = upiUrl;
        } else {
            window.location.href = waUrl;
        }
    } else {
        window.location.href = waUrl;
    }

    // Re-enable button state
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }, 2000);
}

// 8. PDF Bill Generation
function generateTaxInvoicePDF(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) return;

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
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 40, 155);
    doc.text(`Payment Mode: ${data.paymentMode}`, 40, 170);

    doc.text(`Customer: ${data.customerName || 'Customer'}`, 320, 140);
    doc.text(`Contact: +91 ${data.customerPhone || ''}`, 320, 155);
    doc.text(`Fulfillment: ${data.fulfillmentType}`, 320, 170);
    doc.text(`Schedule: ${data.slot || 'Ready'}`, 320, 185);
    if (data.fulfillmentType === 'Home Delivery' && data.deliveryAddress) {
        doc.text(`Address: ${String(data.deliveryAddress).substring(0, 35)}`, 320, 200);
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
    doc.text(String(data.cakeName || "Cake"), 50, 268);
    doc.text(String(data.size || "Standard"), 260, 268);
    doc.text(String(data.messageOnCake || "None").substring(0, 22), 340, 268);
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
    doc.text("Thank you for ordering with Chocolate Tree Cake Shop!", 190, 460);

    doc.save(`Invoice_${data.orderId}.pdf`);
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

window.onload = init;