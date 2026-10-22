let fulfillmentType = 'pickup';
let paymentMethod = 'UPI';
let cakeCatalog = defaultCatalogStructure; // Loaded from js/data.js
let selectedCake = cakeCatalog[0];
let selectedSize = 'small';

// Fetch dynamic live menu from Google Apps Script
async function fetchLiveMenu() {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMenu&_t=${Date.now()}`);
    const json = await response.json();
    if (json.status === "success" && Array.isArray(json.menu) && json.menu.length > 0) {
      json.menu.forEach(remoteItem => {
        const local = cakeCatalog.find(c => c.id === remoteItem.id);
        if (local) {
          if (remoteItem.prices) local.prices = remoteItem.prices;
          local.inStock = (remoteItem.inStock === true || String(remoteItem.inStock).trim().toUpperCase() === "TRUE");
        }
      });
      document.getElementById('menuCountBadge').innerText = `${cakeCatalog.length} Varieties (Live)`;
    } else {
      document.getElementById('menuCountBadge').innerText = `${cakeCatalog.length} Varieties`;
    }
  } catch (e) {
    console.warn("Using offline catalog fallback:", e);
    document.getElementById('menuCountBadge').innerText = `${cakeCatalog.length} Varieties`;
  } finally {
    populateDropdown();
    renderCake(selectedCake);
  }
}

function populateDropdown() {
  const dropdown = document.getElementById('cakeSelector');
  dropdown.innerHTML = '';
  cakeCatalog.forEach((cake) => {
    const opt = document.createElement('option');
    opt.value = cake.id;
    const isAvailable = (cake.inStock === true || String(cake.inStock).trim().toUpperCase() === "TRUE");

    if (isAvailable) {
      opt.textContent = `${cake.name} (from ₹${cake.prices.small})`;
    } else {
      opt.textContent = `❌ ${cake.name} (Sold Out)`;
      opt.style.color = "#94a3b8";
    }
    dropdown.appendChild(opt);
  });
}

function init() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  document.getElementById('pickupDate').value = tomorrowStr;
  document.getElementById('pickupDate').min = todayStr;
  document.getElementById('deliveryDate').value = tomorrowStr;
  document.getElementById('deliveryDate').min = todayStr;

  populateDropdown();
  renderCake(cakeCatalog[0]);
  fetchLiveMenu();
}

function onCakeChange(cakeId) {
  const found = cakeCatalog.find(c => c.id === cakeId);
  if (found) {
    selectedCake = found;
    selectedSize = 'small';
    renderCake(found);
  }
}

function renderCake(cake) {
  document.getElementById('heroTitle').innerText = cake.name;
  document.getElementById('heroSubtitle').innerText = cake.desc;
  document.getElementById('heroCategoryTag').innerText = cake.category;
  document.getElementById('heroImage').src = cake.image;

  const isAvailable = (cake.inStock === true || String(cake.inStock).trim().toUpperCase() === "TRUE");
  const heroImage = document.getElementById('heroImage');
  const submitBtn = document.getElementById('submitBtn');
  const heroTag = document.getElementById('heroCategoryTag');

  // Handle Sold Out UI
  if (!isAvailable) {
    heroImage.style.filter = "grayscale(85%) opacity(75%)";
    heroTag.innerText = "SOLD OUT";
    heroTag.style.background = "#dc2626";
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.45";
    submitBtn.style.cursor = "not-allowed";
    submitBtn.innerHTML = "<span>🚫 CURRENTLY SOLD OUT</span>";
  } else {
    heroImage.style.filter = "none";
    heroTag.style.background = "#ff7700";
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
    submitBtn.style.cursor = "pointer";
    setPaymentMode(paymentMethod);
  }

  const container = document.getElementById('weightContainer');
  container.innerHTML = '';

  const sizeDefs = [
    { key: 'pastry', label: 'Pastry', approx: '1 Slice', price: cake.prices.pastry },
    { key: 'small', label: (cake.category.includes('Kunafa') ? 'Medium' : 'Small'), approx: (cake.category.includes('Kunafa') ? '~0.75 kg' : '~0.5 kg'), price: cake.prices.small },
    { key: 'large', label: 'Large', approx: '~1.0 kg', price: cake.prices.large }
  ];

  if (!cake.prices[selectedSize]) selectedSize = 'small';

  sizeDefs.forEach(def => {
    const btn = document.createElement('div');
    const hasPrice = def.price !== null && def.price !== undefined;
    const isActive = hasPrice && isAvailable && selectedSize === def.key;

    btn.className = `size-btn ${isActive ? 'active' : ''} ${(!hasPrice || !isAvailable) ? 'disabled' : ''}`;
    btn.innerHTML = `
      <div class="size-name">${def.label}</div>
      <div class="size-approx">${def.approx}</div>
      <div class="size-price">${hasPrice ? '₹' + def.price : 'N/A'}</div>
    `;

    if (hasPrice && isAvailable) {
      btn.onclick = () => {
        selectedSize = def.key;
        renderCake(selectedCake);
      };
    }
    container.appendChild(btn);
  });

  const currentPrice = cake.prices[selectedSize] || cake.prices.small;
  document.getElementById('billDisplay').innerText = `₹${currentPrice}`;
}

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

function getOrderPayload() {
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
  const payload = getOrderPayload();
  if (!payload) return;

  const btn = document.getElementById("submitBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = "<span>⏳ Logging Order...</span>";
  btn.style.opacity = "0.7";

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Sheet writing error:", e);
  }

  generateTaxInvoicePDF(payload);

  btn.innerHTML = originalText;
  btn.style.opacity = "1";

  const confirmTextForCustomer = encodeURIComponent(
    `Hello ${payload.customerName}, your order #${payload.orderId} at Chocolate Tree Cake Shop is RECEIVED & CONFIRMED!\n\n` +
    `🎂 Cake: ${payload.cakeName} (${payload.size})\n` +
    `💰 Total: ₹${payload.amount}\n` +
    `📅 Scheduled for: ${payload.slot}\n\n` +
    `Thank you for ordering with Chocolate Tree!`
  );

  const ownerTicket = 
    `🚨 *NEW ORDER: CHOCOLATE TREE CAKE SHOP*\n` +
    `-----------------------------------------\n` +
    `🧾 *Order ID:* ${payload.orderId}\n` +
    `👤 *Customer:* ${payload.customerName}\n` +
    `📞 *Phone:* +91 ${payload.customerPhone}\n` +
    `🚚 *Type:* ${payload.fulfillmentType}\n` +
    (payload.fulfillmentType === 'Home Delivery' ? `📍 *Address:* ${payload.deliveryAddress}\n` : '') +
    `🎂 *Cake:* ${payload.cakeName}\n` +
    `⚖️ *Size:* ${payload.size}\n` +
    `✍️ *Message:* "${payload.messageOnCake}"\n` +
    `📅 *Schedule:* ${payload.slot}\n` +
    `💰 *Bill Amount:* ₹${payload.amount}\n` +
    `💳 *Payment:* ${payload.paymentMode}\n` +
    `-----------------------------------------\n` +
    `👉 *Tap to Confirm with Customer:*\n` +
    `https://wa.me/91${payload.customerPhone}?text=${confirmTextForCustomer}`;

  const waOwnerUrl = `https://wa.me/${SHOP_WHATSAPP_NUMBER}?text=${encodeURIComponent(ownerTicket)}`;

  if (paymentMethod === 'UPI') {
    const note = `Order-${payload.orderId}`;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(SHOP_UPI_ID)}&pn=${encodeURIComponent(SHOP_NAME)}&am=${payload.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

    alert("✅ Order Logged & PDF Bill Downloaded!\n\nNow launching your UPI App to complete payment, then sending order details to bakery WhatsApp.");

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = upiUrl;
      setTimeout(() => { window.location.href = waOwnerUrl; }, 2500);
    } else {
      window.location.href = waOwnerUrl;
    }
  } else {
    alert("✅ Order Confirmed & PDF Bill Downloaded!\n\nSending order summary to the bakery on WhatsApp...");
    window.location.href = waOwnerUrl;
  }
}

function generateTaxInvoicePDF(data) {
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

  doc.text(`Customer: ${data.customerName}`, 320, 140);
  doc.text(`Contact: +91 ${data.customerPhone}`, 320, 155);
  doc.text(`Fulfillment: ${data.fulfillmentType}`, 320, 170);
  doc.text(`Schedule: ${data.slot}`, 320, 185);
  if (data.fulfillmentType === 'Home Delivery') {
    doc.text(`Address: ${data.deliveryAddress.substring(0, 35)}`, 320, 200);
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
  doc.text(data.cakeName, 50, 268);
  doc.text(data.size, 260, 268);
  doc.text(data.messageOnCake.substring(0, 22), 340, 268);
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

window.onload = init;