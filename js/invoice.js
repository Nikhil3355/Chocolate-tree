// =====================================================================
//  Shared invoice engine (used by the customer site, admin portal and
//  the manual invoice maker). Business details come from config.js.
//
//  invoice object:
//  {
//    invoiceNo, date, title?,
//    customer: { name, phone, address, gstin },
//    meta: [ ["Label", "Value"], ... ],        // right-hand "Order details" block
//    items: [ { name, desc, qty, rate } ],
//    discount, deliveryCharge, paidAmount,
//    paymentMode, notes
//  }
// =====================================================================

const INV_COLORS = {
  dark: [43, 24, 16],
  orange: [255, 119, 0],
  orangeDark: [230, 92, 0],
  muted: [140, 106, 84],
  line: [235, 217, 200],
  cream: [251, 245, 238],
  green: [21, 128, 61],
  greenBg: [220, 252, 231],
  amber: [180, 83, 9],
  amberBg: [254, 243, 199]
};

function invMoney(n) {
  return "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invDate(d) {
  const dt = d ? new Date(d) : new Date();
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Amount in words, Indian system (crore / lakh)
function numberToWordsIN(num) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  const three = n => (n >= 100 ? a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : "") + (n % 100 ? two(n % 100) : "");

  num = Math.round(Number(num || 0) * 100) / 100;
  let rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;

  let out = "";
  if (crore) out += three(crore) + " Crore ";
  if (lakh) out += two(lakh) + " Lakh ";
  if (thousand) out += two(thousand) + " Thousand ";
  if (rupees) out += three(rupees);
  out = out.trim() || "Zero";

  return "Rupees " + out + (paise ? " and " + two(paise) + " Paise" : "") + " Only";
}

function calcInvoiceTotals(inv) {
  const items = inv.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const discount = Math.min(Math.max(Number(inv.discount) || 0, 0), subtotal);
  const delivery = Math.max(Number(inv.deliveryCharge) || 0, 0);
  const gross = subtotal - discount + delivery;

  const gstOn = !!(BUSINESS.gstin && Number(BUSINESS.gstRate) > 0);
  let taxable = gross, cgst = 0, sgst = 0, total = gross;
  if (gstOn) {
    const r = Number(BUSINESS.gstRate) / 100;
    if (BUSINESS.pricesIncludeGst) {
      taxable = gross / (1 + r);
      cgst = sgst = (gross - taxable) / 2;
      total = gross;
    } else {
      taxable = gross;
      cgst = sgst = (gross * r) / 2;
      total = gross + cgst + sgst;
    }
  }

  const grand = Math.round(total);
  const roundOff = grand - total;
  const paid = Math.min(Math.max(Number(inv.paidAmount) || 0, 0), grand);
  const balance = grand - paid;
  const status = grand > 0 && balance <= 0 ? "PAID" : (paid > 0 ? "PARTIALLY PAID" : "PAYMENT DUE");

  return { subtotal, discount, delivery, gstOn, taxable, cgst, sgst, roundOff, grand, paid, balance, status };
}

function drawInvoiceLogo(doc, x, y, w, h) {
  const C = INV_COLORS;
  if (BUSINESS.logoDataUrl) {
    try {
      const fmt = /^data:image\/jpe?g/i.test(BUSINESS.logoDataUrl) ? "JPEG" : "PNG";
      doc.addImage(BUSINESS.logoDataUrl, fmt, x, y, w, h);
      return;
    } catch (e) { /* fall back to the built-in mark */ }
  }
  doc.setFillColor(...C.dark);
  doc.roundedRect(x, y, w, h, 10, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.round(h * 0.4));
  doc.text("CT", x + w / 2, y + h * 0.58, { align: "center" });
  doc.setFillColor(...C.orange);
  doc.roundedRect(x + w * 0.27, y + h * 0.72, w * 0.46, 3.5, 1.75, 1.75, "F");
}

