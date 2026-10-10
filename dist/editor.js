(() => {
  // client/styles.js
  var CSS = [
    "[data-hme-overlay],[data-hme-overlay] *{box-sizing:border-box}",
    "[data-hme-overlay]{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif}",
    "[data-hme-overlay] [hidden]{display:none!important}",
    "[data-hme-editor]{box-sizing:border-box;pointer-events:auto}",
    ".hme-box,.hme-toast{pointer-events:none!important}",
    ".hme-toolbar{position:fixed;top:12px;right:12px;display:flex;gap:4px;background:#111827;padding:4px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35)}",
    ".hme-btn{color:#d1d5db;background:transparent;border:0;padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit;font-weight:600}",
    ".hme-btn:hover{color:#fff;background:#1f2937}",
    ".hme-btn.active{color:#fff;background:#4f46e5}",
    ".hme-mode{display:flex;align-items:center;justify-content:center;padding:6px 9px}",
    ".hme-mode .hme-icon{width:16px;height:16px;display:none}",
    ".hme-mode[data-mode='rect'] .hme-icon-rect{display:block}",
    ".hme-mode[data-mode='text'] .hme-icon-text{display:block}",
    ".hme-mode[data-mode='node'] .hme-icon-node{display:block}",
    ".hme-btn:disabled{opacity:.35;cursor:default}",
    ".hme-btn:disabled:hover{color:#d1d5db;background:transparent}",
    ".hme-box{position:fixed;border:2px solid #6366f1;background:rgba(99,102,241,.12);border-radius:3px}",
    ".hme-popover{position:fixed;width:320px;max-width:calc(100vw - 16px);background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.35);padding:10px}",
    ".hme-popover textarea{width:100%;height:auto;min-height:44px;max-height:220px;resize:none;overflow:auto;border:1px solid #d1d5db;border-radius:6px;padding:8px;font:inherit;color:#111827}",
    ".hme-popover textarea:focus{outline:2px solid #6366f1;outline-offset:-1px}",
    ".hme-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:8px}",
    ".hme-hint{margin-right:auto;padding-left:4px;font-size:11px;color:#9ca3af}",
    ".hme-deck{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;background:#111827;color:#e5e7eb;padding:5px 10px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.45);z-index:1}",
    ".hme-deck button{background:transparent;border:0;color:#e5e7eb;font-size:18px;line-height:1;padding:0 8px;border-radius:6px;cursor:pointer}",
    ".hme-deck button:hover{background:#374151}",
    ".hme-deck-pos{font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;min-width:54px;text-align:center}",
    ":root[data-hme-theme='dark'] .hme-popover{background:#111111;color:#e5e7eb;border-color:#333333;box-shadow:0 10px 30px rgba(0,0,0,.6)}",
    ":root[data-hme-theme='dark'] .hme-popover textarea{background:#0b0b0b;color:#e5e7eb;border-color:#333333}",
    ".hme-send{display:flex;align-items:center;justify-content:center;color:#fff;background:#4f46e5;border:0;padding:6px 9px;border-radius:6px;cursor:pointer;font:inherit}",
    ".hme-send svg{width:16px;height:16px;display:block}",
    ".hme-send:disabled{opacity:.5;cursor:default}",
    ".hme-quick{position:fixed;display:flex;flex-direction:column;gap:2px;background:#111827;padding:4px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.4)}",
    ".hme-qbtn{display:flex;align-items:center;gap:8px;min-width:140px;color:#e5e7eb;background:transparent;border:0;padding:6px 9px;border-radius:6px;cursor:pointer;font:inherit;font-weight:600;text-align:left}",
    ".hme-qbtn:hover{background:#374151;color:#fff}",
    ".hme-qicon{width:15px;height:15px;flex:0 0 15px;display:block}",
    ".hme-qlabel{flex:1 1 auto;margin-right:12px}",
    ".hme-qkbd{font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:#9ca3af;background:#1f2937;border:1px solid #374151;border-radius:4px;padding:1px 5px}",
    ".hme-qbtn:hover .hme-qkbd{color:#e5e7eb;background:#111827}",
    ".hme-explain{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 32px));max-height:75vh;display:flex;flex-direction:column;overflow:hidden;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.45)}",
    ".hme-explain-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 10px 10px 18px;border-bottom:1px solid #e5e7eb;font:600 14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif}",
    ".hme-explain-x{background:transparent;border:0;color:#6b7280;font-size:22px;line-height:1;padding:0 8px;border-radius:6px;cursor:pointer}",
    ".hme-explain-x:hover{background:#f3f4f6;color:#111827}",
    ".hme-explain-body{white-space:normal;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;padding:16px 20px;overflow-y:auto;flex:1 1 auto;min-height:0}",
    ".hme-explain-body > :first-child{margin-top:0}",
    ".hme-explain-body > :last-child{margin-bottom:0}",
    ".hme-explain-body h1,.hme-explain-body h2,.hme-explain-body h3{line-height:1.25;margin:1.1em 0 .5em}",
    ".hme-explain-body h1{font-size:1.35em}",
    ".hme-explain-body h2{font-size:1.2em}",
    ".hme-explain-body h3{font-size:1.05em}",
    ".hme-explain-body p,.hme-explain-body ul,.hme-explain-body ol,.hme-explain-body pre,.hme-explain-body blockquote{margin:0 0 .9em}",
    ".hme-explain-body ul,.hme-explain-body ol{padding-left:1.4em}",
    ".hme-explain-body li{margin:.2em 0}",
    ".hme-explain-body code{background:rgba(127,127,127,.2);border-radius:4px;padding:.1em .35em;font:.9em/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}",
    ".hme-explain-body pre{background:rgba(127,127,127,.16);border-radius:8px;padding:10px 12px;overflow:auto}",
    ".hme-explain-body pre code{background:none;padding:0}",
    ".hme-explain-body a{color:#818cf8}",
    ".hme-explain-body blockquote{margin-left:0;padding:.2em .8em;border-left:3px solid rgba(127,127,127,.5);opacity:.9}",
    ":root[data-hme-theme='dark'] .hme-explain{background:#111111;color:#e5e7eb;border-color:#333333;box-shadow:0 20px 60px rgba(0,0,0,.7)}",
    ":root[data-hme-theme='dark'] .hme-explain-head{border-bottom-color:#262626}",
    ":root[data-hme-theme='dark'] .hme-explain-x{color:#9ca3af}",
    ":root[data-hme-theme='dark'] .hme-explain-x:hover{background:#262626;color:#e5e7eb}",
    ".hme-theme{display:flex;align-items:center;justify-content:center;padding:6px 9px}",
    ".hme-theme .hme-icon{width:16px;height:16px;display:none}",
    ":root[data-hme-theme='dark'] .hme-theme .hme-icon-sun{display:block}",
    ":root:not([data-hme-theme='dark']) .hme-theme .hme-icon-moon{display:block}",
    "html.hme-generic[data-hme-theme='dark']{background:#000}",
    "html.hme-generic[data-hme-theme='dark'] body{background:#000}",
    "html.hme-generic[data-hme-theme='dark'] body > *:not([data-hme-overlay]){filter:invert(1) hue-rotate(180deg)}",
    "html.hme-generic[data-hme-theme='dark'] body > *:not([data-hme-overlay]) img,html.hme-generic[data-hme-theme='dark'] body > *:not([data-hme-overlay]) svg,html.hme-generic[data-hme-theme='dark'] body > *:not([data-hme-overlay]) video,html.hme-generic[data-hme-theme='dark'] body > *:not([data-hme-overlay]) canvas{filter:invert(1) hue-rotate(180deg)}",
    ".hme-pin{position:fixed;width:26px;height:26px;border-radius:50%;background:#4f46e5;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.35);cursor:pointer}",
    ".hme-spin{width:12px;height:12px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:hme-spin .7s linear infinite}",
    "@keyframes hme-spin{to{transform:rotate(360deg)}}",
    ".hme-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:8px 14px;border-radius:8px;opacity:0;transition:opacity .15s;max-width:80vw}",
    ".hme-toast.show{opacity:1}",
    ".hme-toast.error{background:#b91c1c}",
    "body.hme-dragging,body.hme-dragging *{user-select:none!important;-webkit-user-select:none!important}",
    "body.hme-dragging img,body.hme-dragging a,body.hme-dragging [draggable='true']{-webkit-user-drag:none!important;user-drag:none}",
    ":root[data-hme-mode='rect'] body > *:not([data-hme-overlay]){cursor:crosshair}",
    ":root[data-hme-mode='text'] body > *:not([data-hme-overlay]){cursor:text}",
    ":root[data-hme-mode='node'] body > *:not([data-hme-overlay]){cursor:url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxOCcgaGVpZ2h0PScxOCcgdmlld0JveD0nMCAwIDI2IDI2Jz48Y2lyY2xlIGN4PScxMycgY3k9JzEzJyByPSc3LjUnIGZpbGw9J25vbmUnIHN0cm9rZT0nIzAwMCcgc3Ryb2tlLXdpZHRoPSc0Jy8+PGNpcmNsZSBjeD0nMTMnIGN5PScxMycgcj0nNy41JyBmaWxsPSdub25lJyBzdHJva2U9JyNmZmYnIHN0cm9rZS13aWR0aD0nMS44Jy8+PHBhdGggZD0nTTEzIDF2NC41TTEzIDIwLjVWMjVNMSAxM2g0LjVNMjAuNSAxM0gyNScgc3Ryb2tlPScjMDAwJyBzdHJva2Utd2lkdGg9JzQnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcvPjxwYXRoIGQ9J00xMyAxdjQuNU0xMyAyMC41VjI1TTEgMTNoNC41TTIwLjUgMTNIMjUnIHN0cm9rZT0nI2ZmZicgc3Ryb2tlLXdpZHRoPScxLjgnIHN0cm9rZS1saW5lY2FwPSdyb3VuZCcvPjxjaXJjbGUgY3g9JzEzJyBjeT0nMTMnIHI9JzEuNicgZmlsbD0nI2ZmZicgc3Ryb2tlPScjMDAwJyBzdHJva2Utd2lkdGg9JzEuMicvPjwvc3ZnPg==) 9 9, pointer}"
  ].join("\n");

  // client/main.js
  (function() {
    "use strict";
    var currentScript = document.currentScript;
    if (!currentScript) return;
    var scriptUrl = new URL(currentScript.src, location.href);
    var TOKEN = scriptUrl.searchParams.get("t") || "";
    var MD = scriptUrl.searchParams.get("md") === "1";
    if (!TOKEN) return;
    if (window.__hmeInit) return;
    window.__hmeInit = true;
    if (!MD) document.documentElement.classList.add("hme-generic");
    try {
      var savedTheme = localStorage.getItem("hme-theme") || "dark";
      document.documentElement.setAttribute("data-hme-theme", savedTheme);
    } catch (e) {
      document.documentElement.setAttribute("data-hme-theme", "dark");
    }
    var mode = "text";
    document.documentElement.setAttribute("data-hme-mode", mode);
    var busy = false;
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var pending = null;
    var pendingCaptureEl = null;
    var popoverLoc = { x: 0, y: 0 };
    var styleEl = document.createElement("style");
    styleEl.setAttribute("data-hme-editor", "");
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
    var root = document.createElement("div");
    root.setAttribute("data-hme-overlay", "");
    root.innerHTML = '<div class="hme-toolbar" data-hme-editor><button class="hme-btn hme-mode" data-action="mode" data-mode="text" title="Toggle selection mode (region / text / node) [T]" aria-label="Toggle selection mode"><svg class="hme-icon hme-icon-rect" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke-dasharray="3 2"/></svg><svg class="hme-icon hme-icon-text" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12v3.2h-1.2c-.3-1.3-.8-1.7-2.2-1.7H9.2v8.4c0 1.2.2 1.4 1.6 1.6V15H5.2v-1.5c1.4-.2 1.6-.4 1.6-1.6V3.5H5.4c-1.4 0-1.9.4-2.2 1.7H2V2z"/></svg><svg class="hme-icon hme-icon-node" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2"/></svg></button><button class="hme-btn" data-action="undo" title="Undo last file change [Z]" disabled>\u21B6</button><button class="hme-btn" data-action="redo" title="Redo [Y]" disabled>\u21B7</button><button class="hme-btn hme-theme" data-action="theme" title="Toggle dark / light [B]"><svg class="hme-icon hme-icon-moon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a6 6 0 1 0 7.3 7.3z"/></svg><svg class="hme-icon hme-icon-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M2.9 2.9l1.1 1.1M12 12l1.1 1.1M13.1 2.9L12 4M4 12l-1.1 1.1"/></svg></button></div><div class="hme-box" data-hme-editor hidden></div><div class="hme-popover" data-hme-editor hidden><textarea placeholder="What should I change here?"></textarea><div class="hme-actions"><span class="hme-hint">\u2318\u21B5 to send</span><button class="hme-send" title="Send" aria-label="Send"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 1.5 7.5 14.5 6 9 1.5 7.5z"/><path d="m14.5 1.5-7 7"/></svg></button></div></div><div class="hme-quick" data-hme-editor hidden><button class="hme-qbtn" data-quick="remove" title="Remove [R]"><svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6.2 4.5v-.9a1.1 1.1 0 0 1 1.1-1.1h1.4a1.1 1.1 0 0 1 1.1 1.1v.9M3.9 4.5l.55 8a1.35 1.35 0 0 0 1.34 1.25h4.42a1.35 1.35 0 0 0 1.34-1.25l.55-8"/></svg><span class="hme-qlabel">Remove</span><kbd class="hme-qkbd">R</kbd></button><button class="hme-qbtn" data-quick="less" title="Less [L]"><svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.8 8H5.2M8.4 5.6 11 8l-2.6 2.4M7.6 5.6 5 8l2.6 2.4"/></svg><span class="hme-qlabel">Less</span><kbd class="hme-qkbd">L</kbd></button><button class="hme-qbtn" data-quick="more" title="More [M]"><svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.2 8h5.6M7.6 5.6 5 8l2.6 2.4M8.4 5.6 11 8l-2.6 2.4"/></svg><span class="hme-qlabel">More</span><kbd class="hme-qkbd">M</kbd></button><button class="hme-qbtn" data-quick="edit" title="Edit [E]"><svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.7 3.4 12.6 6.3 6.6 12.3a.6.6 0 0 1-.25.15l-2.95.77.77-2.95a.6.6 0 0 1 .15-.25z"/></svg><span class="hme-qlabel">Edit</span><kbd class="hme-qkbd">E</kbd></button><button class="hme-qbtn" data-quick="other" title="Other [O]"><svg class="hme-qicon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg><span class="hme-qlabel">Other</span><kbd class="hme-qkbd">O</kbd></button><button class="hme-qbtn" data-quick="explain" title="Explain [X]"><svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2a3.8 3.8 0 0 0-1.5 7.3c.35.15.5.45.5.8v.9a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-.9c0-.35.15-.65.5-.8A3.8 3.8 0 0 0 8 2z"/><path d="M6.8 13h2.4"/></svg><span class="hme-qlabel">Explain</span><kbd class="hme-qkbd">X</kbd></button></div><div class="hme-explain" data-hme-editor hidden><div class="hme-explain-head"><span>Explanation</span><button class="hme-explain-x" aria-label="Close">\xD7</button></div><div class="hme-explain-body"></div></div><div class="hme-deck" data-hme-editor hidden><button class="hme-deck-prev" aria-label="Previous slide">\u2039</button><span class="hme-deck-pos"></span><button class="hme-deck-next" aria-label="Next slide">\u203A</button></div><div class="hme-pin" data-hme-editor hidden><span class="hme-spin"></span></div><div class="hme-toast" data-hme-editor hidden></div>';
    document.body.appendChild(root);
    var toolbar = root.querySelector(".hme-toolbar");
    var undoBtn = toolbar.querySelector('[data-action="undo"]');
    var redoBtn = toolbar.querySelector('[data-action="redo"]');
    var themeBtn = toolbar.querySelector('[data-action="theme"]');
    var box = root.querySelector(".hme-box");
    var popover = root.querySelector(".hme-popover");
    var quick = root.querySelector(".hme-quick");
    var textarea = root.querySelector("textarea");
    var sendBtn = root.querySelector(".hme-send");
    var explain = root.querySelector(".hme-explain");
    var explainBody = root.querySelector(".hme-explain-body");
    var explainX = root.querySelector(".hme-explain-x");
    var pin = root.querySelector(".hme-pin");
    var toast = root.querySelector(".hme-toast");
    var deck = root.querySelector(".hme-deck");
    var deckPos = root.querySelector(".hme-deck-pos");
    var deckPrev = root.querySelector(".hme-deck-prev");
    var deckNext = root.querySelector(".hme-deck-next");
    var toastTimer = null;
    var settleGraceTimer = null;
    var watchdogTimer = null;
    var popoverMode = "instruction";
    var pendingEditOld = "";
    var nodePaused = false;
    var deckSlides = [];
    var deckIndex = 0;
    var isDeck = false;
    function isEditorNode(el) {
      return !!(el && el.closest && el.closest("[data-hme-editor]"));
    }
    function elementOf(node) {
      return node && node.nodeType === 1 ? node : node && node.parentElement ? node.parentElement : null;
    }
    function esc(name) {
      return String(name).replace(/[^A-Za-z0-9_-]/g, function(ch) {
        return "\\" + ch;
      });
    }
    function cssPath(el) {
      if (!el || el.nodeType !== 1) return null;
      var parts = [];
      var node = el;
      while (node && node.nodeType === 1 && node !== document.documentElement) {
        var tag = node.tagName.toLowerCase();
        if (node.id) {
          parts.unshift(tag + "#" + esc(node.id));
          break;
        }
        var sel = tag;
        if (typeof node.className === "string") {
          var classes = node.className.trim().split(/\s+/).filter(Boolean);
          for (var c = 0; c < classes.length && c < 2; c++) sel += "." + esc(classes[c]);
        }
        var parent = node.parentElement;
        if (parent) {
          var siblings = parent.children;
          var nth = 1;
          var sameTotal = 0;
          for (var i = 0; i < siblings.length; i++) {
            var sib = siblings[i];
            if (sib.tagName === node.tagName) {
              sameTotal++;
              if (sib === node) nth = sameTotal;
            }
          }
          if (sameTotal > 1) sel += ":nth-of-type(" + nth + ")";
        }
        parts.unshift(sel);
        node = parent;
      }
      return parts.join(" > ");
    }
    function captureHtml(el) {
      if (!el) return void 0;
      try {
        return el.outerHTML.slice(0, 6e4);
      } catch (e) {
        return void 0;
      }
    }
    function rectOf(r) {
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    function lowestCommonAncestor(a, b) {
      var chain = /* @__PURE__ */ new Set();
      var n = a;
      while (n) {
        chain.add(n);
        n = n.parentElement;
      }
      var m = b;
      while (m && !chain.has(m)) m = m.parentElement;
      return m;
    }
    function commonAncestor(list) {
      var anc = list[0];
      for (var i = 1; i < list.length; i++) anc = lowestCommonAncestor(anc, list[i]);
      return anc;
    }
    function sampleElements(rect) {
      var found = [];
      var stepX = Math.max(6, Math.floor(rect.width / 8));
      var stepY = Math.max(6, Math.floor(rect.height / 8));
      for (var y = rect.y; y <= rect.y + rect.height; y += stepY) {
        for (var x = rect.x; x <= rect.x + rect.width; x += stepX) {
          var stack = document.elementsFromPoint(x, y);
          for (var i = 0; i < stack.length; i++) {
            var el = stack[i];
            if (el === root || el === document.documentElement || el === document.body) continue;
            if (isEditorNode(el)) continue;
            if (found.indexOf(el) === -1) found.push(el);
          }
        }
      }
      return found.filter(function(el2) {
        return !found.some(function(other) {
          return other !== el2 && other.contains(el2);
        });
      });
    }
    function clampX(x) {
      return Math.max(8, Math.min(x, window.innerWidth - 330));
    }
    function clampY(y) {
      return Math.max(8, Math.min(y, window.innerHeight - 120));
    }
    function autoGrow() {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight || 44, 220) + "px";
    }
    function openPopover(x, y) {
      popover.hidden = false;
      popover.style.left = clampX(x) + "px";
      popover.style.top = clampY(y) + "px";
      autoGrow();
      textarea.focus();
    }
    function closePopover() {
      popover.hidden = true;
    }
    function hideQuick() {
      quick.hidden = true;
    }
    function openQuick(x, y) {
      quick.hidden = false;
      quick.style.left = Math.max(8, Math.min(x, window.innerWidth - quick.offsetWidth - 8)) + "px";
      quick.style.top = Math.max(8, Math.min(y, window.innerHeight - quick.offsetHeight - 8)) + "px";
    }
    function openInstruction() {
      popoverMode = "instruction";
      sendBtn.title = "Send";
      sendBtn.setAttribute("aria-label", "Send");
      textarea.value = "";
      textarea.placeholder = "What should I change here?";
      openPopover(popoverLoc.x, popoverLoc.y);
    }
    function openEdit() {
      popoverMode = "edit";
      pendingEditOld = pending && pending.text ? pending.text : "";
      sendBtn.title = "Replace";
      sendBtn.setAttribute("aria-label", "Replace");
      textarea.placeholder = "New text";
      textarea.value = pendingEditOld;
      openPopover(popoverLoc.x, popoverLoc.y);
    }
    function showExplanation(text, html) {
      if (html) explainBody.innerHTML = html;
      else explainBody.textContent = text;
      explain.hidden = false;
    }
    function showToast(msg, isError) {
      toast.textContent = msg;
      toast.className = "hme-toast show" + (isError ? " error" : "");
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function() {
        toast.hidden = true;
      }, 4200);
    }
    function updateHistoryButtons(state) {
      if (!state) return;
      if (undoBtn) undoBtn.disabled = !state.canUndo;
      if (redoBtn) redoBtn.disabled = !state.canRedo;
    }
    function historyAction(kind) {
      fetch("/__" + kind + "?t=" + encodeURIComponent(TOKEN), { method: "POST" }).then(function(res) {
        return res.json().catch(function() {
          return null;
        }).then(function(body) {
          if (!res.ok) throw new Error(body && body.error ? body.error : "history action failed");
          return body;
        });
      }).then(function(state) {
        updateHistoryButtons(state);
      }).catch(function(err) {
        showToast(err && err.message ? err.message : String(err), true);
      });
    }
    function refreshHistory() {
      fetch("/__history?t=" + encodeURIComponent(TOKEN)).then(function(res) {
        return res.ok ? res.json() : null;
      }).then(function(state) {
        updateHistoryButtons(state);
      }).catch(function() {
      });
    }
    function showPin(x, y) {
      pin.style.left = Math.max(4, Math.min(x - 13, window.innerWidth - 30)) + "px";
      pin.style.top = Math.max(4, Math.min(y - 13, window.innerHeight - 30)) + "px";
      pin.hidden = false;
    }
    function slideOf(el) {
      if (!deckSlides.length || !el) return -1;
      for (var k = 0; k < deckSlides.length; k++) {
        if (deckSlides[k].contains(el)) return k;
      }
      return -1;
    }
    function showSlide(i) {
      if (!deckSlides.length) return;
      deckIndex = Math.max(0, Math.min(i, deckSlides.length - 1));
      for (var k = 0; k < deckSlides.length; k++) {
        deckSlides[k].classList.toggle("hme-slide-active", k === deckIndex);
      }
      deckPos.textContent = deckIndex + 1 + " / " + deckSlides.length;
    }
    function changeSlide(delta) {
      showSlide(deckIndex + delta);
      hideQuick();
      closePopover();
      pending = null;
      pendingCaptureEl = null;
    }
    function initDeck() {
      deckSlides = Array.prototype.slice.call(document.querySelectorAll("svg[data-marpit-svg]"));
      isDeck = deckSlides.length > 0;
      themeBtn.hidden = isDeck;
      themeBtn.title = isDeck ? "This deck uses its own Marp theme" : "Toggle dark / light [B]";
      if (!deckSlides.length) {
        deck.hidden = true;
        return;
      }
      if (deckIndex >= deckSlides.length) deckIndex = 0;
      deck.hidden = false;
      showSlide(deckIndex);
    }
    function settle() {
      busy = false;
      pending = null;
      pendingCaptureEl = null;
      pendingEditOld = "";
      popoverMode = "instruction";
      pin.hidden = true;
      sendBtn.disabled = false;
      sendBtn.title = "Send";
      sendBtn.setAttribute("aria-label", "Send");
      textarea.placeholder = "What should I change here?";
      clearTimeout(settleGraceTimer);
      clearTimeout(watchdogTimer);
      closePopover();
      hideQuick();
      popover.querySelector("textarea").value = "";
    }
    function onSettled(info) {
      if (!busy) return;
      if (info && info.kind === "explain") {
        var exp = info.reply ? String(info.reply).trim() : "";
        settle();
        if (exp && info.replyHtml) showExplanation(exp, info.replyHtml);
        else showExplanation(exp || "No explanation returned.");
        return;
      }
      clearTimeout(settleGraceTimer);
      var edited = !!(info && info.edited);
      var reply = info && info.reply ? String(info.reply).trim() : "";
      var graceMs = edited ? 5e3 : 1500;
      settleGraceTimer = setTimeout(function() {
        if (!busy) return;
        if (edited) {
          applySource();
        } else {
          settle();
          showToast(reply ? "Pi didn't change the file. It said: \u201C" + reply.slice(0, 160) + "\u201D" : "Pi didn't change the file.", true);
        }
      }, graceMs);
    }
    function onError(message) {
      if (busy) {
        settle();
        showToast(message || "The agent reported an error.", true);
      }
    }
    function dismissBusy() {
      if (!busy) return;
      settle();
      showToast("Stopped waiting for the agent.", true);
    }
    function normalizeRect(x1, y1, x2, y2) {
      var left = Math.min(x1, x2);
      var top = Math.min(y1, y2);
      var right = Math.max(x1, x2);
      var bottom = Math.max(y1, y2);
      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        pageX: left + window.scrollX,
        pageY: top + window.scrollY
      };
    }
    function updateBox(x, y) {
      var r = normalizeRect(startX, startY, x, y);
      box.style.left = r.x + "px";
      box.style.top = r.y + "px";
      box.style.width = r.width + "px";
      box.style.height = r.height + "px";
    }
    function finishRect(rect) {
      var tops = sampleElements(rect);
      var targetEl = null;
      if (tops.length === 1) targetEl = tops[0];
      else if (tops.length > 1) targetEl = commonAncestor(tops);
      pending = {
        mode: "rect",
        rect,
        anchorHtml: captureHtml(targetEl),
        selector: cssPath(targetEl) || void 0,
        primaryRect: targetEl ? rectOf(targetEl.getBoundingClientRect()) : void 0
      };
      pendingCaptureEl = targetEl;
      popoverLoc = { x: rect.x, y: rect.y + rect.height + 8 };
      openInstruction();
    }
    function finishText() {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      var range = sel.getRangeAt(0);
      var raw = range.toString();
      var text = raw.trim();
      if (!text) return;
      var endRect = range.getBoundingClientRect();
      var el = elementOf(range.commonAncestorContainer);
      var anchorText = el ? el.textContent || "" : "";
      var startOffset = -1;
      if (el) {
        try {
          var pre = document.createRange();
          pre.selectNodeContents(el);
          pre.setEnd(range.startContainer, range.startOffset);
          var lead = raw.length - raw.replace(/^\s+/, "").length;
          startOffset = pre.toString().length + lead;
        } catch (e) {
          startOffset = -1;
        }
      }
      pending = {
        mode: "text",
        text,
        anchorText,
        startOffset,
        anchorHtml: captureHtml(el),
        selector: cssPath(el) || void 0
      };
      pendingCaptureEl = el;
      popoverLoc = { x: endRect.right, y: endRect.bottom + 8 };
      openQuick(popoverLoc.x, popoverLoc.y);
    }
    function finishNode(el) {
      nodePaused = true;
      var r = el.getBoundingClientRect();
      var tc = el.textContent || "";
      var trimmed = tc.trim();
      var lead = tc.length - tc.replace(/^\s+/, "").length;
      pending = {
        mode: "node",
        text: trimmed || void 0,
        anchorText: tc,
        startOffset: trimmed ? lead : -1,
        anchorHtml: captureHtml(el),
        selector: cssPath(el) || void 0,
        primaryRect: rectOf(r)
      };
      pendingCaptureEl = el;
      popoverLoc = { x: r.left, y: r.bottom + 8 };
      openQuick(popoverLoc.x, popoverLoc.y);
    }
    function ensureToImage() {
      return new Promise(function(resolve, reject) {
        if (window.htmlToImage) return resolve();
        var s = document.createElement("script");
        s.src = "/__editor/html-to-image.js?t=" + encodeURIComponent(TOKEN);
        s.onload = function() {
          resolve();
        };
        s.onerror = function() {
          reject(new Error("rasterizer failed to load"));
        };
        document.head.appendChild(s);
      });
    }
    function captureRegion() {
      var el = pendingCaptureEl;
      if (!el) return Promise.resolve(null);
      var area = (el.scrollWidth || 0) * (el.scrollHeight || 0);
      if (!area || area > 4e6 || el === document.documentElement || el === document.body) {
        return Promise.resolve(null);
      }
      return ensureToImage().then(function() {
        return window.htmlToImage.toPng(el, {
          backgroundColor: "#ffffff",
          pixelRatio: 1,
          cacheBust: false
        });
      }).catch(function() {
        return null;
      });
    }
    function submit(kind) {
      kind = kind || "edit";
      if (!pending) return;
      if (popoverMode === "edit") {
        doReplace();
        return;
      }
      var instruction = textarea.value.trim();
      if (!instruction && kind !== "explain") {
        textarea.focus();
        return;
      }
      if (!instruction) instruction = "Explain the selected content.";
      explain.hidden = true;
      var payload = {
        mode: pending.mode,
        kind,
        instruction,
        text: pending.text,
        rect: pending.rect,
        anchorHtml: pending.anchorHtml,
        selector: pending.selector,
        primaryRect: pending.primaryRect,
        slide: pendingCaptureEl ? slideOf(pendingCaptureEl) : -1,
        slideTotal: deckSlides.length,
        imageDataUrl: null
      };
      busy = true;
      closePopover();
      showPin(popoverLoc.x, popoverLoc.y);
      sendBtn.disabled = true;
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(function() {
        if (!busy) return;
        settle();
        showToast("Timed out waiting for the agent.", true);
      }, 18e4);
      var work = Promise.resolve();
      if (payload.mode === "rect" || payload.mode === "node") {
        work = captureRegion().then(function(dataUrl) {
          payload.imageDataUrl = dataUrl;
        });
      }
      work.then(function() {
        return fetch("/__submit?t=" + encodeURIComponent(TOKEN), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }).then(function(res) {
        if (!res.ok) throw new Error("submit rejected (" + res.status + ")");
      }).catch(function(err) {
        busy = false;
        pin.hidden = true;
        sendBtn.disabled = false;
        clearTimeout(watchdogTimer);
        showToast(err && err.message ? err.message : String(err), true);
        textarea.value = instruction;
        openPopover(popoverLoc.x, popoverLoc.y);
      });
    }
    function doReplace() {
      if (!pending) return;
      var oldText = pendingEditOld;
      var newText = textarea.value;
      var anchorText = pending.anchorText;
      var startOffset = pending.startOffset;
      var slide = pendingCaptureEl ? slideOf(pendingCaptureEl) : -1;
      busy = true;
      closePopover();
      hideQuick();
      showPin(popoverLoc.x, popoverLoc.y);
      sendBtn.disabled = true;
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(function() {
        if (!busy) return;
        settle();
        showToast("Timed out waiting for the file to update.", true);
      }, 15e3);
      fetch("/__replace?t=" + encodeURIComponent(TOKEN), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldText, newText, anchorText, startOffset, slide })
      }).then(function(res) {
        return res.json().catch(function() {
          return null;
        }).then(function(body) {
          if (!res.ok) throw new Error(body && body.error ? body.error : "replace failed");
          return body;
        });
      }).catch(function(err) {
        busy = false;
        pin.hidden = true;
        sendBtn.disabled = false;
        clearTimeout(watchdogTimer);
        showToast(err && err.message ? err.message : String(err), true);
        popoverMode = "edit";
        textarea.value = newText;
        openPopover(popoverLoc.x, popoverLoc.y);
      });
    }
    var applySeq = 0;
    function applySource() {
      var seq = ++applySeq;
      fetch("/__source?t=" + encodeURIComponent(TOKEN)).then(function(res) {
        if (!res.ok) throw new Error("source refused (" + res.status + ")");
        return res.text();
      }).then(function(raw) {
        if (seq !== applySeq) return;
        var doc = new DOMParser().parseFromString(raw, "text/html");
        var tags = { link: 1, style: 1, title: 1, meta: 1 };
        var headChildren = Array.prototype.slice.call(document.head.children);
        headChildren.forEach(function(el) {
          if (el.hasAttribute("data-hme-editor")) return;
          if (tags[el.tagName.toLowerCase()]) el.parentNode.removeChild(el);
        });
        Array.prototype.slice.call(doc.head.children).forEach(function(el) {
          if (el.hasAttribute("data-hme-editor")) return;
          document.head.appendChild(el.cloneNode(true));
        });
        var overlay = root;
        document.body.innerHTML = "";
        document.body.innerHTML = doc.body ? doc.body.innerHTML : "";
        document.body.appendChild(overlay);
        settle();
        initDeck();
      }).catch(function() {
      });
    }
    function connect() {
      var es = new EventSource("/__events?t=" + encodeURIComponent(TOKEN));
      es.onmessage = function(ev) {
        try {
          var msg = JSON.parse(ev.data);
          if (msg.type === "changed") {
            updateHistoryButtons(msg);
            applySource();
          } else if (msg.type === "settled") onSettled(msg);
          else if (msg.type === "error") onError(msg.message);
        } catch (e) {
        }
      };
      es.onerror = function() {
        es.close();
        setTimeout(connect, 3e3);
      };
    }
    function setMode(next) {
      mode = next;
      document.documentElement.setAttribute("data-hme-mode", mode);
      var mb = toolbar.querySelector(".hme-mode");
      if (mb) mb.setAttribute("data-mode", mode);
      box.hidden = true;
      dragging = false;
      nodePaused = false;
    }
    function cycleMode() {
      setMode(mode === "rect" ? "text" : mode === "text" ? "node" : "rect");
    }
    function toggleTheme() {
      if (isDeck) return;
      var isDark = document.documentElement.getAttribute("data-hme-theme") === "dark";
      var next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-hme-theme", next);
      try {
        localStorage.setItem("hme-theme", next);
      } catch (e) {
      }
    }
    toolbar.addEventListener("click", function(e) {
      var btn = e.target.closest(".hme-btn");
      if (!btn || btn.disabled) return;
      var action = btn.getAttribute("data-action");
      if (action === "undo" || action === "redo") {
        historyAction(action);
        return;
      }
      if (action === "mode") {
        cycleMode();
        return;
      }
      if (action === "theme") {
        toggleTheme();
        return;
      }
    });
    document.addEventListener("keydown", function(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      var key = e.key ? e.key.toLowerCase() : "";
      if (key === "t") {
        cycleMode();
        e.preventDefault();
      } else if (key === "b") {
        toggleTheme();
        e.preventDefault();
      } else if (key === "z") {
        historyAction("undo");
        e.preventDefault();
      } else if (key === "y") {
        historyAction("redo");
        e.preventDefault();
      } else if (deckSlides.length && (key === "arrowright" || key === "arrowdown" || key === "pagedown")) {
        changeSlide(1);
        e.preventDefault();
      } else if (deckSlides.length && (key === "arrowleft" || key === "arrowup" || key === "pageup")) {
        changeSlide(-1);
        e.preventDefault();
      } else if (!quick.hidden) {
        var quickKeyToAction = { r: "remove", l: "less", m: "more", e: "edit", o: "other", x: "explain" };
        var quickKind = quickKeyToAction[key];
        if (quickKind) {
          runQuickAction(quickKind);
          e.preventDefault();
        }
      }
    });
    document.addEventListener("keydown", function(e) {
      if (e.key !== "Escape") return;
      explain.hidden = true;
      closePopover();
      hideQuick();
      pending = null;
      pendingCaptureEl = null;
      popoverMode = "instruction";
      setMode("text");
      e.preventDefault();
    });
    document.addEventListener("pointerdown", function(e) {
      if (quick.hidden) return;
      if (quick.contains(e.target)) return;
      hideQuick();
      pending = null;
      pendingCaptureEl = null;
    });
    function runQuickAction(kind) {
      hideQuick();
      if (kind === "edit") {
        openEdit();
        return;
      }
      if (kind === "other") {
        openInstruction();
        return;
      }
      if (kind === "explain") {
        textarea.value = "Explain the selected content.";
        submit("explain");
        return;
      }
      var isNode = pending && pending.mode === "node";
      var instruction = kind === "remove" ? isNode ? "Remove the selected element." : "Remove the selected text." : kind === "less" ? isNode ? "Make the selected element's content shorter." : "Say the same thing in a shorter way." : isNode ? "Make the selected element's content longer and more detailed." : "Say the same thing with more detail.";
      textarea.value = instruction;
      submit("edit");
    }
    quick.addEventListener("click", function(e) {
      var b = e.target.closest(".hme-qbtn");
      if (!b) return;
      runQuickAction(b.getAttribute("data-quick"));
    });
    document.addEventListener(
      "pointerdown",
      function(e) {
        if (mode !== "rect" || e.button !== 0) return;
        if (isEditorNode(e.target)) return;
        dragging = true;
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        box.hidden = false;
        updateBox(e.clientX, e.clientY);
        document.body.classList.add("hme-dragging");
      },
      true
    );
    document.addEventListener("dragstart", function(e) {
      if (dragging) e.preventDefault();
    }, true);
    window.addEventListener("pointermove", function(e) {
      if (dragging) {
        updateBox(e.clientX, e.clientY);
        return;
      }
      if (mode !== "node") return;
      if (nodePaused || !popover.hidden || !quick.hidden) {
        box.hidden = true;
        return;
      }
      if (isEditorNode(e.target)) {
        box.hidden = true;
        return;
      }
      var el = elementOf(e.target);
      if (!el || el === document.documentElement || el === document.body) {
        box.hidden = true;
        return;
      }
      var r = el.getBoundingClientRect();
      box.hidden = false;
      box.style.left = r.left + "px";
      box.style.top = r.top + "px";
      box.style.width = r.width + "px";
      box.style.height = r.height + "px";
    });
    window.addEventListener("pointerup", function(e) {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("hme-dragging");
      var rect = normalizeRect(startX, startY, e.clientX, e.clientY);
      box.hidden = true;
      if (rect.width < 4 || rect.height < 4) return;
      finishRect(rect);
    });
    window.addEventListener(
      "mouseup",
      function(e) {
        if (mode !== "text") return;
        if (isEditorNode(e.target)) return;
        setTimeout(function() {
          if (mode === "text") finishText();
        }, 10);
      },
      true
    );
    textarea.addEventListener("input", autoGrow);
    textarea.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        submit("edit");
      }
    });
    document.addEventListener("click", function(e) {
      if (mode !== "node" || e.button !== 0) return;
      if (isEditorNode(e.target)) return;
      if (nodePaused) {
        nodePaused = false;
        return;
      }
      var el = elementOf(e.target);
      if (!el || el === document.documentElement || el === document.body) return;
      box.hidden = true;
      finishNode(el);
    });
    document.addEventListener("pointerdown", function(e) {
      if (popover.hidden) return;
      if (popover.contains(e.target)) return;
      closePopover();
      hideQuick();
      popoverMode = "instruction";
      pending = null;
      pendingCaptureEl = null;
    });
    sendBtn.addEventListener("click", function() {
      submit("edit");
    });
    explainX.addEventListener("click", function() {
      explain.hidden = true;
    });
    deckPrev.addEventListener("click", function() {
      changeSlide(-1);
    });
    deckNext.addEventListener("click", function() {
      changeSlide(1);
    });
    pin.title = "Waiting for the agent \u2014 click to stop";
    pin.addEventListener("click", dismissBusy);
    connect();
    refreshHistory();
    initDeck();
  })();
})();
