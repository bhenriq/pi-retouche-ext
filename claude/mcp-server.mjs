/*
 * retouche (Claude / MCP build)
 *
 * A single MCP server that also hosts the localhost HTTP server + browser
 * overlay. The browser assets (editor.js, marked.umd.js, html-to-image.js)
 * are shared with the pi build and resolved relative to this file.
 *
 * Architecture (MCP-only, no host hooks):
 *   - Tools:
 *       open            start serving an artifact, return the URL
 *       list_artifacts  list editable files under the working directory
 *       next_request    long-poll; returns the next browser selection or a
 *                       direct-edit/undo notice, or {type:"none"} on timeout
 *       notify_browser  push content to the browser (explanations, status)
 *   - The agent keeps calling next_request; each selection is a tool result,
 *     so edits happen in the main conversation context.
 *   - Direct edits / undo / redo are plain browser→HTTP calls and are surfaced
 *     to the agent as notices from next_request.
 */

import { createHash, randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  isMarkdownPath, isMarpFrontmatter, findSourceSpan, locateSelection, slideSourceRegion,
  renderMarkdownDocument, renderMarpPage,
} from "../lib/engine.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const requireAsset = createRequire(import.meta.url);
const marked = requireAsset(join(ROOT, "assets", "marked.umd.js"));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hash = (text) => createHash("sha1").update(text, "utf8").digest("hex");

async function hashFile(path) {
  try {
    return hash(await readFile(path, "utf8"));
  } catch {
    return "";
  }
}

function snippet(text, max = 80) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

const isMarkdown = (p) => isMarkdownPath(p);

const ARTIFACT_EXTS = new Set([".html", ".htm", ".md", ".markdown", ".mdown", ".mkd"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "vendor"]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8",
};
const SERVEABLE = new Set(Object.keys(CONTENT_TYPES));

async function listArtifacts(root, maxDepth = 3) {
  const out = [];
  async function walk(dir, depth) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
      } else if (entry.isFile() && ARTIFACT_EXTS.has(extname(entry.name).toLowerCase())) {
        try {
          const s = await stat(full);
          out.push({ path: full, mtime: s.mtimeMs });
        } catch {}
      }
    }
  }
  await walk(root, 1);
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, 50);
}

// Markdown/Marp rendering is shared with the pi build via lib/render.ts
// (bundled into lib/engine.mjs). renderPage resolves the artifact into the
// HTML the overlay annotates: Marp deck, plain Markdown, or raw HTML.
async function renderPage(filePath, raw) {
  if (isMarkdownPath(filePath)) {
    if (isMarpFrontmatter(raw)) return renderMarpPage(raw, filePath, marked, active.marpCache);
    return renderMarkdownDocument(raw, basename(filePath), marked);
  }
  return raw;
}

function injectEditor(html, token, md) {
  const tag = `<script src="/__editor/editor.js?t=${token}${md ? "&md=1" : ""}" data-hme-editor></script>`;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx !== -1) return html.slice(0, idx) + tag + html.slice(idx);
  return html + tag;
}

// findSourceSpan / locateSelection / slideSourceRegion are shared with the
// pi build (lib/matching.ts, bundled into lib/engine.mjs).

// ---------------------------------------------------------------------------
// Artifact server (shared with the pi build in spirit)
// ---------------------------------------------------------------------------

let active = null;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function broadcast(data) {
  if (!active) return;
  for (const res of active.clients) {
    try { res.write(data); } catch { active.clients.delete(res); }
  }
}

function tokenOk(req) {
  const u = new URL(req.url ?? "/", "http://127.0.0.1");
  const q = u.searchParams.get("t");
  const c = /(?:^|;\s*)hme_token=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  return q === active?.token || c === active?.token;
}

function resolveStatic(pathname) {
  if (!active) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes("\0")) return null;
  const target = resolve(active.dir, "." + decoded);
  if (target !== active.dir && !target.startsWith(active.dir + sep)) return null;
  if (!SERVEABLE.has(extname(target).toLowerCase())) return null;
  return target;
}

function enqueueSubmit(item) {
  if (waiters.length) {
    const w = waiters.shift();
    w(item);
  } else {
    queue.push(item);
  }
}