function buildInvoicePDF(inv) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const C = INV_COLORS;
  const W = 595, H = 842, M = 40, R = W - M;
  const t = calcInvoiceTotals(inv);
  const cust = inv.customer || {};

  const text = c => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style, size) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
  const clean = s => String(s == null ? "" : s).replace(/[^\x20-\x7E\u00A0-\u00FF•°]/g, "");

  // ---------- Header ----------
  const [lw, lh] = BUSINESS.logoSize || [46, 46];
  drawInvoiceLogo(doc, M, 36, lw, lh);

  const nameX = M + lw + 12;
  let nameSize = 16;
  font("bold", nameSize);
  while (nameSize > 10 && doc.getTextWidth(clean(BUSINESS.name).toUpperCase()) > 270) { nameSize -= 1; font("bold", nameSize); }
  text(C.dark);
  doc.text(clean(BUSINESS.name).toUpperCase(), nameX, 36 + lh * 0.45);
  font("normal", 8.5);
  text(C.muted);
  doc.text(clean(BUSINESS.tagline || ""), nameX, 36 + lh * 0.45 + 14);

  const title = inv.title || (BUSINESS.gstin ? "TAX INVOICE" : "INVOICE");
  font("bold", 20);
  text(C.dark);
  doc.text(title, R, 54, { align: "right" });
  font("normal", 9);
  text(C.muted);
  doc.text("No. " + clean(inv.invoiceNo), R, 70, { align: "right" });
  doc.text("Date: " + invDate(inv.date), R, 83, { align: "right" });

  const ruleY = 36 + lh + 14;
  doc.setLineWidth(0.75);
  doc.setDrawColor(...C.line);
  doc.line(M, ruleY, R, ruleY);
  doc.setLineWidth(2.5);
  doc.setDrawColor(...C.orange);
  doc.line(M, ruleY, M + 64, ruleY);

  // ---------- Business details ----------
  const leftInfo = [];
  (BUSINESS.addressLines || []).forEach(l => { if (String(l).trim()) leftInfo.push(clean(l)); });
  const contact = [BUSINESS.phone && "Phone: " + BUSINESS.phone, BUSINESS.email, BUSINESS.website].filter(Boolean).join("   |   ");
  if (contact) leftInfo.push(clean(contact));

  const rightInfo = [];
  if (BUSINESS.gstin) rightInfo.push("GSTIN: " + BUSINESS.gstin);
  if (BUSINESS.fssai) rightInfo.push("FSSAI Lic. No: " + BUSINESS.fssai);
  if (BUSINESS.pan) rightInfo.push("PAN: " + BUSINESS.pan);
  if (BUSINESS.stateName) rightInfo.push("State: " + BUSINESS.stateName + (BUSINESS.stateCode ? " (" + BUSINESS.stateCode + ")" : ""));

  font("normal", 8.5);
  text(C.muted);
  let infoY = ruleY + 18;
  leftInfo.forEach((l, i) => doc.text(l, M, infoY + i * 11.5));
  rightInfo.forEach((l, i) => doc.text(clean(l), R, infoY + i * 11.5, { align: "right" }));
  const infoEnd = infoY + Math.max(leftInfo.length, rightInfo.length) * 11.5;

  // ---------- Billed to / order details ----------
  let y = (leftInfo.length || rightInfo.length) ? infoEnd + 14 : ruleY + 26;
  const col2 = 330;

  font("bold", 8);
  text(C.orangeDark);
  doc.text("BILLED TO", M, y);
  doc.text("ORDER DETAILS", col2, y);

  let ly = y + 15;
  font("bold", 11);
  text(C.dark);
  doc.text(clean(cust.name || "Walk-in Customer"), M, ly);
  font("normal", 9);
  text(C.muted);
  ly += 13;
  if (cust.phone) { doc.text("Phone: +91 " + clean(String(cust.phone).replace(/^\+?91/, "")), M, ly); ly += 12; }
  if (cust.address) {
    doc.splitTextToSize(clean(cust.address), 250).slice(0, 4).forEach(l => { doc.text(l, M, ly); ly += 11.5; });
  }
  if (cust.gstin) { doc.text("GSTIN: " + clean(cust.gstin), M, ly); ly += 12; }

  let ry = y + 15;
  (inv.meta || []).forEach(([label, value]) => {
    if (!value) return;
    font("normal", 9);
    text(C.muted);
    doc.text(clean(label), col2, ry);
    text(C.dark);
    const lines = doc.splitTextToSize(clean(value), R - col2 - 66).slice(0, 3);
    lines.forEach((l, i) => doc.text(l, col2 + 66, ry + i * 11.5));
    ry += Math.max(lines.length, 1) * 11.5 + 2;
  });

  y = Math.max(ly, ry) + 16;

  // ---------- Items table ----------
  const colQty = 365, colRate = 450;
  const drawTableHead = (yy) => {
    font("bold", 8);
    text(C.muted);
    doc.text("#", M, yy);
    doc.text("ITEM", M + 20, yy);
    doc.text("QTY", colQty, yy, { align: "right" });
    doc.text("RATE", colRate, yy, { align: "right" });
    doc.text("AMOUNT", R, yy, { align: "right" });
    doc.setLineWidth(0.75);
    doc.setDrawColor(...C.dark);
    doc.line(M, yy + 7, R, yy + 7);
    return yy + 24;
  };
  y = drawTableHead(y);

  (inv.items || []).forEach((it, idx) => {
    const nameLines = doc.splitTextToSize(clean(it.name || "Item"), 270);
    const descText = [it.desc, BUSINESS.hsn ? "HSN " + BUSINESS.hsn : ""].filter(Boolean).join("  |  ");
    const descLines = descText ? doc.splitTextToSize(clean(descText), 270) : [];
    const rowH = nameLines.length * 12 + descLines.length * 10.5 + 12;

    if (y + rowH > 740) {
      doc.addPage();
      y = drawTableHead(54);
    }

    font("normal", 9);
    text(C.muted);
    doc.text(String(idx + 1), M, y);

    font("bold", 10);
    text(C.dark);
    nameLines.forEach((l, i) => doc.text(l, M + 20, y + i * 12));

    font("normal", 8.5);
    text(C.muted);
    descLines.forEach((l, i) => doc.text(l, M + 20, y + nameLines.length * 12 + i * 10.5));

    const qty = Number(it.qty) || 0, rate = Number(it.rate) || 0;
    font("normal", 9.5);
    text(C.dark);
    doc.text(String(qty), colQty, y, { align: "right" });
    doc.text(invMoney(rate), colRate, y, { align: "right" });
    font("bold", 9.5);
    doc.text(invMoney(qty * rate), R, y, { align: "right" });

    const sepY = y + rowH - 12 + 2;
    doc.setLineWidth(0.5);
    doc.setDrawColor(...C.line);
    doc.line(M, sepY, R, sepY);
    y += rowH;
  });

  // ---------- Totals ----------
  y += 6;
  const rows = [["Subtotal", invMoney(t.subtotal)]];
  if (t.discount > 0) rows.push(["Discount", "- " + invMoney(t.discount)]);
  if (t.delivery > 0) rows.push(["Delivery charge", invMoney(t.delivery)]);
  if (t.gstOn) {
    const half = Number(BUSINESS.gstRate) / 2;
    rows.push(["Taxable value", invMoney(t.taxable)]);
    rows.push(["CGST @ " + half + "%", invMoney(t.cgst)]);
    rows.push(["SGST @ " + half + "%", invMoney(t.sgst)]);
  }
  if (Math.abs(t.roundOff) >= 0.005) rows.push(["Round off", (t.roundOff < 0 ? "- " : "") + invMoney(Math.abs(t.roundOff))]);

  const needed = rows.length * 15 + 60 + (t.paid > 0 ? 34 : 0) + 130;
  if (y + needed > H - 70) { doc.addPage(); y = 54; }

  const totalsTop = y;
  const lblX = 365;
  font("normal", 9.5);
  rows.forEach(([label, value]) => {
    text(C.muted);
    doc.text(label, lblX, y);
    text(C.dark);
    doc.text(value, R, y, { align: "right" });
    y += 15;
  });

  y += 2;
  doc.setFillColor(...C.cream);
  doc.roundedRect(lblX - 12, y - 13, R - lblX + 24, 28, 6, 6, "F");
  font("bold", 10);
  text(C.dark);
  doc.text("TOTAL", lblX, y + 5);
  font("bold", 14);
  text(C.orangeDark);
  doc.text(invMoney(t.grand), R, y + 6, { align: "right" });
  y += 30;

  if (t.paid > 0) {
    font("normal", 9.5);
    text(C.muted);
    doc.text("Paid", lblX, y);
    text(C.green);
    doc.text("- " + invMoney(t.paid), R, y, { align: "right" });
    y += 15;
    font("bold", 10);
    text(C.dark);
    doc.text("Balance due", lblX, y);
    doc.text(invMoney(t.balance), R, y, { align: "right" });
    y += 15;
  }
  const totalsEnd = y;

  // ---------- Left column next to totals ----------
  let wy = totalsTop;
  font("bold", 8);
  text(C.orangeDark);
  doc.text("AMOUNT IN WORDS", M, wy);
  font("normal", 9);
  text(C.dark);
  doc.splitTextToSize(numberToWordsIN(t.grand), 280).forEach((l, i) => doc.text(l, M, wy + 13 + i * 11.5));
  wy += 13 + doc.splitTextToSize(numberToWordsIN(t.grand), 280).length * 11.5 + 8;

  // Status badge
  const paidFull = t.status === "PAID";
  const badgeBg = paidFull ? C.greenBg : C.amberBg;
  const badgeFg = paidFull ? C.green : C.amber;
  font("bold", 8.5);
  const bw = doc.getTextWidth(t.status) + 22;
  doc.setFillColor(...badgeBg);
  doc.roundedRect(M, wy, bw, 18, 9, 9, "F");
  text(badgeFg);
  doc.text(t.status, M + bw / 2, wy + 12, { align: "center" });
  wy += 30;

  font("normal", 9);
  text(C.muted);
  if (inv.paymentMode) { doc.text("Payment mode: " + clean(inv.paymentMode), M, wy); wy += 13; }
  if (t.balance > 0 && BUSINESS.upiId) {
    doc.text("Pay via UPI: " + clean(BUSINESS.upiId) + "  (note: " + clean(inv.invoiceNo) + ")", M, wy);
    wy += 13;
  }
  if (t.gstOn && BUSINESS.pricesIncludeGst) {
    doc.text("All prices are inclusive of GST.", M, wy);
    wy += 13;
  }
  if (inv.notes) {
    wy += 12;
    font("bold", 8);
    text(C.orangeDark);
    doc.text("NOTES", M, wy);
    font("normal", 9);
    text(C.dark);
    doc.splitTextToSize(clean(inv.notes), 280).slice(0, 5).forEach((l, i) => doc.text(l, M, wy + 13 + i * 11.5));
    wy += 13 + Math.min(doc.splitTextToSize(clean(inv.notes), 280).length, 5) * 11.5;
  }

  // ---------- Terms and signature ----------
  y = Math.max(totalsEnd, wy) + 26;
  if (y > H - 130) { doc.addPage(); y = 54; }

  const terms = (BUSINESS.terms || []).filter(Boolean);
  if (terms.length) {
    font("bold", 8);
    text(C.orangeDark);
    doc.text("TERMS", M, y);
    font("normal", 8);
    text(C.muted);
    let ty = y + 12;
    terms.forEach((tm, i) => {
      doc.splitTextToSize((i + 1) + ".  " + clean(tm), 290).forEach(l => { doc.text(l, M, ty); ty += 10.5; });
    });
  }

  font("bold", 9);
  text(C.dark);
  doc.text("For " + clean(BUSINESS.name), R, y, { align: "right" });
  doc.setLineWidth(0.75);
  doc.setDrawColor(...C.muted);
  doc.line(R - 140, y + 42, R, y + 42);
  font("normal", 8);
  text(C.muted);
  doc.text(clean(BUSINESS.signatoryLabel || "Authorised Signatory"), R, y + 53, { align: "right" });

  // ---------- Footer on every page ----------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setLineWidth(0.75);
    doc.setDrawColor(...C.line);
    doc.line(M, H - 52, R, H - 52);
    font("bold", 9);
    text(C.orangeDark);
    doc.text(clean(BUSINESS.footerNote || ""), W / 2, H - 36, { align: "center" });
    if (pages > 1) {
      font("normal", 8);
      text(C.muted);
      doc.text("Page " + p + " of " + pages, R, H - 36, { align: "right" });
    }
  }

  return doc;
}

