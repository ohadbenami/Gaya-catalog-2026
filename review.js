/* ============================================================
   review.js — שכבת "מורה" מעל הקטלוג
   - מציירת הערות / חיצים / קווים / סימוני בלוקים מעל הקטלוג
   - לא נוגעת בקטלוג עצמו (הוא נטען ב-iframe)
   - שומרת ל-localStorage אוטומטית, מייצאת/מייבאת feedback.json
   ============================================================ */
(function () {
  "use strict";

  // ---------- הגדרות בסיס ----------
  var COLORS = { ohad: "#d6336c", sagi: "#1c7ed6" };
  var LS_KEY = "gaya_catalog_feedback_v2";

  var state = {
    tool: "select",
    author: "ohad",
    hideDone: false,
    catalogUrl: "",
    zoom: 1,           // מקדם הקטנה כדי שכל הקטלוג ייכנס למסך
    items: []          // כל ההערות/הסימונים
  };

  // ---------- אלמנטים ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var overlay = $("#overlay");
  var wires = $("#wires");
  var frame = $("#catalog");
  var frameWrap = $("#frameWrap");
  var toastEl = $("#toast");
  var statusEl = $("#status");

  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var nowISO = function () { return new Date().toISOString(); };

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  // ============================================================
  //  טעינה / שמירה
  // ============================================================
  function persist() {
    var payload = { version: 2, updatedAt: nowISO(), items: state.items, catalogUrl: state.catalogUrl };
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (e) {}
    statusEl.textContent = "נשמר " + new Date().toLocaleTimeString("he-IL");
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        state.items = data.items || [];
        if (data.catalogUrl) state.catalogUrl = data.catalogUrl;
      }
    } catch (e) {}
  }

  // ניסיון לטעון feedback.json מהריפו (אם קיים) — רק כדי לאתחל בפעם הראשונה
  function loadRepoFeedback() {
    return fetch("feedback.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        // משתמשים ב-repo רק אם אין כלום מקומית, או אם הוא חדש יותר
        var repoItems = [];
        if (Array.isArray(data.items)) repoItems = data.items;
        else if (Array.isArray(data.boards)) repoItems = data.boards.reduce(function (acc, b) { return acc.concat(b.items || []); }, []);
        if (!state.items.length && repoItems.length) {
          state.items = repoItems;
          toast("נטענו " + repoItems.length + " הערות מהריפו");
        }
      })
      .catch(function () {});
  }

  // ============================================================
  //  ייצוא / ייבוא
  // ============================================================
  function exportJSON() {
    var payload = { version: 2, updatedAt: nowISO(), catalogUrl: state.catalogUrl, items: state.items };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "feedback.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("הורד feedback.json — העלה אותו לריפו כדי לשתף");
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var items = data.items || (data.boards ? data.boards.reduce(function (a, b) { return a.concat(b.items || []); }, []) : []);
        // מיזוג לפי id (לא דורסים הערות קיימות, מעדכנים זהות)
        var byId = {};
        state.items.forEach(function (it) { byId[it.id] = it; });
        items.forEach(function (it) { byId[it.id] = it; });
        state.items = Object.keys(byId).map(function (k) { return byId[k]; });
        if (data.catalogUrl) { state.catalogUrl = data.catalogUrl; $("#urlInput").value = data.catalogUrl; }
        renderAll(); persist();
        toast("יובאו " + items.length + " הערות (מוזגו)");
      } catch (e) { toast("קובץ לא תקין"); }
    };
    reader.readAsText(file);
  }

  // ============================================================
  //  טעינת הקטלוג ל-iframe
  // ============================================================
  function loadCatalog(url) {
    state.catalogUrl = url;
    frame.src = url;
    persist();
  }

  var DESKTOP_W = 1280;        // רוחב "דסקטופ" שבו מצויר הקטלוג
  var clip = document.getElementById("clip");

  function applyLayout() {
    var h = parseInt($("#frameH").value, 10) || 5200;
    // מצייר את הקטלוג ברוחב דסקטופ מלא, ואז מקטין כדי שייכנס למסך
    frameWrap.style.width = DESKTOP_W + "px";
    frameWrap.style.height = h + "px";
    frameWrap.style.transform = "scale(" + state.zoom + ")";
    // clip מקבל את המידות אחרי ההקטנה — כך אין רווח לבן
    clip.style.width = (DESKTOP_W * state.zoom) + "px";
    clip.style.height = (h * state.zoom) + "px";
    var lbl = $("#zoomLabel"); if (lbl) lbl.textContent = Math.round(state.zoom * 100) + "%";
  }

  function fitToScreen() {
    var avail = window.innerWidth - 40;            // שוליים קטנים
    state.zoom = Math.min(1, avail / DESKTOP_W);
    applyLayout(); renderAll();
  }

  function setZoom(z) {
    state.zoom = Math.max(0.3, Math.min(1.5, z));
    applyLayout(); renderAll();
  }

  function setFrameHeight(px) {
    applyLayout();
  }

  // ============================================================
  //  קואורדינטות — שומרים באחוזים כדי שהסימונים יישארו במקום
  //  גם כשגודל החלון משתנה
  // ============================================================
  // pxToPct: ממיר קואורדינטות עכבר (מסך) לאחוזים. getBoundingClientRect
  // מחזיר מידות *אחרי* ההקטנה — בדיוק מה שצריך מול מיקום העכבר.
  function pxToPct(x, y) {
    var r = overlay.getBoundingClientRect();
    return { x: (x - r.left) / r.width * 100, y: (y - r.top) / r.height * 100 };
  }
  // pctToPx: ממיר אחוזים לפיקסלים *פנימיים* (לא מוקטנים), כי הסימונים יושבים
  // בתוך האלמנט שעליו מופעל ה-transform. offsetWidth מחזיר את הגודל לפני ההקטנה.
  function pctToPx(xPct, yPct) {
    var w = overlay.offsetWidth, h = overlay.offsetHeight;
    return { x: xPct / 100 * w, y: yPct / 100 * h };
  }
  // מקדם להמרת תזוזת עכבר (מסך) לתזוזה פנימית בגרירה
  function dragScale() { return state.zoom || 1; }

  // ============================================================
  //  יצירת פריטים
  // ============================================================
  function addNote(xPct, yPct) {
    var item = {
      id: uid(), type: "note", author: state.author,
      x: xPct, y: yPct, text: "", tag: "",
      done: false, replies: [], createdAt: nowISO()
    };
    state.items.push(item); renderAll(); persist();
    // פוקוס מיידי על הטקסט
    var el = $('[data-id="' + item.id + '"] textarea');
    if (el) el.focus();
  }

  function addRegion(xPct, yPct, wPct, hPct) {
    var item = {
      id: uid(), type: "region", author: state.author,
      x: xPct, y: yPct, w: wPct, h: hPct,
      label: "להזיז / לשנות כאן", done: false, createdAt: nowISO()
    };
    state.items.push(item); renderAll(); persist();
  }

  function addWire(type, x1, y1, x2, y2) {
    var item = {
      id: uid(), type: type, author: state.author,
      x1: x1, y1: y1, x2: x2, y2: y2,
      done: false, createdAt: nowISO()
    };
    state.items.push(item); renderAll(); persist();
  }

  function removeItem(id) {
    state.items = state.items.filter(function (it) { return it.id !== id; });
    renderAll(); persist();
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  // ============================================================
  //  רינדור
  // ============================================================
  function renderAll() {
    // ניקוי
    $$(".ann", overlay).forEach(function (n) { n.remove(); });
    while (wires.firstChild) wires.removeChild(wires.firstChild);

    state.items.forEach(function (it) {
      if (state.hideDone && it.done) return;
      if (it.type === "note") renderNote(it);
      else if (it.type === "region") renderRegion(it);
      else if (it.type === "arrow" || it.type === "line") renderWire(it);
    });
  }

  function renderNote(it) {
    var p = pctToPx(it.x, it.y);
    var el = document.createElement("div");
    el.className = "note ann" + (it.author === "sagi" ? " sagi" : "") + (it.done ? " done" : "");
    el.dataset.id = it.id;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";

    var authorName = it.author === "sagi" ? "שגיא" : "אוהד";
    var repliesHtml = (it.replies || []).map(function (r) {
      return '<div class="reply"><b>' + (r.author === "sagi" ? "שגיא" : "אוהד") + ':</b> ' + escapeHtml(r.text) + '</div>';
    }).join("");

    el.innerHTML =
      '<div class="head"><span class="author" style="color:' + COLORS[it.author] + '">' + authorName + '</span>' +
        '<span><button class="x" title="מחק" style="border:0;background:none;cursor:pointer;font-size:14px">✕</button></span></div>' +
      '<div class="body"><textarea placeholder="כתוב הערה...">' + escapeHtml(it.text || "") + '</textarea></div>' +
      '<div class="tag"><select class="tagSel">' + tagOptions(it.tag) + '</select></div>' +
      (repliesHtml ? '<div class="replies">' + repliesHtml + '</div>' : '') +
      '<div class="foot">' +
        '<button class="done-btn' + (it.done ? ' on' : '') + '">' + (it.done ? '✓ בוצע' : 'סמן בוצע') + '</button>' +
        '<button class="reply-btn">↩ תגובה</button>' +
      '</div>';

    overlay.appendChild(el);

    // עריכת טקסט
    var ta = $("textarea", el);
    ta.addEventListener("input", function () { it.text = ta.value; persist(); });
    autoGrow(ta);
    ta.addEventListener("input", function () { autoGrow(ta); });

    // תגית
    $(".tagSel", el).addEventListener("change", function (e) { it.tag = e.target.value; persist(); });

    // בוצע
    $(".done-btn", el).addEventListener("click", function () { it.done = !it.done; renderAll(); persist(); });

    // תגובה
    $(".reply-btn", el).addEventListener("click", function () {
      var txt = prompt("תגובה כ" + (state.author === "sagi" ? "שגיא" : "אוהד") + ":");
      if (txt) { it.replies = it.replies || []; it.replies.push({ author: state.author, text: txt, at: nowISO() }); renderAll(); persist(); }
    });

    // מחיקה
    $(".x", el).addEventListener("click", function () { if (confirm("למחוק את ההערה?")) removeItem(it.id); });

    // גרירה
    makeDraggable($(".head", el), function (dx, dy) {
      var r = overlay.getBoundingClientRect();
      it.x += dx / r.width * 100; it.y += dy / r.height * 100;
      el.style.left = pctToPx(it.x, it.y).x + "px";
      el.style.top = pctToPx(it.x, it.y).y + "px";
    }, persist);
  }

  function renderRegion(it) {
    var p = pctToPx(it.x, it.y);
    var iw = overlay.offsetWidth, ih = overlay.offsetHeight;
    var el = document.createElement("div");
    el.className = "region ann" + (it.author === "sagi" ? " sagi" : "") + (it.done ? " done" : "");
    el.dataset.id = it.id;
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
    el.style.width = (it.w / 100 * iw) + "px";
    el.style.height = (it.h / 100 * ih) + "px";
    el.innerHTML =
      '<div class="label">' + escapeHtml(it.label || "") + '</div>' +
      '<div class="resize"></div>';
    overlay.appendChild(el);

    var label = $(".label", el);
    // עריכת טקסט התווית בדאבל-קליק
    label.addEventListener("dblclick", function () {
      var t = prompt("מה לעשות עם הבלוק הזה?", it.label);
      if (t !== null) { it.label = t; label.textContent = t; persist(); }
    });
    // לחיצה ימנית = תפריט מהיר (בוצע/מחק)
    el.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      var act = prompt("הקלד: done = סמן בוצע, del = מחק, או טקסט חדש לתווית");
      if (act === "done") { it.done = !it.done; renderAll(); }
      else if (act === "del") { removeItem(it.id); return; }
      else if (act) { it.label = act; }
      persist();
    });

    // גרירת התיבה (מהתווית). rr.width הוא רוחב *אחרי* הקטנה, ו-dx הוא תזוזת
    // עכבר על המסך — היחס ביניהם נכון לאחוזים.
    makeDraggable(label, function (dx, dy) {
      var rr = overlay.getBoundingClientRect();
      it.x += dx / rr.width * 100; it.y += dy / rr.height * 100;
      el.style.left = pctToPx(it.x, it.y).x + "px";
      el.style.top = pctToPx(it.x, it.y).y + "px";
    }, persist);

    // שינוי גודל
    makeDraggable($(".resize", el), function (dx, dy) {
      var rr = overlay.getBoundingClientRect();
      var iw = overlay.offsetWidth, ih = overlay.offsetHeight;
      it.w = Math.max(4, it.w + dx / rr.width * 100);
      it.h = Math.max(4, it.h + dy / rr.height * 100);
      el.style.width = (it.w / 100 * iw) + "px";
      el.style.height = (it.h / 100 * ih) + "px";
    }, persist);
  }

  function renderWire(it) {
    var a = pctToPx(it.x1, it.y1), b = pctToPx(it.x2, it.y2);
    var ns = "http://www.w3.org/2000/svg";
    var color = COLORS[it.author] || "#333";

    // הגדרת חץ
    if (it.type === "arrow") {
      var markId = "arrow-" + it.id;
      var defs = document.createElementNS(ns, "defs");
      var marker = document.createElementNS(ns, "marker");
      marker.setAttribute("id", markId);
      marker.setAttribute("markerWidth", "10"); marker.setAttribute("markerHeight", "10");
      marker.setAttribute("refX", "7"); marker.setAttribute("refY", "3");
      marker.setAttribute("orient", "auto"); marker.setAttribute("markerUnits", "strokeWidth");
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M0,0 L7,3 L0,6 Z"); path.setAttribute("fill", color);
      marker.appendChild(path); defs.appendChild(marker); wires.appendChild(defs);
    }

    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", it.done ? "2" : "3.5");
    line.setAttribute("stroke-linecap", "round");
    if (it.done) line.setAttribute("stroke-dasharray", "6 6");
    if (it.type === "arrow") line.setAttribute("marker-end", "url(#arrow-" + it.id + ")");
    line.setAttribute("class", "wire ann");
    line.dataset.id = it.id;
    line.addEventListener("click", function (e) {
      e.stopPropagation();
      var act = prompt("חץ/קו — הקלד: done = בוצע, del = מחק");
      if (act === "done") { it.done = !it.done; renderAll(); persist(); }
      else if (act === "del") { removeItem(it.id); }
    });
    wires.appendChild(line);
  }

  // ============================================================
  //  עזרי UI
  // ============================================================
  function tagOptions(sel) {
    var tags = ["", "תזיז סדר", "תוריד", "תגדיל", "תקטין", "תכפיל", "תחליף תמונה", "תשנה טקסט", "תשנה צבע", "מרווח"];
    return tags.map(function (t) {
      return '<option value="' + t + '"' + (t === sel ? " selected" : "") + '>' + (t || "— תגית —") + '</option>';
    }).join("");
  }
  function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }

  function makeDraggable(handle, onMove, onEnd) {
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault(); e.stopPropagation();
      var lastX = e.clientX, lastY = e.clientY;
      function move(ev) {
        onMove(ev.clientX - lastX, ev.clientY - lastY);
        lastX = ev.clientX; lastY = ev.clientY;
      }
      function up() {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        if (onEnd) onEnd();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  // ============================================================
  //  כלי ציור על השכבה
  // ============================================================
  function setTool(tool) {
    state.tool = tool;
    $$("#tools .btn").forEach(function (b) { b.classList.toggle("active", b.dataset.tool === tool); });
    var active = tool !== "select";
    overlay.classList.toggle("passthrough", !active);
    overlay.classList.toggle("tool-active", active);
  }

  // ציור חץ/קו/בלוק בגרירה
  var draft = null;
  overlay.addEventListener("mousedown", function (e) {
    if (state.tool === "select") return;
    if (e.target.closest(".ann")) return; // לא להתחיל ציור על הערה קיימת

    var start = pxToPct(e.clientX, e.clientY);

    if (state.tool === "note") {
      addNote(start.x, start.y);
      return;
    }

    // arrow / line / region — גרירה
    draft = { tool: state.tool, x1: start.x, y1: start.y };
    var ns = "http://www.w3.org/2000/svg";

    if (state.tool === "region") {
      draft.el = document.createElement("div");
      draft.el.className = "region ann" + (state.author === "sagi" ? " sagi" : "");
      draft.el.style.left = pctToPx(start.x, start.y).x + "px";
      draft.el.style.top = pctToPx(start.x, start.y).y + "px";
      overlay.appendChild(draft.el);
    } else {
      draft.line = document.createElementNS(ns, "line");
      var a = pctToPx(start.x, start.y);
      draft.line.setAttribute("x1", a.x); draft.line.setAttribute("y1", a.y);
      draft.line.setAttribute("x2", a.x); draft.line.setAttribute("y2", a.y);
      draft.line.setAttribute("stroke", COLORS[state.author]);
      draft.line.setAttribute("stroke-width", "3.5");
      draft.line.setAttribute("stroke-linecap", "round");
      wires.appendChild(draft.line);
    }

    function mm(ev) {
      var cur = pxToPct(ev.clientX, ev.clientY);
      draft.x2 = cur.x; draft.y2 = cur.y;
      if (draft.tool === "region") {
        var ax = Math.min(draft.x1, cur.x), ay = Math.min(draft.y1, cur.y);
        var p = pctToPx(ax, ay);
        var iw = overlay.offsetWidth, ih = overlay.offsetHeight;
        draft.el.style.left = p.x + "px"; draft.el.style.top = p.y + "px";
        draft.el.style.width = Math.abs(cur.x - draft.x1) / 100 * iw + "px";
        draft.el.style.height = Math.abs(cur.y - draft.y1) / 100 * ih + "px";
      } else {
        var b = pctToPx(cur.x, cur.y);
        draft.line.setAttribute("x2", b.x); draft.line.setAttribute("y2", b.y);
      }
    }
    function mu(ev) {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
      var cur = pxToPct(ev.clientX, ev.clientY);
      if (draft.tool === "region") {
        if (draft.el) draft.el.remove();
        var ax = Math.min(draft.x1, cur.x), ay = Math.min(draft.y1, cur.y);
        var w = Math.abs(cur.x - draft.x1), h = Math.abs(cur.y - draft.y1);
        if (w > 1 && h > 1) addRegion(ax, ay, w, h);
      } else {
        if (draft.line) draft.line.remove();
        var dist = Math.hypot(cur.x - draft.x1, cur.y - draft.y1);
        if (dist > 1) addWire(draft.tool, draft.x1, draft.y1, cur.x, cur.y);
      }
      draft = null;
    }
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  });

  // ============================================================
  //  חיווט הסרגל
  // ============================================================
  function wireToolbar() {
    $$("#tools .btn").forEach(function (b) {
      b.addEventListener("click", function () { setTool(b.dataset.tool); });
    });

    var authorSel = $("#author");
    authorSel.value = state.author;
    $("#authorDot").style.background = COLORS[state.author];
    authorSel.addEventListener("change", function () {
      state.author = authorSel.value;
      $("#authorDot").style.background = COLORS[state.author];
    });

    $("#hideDone").addEventListener("change", function (e) { state.hideDone = e.target.checked; renderAll(); });

    $("#loadBtn").addEventListener("click", function () {
      var u = $("#urlInput").value.trim();
      if (u) loadCatalog(u);
    });

    $("#frameH").addEventListener("change", function () { applyLayout(); renderAll(); });

    // זום
    $("#fitBtn").addEventListener("click", fitToScreen);
    $("#zoomIn").addEventListener("click", function () { setZoom(state.zoom + 0.1); });
    $("#zoomOut").addEventListener("click", function () { setZoom(state.zoom - 0.1); });

    $("#exportBtn").addEventListener("click", exportJSON);
    $("#importBtn").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function (e) { if (e.target.files[0]) importJSON(e.target.files[0]); });

    // קיצורי מקלדת
    document.addEventListener("keydown", function (e) {
      if (e.target.matches("textarea, input, select")) return;
      var map = { "1": "select", "2": "note", "3": "arrow", "4": "line", "5": "region",
                  n: "note", a: "arrow", l: "line", r: "region", v: "select" };
      if (e.key === "Escape") { setTool("select"); }
      else if (map[e.key]) { setTool(map[e.key]); }
      else if (e.key === "+" || e.key === "=") { setZoom(state.zoom + 0.1); }
      else if (e.key === "-") { setZoom(state.zoom - 0.1); }
      else if (e.key === "0") { fitToScreen(); }
    });

    // שמירה במקרה של סגירה
    window.addEventListener("beforeunload", persist);
    // התאמה מחדש בשינוי גודל חלון (כי הכל יחסי)
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { applyLayout(); renderAll(); }, 120); });
  }

  // ============================================================
  //  אתחול
  // ============================================================
  function init() {
    loadLocal();
    wireToolbar();
    setTool("select");

    var startUrl = state.catalogUrl || $("#urlInput").value.trim();
    $("#urlInput").value = startUrl;
    if (startUrl) loadCatalog(startUrl);

    fitToScreen();                 // מתחיל בתצוגה שמראה את כל רוחב הקטלוג
    loadRepoFeedback().then(renderAll);
    renderAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