async function handleHttp(req, res) {
  if (!tokenOk(req)) return sendJson(res, 403, { error: "forbidden" });
  const u = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = u.pathname;
  const artifactPath = "/" + encodeURIComponent(basename(active.path));

  if ((pathname === "/" || pathname === artifactPath) && req.method === "GET") {
    const raw = await readFile(active.path, "utf8").catch(() => null);
    if (raw === null) return sendJson(res, 404, { error: "artifact unavailable" });
    res.setHeader("Set-Cookie", `hme_token=${active.token}; HttpOnly; SameSite=Lax; Path=/`);
    // Keep the token out of the address bar once the cookie is set.
    if (u.searchParams.has("t")) {
      res.writeHead(302, { Location: artifactPath });
      res.end();
      return;
    }
    const page = await renderPage(active.path, raw);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(injectEditor(page, active.token, active.markdown));
  }

  if (pathname === "/__source" && req.method === "GET") {
    const raw = await readFile(active.path, "utf8").catch(() => null);
    if (raw === null) return sendJson(res, 404, { error: "artifact unavailable" });
    const page = await renderPage(active.path, raw);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(page);
  }

  if (pathname === "/__editor/editor.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(await readFile(join(ROOT, "dist", "editor.js"), "utf8"));
  }

  if (pathname === "/__editor/html-to-image.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(await readFile(join(ROOT, "assets", "html-to-image.js"), "utf8"));
  }

  if (pathname === "/__events" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write("retry: 3000\n\n");
    active.clients.add(res);
    req.on("close", () => active.clients.delete(res));
    return;
  }

  if (pathname === "/__history" && req.method === "GET") {
    return sendJson(res, 200, { canUndo: active.vIndex > 0, canRedo: active.vIndex < active.versions.length - 1 });
  }

  if ((pathname === "/__undo" || pathname === "/__redo") && req.method === "POST") {
    const step = pathname === "/__undo" ? -1 : 1;
    const next = active.vIndex + step;
    if (next < 0 || next >= active.versions.length) return sendJson(res, 409, { error: step < 0 ? "nothing to undo" : "nothing to redo" });
    active.vIndex = next;
    const content = active.versions[next];
    await writeFile(active.path, content, "utf8");
    active.rawHash = hash(content);
    broadcast(`data: ${JSON.stringify({ type: "changed", canUndo: active.vIndex > 0, canRedo: active.vIndex < active.versions.length - 1 })}\n\n`);
    enqueueSubmit({ type: "notice", message: `User ${step < 0 ? "undid" : "redid"} a change to ${basename(active.path)} in the visual editor.` });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/__replace" && req.method === "POST") {
    const raw = await readBody(req, 4 * 1024 * 1024);
    let body;
    try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "invalid json" }); }
    const oldText = typeof body.oldText === "string" ? body.oldText : "";
    const newText = typeof body.newText === "string" ? body.newText : "";
    const anchorText = typeof body.anchorText === "string" ? body.anchorText : "";
    const startOffset = typeof body.startOffset === "number" ? body.startOffset : -1;
    const slide = typeof body.slide === "number" ? body.slide : -1;
    if (!oldText) return sendJson(res, 400, { error: "oldText required" });
    let content;
    try { content = await readFile(active.path, "utf8"); } catch { return sendJson(res, 404, { error: "artifact unavailable" }); }

    // Prefer the slide-scoped match (e.g. a slide title that also appears as a
    // prefix of a frontmatter header), falling back to the whole file.
    let search = content;
    let offset = 0;
    if (slide >= 0) {
      const region = slideSourceRegion(content, slide);
      if (region) { search = content.slice(region.start, region.end); offset = region.start; }
    }
    let span = locateSelection(search, oldText, anchorText, startOffset);
    if (!span && offset !== 0) {
      search = content;
      offset = 0;
      span = locateSelection(search, oldText, anchorText, startOffset);
    }
    if (!span) return sendJson(res, 409, { error: "selected text wasn't found in the source; use a free instruction instead" });
    const absStart = span.start + offset;
    const absEnd = span.end + offset;
    const updated = content.slice(0, absStart) + newText + content.slice(absEnd);
    try { await writeFile(active.path, updated, "utf8"); } catch (err) { return sendJson(res, 500, { error: String(err?.message || err) }); }
    enqueueSubmit({ type: "notice", message: `User applied a direct edit to ${basename(active.path)} (no AI): "${snippet(oldText)}" → "${snippet(newText)}".` });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/__submit" && req.method === "POST") {
    const raw = await readBody(req, 20 * 1024 * 1024);
    let body;
    try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "invalid json" }); }
    if (typeof body.instruction !== "string" || !body.instruction.trim()) return sendJson(res, 400, { error: "instruction required" });
    const item = {
      type: body.mode === "rect" ? "rect" : "text",
      kind: body.kind === "explain" ? "explain" : "edit",
      instruction: body.instruction,
      text: body.text,
      selector: body.selector,
      anchorHtml: body.anchorHtml,
      rect: body.rect,
      slide: typeof body.slide === "number" ? body.slide : -1,
      slideTotal: typeof body.slideTotal === "number" ? body.slideTotal : 0,
    };
    enqueueSubmit(item);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET") {
    const target = resolveStatic(pathname);
    if (target) {
      const data = await readFile(target).catch(() => null);
      if (data) {
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
        return res.end(data);
      }
    }
  }

  return sendJson(res, 404, { error: "not found" });
}