function invoiceFileName(inv) {
  return "Invoice_" + String(inv.invoiceNo).replace(/[^\w-]+/g, "_") + ".pdf";
}

function downloadInvoicePDF(inv) {
  const doc = buildInvoicePDF(inv);
  doc.save(invoiceFileName(inv));
}

// Turns an online order (from the sheet or the customer's phone) into an invoice
function orderToInvoice(o) {
  const status = String(o.status || "").toLowerCase();
  const isUpi = String(o.paymentMode || "").toLowerCase().includes("upi");
  const delivered = status.includes("delivered");
  const paid = isUpi
    ? (!status.includes("not received") && /paid|verified|confirmed|delivered/.test(status))
    : delivered;

  const amount = Number(o.amount) || 0;
  const home = String(o.fulfillmentType || "").toLowerCase().includes("delivery");

  const descParts = [];
  if (o.size) descParts.push("Size: " + o.size);
  if (o.messageOnCake && !/^(none|no message)/i.test(o.messageOnCake)) descParts.push('Message: "' + o.messageOnCake + '"');
  if (o.candles && o.candles !== "No") descParts.push("Candles: " + o.candles);

  return {
    invoiceNo: BUSINESS.invoicePrefix + "-" + o.orderId,
    date: o.timestamp || o.placedAt || new Date(),
    customer: {
      name: o.customerName,
      phone: o.customerPhone,
      address: home && o.deliveryAddress && o.deliveryAddress !== "Store Pickup Counter" ? o.deliveryAddress : ""
    },
    meta: [
      ["Order ID", o.orderId],
      ["Type", o.fulfillmentType || "Store Pickup"],
      ["Schedule", o.slot],
      ["Payment", o.paymentMode]
    ],
    items: [{ name: o.cakeName || "Cake", desc: descParts.join("  |  "), qty: 1, rate: amount }],
    discount: 0,
    deliveryCharge: 0,
    paidAmount: paid ? amount : 0,
    paymentMode: o.paymentMode
  };
}