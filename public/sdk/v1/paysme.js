/**
 * PaySME SDK v1.11.1
 * Dynamic, Centrally Managed Payment Modal
 * https://www.paysme.site/sdk/v1/paysme.js
 *
 * Usage:
 *   Static mode:  window.PaySME.init({ ... })
 *   Dynamic mode:  const p = window.PaySME.create({ ... }); p.open();
 *   Mobile R2P:    window.PaySME.renderRequestToPayButton({ container: "#paysme-r2p", ... })
 *
 * © PaySME – Bridging Wallets, Apps & Websites
 */
(function () {
  "use strict";

  var VERSION = "1.11.1";
  var PENDING_LOOKUP_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/rest/v1/rpc/lookup_pending_transaction";
  var EDGE_FN_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/payments";
  var REQUEST_TO_PAY_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/mobile-request-to-pay";
  var ADUMO_EDGE_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/adumo-card";
  var ELIGIBILITY_EDGE_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/checkout-eligibility";
  var MOBIWAND_EDGE_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/mobiwand-payment";
  var WAYAME_EDGE_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/wayame-payment";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2b3FycWRudXVwZGVmc3VpdXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNDc0NjEsImV4cCI6MjA4NjYwNzQ2MX0.iYcgNWmjY4zTNAhBf07hZdkj_qyfahT0A9db8O4RBQY";
  var LOGO_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/storage/v1/object/public/LOGO/Paysme%20Logo.png";
  var LOGO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 50'%3E%3Crect width='200' height='50' rx='6' fill='%23374151'/%3E%3Ctext x='100' y='32' text-anchor='middle' font-family='Arial,sans-serif' font-size='22' font-weight='bold' fill='%23f59e0b'%3EPaySME%3C/text%3E%3C/svg%3E";
  var MERCHANT_INFO_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/rest/v1/rpc/get_merchant_public_info";
  var PROVIDER_LOGOS = {
    mtc_maris: "https://www.paysme.site/pay-home/facilitators/maris.jpg",
    wayame: "https://paysme.site/pay-home/facilitators/wayame.jpg",
    paypulse: "https://www.paysme.site/pay-home/facilitators/paypulse.png",
    paytoday: "https://www.paysme.site/pay-home/facilitators/paytoday-payment.png",
    kazang: "https://www.paysme.site/pay-home/facilitators/kazang.png"
  };
  var NAMIBIAN_TOWNS = [
    "Aminuis", "Arandis", "Aranos", "Aroab", "Aus", "Berseba", "Bethanie",
    "Bukalo", "Divundu", "Dordabis", "Eenhana", "Engela", "Epupa", "Gibeon",
    "Gobabis", "Gochas", "Groot Aub", "Grootfontein", "Grünau", "Helao Nafidi",
    "Henties Bay", "Kalkfeld", "Kalkrand", "Kamanjab", "Karasburg", "Karibib",
    "Katima Mulilo", "Keetmanshoop", "Khorixas", "Koës", "Kongola", "Leonardville",
    "Linyanti", "Lüderitz", "Maltahöhe", "Mariental", "Nkurenkuru", "Noordoewer",
    "Ohangwena", "Okahandja", "Okahao", "Okakarara", "Okalongo", "Okongo",
    "Omaruru", "Omuthiya", "Onayena", "Ondangwa", "Ongwediva", "Oniipa", "Opuwo",
    "Oranjemund", "Oshakati", "Oshikango", "Oshikuku", "Otavi", "Otjinene",
    "Otjiwarongo", "Outapi", "Outjo", "Rehoboth", "Ruacana", "Rundu", "Sesfontein",
    "Stampriet", "Swakopmund", "Tsandi", "Tses", "Tsumeb", "Tsumkwe", "Uis",
    "Usakos", "Walvis Bay", "Warmbad", "Windhoek", "Witvlei"
  ];

  // ── Styles ──────────────────────────────────────────────────────────
  var CSS = [
    ".paysme-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:12px;box-sizing:border-box;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}",
    ".paysme-modal{background:#374151;border-radius:10px;padding:20px;width:320px;max-width:92vw;max-height:calc(100dvh - 24px);overflow-y:auto;position:relative;box-sizing:border-box;color:#fff}",
    ".paysme-close{position:absolute;top:10px;right:12px;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:4px}",
    ".paysme-close:hover{color:#d1d5db}",
    ".paysme-header{text-align:center;margin-bottom:16px}",
    ".paysme-header h3{margin:0 0 4px;font-size:18px;font-weight:700;color:#fff}",
    ".paysme-header p{margin:0;font-size:13px;color:#9ca3af}",
    ".paysme-info{background:#4b5563;border-radius:6px;padding:12px;margin-bottom:16px}",
    ".paysme-info-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}",
    ".paysme-info-row:last-child{margin-bottom:0}",
    ".paysme-info-label{font-size:13px;color:#9ca3af}",
    ".paysme-info-value{font-size:13px;font-weight:600;color:#fff}",
    ".paysme-info-value.billing{color:#93c5fd;font-weight:400}",
    ".paysme-form-group{margin-bottom:12px}",
    ".paysme-form-group label{display:block;font-size:13px;font-weight:600;color:#fff;margin-bottom:4px}",
    ".paysme-form-group input{width:100%;padding:8px 10px;border-radius:6px;border:1px solid #6b7280;background:#fff;color:#1f2937;font-size:14px;box-sizing:border-box;outline:none}",
    ".paysme-form-group input:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.3)}",
    ".paysme-form-group input::placeholder{color:#9ca3af}",
    ".paysme-town-autocomplete{position:relative;width:100%}",
    ".paysme-town-suggestions{display:none;position:absolute;top:calc(100% + 2px);left:0;right:0;z-index:99999;width:100%;max-height:170px;overflow-y:auto;box-sizing:border-box;list-style:none;margin:0;padding:0;border:1px solid #b8c0cc;border-radius:0 0 6px 6px;background:#fff;color:#1f2937;box-shadow:0 4px 10px rgba(0,0,0,.18);overscroll-behavior:contain}",
    ".paysme-town-suggestions.paysme-town-suggestions-open{display:block}",
    ".paysme-town-suggestion{display:flex;align-items:center;width:100%;min-height:34px;padding:8px 10px;border:0;background:#fff;color:#1f2937;font:inherit;font-size:14px;text-align:left;cursor:pointer;box-sizing:border-box}",
    ".paysme-town-suggestion:hover,.paysme-town-suggestion-active{background:#f1f5f9}",
    ".paysme-town-suggestion:active{background:#e2e8f0}",
    ".paysme-btn{display:block;width:100%;padding:10px;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;text-align:center;box-sizing:border-box;margin-bottom:8px;transition:opacity .15s}",
    ".paysme-btn:disabled{opacity:.5;cursor:not-allowed}",
    ".paysme-btn-generate{background:#2563eb;color:#fff}",
    ".paysme-btn-generate:hover:not(:disabled){background:#1d4ed8}",
    ".paysme-btn-wayame{background:#ed145b;color:#fff}",
    ".paysme-btn-wayame:hover:not(:disabled){background:#c90f49}",
    ".paysme-btn-maris{background:#00a7d8;color:#d71920}",
    ".paysme-btn-maris:hover:not(:disabled){background:#008fbb}",
    ".paysme-btn-paypulse{background:#2563eb;color:#fbbf24}",
    ".paysme-btn-paypulse:hover:not(:disabled){background:#1d4ed8}",
    ".paysme-btn-paytoday{background:linear-gradient(135deg,#2928f3 0%,#20deda 100%);color:#fff}",
    ".paysme-btn-paytoday:hover:not(:disabled){background:linear-gradient(135deg,#211fd0 0%,#18c4c1 100%)}",
    ".paysme-btn-kazang{background:#B3D31B;color:#000}",
    ".paysme-btn-kazang:hover:not(:disabled){background:#A1BE18}",
    ".paysme-btn-card{background:#fff;color:#1f2937;border:1px solid #d1d5db}",
    ".paysme-btn-card:hover:not(:disabled){background:#f3f4f6}",
    ".paysme-btn-disabled{background:#6b7280;color:#e5e7eb;border:1px solid #9ca3af;cursor:not-allowed;opacity:.85}",
    ".paysme-disabled-warning{background:#374151;border:1px solid #9ca3af;border-radius:6px;padding:10px 12px;margin-bottom:8px;color:#f9fafb;font-size:13px;font-weight:700;text-align:center}",
    ".paysme-method-disabled{background:#4b5563;border:1px solid #6b7280;border-radius:6px;padding:8px 10px;margin-bottom:8px;color:#d1d5db;font-size:12px;text-align:center}",
    ".paysme-method-disabled strong{display:block;color:#fff;font-size:13px;margin-bottom:2px}",
    ".paysme-method-loading{font-size:12px;color:#9ca3af;text-align:center;margin:8px 0}",
    ".paysme-footer{text-align:center;margin-top:12px}",
    ".paysme-footer p{margin:0 0 4px;font-size:12px;color:#9ca3af}",
    ".paysme-footer img{width:96px;height:auto;margin:0 auto;display:block}",
    ".paysme-code-display{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px}",
    ".paysme-code-display span{font-size:20px;font-weight:700;letter-spacing:2px;color:#fff}",
    ".paysme-instructions{margin-bottom:12px}",
    ".paysme-instructions p{font-size:11px;color:#9ca3af;margin:0 0 4px;line-height:1.4;text-align:center}",
    ".paysme-instructions a{color:#fbbf24;text-decoration:underline;cursor:pointer}",
    ".paysme-btn-copy{background:#fbbf24;color:#000}",
    ".paysme-btn-copy:hover{background:#f59e0b}",
    ".paysme-dynamic-fields{margin-bottom:16px}",
    ".paysme-spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:paysme-spin .6s linear infinite;vertical-align:middle;margin-right:6px}",
    ".paysme-provider-panel{position:absolute;inset:0;z-index:4;background:#374151;border-radius:10px;padding:22px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;text-align:center;overflow-y:auto}",
    ".paysme-provider-logo{display:block;max-width:150px;max-height:64px;object-fit:contain;margin:0 auto 18px;background:#fff;border-radius:8px;padding:8px}",
    ".paysme-provider-logo.paysme-provider-logo-kazang{width:176px;max-width:100%;max-height:none;background:transparent;border-radius:12px;padding:0}",
    ".paysme-provider-panel h4{font-size:18px;margin:0 0 10px;color:#fff}",
    ".paysme-provider-panel p{font-size:13px;line-height:1.55;color:#d1d5db;margin:0 0 16px}",
    ".paysme-provider-panel .paysme-btn-generate{background:#ed145b;color:#fff}",
    ".paysme-provider-panel .paysme-btn-generate:hover:not(:disabled){background:#c90f49}",
    ".paysme-provider-error{display:none;background:#7f1d1d;border:1px solid #ef4444;color:#fee2e2;border-radius:6px;padding:9px;font-size:12px;margin-bottom:10px}",
    ".paysme-provider-back{background:#fff;color:#111827;border:1px solid #d1d5db}",
    ".paysme-provider-back:hover:not(:disabled){background:#f3f4f6;color:#111827}",
    ".paysme-provider-code{width:100%;box-sizing:border-box;border:1px solid #9ca3af;border-radius:7px;background:#fff;color:#111827;font-size:22px;font-weight:700;letter-spacing:4px;text-align:center;padding:12px;margin:2px 0 10px;outline:none}",
    ".paysme-provider-code:focus{border-color:#fbbf24;box-shadow:0 0 0 2px rgba(251,191,36,.3)}",
    ".paysme-provider-code.paysme-provider-code-kazang:focus{border-color:#B3D31B;box-shadow:0 0 0 2px rgba(179,211,27,.3)}",
    ".paysme-provider-timer{font-size:13px;color:#fbbf24;margin:-7px 0 13px}",
    ".paysme-wayame-panel{justify-content:flex-start;overflow-y:auto;padding:18px}",
    ".paysme-wayame-summary{background:#4b5563;border-radius:8px;padding:10px;margin-bottom:12px;font-size:13px;color:#e5e7eb}",
    ".paysme-wayame-summary strong{display:block;color:#fff;font-size:16px;margin-bottom:3px}",
    ".paysme-wayame-or{display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:11px;margin:10px 0}",
    ".paysme-wayame-or:before,.paysme-wayame-or:after{content:'';height:1px;background:#6b7280;flex:1}",
    ".paysme-wayame-qr{display:block;width:190px;height:190px;object-fit:contain;margin:0 auto 8px;background:#fff;border-radius:8px;padding:6px}",
    ".paysme-wayame-wait{border:1px solid #ec4899;background:#4a1730;color:#fbcfe8;border-radius:7px;padding:9px;margin:10px 0;font-size:12px}",
    ".paysme-wayame-success{display:flex;align-items:center;justify-content:center;width:54px;height:54px;box-sizing:border-box;border:5px solid #4ade80;border-radius:50%;color:#4ade80;font-size:31px;font-weight:800;line-height:1;margin:18px auto 16px}",
    ".paysme-simulation-result{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}",
    ".paysme-r2p-notice{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1000000;width:min(390px,calc(100vw - 32px));box-sizing:border-box;border-radius:10px;background:#17211a;color:#fff;border:1px solid #f0b429;box-shadow:0 12px 32px rgba(0,0,0,.35);padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;text-align:left}",
    ".paysme-r2p-notice strong{display:block;color:#fff;font-size:16px;line-height:1.4}",
    ".paysme-r2p-button{display:inline-flex;align-items:center;justify-content:center;gap:14px;min-height:58px;padding:0 24px;box-sizing:border-box;border:0;border-radius:9px;background:#222b25;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:.01em;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.22);transition:background .15s ease,transform .15s ease,opacity .15s ease}",
    ".paysme-r2p-button:hover:not(:disabled){background:#17211a;transform:translateY(-1px)}",
    ".paysme-r2p-button:focus-visible{outline:3px solid rgba(240,180,41,.45);outline-offset:3px}",
    ".paysme-r2p-button:disabled{opacity:.65;cursor:wait;transform:none}",
    ".paysme-r2p-button-mark{display:inline-flex;align-items:center;justify-content:center;width:36px;height:25px;box-sizing:border-box;border:3px solid #fff;border-radius:8px;flex:0 0 auto}",
    ".paysme-r2p-button-mark:after{content:'';display:block;width:13px;height:15px;border-radius:3px;background:#f0b429}",
    ".paysme-provider-brand{margin:12px auto 0;text-align:center;color:#d1d5db;font-size:10px;line-height:1.2}",
    ".paysme-provider-brand span{display:block;margin-bottom:3px}",
    ".paysme-provider-brand img{display:block;width:82px;height:auto;margin:0 auto}",
    ".paysme-modal:has(.paysme-provider-panel)>.paysme-footer{visibility:hidden}",
    "@keyframes paysme-spin{to{transform:rotate(360deg)}}"
  ].join("\n");

  function injectStyles() {
    if (document.getElementById("paysme-sdk-styles")) return;
    var s = document.createElement("style");
    s.id = "paysme-sdk-styles";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var pageScrollState = null;

  function lockPageScroll() {
    if (pageScrollState) return;
    pageScrollState = {
      bodyOverflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }

  function unlockPageScroll() {
    if (!pageScrollState) return;
    document.body.style.overflow = pageScrollState.bodyOverflow;
    document.documentElement.style.overflow = pageScrollState.htmlOverflow;
    pageScrollState = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function providerBrandHtml() {
    return '<div class="paysme-provider-brand"><span>Powered by</span><img src="' + LOGO_URL + '" onerror="this.onerror=null;this.src=\'' + LOGO_FALLBACK + '\'" alt="PaySME"></div>';
  }

  function setBaseFooterHidden(modal, hidden) {
    var footer = modal && modal.querySelector(".paysme-footer");
    if (footer) footer.style.visibility = hidden ? "hidden" : "";
  }

  function showRequestToPayNotice(result) {
    var existing = document.getElementById("paysme-r2p-notice");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var notice = document.createElement("div");
    notice.id = "paysme-r2p-notice";
    notice.className = "paysme-r2p-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    var title = result.transaction_status === "paid"
      ? "Invoice Already Paid."
      : "Request to Pay Sent. Check your SMS.";
    notice.innerHTML = "<strong>" + title + "</strong>";
    document.body.appendChild(notice);
    setTimeout(function () {
      if (notice.parentNode) notice.parentNode.removeChild(notice);
    }, 7000);
  }

  function removeProviderPanel(panel) {
    if (!panel) return;
    var modal = panel.parentNode;
    if (modal) {
      setBaseFooterHidden(modal, false);
      modal.removeChild(panel);
    }
  }

  function getTownSuggestions(value) {
    var query = String(value || "").trim().toLocaleLowerCase();
    if (query.length < 3) return [];
    return NAMIBIAN_TOWNS.filter(function (town) {
      return town.toLocaleLowerCase().indexOf(query) !== -1;
    }).sort(function (first, second) {
      var firstStarts = first.toLocaleLowerCase().indexOf(query) === 0;
      var secondStarts = second.toLocaleLowerCase().indexOf(query) === 0;
      if (firstStarts !== secondStarts) return firstStarts ? -1 : 1;
      return first.localeCompare(second);
    });
  }

  function normalizeNamibianMobile(mobile) {
    var clean = String(mobile || "").replace(/\D/g, "");
    if (/^0(81|83|85)\d{7}$/.test(clean)) return "264" + clean.slice(1);
    if (/^264(81|83|85)\d{7}$/.test(clean)) return clean;
    return "";
  }

  function isValidNamibianMobile(mobile) {
    return /^264(81|83|85)\d{7}$/.test(normalizeNamibianMobile(mobile));
  }

  function validateConfig(cfg, requireAmount) {
    if (!cfg.vendor_uuid) throw new Error("PaySME SDK: vendor_uuid is required");
    if (!cfg.api_key) throw new Error("PaySME SDK: api_key is required");
    if (requireAmount) {
      if (!cfg.amount_nad || cfg.amount_nad <= 0) throw new Error("PaySME SDK: amount_nad must be > 0");
      if (!cfg.invoice_id) throw new Error("PaySME SDK: invoice_id is required");
      if (!cfg.product_name) throw new Error("PaySME SDK: product_name is required");
    }
  }

  function fetchMerchantSettings(vendorUuid) {
    return fetch(MERCHANT_INFO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ p_merchant_id: vendorUuid })
    })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var row = rows && rows.length > 0 ? rows[0] : {};
      return { businessName: row.business_name || "PaySME Store", taxMode: row.tax_mode || "not_registered", vatRate: Number(row.vat_rate || 0) };
    })
    .catch(function () { return { businessName: "PaySME Store", taxMode: "not_registered", vatRate: 0 }; });
  }

  function prepareConfig(config) {
    return fetchMerchantSettings(config.vendor_uuid).then(function (settings) {
      config._businessName = settings.businessName;
      config._taxMode = settings.taxMode;
      config._vatRate = settings.vatRate === 15 ? 15 : 0;
      return config;
    });
  }

  function sdkTax(amount, config) {
    var entered = Math.round(Number(amount || 0) * 100) / 100;
    var rate = config._vatRate === 15 ? 15 : 0;
    if (config._taxMode === "vat_exclusive" && rate) {
      var vatAdded = Math.round(entered * rate) / 100;
      return { net: entered, vat: vatAdded, gross: Math.round((entered + vatAdded) * 100) / 100, label: "VAT (15%) added" };
    }
    if (config._taxMode === "vat_inclusive" && rate) {
      var vatIncluded = Math.round((entered - entered / 1.15) * 100) / 100;
      return { net: Math.round((entered - vatIncluded) * 100) / 100, vat: vatIncluded, gross: entered, label: "VAT (15%) included" };
    }
    return { net: entered, vat: 0, gross: entered, label: "" };
  }

  // ── API calls ──────────────────────────────────────────────────────
  function createTransaction(cfg, town, email, mobile) {
    return fetch(EDGE_FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        action: "create_transaction",
        payload: {
          merchant_id: cfg.vendor_uuid,
          amount: cfg.amount_nad,
          type: "api",
          invoice_id: cfg.invoice_id,
          town: town,
          email: email,
          mobile: normalizeNamibianMobile(mobile)
        }
      })
    }).then(function (r) { return r.json(); });
  }

  function lookupPendingTransactions(vendorUuid, email, mobile) {
    return fetch(PENDING_LOOKUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        p_merchant_id: vendorUuid,
        p_email: email || null,
        p_mobile: normalizeNamibianMobile(mobile) || null
      })
    }).then(function (r) { return r.json(); });
  }

  function initiateCardPayment(cfg) {
    return fetch(ADUMO_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        merchant_id: cfg.vendor_uuid,
        api_key: cfg.api_key,
        amount: cfg._grossAmount || cfg.amount_nad,
        invoice_id: cfg.invoice_id,
        generated_code: cfg._generated_code,
        retry_failed: cfg._retry_failed === true,
        origin_url: cfg.redirect_url || window.location.href,
        town: cfg._town || null,
        email: cfg._email || null,
        mobile: normalizeNamibianMobile(cfg._mobile) || null,
        business_name: cfg._businessName || "PaySME Store"
      })
    }).then(function (r) { return r.json(); });
  }

  var requestToPayInFlight = {};

  function invoiceIdempotencyKey(merchantId, invoiceId) {
    var source = merchantId + "|" + invoiceId;
    var hashA = 2166136261;
    var hashB = 3335557771;
    for (var i = 0; i < source.length; i += 1) {
      hashA ^= source.charCodeAt(i);
      hashA = Math.imul(hashA, 16777619);
      hashB ^= source.charCodeAt(i);
      hashB = Math.imul(hashB, 2246822519);
    }
    var readableInvoice = invoiceId.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "invoice";
    return "invoice-" + readableInvoice + "-" + (hashA >>> 0).toString(16).padStart(8, "0") + (hashB >>> 0).toString(16).padStart(8, "0");
  }

  function requestToPay(config) {
    injectStyles();
    var cfg = config || {};
    var merchantId = String(cfg.vendor_uuid || cfg.merchant_id || "").trim();
    var apiKey = String(cfg.api_key || "").trim();
    var invoiceId = String(cfg.invoice_id || "").trim();
    var amount = Number(cfg.amount_nad != null ? cfg.amount_nad : cfg.amount);
    var mobile = normalizeNamibianMobile(cfg.mobile);
    var email = String(cfg.email || "").trim().toLowerCase();
    var town = String(cfg.town || "").trim().replace(/\s+/g, " ");

    if (!merchantId) return Promise.reject(new Error("PaySME SDK: vendor_uuid (Merchant ID) is required"));
    if (!apiKey) return Promise.reject(new Error("PaySME SDK: api_key is required"));
    if (!invoiceId) return Promise.reject(new Error("PaySME SDK: invoice_id is required"));
    if (!Number.isFinite(amount) || amount <= 0) return Promise.reject(new Error("PaySME SDK: a valid amount_nad is required"));
    if (!mobile) return Promise.reject(new Error("PaySME SDK: use a mobile number beginning with 081, 083, 085, +26481, +26483, or +26485"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.reject(new Error("PaySME SDK: a valid customer email is required"));
    if (!town) return Promise.reject(new Error("PaySME SDK: customer town is required"));

    var fingerprint = [merchantId, invoiceId, amount.toFixed(2), mobile].join("|");
    if (requestToPayInFlight[fingerprint]) return requestToPayInFlight[fingerprint];

    var idempotencyKey = String(cfg.idempotency_key || "").trim();
    if (!idempotencyKey) {
      idempotencyKey = invoiceIdempotencyKey(merchantId, invoiceId);
    }

    var promise = fetch(REQUEST_TO_PAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "X-Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify({
        vendor_uuid: merchantId,
        api_key: apiKey,
        invoice_id: invoiceId,
        amount_nad: amount,
        mobile: mobile,
        email: email,
        town: town,
        idempotency_key: idempotencyKey
      })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok || !body.ok) throw new Error(body.error || "Unable to send the PaySME payment request");
          return body;
        });
      })
      .then(function (result) {
        if (cfg.show_notification !== false) showRequestToPayNotice(result);
        if (result.transaction_status === "paid") {
          if (typeof cfg.on_already_paid === "function") cfg.on_already_paid(result);
        } else if (typeof cfg.on_request_sent === "function") {
          cfg.on_request_sent(result);
        }
        return result;
      })
      .catch(function (error) {
        if (typeof cfg.on_error === "function") cfg.on_error(error);
        throw error;
      })
      .finally(function () {
        delete requestToPayInFlight[fingerprint];
      });

    requestToPayInFlight[fingerprint] = promise;
    return promise;
  }

  function renderRequestToPayButton(config) {
    injectStyles();
    var cfg = config || {};
    var container = cfg.container;
    if (typeof container === "string") container = document.querySelector(container);
    if (!container || typeof container.appendChild !== "function") {
      throw new Error("PaySME SDK: renderRequestToPayButton requires a valid container selector or element");
    }

    var existing = container.querySelector("[data-paysme-request-to-pay-button]");
    if (existing) existing.parentNode.removeChild(existing);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "paysme-r2p-button";
    button.setAttribute("data-paysme-request-to-pay-button", "true");
    button.setAttribute("aria-label", "Create Payment Request with PaySME");
    button.innerHTML = '<span class="paysme-r2p-button-mark" aria-hidden="true"></span><span>Create Payment Request</span>';

    button.addEventListener("click", function () {
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      var label = button.querySelector("span:last-child");
      if (label) label.textContent = "Sending Request...";

      requestToPay(cfg)
        .catch(function () { /* on_error is handled by requestToPay */ })
        .finally(function () {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          if (label) label.textContent = "Create Payment Request";
        });
    });

    container.appendChild(button);
    return button;
  }

  function fetchEligibility(cfg) {
    return fetch(ELIGIBILITY_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        vendor_uuid: cfg.vendor_uuid,
        api_key: cfg.api_key,
        amount_nad: cfg.amount_nad
      })
    })
    .then(function (r) { return r.json(); })
    .catch(function (err) {
      console.error("PaySME eligibility check failed:", err);
      return null;
    });
  }

  function methodEnabled(eligibility, methodKey) {
    return !!(eligibility && eligibility.methods && eligibility.methods[methodKey] && eligibility.methods[methodKey].enabled);
  }

  function billingLocked(eligibility) {
    return !!(eligibility && eligibility.billing && eligibility.billing.locked);
  }

  function methodReason(eligibility, methodKey, fallback) {
    if (eligibility && eligibility.methods && eligibility.methods[methodKey] && eligibility.methods[methodKey].reason) {
      return eligibility.methods[methodKey].reason;
    }
    return fallback || "This payment method is not available.";
  }

  function disabledMethodHtml(label, reason) {
    return '<div class="paysme-method-disabled"><strong>' + esc(label) + '</strong>' + esc(reason || "Unavailable") + '</div>';
  }

  function showInlineNotice(overlay, button, noticeId, title, body) {
    var existing = overlay.querySelector("#" + noticeId);
    if (existing) return;
    var notice = document.createElement("div");
    notice.id = noticeId;
    notice.style.cssText = "background:#1e3a5f;border:1px solid #3b82f6;border-radius:6px;padding:10px 12px;margin-top:8px;text-align:center;font-size:13px;color:#93c5fd;";
    notice.innerHTML = "<strong style='color:#fff'>" + esc(title) + "</strong><br><span style='color:#9ca3af;font-size:12px'>" + esc(body) + "</span>";
    button.parentNode.insertBefore(notice, button.nextSibling);
    setTimeout(function () { if (notice.parentNode) notice.parentNode.removeChild(notice); }, 4000);
  }

  function friendlyCardError(error) {
    var message = error && error.message ? error.message : String(error || "");
    if (/not available|not configured|limit|hidden|Adumo|merchant code|credential|forbidden|non-2xx|Edge Function/i.test(message)) {
      return "Card payments are not available for this checkout right now. Please use the PaySME code or another available payment method.";
    }
    return "We could not start the card payment. Please try again or use another available payment method.";
  }

  function submitAdumoForm(resp, amount) {
    var form = document.createElement("form");
    form.method = "POST";
    form.action = resp.adumo_url;
    form.style.display = "none";
    var displayAmount = String(Number(amount).toFixed(2));
    var fields = {
      "MerchantID": resp.merchant_id,
      "ApplicationID": resp.application_id,
      "MerchantReference": resp.mref,
      "Amount": displayAmount,
      "Token": resp.token,
      "RedirectSuccessfulURL": resp.redirect_success_url,
      "RedirectFailedURL": resp.redirect_failed_url,
      "puid": resp.puid
    };
    // Adumo documents AuthoriseCurrencyCode as conditional: only submit it
    // when MCP/FX is enabled for the Application UID. A normal ZAR application
    // must use the currency configured in the Adumo portal.
    if (resp.currency_override_enabled === true && resp.currency_code) {
      fields.AuthoriseCurrencyCode = resp.currency_code;
    }
    for (var key in fields) {
      if (!fields[key]) continue;
      var input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = fields[key];
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  function callWayame(cfg, action, extra) {
    var payload = Object.assign({
      action: action,
      merchant_id: cfg.vendor_uuid,
      api_key: cfg.api_key,
      generated_code: cfg._generated_code,
      invoice_id: cfg.invoice_id,
      amount: cfg.amount_nad,
      retry_failed: cfg._retry_failed === true,
      origin_url: cfg.redirect_url || window.location.href
    }, extra || {});
    return fetch(WAYAME_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok || data.ok === false) throw new Error(data.error || "WayaMe request failed");
        return data;
      });
    });
  }

  function showWayameCheckout(overlay, cfg, callbacks) {
    var modal = overlay.querySelector(".paysme-modal");
    if (!modal || modal.querySelector(".paysme-provider-panel")) return;
    var panel = document.createElement("div");
    panel.className = "paysme-provider-panel paysme-wayame-panel";
    panel.innerHTML =
      '<img class="paysme-provider-logo" src="' + PROVIDER_LOGOS.wayame + '" alt="WayaMe">' +
      '<h4>Preparing WayaMe payment</h4>' +
      '<p>Preparing the payment interface...</p>' +
      '<span class="paysme-spinner" style="margin:8px auto 18px"></span>' +
      '<button class="paysme-btn paysme-provider-back" data-wayame-back>Back</button>' + providerBrandHtml();
    modal.appendChild(panel);
    setBaseFooterHidden(modal, true);

    var pollTimer = null;
    var simulationTimer = null;
    var stopped = false;
    function stopPolling() {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (simulationTimer) clearInterval(simulationTimer);
    }
    function closePanel() {
      stopPolling();
      removeProviderPanel(panel);
    }
    panel.querySelector("[data-wayame-back]").addEventListener("click", closePanel);

    function finishSuccess(data) {
      stopPolling();
      panel.innerHTML =
        '<img class="paysme-provider-logo" src="' + PROVIDER_LOGOS.wayame + '" alt="WayaMe">' +
        '<div class="paysme-wayame-success">&#10003;</div>' +
        '<h4>Payment successful</h4>' +
        '<p>WayaMe confirmed this payment. The merchant has been notified.</p>' + providerBrandHtml();
      var result = Object.assign({ provider: "wayame", payment_method: "wayame", status: "paid" }, data || {});
      window.dispatchEvent(new CustomEvent("paysme:payment-success", { detail: result }));
      if (typeof cfg.on_payment_success === "function") cfg.on_payment_success(result);
      if (callbacks && typeof callbacks.on_payment_success === "function") callbacks.on_payment_success(result);
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        unlockPageScroll();
      }, 1400);
    }

    function showTerminalStatus(status, message) {
      stopPolling();
      var statusLabel = status === "declined" ? "Payment declined" : status === "expired" ? "Payment request expired" : "Payment unsuccessful";
      panel.innerHTML =
        '<img class="paysme-provider-logo" src="' + PROVIDER_LOGOS.wayame + '" alt="WayaMe">' +
        '<h4>' + esc(statusLabel) + '</h4>' +
        '<p>' + esc(message || "WayaMe did not complete this payment. You may go back and choose another method.") + '</p>' +
        '<button class="paysme-btn paysme-provider-back" data-wayame-back>Back</button>' + providerBrandHtml();
      panel.querySelector("[data-wayame-back]").addEventListener("click", closePanel);
    }

    function pollStatus(requestId) {
      if (stopped) return;
      callWayame(cfg, "status", { request_id: requestId }).then(function (statusData) {
        if (statusData.status === "paid") {
          finishSuccess(statusData);
          return;
        }
        if (["failed", "declined", "expired", "cancelled"].indexOf(statusData.status) !== -1) {
          showTerminalStatus(statusData.status);
          return;
        }
        pollTimer = setTimeout(function () { pollStatus(requestId); }, 2500);
      }).catch(function (error) {
        console.error("PaySME WayaMe status error:", error);
        pollTimer = setTimeout(function () { pollStatus(requestId); }, 4000);
      });
    }

    function renderPayment(data) {
      var appButton = data.app_intent
        ? '<button class="paysme-btn paysme-btn-wayame" data-wayame-app>Approve in Bank App</button>'
        : "";
      var simulationButton = data.simulation
        ? '<button class="paysme-btn paysme-btn-wayame" data-wayame-test>Approve in Bank App</button>'
        : "";
      var qrBlock = data.qr_image
        ? '<div class="paysme-wayame-or">OR SCAN QR</div><button type="button" data-wayame-qr style="display:block;margin:0 auto;padding:0;border:0;border-radius:8px;background:transparent;cursor:pointer"><img class="paysme-wayame-qr" src="' + esc(data.qr_image) + '" alt="WayaMe payment QR"></button><p style="font-size:11px;margin-bottom:8px">Scan with your banking or payment application. You can also tap the QR to continue.</p>'
        : "";
      var waitingBlock = data.simulation
        ? '<div class="paysme-wayame-wait" data-wayame-test-wait style="display:none"><span class="paysme-spinner" style="width:14px;height:14px;border-width:2px;vertical-align:middle;margin-right:6px"></span><strong>Waiting for approval...</strong><br>Approval check completes in <span data-wayame-test-time>0:07</span>.</div>'
        : '<div class="paysme-wayame-wait"><span class="paysme-spinner" style="width:14px;height:14px;border-width:2px;vertical-align:middle;margin-right:6px"></span><strong>Waiting for payment approval...</strong><br>Please complete the payment using your banking/payment app.</div>';
      panel.innerHTML =
        '<img class="paysme-provider-logo" src="' + PROVIDER_LOGOS.wayame + '" alt="WayaMe">' +
        '<h4>Pay with WayaMe</h4>' +
        '<div class="paysme-wayame-summary"><strong>' + esc(data.merchant_name || cfg._businessName || "PaySME Merchant") + '</strong>N$ ' + esc(Number(data.amount || cfg.amount_nad).toFixed(2)) + '<br><span style="font-size:11px">' + esc(data.merchant_alias || "") + '</span></div>' +
        appButton + simulationButton + qrBlock +
        waitingBlock +
        '<div class="paysme-provider-error" role="alert"></div>' +
        '<button class="paysme-btn paysme-provider-back" data-wayame-back>Back</button>' + providerBrandHtml();

      panel.querySelector("[data-wayame-back]").addEventListener("click", closePanel);
      var app = panel.querySelector("[data-wayame-app]");
      if (app) app.addEventListener("click", function () { window.location.href = data.app_intent; });
      var simulationButtonElement = panel.querySelector("[data-wayame-test]");
      var qrButtonElement = panel.querySelector("[data-wayame-qr]");
      function startSimulationApproval() {
        if (!data.simulation || simulationTimer) return;
        var waitBox = panel.querySelector("[data-wayame-test-wait]");
        var timeLabel = panel.querySelector("[data-wayame-test-time]");
        var secondsLeft = 7;
        if (simulationButtonElement) {
          simulationButtonElement.disabled = true;
          simulationButtonElement.style.display = "none";
        }
        if (qrButtonElement) qrButtonElement.disabled = true;
        if (waitBox) waitBox.style.display = "block";
        simulationTimer = setInterval(function () {
          secondsLeft -= 1;
          if (timeLabel) timeLabel.textContent = "0:" + String(secondsLeft).padStart(2, "0");
          if (secondsLeft <= 0) {
            clearInterval(simulationTimer);
            simulationTimer = null;
            panel.className = "paysme-provider-panel paysme-wayame-panel paysme-simulation-result";
            panel.innerHTML =
              '<img class="paysme-provider-logo" src="' + PROVIDER_LOGOS.wayame + '" alt="WayaMe">' +
              '<div class="paysme-wayame-success">&#10003;</div>' +
              '<h4>PASSED: Simulation Testing Event.</h4>' +
              '<p>WayaMe confirmation API is awaiting provider credentials.</p>' +
              '<p style="font-size:11px">No payment was processed or marked paid.</p>' +
              '<button class="paysme-btn paysme-provider-back" data-wayame-back>Back</button>' + providerBrandHtml();
            panel.querySelector("[data-wayame-back]").addEventListener("click", closePanel);
          }
        }, 1000);
      }
      if (simulationButtonElement) simulationButtonElement.addEventListener("click", startSimulationApproval);
      if (qrButtonElement && data.simulation) qrButtonElement.addEventListener("click", startSimulationApproval);
      if (!data.simulation) pollStatus(data.request_id);
    }

    setTimeout(function () {
      renderPayment({
        ok: true,
        request_id: "WAYAME-SIM-" + Date.now(),
        status: "pending",
        simulation: true,
        amount: Number(cfg.amount_nad || 0),
        merchant_name: cfg._businessName || "PaySME Merchant",
        merchant_alias: "",
        qr_image: "https://paysme.site/pay-home/facilitators/wayame-simulation-qr.png"
      });
    }, 300);
  }

  function showMobiWandPreflight(overlay, cfg, provider, callbacks) {
    var modal = overlay.querySelector(".paysme-modal");
    if (!modal || modal.querySelector(".paysme-provider-panel")) return;
    var displayName = provider === "mtc_maris" ? "MTC Maris" : provider === "paypulse" ? "PayPulse" : provider === "paytoday" ? "PayToday" : "Kazang";
    var accountName = provider === "paytoday" ? "PayToday USSD" : displayName;
    var isKazang = provider === "kazang";
    var amountText = Number(cfg.amount_nad || 0).toFixed(2);
    var logoClass = "paysme-provider-logo" + (isKazang ? " paysme-provider-logo-kazang" : "");
    var actionClass = isKazang ? "paysme-btn-kazang" : "paysme-btn-generate";
    var panel = document.createElement("div");
    panel.className = "paysme-provider-panel";
    panel.innerHTML =
      '<img class="' + logoClass + '" src="' + PROVIDER_LOGOS[provider] + '" alt="' + esc(displayName) + '">' +
      '<h4>' + (isKazang ? 'Purchase an EasyPay Voucher' : 'Pay with ' + esc(displayName)) + '</h4>' +
      '<p>' + (isKazang
        ? 'Visit a participating Kazang retailer and purchase an EasyPay Voucher for exactly <strong style="color:#fff">N$ ' + esc(amountText) + '</strong>. Keep the receipt safe. It contains a unique 16-digit PIN. Continue when you have your voucher.'
        : 'You need an active ' + esc(accountName) + ' account with a balance greater than <strong style="color:#fff">N$ ' + esc(amountText) + '</strong> to proceed. Select Proceed to continue to confirmation-code entry.') + '</p>' +
      '<div class="paysme-provider-error" role="alert"></div>' +
      '<button class="paysme-btn ' + actionClass + '" data-provider-proceed>' + (isKazang ? 'I have Voucher' : 'Proceed') + '</button>' +
      '<button class="paysme-btn paysme-provider-back" data-provider-back>Back</button>' + providerBrandHtml();
    modal.appendChild(panel);
    setBaseFooterHidden(modal, true);

    var proceed = panel.querySelector("[data-provider-proceed]");
    var back = panel.querySelector("[data-provider-back]");
    back.addEventListener("click", function () { removeProviderPanel(panel); });
    proceed.addEventListener("click", function () {
      panel.innerHTML =
        '<img class="' + logoClass + '" src="' + PROVIDER_LOGOS[provider] + '" alt="' + esc(displayName) + '">' +
        '<h4>' + (isKazang ? 'Enter your EasyPay Voucher PIN' : 'Enter your ' + esc(displayName) + ' Paycode') + '</h4>' +
        '<p>' + (isKazang
          ? 'Enter the 16-digit PIN printed on your EasyPay Voucher. Confirm that its value is <strong style="color:#fff">N$ ' + esc(amountText) + '</strong>.'
          : 'Enter the confirmation Paycode sent to <strong style="color:#fff">+' + esc(normalizeNamibianMobile(cfg._mobile)) + '</strong>.') + '</p>' +
        (isKazang ? '' : '<div class="paysme-provider-timer">Expires in <span data-provider-timer>3:00</span></div>') +
        '<input class="paysme-provider-code' + (isKazang ? ' paysme-provider-code-kazang' : '') + '" data-provider-code type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="' + (isKazang ? '16' : '12') + '" placeholder="' + (isKazang ? '16-digit PIN' : 'Code') + '" aria-label="' + (isKazang ? 'EasyPay Voucher 16-digit PIN' : esc(displayName) + ' confirmation Paycode') + '">' +
        '<div class="paysme-provider-error" role="alert"></div>' +
        '<button class="paysme-btn ' + actionClass + '" data-provider-confirm disabled>Confirm payment</button>' +
        '<button class="paysme-btn paysme-provider-back" data-provider-back>Back</button>' + providerBrandHtml();

      var codeInput = panel.querySelector("[data-provider-code]");
      var confirmButton = panel.querySelector("[data-provider-confirm]");
      var codeError = panel.querySelector(".paysme-provider-error");
      var timerLabel = panel.querySelector("[data-provider-timer]");
      var secondsLeft = 180;
      var approvalTimer = null;
      var timer = null;
      if (!isKazang) {
        timer = setInterval(function () {
          secondsLeft -= 1;
          var minutes = Math.floor(secondsLeft / 60);
          var seconds = secondsLeft % 60;
          if (timerLabel) timerLabel.textContent = minutes + ":" + String(seconds).padStart(2, "0");
          if (secondsLeft <= 0) {
            clearInterval(timer);
            confirmButton.disabled = true;
            codeError.textContent = "This confirmation Paycode has expired. Request a new code from " + displayName + ".";
            codeError.style.display = "block";
          }
        }, 1000);
      }
      panel.querySelector("[data-provider-back]").addEventListener("click", function () {
        if (timer) clearInterval(timer);
        if (approvalTimer) clearInterval(approvalTimer);
        removeProviderPanel(panel);
      });
      codeInput.addEventListener("input", function () {
        codeInput.value = codeInput.value.replace(/\D/g, "");
        confirmButton.disabled = isKazang ? !/^\d{16}$/.test(codeInput.value) : !/^\d{4,12}$/.test(codeInput.value) || secondsLeft <= 0;
        codeError.style.display = "none";
      });
      confirmButton.addEventListener("click", function () {
        confirmButton.disabled = true;
        confirmButton.innerHTML = '<span class="paysme-spinner"></span> Awaiting approval...';
        codeInput.disabled = true;
        if (timer) clearInterval(timer);
        var approvalSeconds = 7;
        var waitBox = document.createElement("div");
        waitBox.className = "paysme-wayame-wait";
        waitBox.innerHTML = '<span class="paysme-spinner" style="width:14px;height:14px;border-width:2px;vertical-align:middle;margin-right:6px"></span><strong>Waiting for approval...</strong><br>Approval check completes in <span data-provider-approval-time>0:07</span>.';
        panel.appendChild(waitBox);
        var approvalLabel = waitBox.querySelector("[data-provider-approval-time]");
        approvalTimer = setInterval(function () {
          approvalSeconds -= 1;
          if (approvalLabel) approvalLabel.textContent = "0:" + String(approvalSeconds).padStart(2, "0");
          if (approvalSeconds <= 0) {
            clearInterval(approvalTimer);
            approvalTimer = null;
            panel.className = "paysme-provider-panel paysme-simulation-result";
            panel.innerHTML =
              '<img class="' + logoClass + '" src="' + PROVIDER_LOGOS[provider] + '" alt="' + esc(displayName) + '">' +
              '<div class="paysme-wayame-success">&#10003;</div>' +
              '<h4>PASSED: Simulation Testing Event.</h4>' +
              '<p>' + (isKazang ? 'EasyPay Voucher verification is awaiting Kazang API access.' : esc(displayName) + ' confirmation API is awaiting provider credentials.') + '</p>' +
              '<p style="font-size:11px">No payment was processed or marked paid.</p>' +
              '<button class="paysme-btn paysme-provider-back" data-provider-back>Back</button>' + providerBrandHtml();
            panel.querySelector("[data-provider-back]").addEventListener("click", function () { removeProviderPanel(panel); });
          }
        }, 1000);
      });
      setTimeout(function () { codeInput.focus(); }, 0);
    });
  }

  function attachCardPayment(overlay, buttonSelector, cfg, callbacks) {
    var cardBtn = overlay.querySelector(buttonSelector);
    if (!cardBtn) return;
    cardBtn.addEventListener("click", function () {
      cardBtn.disabled = true;
      cardBtn.innerHTML = '<span class="paysme-spinner"></span> Processing...';
      initiateCardPayment(cfg)
        .then(function (resp) {
          if (resp && resp.ok && resp.token) {
            submitAdumoForm(resp, cfg.amount_nad);
            setTimeout(function() {
              var modal = document.querySelector("[data-paysme-modal]");
              if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
              unlockPageScroll();
              if (callbacks && callbacks.on_cancel) callbacks.on_cancel();
            }, 1500);
          } else {
            throw new Error(resp.error || "Card payment initiation failed");
          }
        })
        .catch(function (err) {
          cardBtn.disabled = false;
          cardBtn.textContent = "Pay via Card";
          console.error("PaySME Card Error:", err);
          showInlineNotice(overlay, cardBtn, "paysme-card-error-notice", "Card payment unavailable", friendlyCardError(err));
          if (callbacks && callbacks.on_error) callbacks.on_error(err);
        });
    });
  }

  function paymentOptionsHtml(eligibility, prefix) {
    if (billingLocked(eligibility)) {
      return '<button class="paysme-btn paysme-btn-disabled" disabled>Pay via Card</button>' +
        '<button class="paysme-btn paysme-btn-disabled" disabled>Pay via WayaMe</button>' +
        '<button class="paysme-btn paysme-btn-disabled" disabled>Pay via MTC Maris</button>' +
        '<button class="paysme-btn paysme-btn-disabled" disabled>Pay via PayPulse</button>' +
        '<button class="paysme-btn paysme-btn-disabled" disabled>Pay via PayToday</button>' +
        '<button class="paysme-btn paysme-btn-disabled" disabled>Pay via Kazang</button>' +
        '<div class="paysme-disabled-warning">Payments are temporarily disabled for this merchant.</div>';
    }

    var html = "";
    if (methodEnabled(eligibility, "wayame")) {
      html += '<button class="paysme-btn paysme-btn-wayame" id="' + prefix + '-wayame">Pay via WayaMe</button>';
    }
    if (methodEnabled(eligibility, "mtc_maris")) {
      html += '<button class="paysme-btn paysme-btn-maris" id="' + prefix + '-maris">Pay via MTC Maris</button>';
    }
    if (methodEnabled(eligibility, "paypulse")) {
      html += '<button class="paysme-btn paysme-btn-paypulse" id="' + prefix + '-paypulse">Pay via PayPulse</button>';
    }
    if (methodEnabled(eligibility, "paytoday")) {
      html += '<button class="paysme-btn paysme-btn-paytoday" id="' + prefix + '-paytoday">Pay via PayToday</button>';
    }
    if (methodEnabled(eligibility, "kazang")) {
      html += '<button class="paysme-btn paysme-btn-kazang" id="' + prefix + '-kazang">Pay via Kazang</button>';
    }
    if (methodEnabled(eligibility, "card")) {
      html += '<button class="paysme-btn paysme-btn-card" id="' + prefix + '-card">Pay via Card</button>';
    }
    return html;
  }

  function attachPaymentOptionEvents(overlay, cfg, prefix, callbacks) {
    var wayameBtn = overlay.querySelector("#" + prefix + "-wayame");
    if (wayameBtn) {
      wayameBtn.addEventListener("click", function () {
        showWayameCheckout(overlay, cfg, callbacks);
      });
    }
    var marisBtn = overlay.querySelector("#" + prefix + "-maris");
    if (marisBtn) {
      marisBtn.addEventListener("click", function () {
        showMobiWandPreflight(overlay, cfg, "mtc_maris", callbacks);
      });
    }
    var paypulseBtn = overlay.querySelector("#" + prefix + "-paypulse");
    if (paypulseBtn) {
      paypulseBtn.addEventListener("click", function () {
        showMobiWandPreflight(overlay, cfg, "paypulse", callbacks);
      });
    }
    var paytodayBtn = overlay.querySelector("#" + prefix + "-paytoday");
    if (paytodayBtn) {
      paytodayBtn.addEventListener("click", function () {
        showMobiWandPreflight(overlay, cfg, "paytoday", callbacks);
      });
    }
    var kazangBtn = overlay.querySelector("#" + prefix + "-kazang");
    if (kazangBtn) {
      kazangBtn.addEventListener("click", function () {
        showMobiWandPreflight(overlay, cfg, "kazang", callbacks);
      });
    }
    attachCardPayment(overlay, "#" + prefix + "-card", cfg, callbacks);
  }

  // ── Modal Builder ───────────────────────────────────────────────────
  function buildModal(cfg, isDynamic) {
    var overlay = document.createElement("div");
    overlay.className = "paysme-overlay";
    overlay.setAttribute("data-paysme-modal", "true");

    var billingText = "Once-off payment";
    if (cfg.recurring === true) {
      var period = cfg.recurring_period || "monthly";
      billingText = period + " recurring";
    }
    var billingInfo =
      '<div class="paysme-info-row">' +
      '<span class="paysme-info-label">Billing</span>' +
      '<span class="paysme-info-value billing">' + esc(billingText) + "</span>" +
      "</div>";

    var infoBlock = "";
    var tax = sdkTax(cfg.amount_nad, cfg);
    var taxRows = cfg._taxMode && cfg._taxMode !== "not_registered"
      ? '<div class="paysme-info-row"><span class="paysme-info-label">' + esc(tax.label) + '</span><span class="paysme-info-value">N$ ' + esc(tax.vat.toFixed(2)) + '</span></div><div class="paysme-info-row"><span class="paysme-info-label">Customer pays:</span><span class="paysme-info-value">N$ ' + esc(tax.gross.toFixed(2)) + '</span></div>'
      : '';
    if (!isDynamic) {
      infoBlock =
        '<div class="paysme-info">' +
        '<div class="paysme-info-row"><span class="paysme-info-label">Invoice ID:</span><span class="paysme-info-value">' + esc(cfg.invoice_id) + "</span></div>" +
        '<div class="paysme-info-row"><span class="paysme-info-label">Price before VAT:</span><span class="paysme-info-value">N$ ' + esc(tax.net.toFixed(2)) + "</span></div>" + taxRows +
        billingInfo +
        '<div class="paysme-info-row"><span class="paysme-info-label">Product:</span><span class="paysme-info-value">' + esc(cfg.product_name || "") + "</span></div>" +
        "</div>";
    }

    var dynamicFields = "";
    if (isDynamic) {
      dynamicFields =
        '<div class="paysme-dynamic-fields">' +
        '<div class="paysme-form-group"><label>Product / Invoice ID</label><input type="text" id="paysme-dyn-product" placeholder="e.g. Invoice #123"></div>' +
        '<div class="paysme-form-group"><label>Amount (N$)</label><input type="number" id="paysme-dyn-amount" placeholder="0.00" min="0.01" step="0.01"></div>' +
        '<div class="paysme-form-group"><label><input type="checkbox" id="paysme-dyn-recurring"> Recurring payment</label></div>' +
        '<div class="paysme-form-group" id="paysme-dyn-period-wrap" style="display:none"><label>Period</label><select id="paysme-dyn-period" style="width:100%;padding:8px;border-radius:6px;border:1px solid #6b7280"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></div>' +
        "</div>";
    }

    // NOTE: Only "Generate PaySME Code" button on the initial form screen.
    // IPP and Card buttons appear ONLY on the paycode success screen.
    var modalHTML =
      '<div class="paysme-modal">' +
      '<button class="paysme-close" id="paysme-close-btn">&times;</button>' +
      '<div class="paysme-header">' +
      '<h3>' + esc(cfg._businessName || "PaySME Store") + "</h3>" +
      '<p>Complete your payment securely with PaySME</p>' +
      "</div>" +
      infoBlock +
      dynamicFields +
      '<div id="paysme-form-section">' +
      '<div class="paysme-form-group"><label for="paysme-town">Town</label><div class="paysme-town-autocomplete"><input type="text" id="paysme-town" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="paysme-town-suggestions" autocomplete="address-level2" maxlength="120" placeholder="Start typing your town"><ul id="paysme-town-suggestions" class="paysme-town-suggestions" role="listbox"></ul></div></div>' +
      '<div class="paysme-form-group"><label>Email Address</label><input type="email" id="paysme-email" placeholder="you@email.com"></div>' +
      '<div class="paysme-form-group"><label>Mobile Number</label><input type="tel" id="paysme-mobile" placeholder="0812345678 or 264812345678"></div>' +
      '<button class="paysme-btn paysme-btn-generate" id="paysme-gen-btn" disabled>Generate PaySME Code</button>' +
      "</div>" +
      '<div id="paysme-success-section" style="display:none"></div>' +
      '<div class="paysme-footer">' +
      "<p>Powered by</p>" +
      '<img src="' + LOGO_URL + '" alt="PaySME" onerror="this.src=\'' + LOGO_FALLBACK + '\'">' +
      "</div>" +
      "</div>";

    overlay.innerHTML = modalHTML;
    return overlay;
  }

  // ── Paycode Success View ────────────────────────────────────────────
  function showPaycodeView(overlay, code, cfg, transaction) {
    var formSection = overlay.querySelector("#paysme-form-section");
    var successSection = overlay.querySelector("#paysme-success-section");
    if (formSection) formSection.style.display = "none";
    if (successSection) {
      successSection.style.display = "block";
      successSection.innerHTML =
        '<div class="paysme-info">' +
        '<div class="paysme-info-row"><span class="paysme-info-label">Invoice ID:</span><span class="paysme-info-value">' + esc(cfg.invoice_id) + "</span></div>" +
        '<div class="paysme-info-row"><span class="paysme-info-label">Customer pays:</span><span class="paysme-info-value">N$ ' + esc(String(transaction && transaction.amount != null ? transaction.amount : sdkTax(cfg.amount_nad, cfg).gross)) + "</span></div>" +
        (transaction && Number(transaction.vat_amount || 0) > 0 ? '<div class="paysme-info-row"><span class="paysme-info-label">VAT (15%)</span><span class="paysme-info-value">N$ ' + esc(Number(transaction.vat_amount).toFixed(2)) + "</span></div>" : '') +
        "</div>" +
        '<div class="paysme-code-display">' +
        '<span>' + esc(code) + "</span>" +
        "</div>" +
        '<div class="paysme-instructions">' +
        "<p>This code has been sent via SMS.</p>" +
        "<p>Provide it at the teller/kiosk of our participating Payment Vendors to finalize purchase.</p>" +
        "<p>The Merchant will immediately get notified of successful payment in order to ship product or initialize service (contact your merchant for their process).</p>" +
        '<p>See list of Payment Vendors Here: <a href="https://paysme.site" target="_blank">Vendor List</a></p>' +
        "</div>" +
        '<button class="paysme-btn paysme-btn-copy" id="paysme-copy-btn">Copy PaySME Code</button>' +
        '<div id="paysme-payment-options"><div class="paysme-method-loading">Checking available payment methods...</div></div>';

      // Copy button
      var copyBtn = overlay.querySelector("#paysme-copy-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", function () {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(code).then(function () {
              copyBtn.textContent = "Copied!";
              setTimeout(function () { copyBtn.textContent = "Copy PaySME Code"; }, 2000);
            });
          }
        });
      }

      cfg._generated_code = code;
      fetchEligibility(cfg).then(function (eligibility) {
        var options = overlay.querySelector("#paysme-payment-options");
        if (!options) return;
        options.innerHTML = paymentOptionsHtml(eligibility, "paysme-method");
        attachPaymentOptionEvents(overlay, cfg, "paysme-method", {
          on_error: cfg.on_error,
          on_cancel: cfg.on_cancel
        });
      });

      // Card button — initiates Adumo card payment
      var cardBtn2 = overlay.querySelector("#paysme-card-btn2");
      if (cardBtn2) {
        cardBtn2.addEventListener("click", function () {
          cardBtn2.disabled = true;
          cardBtn2.innerHTML = '<span class="paysme-spinner"></span> Processing...';

          // Store generated code on cfg BEFORE calling initiateCardPayment
          cfg._generated_code = code;

          // Safety check — log payload so missing fields are visible in console
          console.log("PaySME Card payload:", {
            merchant_id:    cfg.vendor_uuid,
            amount:         cfg.amount_nad,
            invoice_id:     cfg.invoice_id,
            generated_code: cfg._generated_code,
            email:          cfg._email,
            mobile:         cfg._mobile
          });

          initiateCardPayment(cfg)
            .then(function (resp) {
              if (resp && resp.ok && resp.token) {
                submitAdumoForm(resp, cfg.amount_nad);
                // Close modal after Adumo opens in new tab
                setTimeout(function() {
                  var modal = document.querySelector("[data-paysme-modal]");
                  if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
                  unlockPageScroll();
                  if (cfg.on_cancel) cfg.on_cancel();
                }, 1500);
              } else {
                throw new Error(resp.error || "Card payment initiation failed");
              }
            })
            .catch(function (err) {
              cardBtn2.disabled = false;
              cardBtn2.textContent = "Pay via Card";
              console.error("PaySME Card Error:", err);
              showInlineNotice(overlay, cardBtn2, "paysme-card-error-notice", "Card payment unavailable", friendlyCardError(err));
              if (cfg.on_error) cfg.on_error(err);
            });
        });
      }
    }
  }

  // ── Attach Modal Logic ──────────────────────────────────────────────
  function attachModalEvents(overlay, cfg, isDynamic, callbacks) {
    var townInput = overlay.querySelector("#paysme-town");
    var townList = overlay.querySelector("#paysme-town-suggestions");
    var townWrapper = overlay.querySelector(".paysme-town-autocomplete");
    var emailInput = overlay.querySelector("#paysme-email");
    var mobileInput = overlay.querySelector("#paysme-mobile");
    var genBtn = overlay.querySelector("#paysme-gen-btn");
    var closeBtn = overlay.querySelector("#paysme-close-btn");
    var townMatches = [];
    var activeTownIndex = -1;

    // Dynamic mode: recurring toggle
    if (isDynamic) {
      var recurCheck = overlay.querySelector("#paysme-dyn-recurring");
      var periodWrap = overlay.querySelector("#paysme-dyn-period-wrap");
      if (recurCheck && periodWrap) {
        recurCheck.addEventListener("change", function () {
          periodWrap.style.display = recurCheck.checked ? "block" : "none";
        });
      }
    }

    function getFields() {
      var town = (townInput && townInput.value || "").trim();
      var email = (emailInput && emailInput.value || "").trim();
      var mobile = (mobileInput && mobileInput.value || "").trim();
      return { town: town, email: email, mobile: mobile };
    }

    function updateButtons() {
      var f = getFields();
      var validMobile = isValidNamibianMobile(f.mobile);
      var hasFields = f.town.length > 0 && f.email.length > 0 && validMobile;
      if (mobileInput) {
        mobileInput.setCustomValidity(validMobile || f.mobile.length === 0 ? "" : "Use 081, 083, 085 or +26481, +26483, +26485 followed by 7 digits.");
      }
      if (isDynamic) {
        var amtEl = overlay.querySelector("#paysme-dyn-amount");
        var prodEl = overlay.querySelector("#paysme-dyn-product");
        hasFields = hasFields && amtEl && parseFloat(amtEl.value) > 0 && prodEl && prodEl.value.trim().length > 0;
      }
      if (genBtn) genBtn.disabled = !hasFields;
    }

    function closeTownSuggestions() {
      activeTownIndex = -1;
      if (townList) {
        townList.innerHTML = "";
        townList.classList.remove("paysme-town-suggestions-open");
      }
      if (townInput) {
        townInput.setAttribute("aria-expanded", "false");
        townInput.removeAttribute("aria-activedescendant");
      }
    }

    function selectTown(town) {
      if (!townInput) return;
      townInput.value = town;
      closeTownSuggestions();
      updateButtons();
      townInput.focus();
    }

    function highlightTown(index) {
      if (!townList || !townMatches.length) return;
      activeTownIndex = index;
      var buttons = townList.querySelectorAll(".paysme-town-suggestion");
      buttons.forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === activeTownIndex;
        button.classList.toggle("paysme-town-suggestion-active", isActive);
        if (button.parentNode) {
          button.parentNode.setAttribute("aria-selected", isActive ? "true" : "false");
        }
      });
      var activeButton = buttons[activeTownIndex];
      if (activeButton) {
        townInput.setAttribute("aria-activedescendant", activeButton.id);
        activeButton.scrollIntoView({ block: "nearest" });
      }
    }

    function renderTownSuggestions() {
      if (!townInput || !townList) return;
      townMatches = getTownSuggestions(townInput.value);
      activeTownIndex = -1;
      townList.innerHTML = "";

      if (!townMatches.length) {
        closeTownSuggestions();
        return;
      }

      townMatches.forEach(function (town, index) {
        var item = document.createElement("li");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        var button = document.createElement("button");
        button.type = "button";
        button.id = "paysme-town-option-" + index;
        button.className = "paysme-town-suggestion";
        button.textContent = town;
        button.addEventListener("pointerdown", function (event) {
          event.preventDefault();
        });
        button.addEventListener("click", function () {
          selectTown(town);
        });
        item.appendChild(button);
        townList.appendChild(item);
      });

      townList.classList.add("paysme-town-suggestions-open");
      townInput.setAttribute("aria-expanded", "true");
    }

    if (townInput) {
      townInput.addEventListener("input", function () {
        renderTownSuggestions();
        updateButtons();
      });
      townInput.addEventListener("focus", function () {
        if (townInput.value.trim().length >= 3) renderTownSuggestions();
      });
      townInput.addEventListener("blur", function () {
        setTimeout(function () {
          if (!townWrapper || !townWrapper.contains(document.activeElement)) {
            closeTownSuggestions();
          }
        }, 0);
      });
      townInput.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          closeTownSuggestions();
          return;
        }
        if (!townMatches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          renderTownSuggestions();
        }
        if (!townMatches.length) return;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          highlightTown(activeTownIndex < townMatches.length - 1 ? activeTownIndex + 1 : 0);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          highlightTown(activeTownIndex > 0 ? activeTownIndex - 1 : townMatches.length - 1);
        } else if (event.key === "Enter" && activeTownIndex >= 0) {
          event.preventDefault();
          selectTown(townMatches[activeTownIndex]);
        }
      });
    }
    overlay.addEventListener("pointerdown", function (event) {
      if (!townWrapper || !townWrapper.contains(event.target)) closeTownSuggestions();
    });
    if (emailInput) emailInput.addEventListener("input", updateButtons);
    if (mobileInput) mobileInput.addEventListener("input", updateButtons);
    if (isDynamic) {
      var dA = overlay.querySelector("#paysme-dyn-amount");
      var dP = overlay.querySelector("#paysme-dyn-product");
      if (dA) dA.addEventListener("input", updateButtons);
      if (dP) dP.addEventListener("input", updateButtons);
    }

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      unlockPageScroll();
      if (callbacks.on_cancel) callbacks.on_cancel();
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) e.stopPropagation();
    });

    if (genBtn) {
      genBtn.addEventListener("click", function () {
        var f = getFields();
        var activeCfg = Object.assign({}, cfg);

        if (isDynamic) {
          var amtEl = overlay.querySelector("#paysme-dyn-amount");
          var prodEl = overlay.querySelector("#paysme-dyn-product");
          var perEl = overlay.querySelector("#paysme-dyn-period");
          var recEl = overlay.querySelector("#paysme-dyn-recurring");
          activeCfg.amount_nad = parseFloat(amtEl.value);
          activeCfg.invoice_id = prodEl.value.trim();
          activeCfg.product_name = prodEl.value.trim();
          activeCfg.recurring = recEl ? recEl.checked : false;
          activeCfg.recurring_period = perEl ? perEl.value : "monthly";
        }

        // Store customer details on cfg for card payment flow
        activeCfg._town = f.town;
        activeCfg._email = f.email;
        activeCfg._mobile = f.mobile;

        genBtn.disabled = true;
        genBtn.innerHTML = '<span class="paysme-spinner"></span> Generating...';

        createTransaction(activeCfg, f.town, f.email, f.mobile)
          .then(function (resp) {
            if (resp && resp.ok && resp.transaction) {
              var code = resp.transaction.generated_code;
              activeCfg._grossAmount = Number(resp.transaction.amount || sdkTax(activeCfg.amount_nad, activeCfg).gross);
              showPaycodeView(overlay, code, activeCfg, resp.transaction);
              if (callbacks.on_success) {
                callbacks.on_success({
                  transaction_id: resp.transaction.transaction_id,
                  generated_code: code,
                  amount: resp.transaction.amount,
                  invoice_id: activeCfg.invoice_id,
                  town: f.town
                });
              }
            } else {
              throw new Error(resp.error || "Transaction failed");
            }
          })
          .catch(function (err) {
            genBtn.disabled = false;
            genBtn.textContent = "Generate PaySME Code";
            if (callbacks.on_error) callbacks.on_error(err);
            else console.error("PaySME SDK Error:", err);
          });
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────────
  var PaySME = {
    version: VERSION,

    /**
     * Mobile Request-to-Pay — creates a pending PaySME transaction and sends
     * the customer an SMS payment link without opening the checkout modal.
     */
    requestToPay: requestToPay,

    /**
     * Required customer-facing Request-to-Pay integration. Renders the
     * official branded PaySME button and calls requestToPay on click.
     */
    renderRequestToPayButton: renderRequestToPayButton,

    init: function (config) {
      injectStyles();
      validateConfig(config, true);

      prepareConfig(config).then(function () {
        var overlay = buildModal(config, false);
        lockPageScroll();
        document.body.appendChild(overlay);
        attachModalEvents(overlay, config, false, {
          on_success: config.on_success,
          on_error: config.on_error,
          on_cancel: config.on_cancel
        });
      });
    },

    create: function (config) {
      injectStyles();
      if (!config.vendor_uuid) throw new Error("PaySME SDK: vendor_uuid is required");
      if (!config.api_key) throw new Error("PaySME SDK: api_key is required");

      return {
        open: function () {
          var existing = document.querySelector("[data-paysme-modal]");
          if (existing) {
            existing.parentNode.removeChild(existing);
            unlockPageScroll();
          }

          prepareConfig(config).then(function () {
            var overlay = buildModal(config, true);
            lockPageScroll();
            document.body.appendChild(overlay);
            attachModalEvents(overlay, config, true, {
              on_success: config.on_success,
              on_error: config.on_error,
              on_cancel: config.on_cancel
            });
          });
        },
        close: function () {
          var existing = document.querySelector("[data-paysme-modal]");
          if (existing) existing.parentNode.removeChild(existing);
          unlockPageScroll();
        }
      };
    },

    /**
     * Pending Pay modal — merchant passes the generated_code directly.
     * The modal validates the code, shows its details, and offers payment options (Copy, IPP, Card).
     *
     * Usage:
     *   var pending = window.PaySME.pending({
     *     vendor_uuid: "...",
     *     api_key: "...",
     *     generated_code: "1234-5678-9012",  // required — the pending paycode
     *     on_success: function(data) { console.log(data); },
     *     on_error: function(err) { console.error(err); },
     *     on_cancel: function() { }
     *   });
     *   pending.open();   // opens the modal — shows code + payment options immediately
     *   pending.close();  // closes it
     */
    pending: function (config) {
      injectStyles();
      if (!config.vendor_uuid) throw new Error("PaySME SDK: vendor_uuid is required");
      if (!config.api_key) throw new Error("PaySME SDK: api_key is required");
      if (!config.generated_code) throw new Error("PaySME SDK: generated_code is required for pending pay");

      var VALIDATE_URL = "https://zvoqrqdnuupdefsuiurt.supabase.co/rest/v1/rpc/validate_payment_code";

      return {
        open: function () {
          var existing = document.querySelector("[data-paysme-modal]");
          if (existing) {
            existing.parentNode.removeChild(existing);
            unlockPageScroll();
          }

          prepareConfig(config).then(function () {

            var overlay = document.createElement("div");
            overlay.className = "paysme-overlay";
            overlay.setAttribute("data-paysme-modal", "true");

            var modalHTML =
              '<div class="paysme-modal">' +
              '<button class="paysme-close" id="paysme-close-btn">&times;</button>' +
              '<div class="paysme-header">' +
              '<h3>' + esc(config._businessName) + '</h3>' +
              '<p>Your pending PaySME code</p>' +
              '</div>' +
              '<div id="paysme-pending-loading" style="text-align:center;padding:16px 0;">' +
              '<span class="paysme-spinner" style="width:24px;height:24px;border-width:3px;"></span>' +
              '<p style="color:#9ca3af;font-size:13px;margin-top:8px;">Validating code...</p>' +
              '</div>' +
              '<div id="paysme-pending-results" style="display:none"></div>' +
              '<div class="paysme-footer">' +
              '<p>Powered by</p>' +
              '<img src="' + LOGO_URL + '" alt="PaySME" onerror="this.src=\'' + LOGO_FALLBACK + '\'">' +
              '</div>' +
              '</div>';

            overlay.innerHTML = modalHTML;
            lockPageScroll();
            document.body.appendChild(overlay);

            var closeBtn = overlay.querySelector("#paysme-close-btn");
            var loadingDiv = overlay.querySelector("#paysme-pending-loading");
            var resultsDiv = overlay.querySelector("#paysme-pending-results");

            function closeModal() {
              if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
              unlockPageScroll();
              if (config.on_cancel) config.on_cancel();
            }
            closeBtn.addEventListener("click", closeModal);
            overlay.addEventListener("click", function (e) {
              if (e.target === overlay) e.stopPropagation();
            });

            // Validate the code via RPC
            fetch(VALIDATE_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": "Bearer " + SUPABASE_ANON_KEY
              },
              body: JSON.stringify({ pay_code: config.generated_code })
            })
            .then(function (r) { return r.json(); })
            .then(function (rows) {
              loadingDiv.style.display = "none";
              resultsDiv.style.display = "block";

              if (!rows || rows.length === 0) {
                resultsDiv.innerHTML =
                  '<div style="text-align:center;padding:12px;color:#fbbf24;font-size:13px;">' +
                  '⚠️ This code is no longer pending or does not exist.' +
                  '</div>';
                if (config.on_error) config.on_error(new Error("Code not found or not pending"));
                return;
              }

              var tx = rows[0];
              var pendingCfg = Object.assign({}, config, {
                amount_nad: tx.amount,
                invoice_id: tx.invoice_id || "N/A",
                _businessName: tx.business_name || config._businessName,
                _generated_code: tx.generated_code,
                _email: tx.user_email || null,
                _mobile: tx.user_mobile || null
              });

              if (tx.status === "failed" && tx.can_retry) {
                resultsDiv.innerHTML =
                  '<div class="paysme-info">' +
                  '<div class="paysme-info-row"><span class="paysme-info-label">Invoice ID:</span><span class="paysme-info-value">' + esc(tx.invoice_id || "N/A") + '</span></div>' +
                  '<div class="paysme-info-row"><span class="paysme-info-label">Amount:</span><span class="paysme-info-value">N$ ' + esc(String(tx.amount)) + '</span></div>' +
                  '<div class="paysme-info-row"><span class="paysme-info-label">Status:</span><span class="paysme-info-value" style="color:#ef4444;">Payment Failed</span></div>' +
                  '</div>' +
                  '<div class="paysme-code-display"><span>' + esc(tx.generated_code) + '</span></div>' +
                  '<div class="paysme-instructions"><p>Your previous payment attempt failed. You can retry by card or choose another available payment method below.</p></div>' +
                  '<button class="paysme-btn paysme-btn-copy" id="paysme-failed-copy">Copy PaySME Code</button>' +
                  '<button class="paysme-btn paysme-btn-card" id="paysme-retry-card-btn">Retry Card Payment</button>' +
                  '<div id="paysme-failed-payment-options"><div class="paysme-method-loading">Checking other payment methods...</div></div>';

                var failedCopyBtn = overlay.querySelector("#paysme-failed-copy");
                if (failedCopyBtn) {
                  failedCopyBtn.addEventListener("click", function () {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(tx.generated_code).then(function () {
                        failedCopyBtn.textContent = "Copied!";
                        setTimeout(function () { failedCopyBtn.textContent = "Copy PaySME Code"; }, 2000);
                      });
                    }
                  });
                }

                var retryBtn = overlay.querySelector("#paysme-retry-card-btn");
                if (retryBtn) {
                  retryBtn.addEventListener("click", function () {
                    retryBtn.disabled = true;
                    retryBtn.innerHTML = '<span class="paysme-spinner"></span> Processing...';
                    var retryCfg = Object.assign({}, pendingCfg, { _retry_failed: true });
                    initiateCardPayment(retryCfg)
                    .then(function (resp) {
                      if (resp && resp.ok && resp.token) {
                        submitAdumoForm(resp, pendingCfg.amount_nad);
                        setTimeout(function () { closeModal(); }, 1500);
                      } else {
                        throw new Error(resp.error || "Card retry failed");
                      }
                    })
                    .catch(function (err) {
                      retryBtn.disabled = false;
                      retryBtn.textContent = "Retry Card Payment";
                      console.error("PaySME Retry Error:", err);
                      showInlineNotice(overlay, retryBtn, "paysme-retry-card-error-notice", "Card payment unavailable", friendlyCardError(err));
                      if (config.on_error) config.on_error(err);
                    });
                  });
                }
                fetchEligibility(pendingCfg).then(function (eligibility) {
                  var options = overlay.querySelector("#paysme-failed-payment-options");
                  if (!options) return;
                  if (billingLocked(eligibility)) {
                    if (retryBtn) {
                      retryBtn.disabled = true;
                      retryBtn.className = "paysme-btn paysme-btn-disabled";
                      retryBtn.textContent = "Retry Card Payment";
                    }
                    options.innerHTML = paymentOptionsHtml(eligibility, "paysme-failed");
                    return;
                  }

                  var html = "";
                  if (methodEnabled(eligibility, "wayame")) {
                    html += '<button class="paysme-btn paysme-btn-wayame" id="paysme-failed-wayame">Pay via WayaMe</button>';
                  }
                  if (methodEnabled(eligibility, "mtc_maris")) {
                    html += '<button class="paysme-btn paysme-btn-maris" id="paysme-failed-maris">Pay via MTC Maris</button>';
                  }
                  if (methodEnabled(eligibility, "paypulse")) {
                    html += '<button class="paysme-btn paysme-btn-paypulse" id="paysme-failed-paypulse">Pay via PayPulse</button>';
                  }
                  if (methodEnabled(eligibility, "paytoday")) {
                    html += '<button class="paysme-btn paysme-btn-paytoday" id="paysme-failed-paytoday">Pay via PayToday</button>';
                  }
                  if (methodEnabled(eligibility, "kazang")) {
                    html += '<button class="paysme-btn paysme-btn-kazang" id="paysme-failed-kazang">Pay via Kazang</button>';
                  }
                  options.innerHTML = html || disabledMethodHtml("Other payment methods", "No other payment methods are available for this checkout.");
                  var wayameBtn = overlay.querySelector("#paysme-failed-wayame");
                  if (wayameBtn) {
                    wayameBtn.addEventListener("click", function () {
                      showWayameCheckout(overlay, Object.assign({}, pendingCfg, { _retry_failed: true }), { on_error: config.on_error });
                    });
                  }
                  var marisBtn = overlay.querySelector("#paysme-failed-maris");
                  if (marisBtn) {
                    marisBtn.addEventListener("click", function () {
                      showMobiWandPreflight(overlay, pendingCfg, "mtc_maris", { on_error: config.on_error });
                    });
                  }
                  var paypulseBtn = overlay.querySelector("#paysme-failed-paypulse");
                  if (paypulseBtn) {
                    paypulseBtn.addEventListener("click", function () {
                      showMobiWandPreflight(overlay, pendingCfg, "paypulse", { on_error: config.on_error });
                    });
                  }
                  var paytodayBtn = overlay.querySelector("#paysme-failed-paytoday");
                  if (paytodayBtn) {
                    paytodayBtn.addEventListener("click", function () {
                      showMobiWandPreflight(overlay, pendingCfg, "paytoday", { on_error: config.on_error });
                    });
                  }
                  var kazangBtn = overlay.querySelector("#paysme-failed-kazang");
                  if (kazangBtn) {
                    kazangBtn.addEventListener("click", function () {
                      showMobiWandPreflight(overlay, pendingCfg, "kazang", { on_error: config.on_error });
                    });
                  }
                });
                return;
              }

              resultsDiv.innerHTML =
                '<div class="paysme-info">' +
                '<div class="paysme-info-row"><span class="paysme-info-label">Invoice ID:</span><span class="paysme-info-value">' + esc(tx.invoice_id || "N/A") + '</span></div>' +
                '<div class="paysme-info-row"><span class="paysme-info-label">Amount:</span><span class="paysme-info-value">N$ ' + esc(String(tx.amount)) + '</span></div>' +
                '<div class="paysme-info-row"><span class="paysme-info-label">Status:</span><span class="paysme-info-value" style="color:#fbbf24;">' + esc(tx.status || "pending") + '</span></div>' +
                '</div>' +
                '<div class="paysme-code-display"><span>' + esc(tx.generated_code) + '</span></div>' +
                '<div class="paysme-instructions">' +
                '<p>This code is pending payment.</p>' +
                '<p>Present it at a participating Payment Vendor teller/kiosk, or pay online below.</p>' +
                '<p>See list of Payment Vendors: <a href="https://paysme.site" target="_blank">Vendor List</a></p>' +
                '</div>' +
                '<button class="paysme-btn paysme-btn-copy" id="paysme-pending-copy">Copy PaySME Code</button>' +
                '<div id="paysme-pending-payment-options"><div class="paysme-method-loading">Checking available payment methods...</div></div>';

              // Copy
              var copyBtn = overlay.querySelector("#paysme-pending-copy");
              if (copyBtn) {
                copyBtn.addEventListener("click", function () {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(tx.generated_code).then(function () {
                      copyBtn.textContent = "Copied!";
                      setTimeout(function () { copyBtn.textContent = "Copy PaySME Code"; }, 2000);
                    });
                  }
                });
              }

              fetchEligibility(pendingCfg).then(function (eligibility) {
                var options = overlay.querySelector("#paysme-pending-payment-options");
                if (!options) return;
                options.innerHTML = paymentOptionsHtml(eligibility, "paysme-pending-method");
                attachPaymentOptionEvents(overlay, pendingCfg, "paysme-pending-method", {
                  on_error: config.on_error,
                  on_cancel: config.on_cancel
                });
              });

              // Card payment
              var cardBtn = overlay.querySelector("#paysme-pending-card");
              if (cardBtn) {
                cardBtn.addEventListener("click", function () {
                  cardBtn.disabled = true;
                  cardBtn.innerHTML = '<span class="paysme-spinner"></span> Processing...';
                  initiateCardPayment(pendingCfg)
                    .then(function (resp) {
                      if (resp && resp.ok && resp.token) {
                        submitAdumoForm(resp, tx.amount);
                        setTimeout(function () { closeModal(); }, 1500);
                      } else {
                        throw new Error(resp.error || "Card payment initiation failed");
                      }
                    })
                    .catch(function (err) {
                      cardBtn.disabled = false;
                      cardBtn.textContent = "Pay via Card";
                      console.error("PaySME Card Error:", err);
                      showInlineNotice(overlay, cardBtn, "paysme-pending-card-error-notice", "Card payment unavailable", friendlyCardError(err));
                      if (config.on_error) config.on_error(err);
                    });
                });
              }

              if (config.on_success) {
                config.on_success({
                  transaction_id: tx.transaction_id,
                  generated_code: tx.generated_code,
                  amount: tx.amount,
                  invoice_id: tx.invoice_id
                });
              }
            })
            .catch(function (err) {
              loadingDiv.style.display = "none";
              resultsDiv.style.display = "block";
              resultsDiv.innerHTML =
                '<div style="text-align:center;padding:12px;color:#ef4444;font-size:13px;">' +
                '❌ Failed to validate code. Please try again.' +
                '</div>';
              console.error("PaySME Pending Validation Error:", err);
              if (config.on_error) config.on_error(err);
            });
          });
        },
        close: function () {
          var existing = document.querySelector("[data-paysme-modal]");
          if (existing) existing.parentNode.removeChild(existing);
          unlockPageScroll();
        }
      };
    }
  };

  window.PaySME = PaySME;
  console.log("PaySME SDK v" + VERSION + " loaded");
})();
