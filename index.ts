/**
 * html-editor — visual editing for local HTML artifacts from the browser.
 *
 * Usage: /edit path/to/file.html
 *
 * Starts a localhost-only server that serves the file with an annotation
 * overlay. Draw a region or select text, attach an instruction, and it is
 * sent back into the live pi session as a user message (queued as follow-up
 * while the agent is busy). The file on disk is the single source of truth;
 * the browser re-renders whenever the watcher sees the file change.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile, writeFile, stat, readdir, mkdtemp, rm } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep, extname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { isMarkdownPath, isMarpFrontmatter, findSourceSpan, locateSelection } from "./lib/matching";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, "assets");
const requireAsset = createRequire(import.meta.url);



const ARTIFACT_EXTS = new Set([".html", ".htm", ".md", ".markdown", ".mdown", ".mkd"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "vendor"]);

async function listArtifacts(root: string, maxDepth = 3): Promise<{ path: string; mtime: number }[]> {
  const out: { path: string; mtime: number }[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
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
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  await walk(root, 1);
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, 50);
}

function timeAgo(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

type MarkedLib = { parse: (src: string, opts?: Record<string, unknown>) => string };
let markedLib: MarkedLib | null = null;
function getMarked(): MarkedLib {
  if (!markedLib) markedLib = requireAsset(join(ASSET_DIR, "marked.umd.js")) as MarkedLib;
  return markedLib;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SendPart = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

interface SubmitBody {
  mode: "rect" | "text" | "node";
  kind?: "edit" | "explain";
  slide?: number;
  slideTotal?: number;
  instruction: string;
  text?: string;
  rect?: { x: number; y: number; width: number; height: number; pageX: number; pageY: number };
  anchorHtml?: string;
  selector?: string;
  primaryRect?: { x: number; y: number; width: number; height: number };
  imageDataUrl?: string | null;
}

interface Artifact {
  path: string;
  dir: string;
  token: string;
  port: number;
  server: Server;
  rawHash: string;
  markdown: boolean;
  marpCache?: { hash: string; page: string };
  versions: string[];
  vIndex: number;
  clients: Set<ServerResponse>;
  keepalive: NodeJS.Timeout;
  shutdown: () => void;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// Only serve extensions that an HTML page plausibly references. Deliberately
// excludes dotfiles, source-env files, archives, etc. as a mild localhost guard.
const SERVEABLE_EXTENSIONS = new Set(Object.keys(CONTENT_TYPES));

let active: Artifact | null = null;

// Annotations submitted from the browser, plus the artifact hash at submit
// time. Used to correlate agent_settled events with browser-originated work
// and to detect whether the agent actually changed the file.
let pendingSubmits: { snapshotHash: string; kind: "edit" | "explain" }[] = [];

// Last assistant text is accumulated so the browser can show a short
// explanation when the agent finishes without changing the file.
let lastAssistantText = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

async function hashFile(path: string): Promise<string> {
  try {
    return hash(await readFile(path, "utf8"));
  } catch {
    return "";
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function snippet(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// Record an editor-side change in the pi session so it stays in context
// (without triggering a turn). Used for direct edits/undo/redo that bypass the agent.
function notifySession(content: string): void {
  try {
    piRef?.sendMessage({ customType: "html-editor", content, display: true });
  } catch {
    /* session unavailable; ignore */
  }
}

