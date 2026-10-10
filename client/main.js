import { CSS } from "./styles.js";
/*
 * retouche browser overlay.
 * Reads a token from its script URL, attaches an annotation layer to the
 * page, and lets the user send region/text selections back to the pi session.
 * This script NEVER mutates the artifact document; it only annotates it.
 */
(function () {
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
  var generalComment = false;
  var popoverLoc = { x: 0, y: 0 };



  var styleEl = document.createElement("style");
  styleEl.setAttribute("data-hme-editor", "");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  var root = document.createElement("div");
  root.setAttribute("data-hme-overlay", "");
  root.innerHTML =
    '<div class="hme-toolbar" data-hme-editor>' +
    '<button class="hme-btn hme-mode" data-action="mode" data-mode="text" title="Toggle selection mode (region / text / node) [T]" aria-label="Toggle selection mode">' +
    '<svg class="hme-icon hme-icon-rect" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke-dasharray="3 2"/></svg>' +
    '<svg class="hme-icon hme-icon-text" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12v3.2h-1.2c-.3-1.3-.8-1.7-2.2-1.7H9.2v8.4c0 1.2.2 1.4 1.6 1.6V15H5.2v-1.5c1.4-.2 1.6-.4 1.6-1.6V3.5H5.4c-1.4 0-1.9.4-2.2 1.7H2V2z"/></svg>' +
    '<svg class="hme-icon hme-icon-node" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2"/></svg>' +
    '</button>' +
    '<button class="hme-btn hme-comment" data-action="comment" title="Comment on the whole document [C]" aria-label="Comment on the whole document">' +
      '<svg class="hme-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 7.7a5.4 5.4 0 0 1-8.1 4.6l-3.4 1.1 1.1-3.4A5.4 5.4 0 1 1 14 7.7z"/></svg>' +
    '</button>' +
    '<button class="hme-btn" data-action="undo" title="Undo last file change [Z]" disabled>\u21b6</button>' +
    '<button class="hme-btn" data-action="redo" title="Redo [Y]" disabled>\u21b7</button>' +
    '<button class="hme-btn hme-theme" data-action="theme" title="Toggle dark / light [B]">' +
    '<svg class="hme-icon hme-icon-moon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a6 6 0 1 0 7.3 7.3z"/></svg>' +
    '<svg class="hme-icon hme-icon-sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="3.2"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M2.9 2.9l1.1 1.1M12 12l1.1 1.1M13.1 2.9L12 4M4 12l-1.1 1.1"/></svg>' +
    "</button>" +
    "</div>" +
    '<div class="hme-box" data-hme-editor hidden></div>' +
    '<div class="hme-popover" data-hme-editor hidden>' +
    '<textarea placeholder="What should I change here?"></textarea>' +
    '<div class="hme-actions"><span class="hme-hint">\u2318\u21b5 to send</span><button class="hme-send" title="Send" aria-label="Send"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 1.5 7.5 14.5 6 9 1.5 7.5z"/><path d="m14.5 1.5-7 7"/></svg></button></div>' +
    "</div>" +
    '<div class="hme-quick" data-hme-editor hidden>' +
    '<button class="hme-qbtn" data-quick="remove" title="Remove [R]">' +
      '<svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6.2 4.5v-.9a1.1 1.1 0 0 1 1.1-1.1h1.4a1.1 1.1 0 0 1 1.1 1.1v.9M3.9 4.5l.55 8a1.35 1.35 0 0 0 1.34 1.25h4.42a1.35 1.35 0 0 0 1.34-1.25l.55-8"/></svg>' +
      '<span class="hme-qlabel">Remove</span><kbd class="hme-qkbd">R</kbd>' +
    '</button>' +
    '<button class="hme-qbtn" data-quick="less" title="Less [L]">' +
      '<svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.8 8H5.2M8.4 5.6 11 8l-2.6 2.4M7.6 5.6 5 8l2.6 2.4"/></svg>' +
      '<span class="hme-qlabel">Less</span><kbd class="hme-qkbd">L</kbd>' +
    '</button>' +
    '<button class="hme-qbtn" data-quick="more" title="More [M]">' +
      '<svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.2 8h5.6M7.6 5.6 5 8l2.6 2.4M8.4 5.6 11 8l-2.6 2.4"/></svg>' +
      '<span class="hme-qlabel">More</span><kbd class="hme-qkbd">M</kbd>' +
    '</button>' +
    '<button class="hme-qbtn" data-quick="edit" title="Edit [E]">' +
      '<svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.7 3.4 12.6 6.3 6.6 12.3a.6.6 0 0 1-.25.15l-2.95.77.77-2.95a.6.6 0 0 1 .15-.25z"/></svg>' +
      '<span class="hme-qlabel">Edit</span><kbd class="hme-qkbd">E</kbd>' +
    '</button>' +
    '<button class="hme-qbtn" data-quick="other" title="Other [O]">' +
      '<svg class="hme-qicon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>' +
      '<span class="hme-qlabel">Other</span><kbd class="hme-qkbd">O</kbd>' +
    '</button>' +
    '<button class="hme-qbtn" data-quick="explain" title="Explain [X]">' +
      '<svg class="hme-qicon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2a3.8 3.8 0 0 0-1.5 7.3c.35.15.5.45.5.8v.9a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-.9c0-.35.15-.65.5-.8A3.8 3.8 0 0 0 8 2z"/><path d="M6.8 13h2.4"/></svg>' +
      '<span class="hme-qlabel">Explain</span><kbd class="hme-qkbd">X</kbd>' +
    '</button>' +
    "</div>" +
    '<div class="hme-explain" data-hme-editor hidden>' +
    '<div class="hme-explain-head"><span>Explanation</span><button class="hme-explain-x" aria-label="Close">\u00d7</button></div>' +
    '<div class="hme-explain-body"></div>' +
    "</div>" +
    '<div class="hme-deck" data-hme-editor hidden>' +
    '<button class="hme-deck-prev" aria-label="Previous slide">\u2039</button>' +
    '<span class="hme-deck-pos"></span>' +
    '<button class="hme-deck-next" aria-label="Next slide">\u203a</button>' +
    "</div>" +
    '<div class="hme-pin" data-hme-editor hidden><span class="hme-spin"></span></div>' +
    '<div class="hme-toast" data-hme-editor hidden></div>';
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

  // -------------------------------------------------------------------------
  // DOM helpers (all editor-owned nodes are stripped from any capture)
  // -------------------------------------------------------------------------

  function isEditorNode(el) {
    return !!(el && el.closest && el.closest("[data-hme-editor]"));
  }

  function elementOf(node) {
    return node && node.nodeType === 1 ? node : node && node.parentElement ? node.parentElement : null;
  }

  // Minimal CSS-identifier escaping (replaces CSS.escape, which some browsers lack).
  function esc(name) {
    return String(name).replace(/[^A-Za-z0-9_-]/g, function (ch) {
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
      // Include up to two stable class names so the model can grep the source.
      if (typeof node.className === "string") {
        var classes = node.className.trim().split(/\s+/).filter(Boolean);
        for (var c = 0; c < classes.length && c < 2; c++) sel += "." + esc(classes[c]);
      }
      var parent = node.parentElement;
      if (parent) {
        // Disambiguate whenever more than one sibling shares the tag, not
        // only when this element is not the first of them.
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
    if (!el) return undefined;
    try {
      return el.outerHTML.slice(0, 60000);
    } catch (e) {
      return undefined;
    }
  }

  function rectOf(r) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }

  function lowestCommonAncestor(a, b) {
    var chain = new Set();
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
    // Keep only the "topmost" elements (those not containing another candidate).
    return found.filter(function (el) {
      return !found.some(function (other) {
        return other !== el && other.contains(el);
      });
    });
  }

  // -------------------------------------------------------------------------
  // UI helpers
  // -------------------------------------------------------------------------

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
    popover.style.transform = "none";
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
    generalComment = false;
    quick.hidden = false;
    quick.style.left = Math.max(8, Math.min(x, window.innerWidth - quick.offsetWidth - 8)) + "px";
    quick.style.top = Math.max(8, Math.min(y, window.innerHeight - quick.offsetHeight - 8)) + "px";
  }

  function openGeneralComment() {
    generalComment = true;
    pending = null;
    pendingCaptureEl = null;
    pendingEditOld = "";
    popoverMode = "instruction";
    sendBtn.title = "Send";
    sendBtn.setAttribute("aria-label", "Send");
    textarea.value = "";
    textarea.placeholder = "Comment on the whole document…";
    popover.hidden = false;
    popover.style.left = "50%";
    popover.style.top = "50%";
    popover.style.transform = "translate(-50%, -50%)";
    autoGrow();
    textarea.focus();
    popoverLoc = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 4200);
  }

  function updateHistoryButtons(state) {
    if (!state) return;
    if (undoBtn) undoBtn.disabled = !state.canUndo;
    if (redoBtn) redoBtn.disabled = !state.canRedo;
  }

  function historyAction(kind) {
    fetch("/__" + kind + "?t=" + encodeURIComponent(TOKEN), { method: "POST" })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            if (!res.ok) throw new Error(body && body.error ? body.error : "history action failed");
            return body;
          });
      })
      .then(function (state) {
        updateHistoryButtons(state);
      })
      .catch(function (err) {
        showToast(err && err.message ? err.message : String(err), true);
      });
  }

  function refreshHistory() {
    fetch("/__history?t=" + encodeURIComponent(TOKEN))
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (state) {
        updateHistoryButtons(state);
      })
      .catch(function () {
        /* ignore */
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
    // Marp decks carry their own theme (theme: ... in frontmatter). Don't offer
    // a dark/light toggle here — respect the deck's theme instead.
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
    generalComment = false;
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

  // The agent run finished. If the file changed, "changed" already settled us.
  // Otherwise wait a short grace period for a slow file watcher before giving up.
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
    var graceMs = edited ? 5000 : 1500;
    settleGraceTimer = setTimeout(function () {
      if (!busy) return;
      if (edited) {
        // The file changed but the watcher broadcast was missed: apply directly.
        applySource();
      } else {
        settle();
        showToast(reply ? "Pi didn't change the file. It said: \u201c" + reply.slice(0, 160) + "\u201d" : "Pi didn't change the file.", true);
      }
    }, graceMs);
  }

  function onError(message) {
    if (busy) {
      settle();
      showToast(message || "The agent reported an error.", true);
    }
  }

  // Manual escape hatch: click the spinner to stop waiting.
  function dismissBusy() {
    if (!busy) return;
    settle();
    showToast("Stopped waiting for the agent.", true);
  }

  // -------------------------------------------------------------------------
  // Selection handlers
  // -------------------------------------------------------------------------

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
      pageY: top + window.scrollY,
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
      rect: rect,
      anchorHtml: captureHtml(targetEl),
      selector: cssPath(targetEl) || undefined,
      primaryRect: targetEl ? rectOf(targetEl.getBoundingClientRect()) : undefined,
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
      text: text,
      anchorText: anchorText,
      startOffset: startOffset,
      anchorHtml: captureHtml(el),
      selector: cssPath(el) || undefined,
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
      text: trimmed || undefined,
      anchorText: tc,
      startOffset: trimmed ? lead : -1,
      anchorHtml: captureHtml(el),
      selector: cssPath(el) || undefined,
      primaryRect: rectOf(r),
    };
    pendingCaptureEl = el;
    popoverLoc = { x: r.left, y: r.bottom + 8 };
    openQuick(popoverLoc.x, popoverLoc.y);
  }

  // -------------------------------------------------------------------------
  // Capture + submit
  // -------------------------------------------------------------------------

  function ensureToImage() {
    return new Promise(function (resolve, reject) {
      if (window.htmlToImage) return resolve();
      var s = document.createElement("script");
      s.src = "/__editor/html-to-image.js?t=" + encodeURIComponent(TOKEN);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("rasterizer failed to load"));
      };
      document.head.appendChild(s);
    });
  }

  function captureRegion() {
    var el = pendingCaptureEl;
    if (!el) return Promise.resolve(null);
    var area = (el.scrollWidth || 0) * (el.scrollHeight || 0);
    if (!area || area > 4000000 || el === document.documentElement || el === document.body) {
      return Promise.resolve(null);
    }
    return ensureToImage()
      .then(function () {
        return window.htmlToImage.toPng(el, {
          backgroundColor: "#ffffff",
          pixelRatio: 1,
          cacheBust: false,
        });
      })
      .catch(function () {
        return null;
      });
  }

  function submit(kind) {
    kind = kind || "edit";
    if (!pending && !generalComment) return;
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
      mode: generalComment ? "general" : pending.mode,
      kind: kind,
      instruction: instruction,
      text: generalComment ? null : pending.text,
      rect: generalComment ? null : pending.rect,
      anchorHtml: generalComment ? null : pending.anchorHtml,
      selector: generalComment ? null : pending.selector,
      primaryRect: generalComment ? null : pending.primaryRect,
      slide: generalComment ? -1 : pendingCaptureEl ? slideOf(pendingCaptureEl) : -1,
      slideTotal: generalComment ? 0 : deckSlides.length,
      imageDataUrl: null,
    };

    busy = true;
    closePopover();
    showPin(popoverLoc.x, popoverLoc.y);
    sendBtn.disabled = true;
    clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(function () {
      if (!busy) return;
      settle();
      showToast("Timed out waiting for the agent.", true);
    }, 180000);

    var work = Promise.resolve();
    if (payload.mode === "rect" || payload.mode === "node") {
      work = captureRegion().then(function (dataUrl) {
        payload.imageDataUrl = dataUrl;
      });
    }

    work
      .then(function () {
        return fetch("/__submit?t=" + encodeURIComponent(TOKEN), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error("submit rejected (" + res.status + ")");
        // Keep the pin spinning until the watcher reports a file change.
      })
      .catch(function (err) {
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
    watchdogTimer = setTimeout(function () {
      if (!busy) return;
      settle();
      showToast("Timed out waiting for the file to update.", true);
    }, 15000);

    fetch("/__replace?t=" + encodeURIComponent(TOKEN), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldText: oldText, newText: newText, anchorText: anchorText, startOffset: startOffset, slide: slide }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            if (!res.ok) throw new Error(body && body.error ? body.error : "replace failed");
            return body;
          });
      })
      .catch(function (err) {
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

  // -------------------------------------------------------------------------
  // Refresh (file changed on disk → re-render, preserving the overlay)
  // -------------------------------------------------------------------------

  var applySeq = 0;
  function applySource() {
    var seq = ++applySeq;
    fetch("/__source?t=" + encodeURIComponent(TOKEN))
      .then(function (res) {
        if (!res.ok) throw new Error("source refused (" + res.status + ")");
        return res.text();
      })
      .then(function (raw) {
        if (seq !== applySeq) return; // a newer applySource superseded this one
        var doc = new DOMParser().parseFromString(raw, "text/html");

        // Reconcile <head> while keeping any editor-owned nodes.
        var tags = { link: 1, style: 1, title: 1, meta: 1 };
        var headChildren = Array.prototype.slice.call(document.head.children);
        headChildren.forEach(function (el) {
          if (el.hasAttribute("data-hme-editor")) return;
          if (tags[el.tagName.toLowerCase()]) el.parentNode.removeChild(el);
        });
        Array.prototype.slice.call(doc.head.children).forEach(function (el) {
          if (el.hasAttribute("data-hme-editor")) return;
          document.head.appendChild(el.cloneNode(true));
        });

        // Swap the body, re-attaching the overlay last (innerHTML does not
        // execute scripts, so artifact JS simply resets — as designed).
        var overlay = root;
        document.body.innerHTML = "";
        document.body.innerHTML = doc.body ? doc.body.innerHTML : "";
        document.body.appendChild(overlay);

        settle();
        initDeck();
      })
      .catch(function () {
        /* transient failure; the SSE retry will re-trigger */
      });
  }

  function connect() {
    var es = new EventSource("/__events?t=" + encodeURIComponent(TOKEN));
    es.onmessage = function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === "changed") {
          updateHistoryButtons(msg);
          applySource();
        } else if (msg.type === "settled") onSettled(msg);
        else if (msg.type === "error") onError(msg.message);
      } catch (e) {
        /* ignore */
      }
    };
    es.onerror = function () {
      es.close();
      setTimeout(connect, 3000);
    };
  }

  // -------------------------------------------------------------------------
  // Event wiring
  // -------------------------------------------------------------------------

  // Single place that changes the selection mode and resets transient state.
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
      /* ignore */
    }
  }

  toolbar.addEventListener("click", function (e) {
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
    if (action === "comment") {
      openGeneralComment();
      return;
    }
  });

  // Keyboard shortcuts: T selection mode, B background, Z undo, Y redo.
  document.addEventListener("keydown", function (e) {
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
    } else if (key === "c") {
      openGeneralComment();
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

  // Escape: close any open popup (explain, instruction/edit popover, quick
  // actions) and return to text selection mode.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    explain.hidden = true;
    closePopover();
    hideQuick();
    pending = null;
    pendingCaptureEl = null;
    generalComment = false;
    popoverMode = "instruction";
    setMode("text");
    e.preventDefault();
  });

  // Clicking anywhere outside the quick-action bar dismisses the selection.
  document.addEventListener("pointerdown", function (e) {
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
    var instruction =
      kind === "remove"
        ? isNode
          ? "Remove the selected element."
          : "Remove the selected text."
        : kind === "less"
        ? isNode
          ? "Make the selected element's content shorter."
          : "Say the same thing in a shorter way."
        : isNode
        ? "Make the selected element's content longer and more detailed."
        : "Say the same thing with more detail.";
    textarea.value = instruction;
    submit("edit");
  }

  quick.addEventListener("click", function (e) {
    var b = e.target.closest(".hme-qbtn");
    if (!b) return;
    runQuickAction(b.getAttribute("data-quick"));
  });

  document.addEventListener(
    "pointerdown",
    function (e) {
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

  // Stop images/links from being natively dragged while drawing a region.
  document.addEventListener("dragstart", function (e) {
    if (dragging) e.preventDefault();
  }, true);

  window.addEventListener("pointermove", function (e) {
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

  window.addEventListener("pointerup", function (e) {
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
    function (e) {
      if (mode !== "text") return;
      if (isEditorNode(e.target)) return;
      setTimeout(function () {
        if (mode === "text") finishText();
      }, 10);
    },
    true
  );

  textarea.addEventListener("input", autoGrow);

  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      submit("edit");
    }
  });

  // Node mode: clicking an element selects that element.
  document.addEventListener("click", function (e) {
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

  // Clicking outside the popover dismisses it (replaces the old Cancel button).
  document.addEventListener("pointerdown", function (e) {
    if (popover.hidden) return;
    if (popover.contains(e.target)) return;
    closePopover();
    hideQuick();
    popoverMode = "instruction";
    pending = null;
    pendingCaptureEl = null;
    generalComment = false;
  });

  sendBtn.addEventListener("click", function () {
    submit("edit");
  });

  explainX.addEventListener("click", function () {
    explain.hidden = true;
  });

  deckPrev.addEventListener("click", function () {
    changeSlide(-1);
  });
  deckNext.addEventListener("click", function () {
    changeSlide(1);
  });

  pin.title = "Waiting for the agent — click to stop";
  pin.addEventListener("click", dismissBusy);

  connect();
  refreshHistory();
  initDeck();
})();