async function startArtifact(filePath) {
  await stopActive();
  const fullPath = resolve(process.cwd(), filePath);
  const fileStat = await stat(fullPath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) throw new Error(`Not a file: ${fullPath}`);

  const dir = dirname(fullPath);
  const token = randomBytes(24).toString("hex");
  const clients = new Set();
  const server = createServer((req, res) => {
    handleHttp(req, res).catch((err) => sendJson(res, 500, { error: String(err?.message || err) }));
  });
  await new Promise((ok, bad) => {
    server.once("error", bad);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  if (typeof address !== "object" || !address) { server.close(); throw new Error("bind failed"); }
  const port = address.port;

  let initial = "";
  try { initial = await readFile(fullPath, "utf8"); } catch {}

  active = {
    path: fullPath, dir, token, port, server, clients,
    rawHash: hash(initial), versions: [initial], vIndex: 0,
    markdown: isMarkdown(fullPath),
    marpCache: {},
    keepalive: setInterval(() => broadcast(": ping\n\n"), 25000),
  };

  let debounce = null;
  watchFile(fullPath, { interval: 250 }, () => {
    if (debounce) return;
    debounce = setTimeout(async () => {
      debounce = null;
      try {
        const content = await readFile(fullPath, "utf8");
        const nextHash = hash(content);
        if (nextHash !== active.rawHash) {
          active.rawHash = nextHash;
          if (content !== active.versions[active.vIndex]) {
            active.versions = active.versions.slice(0, active.vIndex + 1);
            active.versions.push(content);
            active.vIndex = active.versions.length - 1;
          }
          broadcast(`data: ${JSON.stringify({ type: "changed", canUndo: active.vIndex > 0, canRedo: active.vIndex < active.versions.length - 1 })}\n\n`);
        }
      } catch {}
    }, 150);
  });

  const url = `http://127.0.0.1:${port}/${encodeURIComponent(basename(fullPath))}?t=${token}`;
  if (!process.env.HME_NO_BROWSER) {
    const cmd = process.platform === "darwin" ? `open ${JSON.stringify(url)}` : process.platform === "win32" ? `start "" ${JSON.stringify(url)}` : `xdg-open ${JSON.stringify(url)}`;
    exec(cmd, () => {});
  }
  return url;
}

async function stopActive() {
  const cur = active;
  active = null;
  if (!cur) return;
  unwatchFile(cur.path);
  clearInterval(cur.keepalive);
  for (const res of cur.clients) { try { res.end(); } catch {} }
  cur.clients.clear();
  await new Promise((ok) => {
    cur.server.close(ok);
    setTimeout(() => { cur.server.closeAllConnections?.(); ok(); }, 500);
  });
}

// ---------------------------------------------------------------------------
// MCP surface
// ---------------------------------------------------------------------------

let queue = [];
let waiters = [];

function dequeue(timeoutMs) {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(done);
      if (i >= 0) waiters.splice(i, 1);
      resolve({ type: "none" });
    }, timeoutMs);
    function done(item) {
      clearTimeout(timer);
      resolve(item);
    }
    waiters.push(done);
  });
}

function notifyBrowser(content) {
  const replyHtml = marked.parse(content, { gfm: true, breaks: false });
  broadcast(`data: ${JSON.stringify({ type: "settled", kind: "explain", edited: false, reply: content, replyHtml })}\n\n`);
}

const server = new McpServer({ name: "retouche", version: "1.0.0" });

server.registerTool(
  "open",
  {
    title: "Open an artifact in the visual editor",
    description: "Serve an HTML or Markdown file locally and open it in the browser with the selection overlay. Returns the browser URL.",
    inputSchema: z.object({ path: z.string().describe("Relative or absolute path to the .html or .md file") }),
  },
  async (args) => {
    const url = await startArtifact(args.path);
    return { content: [{ type: "text", text: JSON.stringify({ url }) }] };
  },
);

server.registerTool(
  "list_artifacts",
  {
    title: "List editable artifacts",
    description: "List HTML and Markdown files under the current working directory, most recently modified first.",
    inputSchema: z.object({}),
  },
  async () => {
    const files = await listArtifacts(process.cwd());
    return { content: [{ type: "text", text: JSON.stringify(files.map((f) => f.path)) }] };
  },
);

server.registerTool(
  "next_request",
  {
    title: "Wait for the next visual-edit request",
    description: "Block until the user makes a selection in the browser (or reports a direct edit/undo). Returns an object with type: 'text', 'rect', 'notice', or 'none'. For 'explain' requests, call notify_browser with the explanation.",
    inputSchema: z.object({ timeout_seconds: z.number().int().min(1).max(300).optional() }),
  },
  async (args) => {
    const timeout = (args.timeout_seconds ?? 30) * 1000;
    const item = await dequeue(timeout);
    return { content: [{ type: "text", text: JSON.stringify(item) }] };
  },
);

server.registerTool(
  "notify_browser",
  {
    title: "Send content to the browser",
    description: "Push an explanation or status message to the visual editor, shown in a popup rendered from Markdown.",
    inputSchema: z.object({ content: z.string().describe("Markdown content to display") }),
  },
  async (args) => {
    notifyBrowser(args.content);
    return { content: [{ type: "text", text: "sent" }] };
  },
);

try {
  await server.connect(new StdioServerTransport());
} catch (err) {
  console.error("retouche mcp failed to start:", err);
  process.exit(1);
}