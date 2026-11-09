// Shop and API Configuration
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyKPjXEKyWYG_kPUrjRhlYxdbGqIm9iqQkklB-KQTt5XpSIe7VPS3ZcNkeFEBy69K64/exec";
const SHOP_UPI_ID = "8554034632@ybl";
const SHOP_NAME = "Chocolate Tree Cake Shop";
const SHOP_WHATSAPP_NUMBER = "918554034632";
const SHOP_PHONE = "918554034632";
const DEFAULT_PIN = "8554";

// =====================================================================
//  BUSINESS DETAILS  (used on every invoice, change here only)
//  Leave a value as "" to hide it on the invoice.
// =====================================================================
const BUSINESS = {
  name: SHOP_NAME,                       // shown big at the top of the invoice
  tagline: "Cakes  •  Chocolate  •  Ice Cream",

  // Address lines (empty lines are skipped)
  addressLines: [
    "opp. Sanskriti Society, Kaspate Wasti, ",                                  // e.g. "Shop No. 4, Main Road, Near ABC Chowk"
    "Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057"                                   // e.g. "Nagpur, Maharashtra - 440001"
  ],
  phone: "+91 9168717481",
  email: "",
  website: "https://chocolatetree.in/",

  // Tax and licence details
  gstin: "",                             // e.g. "27ABCDE1234F1Z5". Leave "" if you are not GST registered:
                                         // the invoice then shows no GST lines and is titled "INVOICE".
  gstRate: 5,                            // TOTAL GST % (split equally into CGST and SGST). SET YOUR REAL RATE.
  pricesIncludeGst: true,                // true = menu prices already include GST (GST is shown as a breakup)
  hsn: "",                               // optional HSN code shown under each item, e.g. "1905"
  fssai: "",                             // e.g. "11522999000123"
  pan: "",
  stateName: "",                         // e.g. "Maharashtra"
  stateCode: "",                         // e.g. "27"

  // Payment details printed on unpaid invoices
  upiId: SHOP_UPI_ID,

  // Invoice number style:  PREFIX-<order id>  or  PREFIX-YYMMDD-001 for manual invoices
  invoicePrefix: "INV",

  // Logo: leave "" to use the built-in "CT" mark.
  // To use your own logo, paste a PNG/JPG as a data URL, e.g. "data:image/png;base64,iVBORw0KG..."
  logoDataUrl: "",
  logoSize: [46, 46],                    // [width, height] in points

  terms: [
    "Please keep cakes refrigerated below 5°C and consume within 24 hours.",
    "Please show this invoice or the Order ID at pickup / delivery."
  ],
  footerNote: "Thank you for choosing Chocolate Tree!",
  signatoryLabel: "Authorised Signatory"
};