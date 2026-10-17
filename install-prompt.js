/* ============================================================================
 * install-prompt.js — نافذة "ثبّت الموقع كتطبيق"
 * ----------------------------------------------------------------------------
 * • تظهر تلقائياً للزائر على الجوال (أندرويد/iOS) وسطح المكتب عند توفّر التثبيت.
 * • تستخدم beforeinstallprompt على أندرويد/كروم/إيدج (تثبيت بنقرة واحدة).
 * • على آيفون Safari تعرض خطوات «إضافة إلى الشاشة الرئيسية».
 * • لا تظهر إذا كان الموقع مثبّتاً أصلاً (standalone).
 * • «لاحقاً» يخفيها لمدة 7 أيام.  بعد التثبيت لا تظهر أبداً.
 * • لا تظهر في التطوير (localhost) ولا داخل iframe المعاينة — نفس شروط sw.js.
 * ==========================================================================*/
(function () {
  "use strict";

  /* ---------- 1) شروط الظهور (مطابقة لشروط تسجيل Service Worker) ---------- */
  var FORCE = window.__ALLOW_SW__ === true;
  var DEV =
    window.__DEV__ === true ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  var FRAME = window.self !== window.top;
  var CAN_SHOW =
    FORCE ||
    (location.protocol === "https:" && !DEV && !FRAME && window.__ALLOW_SW__ !== false);
  if (!CAN_SHOW) return;

  /* ---------- 2) مثبّت بالفعل؟ ---------- */
  var isStandalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  /* ---------- 3) حالة سابقة ---------- */
  var KEY = "asm_install_state_v1";
  var SNOOZE_DAYS = 7;
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }
  if (state.done) return;
  if (state.snooze && Date.now() < state.snooze) return;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- 4) بيئة الجهاز ---------- */
  var ua = navigator.userAgent || "";
  var isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isSafariIOS = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  var isAndroid = /Android/i.test(ua);
  var isMobile = isIOS || isAndroid || /Mobi/i.test(ua);

  var deferred = null;   // حدث beforeinstallprompt المحتفظ به
  var shown = false;

  /* ---------- 5) الأنماط ---------- */
  var CSS =
    '.asm-wrap{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;' +
    'padding:12px;pointer-events:none;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;direction:rtl}' +
    '.asm-card{pointer-events:auto;width:100%;max-width:520px;background:#0f1512;color:#f6f1e7;' +
    'border:1px solid rgba(212,169,74,.45);border-radius:16px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.45);' +
    'display:flex;gap:12px;align-items:flex-start;transform:translateY(140%);transition:transform .38s cubic-bezier(.22,1,.36,1);' +
    'opacity:0}' +
    '.asm-card.asm-in{transform:translateY(0);opacity:1}' +
    '.asm-ico{font-size:26px;line-height:1;flex:0 0 auto;margin-top:2px}' +
    '.asm-body{flex:1 1 auto;min-width:0}' +
    '.asm-title{display:block;font-weight:800;font-size:15px;margin:0 0 4px;color:#d4a94a}' +
    '.asm-sub{margin:0;font-size:13px;line-height:1.7;color:#e9e3d6;opacity:.92}' +
    '.asm-sub b{color:#f6f1e7}' +
    '.asm-steps{margin:8px 0 0;padding:0 16px 0 0;font-size:12.5px;line-height:1.8;color:#e9e3d6}' +
    '.asm-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}' +
    '.asm-btn{appearance:none;border:0;cursor:pointer;font:inherit;font-weight:700;font-size:13.5px;' +
    'padding:9px 16px;border-radius:10px;transition:filter .15s,opacity .15s}' +
    '.asm-btn:hover{filter:brightness(1.08)}' +
    '.asm-yes{background:#d4a94a;color:#12160f}' +
    '.asm-no{background:transparent;color:#c9c2b4;border:1px solid rgba(201,194,180,.35)}' +
    '.asm-x{position:absolute;top:8px;left:10px;background:none;border:0;color:#c9c2b4;font-size:20px;' +
    'cursor:pointer;line-height:1;padding:4px}' +
    '.asm-card{position:relative}' +
    '.asm-ok{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:12px;' +
    'pointer-events:none;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;direction:rtl}' +
    '.asm-ok .asm-card{background:#14301f;border-color:rgba(96,200,140,.5)}' +
    '.asm-ok .asm-title{color:#7ee2a8}' +
    '@media (max-width:420px){.asm-card{padding:12px 14px}.asm-title{font-size:14px}.asm-sub{font-size:12.5px}}';

  function injectCSS() {
    if (document.getElementById("asm-install-css")) return;
    var s = document.createElement("style");
    s.id = "asm-install-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- 6) بناء النافذة ---------- */
  function build(kind) {
    injectCSS();
    var wrap = document.createElement("div");
    wrap.className = "asm-wrap";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-live", "polite");
    wrap.setAttribute("aria-label", "تثبيت الموقع كتطبيق");

    var card = document.createElement("div");
    card.className = "asm-card";

    var x = document.createElement("button");
    x.className = "asm-x";
    x.type = "button";
    x.setAttribute("aria-label", "إغلاق");
    x.textContent = "×";
    x.onclick = function () { hide(true); };
    card.appendChild(x);

    var ico = document.createElement("div");
    ico.className = "asm-ico";
    ico.textContent = "📲";
    card.appendChild(ico);

    var body = document.createElement("div");
    body.className = "asm-body";

    var title = document.createElement("span");
    title.className = "asm-title";
    title.textContent = "ثبّت الموقع كتطبيق على جهازك";
    body.appendChild(title);

    var sub = document.createElement("p");
    sub.className = "asm-sub";
    body.appendChild(sub);

    var row = document.createElement("div");
    row.className = "asm-row";

    if (kind === "ios") {
      sub.innerHTML =
        "يمكنك إضافة الموقع إلى شاشة جوالك الرئيسية ليفتح كتطبيق مستقل <b>ويعمل دون اتصال</b>.";
      var ol = document.createElement("ol");
      ol.className = "asm-steps";
      ol.innerHTML =
        "<li>اضغط زر <b>المشاركة</b> ⬆️ أسفل Safari</li>" +
        "<li>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> ➕</li>" +
        "<li>اضغط <b>«إضافة»</b></li>";
      body.appendChild(ol);

      var okIOS = document.createElement("button");
      okIOS.className = "asm-btn asm-yes";
      okIOS.type = "button";
      okIOS.textContent = "فهمت، لاحقاً";
      okIOS.onclick = function () { hide(true); };
      row.appendChild(okIOS);
    } else if (kind === "native") {
      sub.innerHTML =
        "استخدمه كتطبيق مستقل بلا شريط عنوان، <b>ويعمل دون اتصال</b> بعد أول زيارة.";
      var yes = document.createElement("button");
      yes.className = "asm-btn asm-yes";
      yes.type = "button";
      yes.textContent = "📲 تثبيت الآن";
      yes.onclick = function () { doInstall(); };
      row.appendChild(yes);

      var no = document.createElement("button");
      no.className = "asm-btn asm-no";
      no.type = "button";
      no.textContent = "لاحقاً";
      no.onclick = function () { hide(true); };
      row.appendChild(no);
    } else {
      /* متصفح لا يدعم التثبيت تلقائياً — إرشاد للقائمة */
      sub.innerHTML =
        "افتح قائمة المتصفح (⋮) واختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.";
      var ok = document.createElement("button");
      ok.className = "asm-btn asm-yes";
      ok.type = "button";
      ok.textContent = "حسناً";
      ok.onclick = function () { hide(true); };
      row.appendChild(ok);
    }

    body.appendChild(row);
    card.appendChild(body);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    return { wrap: wrap, card: card };
  }

  var ui = null;

  function show(kind) {
    if (shown) return;
    shown = true;
    ui = build(kind);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { ui.card.classList.add("asm-in"); });
    });
    document.addEventListener("keydown", onKey);
  }

  function onKey(e) { if (e.key === "Escape") hide(true); }

  function hide(snooze) {
    if (!ui) return;
    if (snooze) {
      state.snooze = Date.now() + SNOOZE_DAYS * 86400000;
      save();
    }
    var card = ui.card;
    card.classList.remove("asm-in");
    document.removeEventListener("keydown", onKey);
    setTimeout(function () {
      if (ui && ui.wrap && ui.wrap.parentNode) ui.wrap.parentNode.removeChild(ui.wrap);
      ui = null;
    }, 420);
  }

  function success() {
    state.done = 1;
    save();
    if (ui) {
      ui.card.classList.remove("asm-in");
      setTimeout(function () {
        if (ui && ui.wrap && ui.wrap.parentNode) ui.wrap.parentNode.removeChild(ui.wrap);
        ui = null;
      }, 420);
    }
  }

  function doInstall() {
    if (!deferred) { hide(true); return; }
    var ev = deferred;
    deferred = null;
    try { ev.prompt(); } catch (e) { hide(true); return; }
    Promise.resolve(ev.userChoice).then(function (res) {
      if (res && res.outcome === "accepted") success();
      else hide(true);
    }).catch(function () { hide(true); });
  }

  /* ---------- 7) التقاط حدث التثبيت ---------- */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(function () { show("native"); }, 1400);
  });

  window.addEventListener("appinstalled", function () { success(); });

  /* ---------- 8) خطة آيفون (Safari لا يدعم beforeinstallprompt) ---------- */
  if (isSafariIOS) {
    var go = function () { setTimeout(function () { show("ios"); }, 2200); };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go);
  } else if (isMobile && !isAndroid) {
    var go2 = function () { setTimeout(function () { if (deferred) show("native"); else show("hint"); }, 3000); };
    if (document.readyState === "complete") go2();
    else window.addEventListener("load", go2);
  }

  /* ---------- 9) إتاحة يدوية (لبقية الصفحات أو زر مخصص) ---------- */
  window.AsmInstall = {
    show: function () {
      if (deferred) show("native");
      else if (isSafariIOS) show("ios");
      else show("hint");
    },
    available: function () { return !!deferred; }
  };
})();