function readBody(req: IncomingMessage, limitBytes: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function tokenOk(req: IncomingMessage, artifact: Artifact): boolean {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const fromQuery = url.searchParams.get("t");
  const cookieHeader = req.headers.cookie ?? "";
  const fromCookie = /(?:^|;\s*)hme_token=([^;]+)/.exec(cookieHeader)?.[1];
  return fromQuery === artifact.token || fromCookie === artifact.token;
}

function resolveStatic(artifact: Artifact, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const target = resolve(artifact.dir, "." + decoded);
  if (target !== artifact.dir && !target.startsWith(artifact.dir + sep)) return null;
  const ext = extname(target).toLowerCase();
  if (!SERVEABLE_EXTENSIONS.has(ext)) return null;
  return target;
}

function injectEditor(html: string, token: string, markdown: boolean): string {
  const tag = `<script src="/__editor/editor.js?t=${token}${markdown ? "&md=1" : ""}" data-hme-editor></script>`;
  const closeIdx = html.toLowerCase().lastIndexOf("</body>");
  if (closeIdx !== -1) return html.slice(0, closeIdx) + tag + html.slice(closeIdx);
  return html + tag;
}

const MARKDOWN_STYLE = `
    :root {
      --md-bg: #f9fafb; --md-fg: #111827; --md-border: #e5e7eb;
      --md-link: #4f46e5; --md-code-bg: #eef2ff; --md-code-fg: inherit;
      --md-pre-bg: #111827; --md-pre-fg: #e5e7eb;
      --md-quote-bg: #eef2ff66; --md-quote-border: #c7d2fe; --md-quote-fg: #4b5563;
      --md-th-bg: #f3f4f6; color-scheme: light;
    }
    :root[data-hme-theme="dark"] {
      --md-bg: #000000; --md-fg: #e5e7eb; --md-border: #262626;
      --md-link: #818cf8; --md-code-bg: #1a1a1a; --md-code-fg: #e5e7eb;
      --md-pre-bg: #0a0a0a; --md-pre-fg: #e5e7eb;
      --md-quote-bg: #111111; --md-quote-border: #404040; --md-quote-fg: #cbd5e1;
      --md-th-bg: #1a1a1a; color-scheme: dark;
    }
    body { margin: 0; background: var(--md-bg); color: var(--md-fg);
      font: 16px/1.7 -apple-system, Segoe UI, Roboto, sans-serif; padding: 48px 24px;
      transition: background .15s, color .15s; }
    .md-root { max-width: 760px; margin: 0 auto; }
    .md-root > :first-child { margin-top: 0; }
    .md-root h1, .md-root h2, .md-root h3 { line-height: 1.25; margin: 1.8em 0 .6em; }
    .md-root h1 { font-size: 2em; border-bottom: 1px solid var(--md-border); padding-bottom: .3em; }
    .md-root h2 { font-size: 1.5em; border-bottom: 1px solid var(--md-border); padding-bottom: .3em; }
    .md-root h3 { font-size: 1.2em; }
    .md-root p, .md-root ul, .md-root ol, .md-root blockquote, .md-root pre, .md-root table { margin: 0 0 1em; }
    .md-root a { color: var(--md-link); }
    .md-root code { background: var(--md-code-bg); color: var(--md-code-fg); border-radius: 4px; padding: .15em .35em;
      font: .9em/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .md-root pre { background: var(--md-pre-bg); color: var(--md-pre-fg); border-radius: 10px; padding: 14px 16px; overflow: auto; }
    .md-root pre code { background: none; padding: 0; color: inherit; }
    .md-root blockquote { margin-left: 0; padding: .2em 1em; border-left: 4px solid var(--md-quote-border);
      color: var(--md-quote-fg); background: var(--md-quote-bg); border-radius: 0 8px 8px 0; }
    .md-root ul, .md-root ol { padding-left: 1.6em; }
    .md-root li { margin: .25em 0; }
    .md-root hr { border: 0; border-top: 1px solid var(--md-border); margin: 2em 0; }
    .md-root img { max-width: 100%; border-radius: 8px; }
    .md-root table { border-collapse: collapse; width: 100%; }
    .md-root th, .md-root td { border: 1px solid var(--md-border); padding: 6px 10px; text-align: left; }
    .md-root th { background: var(--md-th-bg); }
  `;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function renderMarkdownDocument(raw: string, title: string): string {
  const body = getMarked().parse(raw, { gfm: true, breaks: false });
  return `<!doctype html>
<html lang="en" data-hme-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${MARKDOWN_STYLE}</style>
</head>
<body>
  <main class="md-root">${body}</main>
</body>
</html>`;
}

const execFileAsync = promisify(execFile);



function buildMarpDocument(cliHtml: string, title: string): string {
  const withoutScripts = cliHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(withoutScripts);
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(withoutScripts);
  const styles = head ? head[1].match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [] : [];
  const slides = bodyMatch ? bodyMatch[1] : withoutScripts;
  return `<!doctype html>
<html lang="en" data-hme-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${styles.join("\n")}
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
    body { overflow: hidden !important; scroll-snap-type: none !important; }
    svg[data-marpit-svg] { display: none !important; width: 100% !important; height: 100% !important; }
    svg[data-marpit-svg].hme-slide-active { display: block !important; }
  </style>
</head>
<body>
${slides}
</body>
</html>`;
}

async function renderMarpPage(raw: string, filePath: string): Promise<string> {
  const key = hash(raw);
  if (active?.marpCache && active.marpCache.hash === key) return active.marpCache.page;
  const tmp = await mkdtemp(join(tmpdir(), "hme-marp-"));
  const out = join(tmp, "out.html");
  try {
    await execFileAsync("marp", [filePath, "--template", "bare", "--allow-local-files", "--no-stdin", "--output", out], { timeout: 30000 });
    const cliHtml = await readFile(out, "utf8");
    const page = buildMarpDocument(cliHtml, basename(filePath));
    if (active) active.marpCache = { hash: key, page };
    return page;
  } catch {
    // Marp CLI unavailable or failed: fall back to plain Markdown rendering.
    const fallback = renderMarkdownDocument(raw, basename(filePath));
    if (active) active.marpCache = { hash: key, page: fallback };
    return fallback;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function openBrowser(url: string): void {
  if (process.env.HME_NO_BROWSER) return;
  const platform = process.platform;
  const command = platform === "darwin" ? `open ${JSON.stringify(url)}` : platform === "win32" ? `start "" ${JSON.stringify(url)}` : `xdg-open ${JSON.stringify(url)}`;
  exec(command, () => {
    /* best effort; failures are not fatal */
  });
}

function buildPrompt(artifact: Artifact, body: SubmitBody): SendPart[] {
  const filename = basename(artifact.path);
  const isMd = isMarkdownPath(artifact.path);
  const lines: string[] = [];

  lines.push(
    `Visual edit request for the ${isMd ? "Markdown" : "HTML"} artifact "${filename}" at ${artifact.path}.`,
    `Implement the change by editing that file directly with your normal edit tools.`,
    `Keep prose minimal: the edited document itself is the deliverable.`,
  );

  if (body.mode === "rect") {
    lines.push(
      "",
      "Mode: region (rectangular area).",
      body.rect
        ? `Selection rectangle (page coords): x=${Math.round(body.rect.pageX)} y=${Math.round(body.rect.pageY)} width=${Math.round(body.rect.width)} height=${Math.round(body.rect.height)}`
        : "Selection rectangle: (not provided)",
    );
    if (body.primaryRect) {
      lines.push(
        `Primary matched element bounds: x=${Math.round(body.primaryRect.x)} y=${Math.round(body.primaryRect.y)} width=${Math.round(body.primaryRect.width)} height=${Math.round(body.primaryRect.height)}`,
      );
    }
  } else if (body.mode === "node") {
    lines.push("", "Mode: element (HTML node) selection.");
    if (body.primaryRect) {
      lines.push(
        `Element bounds: x=${Math.round(body.primaryRect.x)} y=${Math.round(body.primaryRect.y)} width=${Math.round(body.primaryRect.width)} height=${Math.round(body.primaryRect.height)}`,
      );
    }
  } else {
    lines.push("", "Mode: text selection.");
    lines.push("Selected text:", "```text", (body.text ?? "").slice(0, 8000), "```");
  }

  if (typeof body.slide === "number" && body.slide >= 0) {
    const total = typeof body.slideTotal === "number" && body.slideTotal > 0 ? ` of ${body.slideTotal}` : "";
    lines.push("", `Slide: ${body.slide + 1}${total}.`);
  }

  if (isMd) {
    lines.push(
      "",
      "Note: this is a Markdown file. The browser shows HTML rendered from it, so edit the Markdown source — the selected text may be split across Markdown syntax.",
    );
  }

  if (body.selector) {
    lines.push("", `Anchor element CSS selector: ${body.selector}`);
  }
  if (body.anchorHtml) {
    lines.push(
      "",
      "Anchor element markup (from the live document, editor nodes stripped):",
      "```html",
      body.anchorHtml.slice(0, 60000),
      "```",
    );
  }

  lines.push("", `Instruction: ${body.instruction.trim() || "(none given)"}`);
  if (body.kind === "explain") {
    lines.push(
      "",
      "Do not modify the file. Reply with a concise explanation of the selected content; your reply is shown to the user in a popup.",
    );
  } else {
    lines.push(
      "",
      "Apply the requested change now by editing the file with your edit/write tools. " +
        "Do not paste the revised content into chat; a change to the file is the only way your work reaches the page.",
    );
  }

  const parts: SendPart[] = [{ type: "text", text: lines.join("\n") }];

  if (body.imageDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(body.imageDataUrl);
    if (match) {
      parts.push({ type: "image", data: match[2], mimeType: match[1] });
    }
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

async function startServer(filePath: string, ctx: ExtensionCommandContext): Promise<void> {
  await stopServer();

  const fullPath = resolve(ctx.cwd, filePath);
  const fileStat = await stat(fullPath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) {
    throw new Error(`Not a file: ${fullPath}`);
  }

  const dir = dirname(fullPath);
  const token = randomBytes(24).toString("hex");
  const clients = new Set<ServerResponse>();

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, { path: fullPath, dir, token } as Artifact, clients);
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (typeof address !== "object" || !address) {
    server.close();
    throw new Error("Failed to bind local server");
  }
  const port = address.port;

  // Cold read establishes the hash and the first version so the first
  // watchFile fire is not a "change".
  let initialContent = "";
  try {
    initialContent = await readFile(fullPath, "utf8");
  } catch {
    initialContent = "";
  }
  const rawHash = hash(initialContent);

  const artifact: Artifact = {
    path: fullPath,
    dir,
    token,
    port,
    server,
    rawHash,
    markdown: isMarkdownPath(fullPath),
    versions: [initialContent],
    vIndex: 0,
    clients,
    keepalive: setInterval(() => broadcast(clients, ": ping\n\n"), 25000),
    shutdown: () => stopServer(),
  };
  active = artifact;

  let debounce: NodeJS.Timeout | null = null;
  watchFile(fullPath, { interval: 250 }, async () => {
    if (debounce) return;
    debounce = setTimeout(async () => {
      debounce = null;
      try {
        const content = await readFile(fullPath, "utf8");
        const art = active;
        if (!art) return;
        const nextHash = hash(content);
        if (nextHash !== art.rawHash) {
          art.rawHash = nextHash;
          if (content !== art.versions[art.vIndex]) {
            art.versions = art.versions.slice(0, art.vIndex + 1);
            art.versions.push(content);
            art.vIndex = art.versions.length - 1;
          }
          broadcastChanged(art, clients);
        }
      } catch {
        /* file temporarily unreadable; ignore */
      }
    }, 150);
  });

  const url = `http://127.0.0.1:${port}/${encodeURIComponent(basename(fullPath))}?t=${token}`;
  openBrowser(url);
  ctx.ui.notify(`html-editor: editing ${basename(fullPath)} — ${url}`, "info");
}

function broadcast(clients: Set<ServerResponse>, data: string): void {
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
}

function historyState(art: Artifact): { canUndo: boolean; canRedo: boolean; index: number; length: number } {
  return {
    canUndo: art.vIndex > 0,
    canRedo: art.vIndex < art.versions.length - 1,
    index: art.vIndex,
    length: art.versions.length,
  };
}

function broadcastChanged(art: Artifact, clients: Set<ServerResponse>): void {
  broadcast(clients, `data: ${JSON.stringify({ type: "changed", ...historyState(art) })}\n\n`);
}

async function stopServer(): Promise<void> {
  const current = active;
  if (!current) return;
  active = null;

  unwatchFile(current.path);

  for (const res of current.clients) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  current.clients.clear();
  clearInterval(current.keepalive);

  await new Promise<void>((resolveClose) => {
    current.server.close(() => resolveClose());
    // Force-close lingering keep-alive sockets after a grace period.
    setTimeout(() => {
      (current.server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      resolveClose();
    }, 500);
  });
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  artifact: Artifact,
  clients: Set<ServerResponse>,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;
  const artifactPath = "/" + encodeURIComponent(basename(artifact.path));

  // Every route requires the token: the document root is opened with it in
  // the query string and sets a cookie so that same-origin asset requests
  // (which carry the cookie but no query token) still pass.
  if (!tokenOk(req, artifact)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  // Root: serve the artifact with the editor injected. Also served at
  // /<filename> so the URL shows which file is being edited.
  if ((pathname === "/" || pathname === artifactPath) && req.method === "GET") {
    const raw = await readFile(artifact.path, "utf8").catch(() => null);
    if (raw === null) {
      sendJson(res, 404, { error: "artifact unavailable" });
      return;
    }
    res.setHeader("Set-Cookie", `hme_token=${artifact.token}; HttpOnly; SameSite=Lax; Path=/`);
    // Keep the access token out of the address bar: once the cookie is set,
    // redirect the tokenized URL to the clean /<filename> URL.
    if (url.searchParams.has("t")) {
      res.writeHead(302, { Location: artifactPath });
      res.end();
      return;
    }
    const isMd = isMarkdownPath(artifact.path);
    const page =
      isMd && isMarpFrontmatter(raw)
        ? await renderMarpPage(raw, artifact.path)
        : isMd
        ? renderMarkdownDocument(raw, basename(artifact.path))
        : raw;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectEditor(page, artifact.token, isMd));
    return;
  }

  // Raw artifact source (no injection) — used by the client on refresh.
  if (pathname === "/__source" && req.method === "GET") {
    const raw = await readFile(artifact.path, "utf8").catch(() => null);
    if (raw === null) {
      sendJson(res, 404, { error: "artifact unavailable" });
      return;
    }
    const isMd = isMarkdownPath(artifact.path);
    const page =
      isMd && isMarpFrontmatter(raw)
        ? await renderMarpPage(raw, artifact.path)
        : isMd
        ? renderMarkdownDocument(raw, basename(artifact.path))
        : raw;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }

  // Version history: real file-level undo/redo. The file on disk stays the
  // single source of truth; every external change is pushed as a version.
  if (pathname === "/__history" && req.method === "GET") {
    sendJson(res, 200, active ? historyState(active) : { canUndo: false, canRedo: false, index: 0, length: 1 });
    return;
  }

  if ((pathname === "/__undo" || pathname === "/__redo") && req.method === "POST") {
    const art = active;
    if (!art) {
      sendJson(res, 503, { error: "editor unavailable" });
      return;
    }
    const step = pathname === "/__undo" ? -1 : 1;
    const next = art.vIndex + step;
    if (next < 0 || next >= art.versions.length) {
      sendJson(res, 409, { error: step < 0 ? "nothing to undo" : "nothing to redo" });
      return;
    }
    art.vIndex = next;
    const content = art.versions[next];
    try {
      await writeFile(art.path, content, "utf8");
    } catch (err) {
      art.vIndex -= step;
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    art.rawHash = hash(content);
    broadcastChanged(art, clients);
    notifySession(
      step < 0
        ? `User undid a change to ${basename(art.path)} in the visual editor.`
        : `User redid a change to ${basename(art.path)} in the visual editor.`,
    );
    sendJson(res, 200, historyState(art));
    return;
  }

  // Direct text replacement (the "Edit" quick action) — no agent involved.
  // Finds the selected text verbatim in the source and swaps it for the user's
  // new text. The file watcher records the version and broadcasts the change.
  if (pathname === "/__replace" && req.method === "POST") {
    const rawBody = await readBody(req, 4 * 1024 * 1024);
    let body: { oldText?: unknown; newText?: unknown; anchorText?: unknown; startOffset?: unknown };
    try {
      body = JSON.parse(rawBody) as { oldText?: unknown; newText?: unknown; anchorText?: unknown; startOffset?: unknown };
    } catch {
      sendJson(res, 400, { error: "invalid json" });
      return;
    }
    const oldText = typeof body.oldText === "string" ? body.oldText : "";
    const newText = typeof body.newText === "string" ? body.newText : "";
    const anchorText = typeof body.anchorText === "string" ? body.anchorText : "";
    const startOffset = typeof body.startOffset === "number" ? body.startOffset : -1;
    if (!oldText) {
      sendJson(res, 400, { error: "oldText required" });
      return;
    }
    const targetPath = active?.path ?? artifact.path;
    let content: string;
    try {
      content = await readFile(targetPath, "utf8");
    } catch {
      sendJson(res, 404, { error: "artifact unavailable" });
      return;
    }
    const span = locateSelection(content, oldText, anchorText, startOffset);
    if (!span) {
      sendJson(res, 409, { error: "selected text wasn't found in the source; use Other to instruct the agent" });
      return;
    }
    const updated = content.slice(0, span.start) + newText + content.slice(span.end);
    try {
      await writeFile(targetPath, updated, "utf8");
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    notifySession(
      `User applied a direct edit to ${basename(targetPath)} in the visual editor (no AI): "${snippet(oldText)}" → "${snippet(newText)}".`,
    );
    sendJson(res, 200, { ok: true });
    return;
  }

  // Editor client script.
  if (pathname === "/__editor/editor.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    res.end(await readFile(join(__dirname, "dist", "editor.js"), "utf8"));
    return;
  }

  // Vendored rasterizer.
  if (pathname === "/__editor/html-to-image.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    res.end(await readFile(join(ASSET_DIR, "html-to-image.js"), "utf8"));
    return;
  }

  // Server-sent events for file-change notifications.
  if (pathname === "/__events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // Annotation submissions.
  if (pathname === "/__submit" && req.method === "POST") {
    const raw = await readBody(req, 20 * 1024 * 1024);
    let body: SubmitBody;
    try {
      body = JSON.parse(raw) as SubmitBody;
    } catch {
      sendJson(res, 400, { error: "invalid json" });
      return;
    }
    if (typeof body.instruction !== "string" || !body.instruction.trim()) {
      sendJson(res, 400, { error: "instruction required" });
      return;
    }
    if (body.mode !== "rect" && body.mode !== "text" && body.mode !== "node") {
      sendJson(res, 400, { error: "invalid mode" });
      return;
    }

    if (!piRef) {
      sendJson(res, 503, { error: "session unavailable" });
      return;
    }
    try {
      // deliverAs followUp: runs immediately when idle, queues when busy.
      // NOTE: pi.sendUserMessage() returns void (fire-and-forget); errors are
      // surfaced by pi itself as extension errors. The agent_settled handler
      // below is what tells the browser whether an edit actually happened.
      const snapshotHash = await hashFile(artifact.path);
      piRef.sendUserMessage(buildPrompt(artifact, body), { deliverAs: "followUp" });
      pendingSubmits.push({ snapshotHash, kind: body.kind === "explain" ? "explain" : "edit" });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Static sibling assets referenced by the artifact.
  if (req.method === "GET") {
    const target = resolveStatic(artifact, pathname);
    if (target) {
      const data = await readFile(target).catch(() => null);
      if (data) {
        res.writeHead(200, {
          "Content-Type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        res.end(data);
        return;
      }
    }
    sendJson(res, 404, { error: "not found" });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

let piRef: ExtensionAPI | null = null;

export default function (pi: ExtensionAPI) {
  piRef = pi;

  // agent_settled fires only once all automatic work (including queued
  // follow-ups) is done, so it is the reliable "the agent is done" signal.
  pi.on("agent_start", () => {
    lastAssistantText = "";
  });
  pi.on("message_update", (event) => {
    if (event.assistantMessageEvent?.type === "text_delta" && lastAssistantText.length < 6000) {
      lastAssistantText += event.assistantMessageEvent.delta || "";
    }
  });
  pi.on("agent_settled", async () => {
    if (pendingSubmits.length === 0) return;
    const pending = pendingSubmits.shift();
    if (!active || !pending) return;
    const currentHash = await hashFile(active.path);
    const edited = currentHash !== "" && currentHash !== pending.snapshotHash;
    const reply = lastAssistantText.slice(0, pending.kind === "explain" ? 6000 : 400);
    const payload = JSON.stringify({
      type: "settled",
      kind: pending.kind,
      edited,
      reply,
      replyHtml: pending.kind === "explain" ? getMarked().parse(reply, { gfm: true, breaks: false }) : undefined,
    });
    broadcast(active.clients, `data: ${payload}\n\n`);
  });

  pi.registerCommand("edit", {
    description: "Open an HTML or Markdown file in the browser for visual, agent-driven editing",
    handler: async (args, ctx) => {
      let target = args.trim();
      if (!target) {
        const files = await listArtifacts(ctx.cwd).catch(() => [] as { path: string; mtime: number }[]);
        if (files.length === 0) {
          ctx.ui.notify(`No HTML or Markdown artifacts found under ${ctx.cwd}`, "warning");
          return;
        }
        const labels = files.map((f) => `${relative(ctx.cwd, f.path) || basename(f.path)}  ·  ${timeAgo(f.mtime)}`);
        const choice = await ctx.ui.select("Pick an artifact to edit", labels);
        if (!choice) return;
        const idx = labels.indexOf(choice);
        if (idx === -1) return;
        target = files[idx].path;
      }
      try {
        await startServer(target, ctx);
      } catch (err) {
        ctx.ui.notify(`html-editor: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  pi.on("session_shutdown", () => {
    void stopServer();
  });
}