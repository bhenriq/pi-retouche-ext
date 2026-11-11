/**
 * retouche — visual editing for local HTML artifacts from the browser.
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
import { readFile, writeFile, stat, readdir, realpath } from "node:fs/promises";
import { watchFile, unwatchFile } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { dirname, join, resolve, sep, extname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { isMarkdownPath, isMarpFrontmatter, findSourceSpan, locateSelection, slideSourceRegion } from "./lib/matching";
import { renderMarkdownDocument, renderMarpPage, buildMarpDocument } from "./lib/render";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, "assets");
const requireAsset = createRequire(import.meta.url);



const ARTIFACT_EXTS = new Set([".html", ".htm", ".md", ".markdown", ".mdown", ".mkd"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "vendor"]);

async function listArtifacts(root: string, maxDepth = 5): Promise<{ path: string; mtime: number }[]> {
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
  mode: "rect" | "text" | "node" | "general";
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
  /** URL prefix for this artifact (for example "/report.html"). */
  route: string;
  rawHash: string;
  markdown: boolean;
  marpCache?: { hash?: string; page?: string };
  versions: string[];
  vIndex: number;
  clients: Set<ServerResponse>;
  keepalive: NodeJS.Timeout;
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

// Annotations submitted from the browser, plus the artifact hash at submit
// time. Used to correlate agent_settled events with browser-originated work
// and to detect whether the agent actually changed the file. Each entry keeps
// its own artifact so several open files can be waiting at once.
let pendingSubmits: { artifact: Artifact; snapshotHash: string; kind: "edit" | "explain" }[] = [];

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
    piRef?.sendMessage({ customType: "retouche", content, display: true });
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

function tokenOk(req: IncomingMessage): boolean {
  if (!serverToken) return false;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const fromQuery = url.searchParams.get("t");
  const cookieHeader = req.headers.cookie ?? "";
  const fromCookie = /(?:^|;\s*)hme_token=([^;]+)/.exec(cookieHeader)?.[1];
  return fromQuery === serverToken || fromCookie === serverToken;
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

/** Split "/<route>/<rest>" into its route prefix and the remaining path. */
function splitRoute(pathname: string): { route: string; rest: string } | null {
  if (!pathname.startsWith("/")) return null;
  const next = pathname.indexOf("/", 1);
  if (next === -1) return { route: pathname, rest: "" };
  return { route: pathname.slice(0, next), rest: pathname.slice(next) };
}

/** The artifact whose tab issued this request, if the browser sent a Referer. */
function refererArtifact(req: IncomingMessage): Artifact | undefined {
  const referer = req.headers.referer;
  if (!referer) return undefined;
  try {
    const split = splitRoute(new URL(referer).pathname);
    return split ? artifactsByRoute.get(split.route) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve a sibling asset (CSS, images, second pages) against the open
 * artifacts. The Referer pins the request to the tab's own artifact when two
 * open files share a filename; otherwise the first artifact that has it wins.
 */
async function readStaticAsset(pathname: string, req: IncomingMessage): Promise<{ data: Buffer; type: string } | null> {
  const preferred = refererArtifact(req);
  const candidates: Artifact[] = [];
  if (preferred) candidates.push(preferred);
  for (const art of artifactsByPath.values()) if (art !== preferred) candidates.push(art);
  for (const art of candidates) {
    const target = resolveStatic(art, pathname);
    if (!target) continue;
    const data = await readFile(target).catch(() => null);
    if (data) return { data, type: CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream" };
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Landing page listing every open artifact, so a closed tab can be reopened. */
function renderIndexPage(): string {
  const open = [...artifactsByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const rows = open
    .map(
      (art) =>
        `<li><a href="${art.route}">${escapeHtml(basename(art.path))}</a><code>${escapeHtml(art.path)}</code>` +
        `<span class="hint">${art.markdown ? "Markdown" : "HTML"}</span></li>`,
    )
    .join("");
  const body = open.length
    ? `<ul>${rows}</ul><p class="hint">Open another file with <code>/edit &lt;file&gt;</code> in pi; every open file keeps its own tab, history, and undo stack.</p>`
    : `<p>No artifacts open. Run <code>/edit &lt;file&gt;</code> in pi.</p>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>retouche · open artifacts</title>
<style>
  :root { color-scheme: dark light; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; background: #111318; color: #e6e8ee; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 16px; letter-spacing: .01em; }
  ul { list-style: none; margin: 0 0 20px; padding: 0; }
  li { display: flex; align-items: baseline; gap: 10px; padding: 8px 0; border-bottom: 1px solid #23262e; }
  a { color: #8ab4ff; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  code { color: #9aa3b2; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .hint { color: #6f7787; font-size: 12px; margin-left: auto; }
  p.hint { margin-left: 0; }
</style></head>
<body><h1>retouche · open artifacts</h1>${body}</body></html>`;
}

function injectEditor(html: string, token: string, markdown: boolean, base: string): string {
  const tag = `<script src="${base}/__editor/editor.js?t=${token}${markdown ? "&md=1" : ""}" data-hme-editor></script>`;
  const closeIdx = html.toLowerCase().lastIndexOf("</body>");
  if (closeIdx !== -1) return html.slice(0, closeIdx) + tag + html.slice(closeIdx);
  return html + tag;
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

  if (body.mode === "general") {
    lines.push("", "Mode: general comment (no specific text selection).");
    if (typeof body.slide === "number" && body.slide >= 0) {
      lines.push("Apply the comment to the slide indicated below.");
    } else {
      lines.push("Apply it to the document as a whole.");
    }
  } else if (body.mode === "rect") {
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

// One localhost server hosts every open artifact. Each artifact gets its own
// route ("/report.html", disambiguated when basenames collide) and scopes its
// API calls under that route ("/report.html/__submit"), so several files can
// stay open in parallel, in different tabs, without killing each other.

let httpServer: Server | null = null;
let httpPort = 0;
let serverToken = "";

const artifactsByPath = new Map<string, Artifact>();
const artifactsByRoute = new Map<string, Artifact>();

/** Pick a stable, readable route for a file, disambiguating basename collisions. */
function routeFor(fullPath: string): string {
  const name = basename(fullPath);
  const candidates = [name, `${basename(dirname(fullPath))}-${name}`, `${hash(fullPath).slice(0, 8)}-${name}`];
  for (const candidate of candidates) {
    const route = "/" + encodeURIComponent(candidate);
    if (!artifactsByRoute.has(route)) return route;
  }
  let suffix = 2;
  for (;;) {
    const route = "/" + encodeURIComponent(`${hash(fullPath).slice(0, 8)}-${suffix}-${name}`);
    if (!artifactsByRoute.has(route)) return route;
    suffix += 1;
  }
}

async function ensureServer(): Promise<{ port: number; token: string }> {
  if (httpServer) return { port: httpPort, token: serverToken };
  const token = randomBytes(24).toString("hex");
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      if (!res.headersSent) sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      else res.end();
    });
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
  httpServer = server;
  httpPort = address.port;
  serverToken = token;
  return { port: httpPort, token: serverToken };
}

async function openArtifact(filePath: string, ctx: ExtensionCommandContext): Promise<void> {
  const requested = resolve(ctx.cwd, filePath);
  const fullPath = await realpath(requested).catch(() => requested);
  const fileStat = await stat(fullPath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) {
    throw new Error(`Not a file: ${fullPath}`);
  }

  const { port, token } = await ensureServer();

  // Re-opening the same file reuses its tab instead of resetting its history.
  const already = artifactsByPath.get(fullPath);
  if (already) {
    const url = `http://127.0.0.1:${port}${already.route}?t=${token}`;
    openBrowser(url);
    ctx.ui.notify(`retouche: editing ${basename(already.path)} — ${url}`, "info");
    return;
  }

  // Cold read establishes the hash and the first version so the first
  // watchFile fire is not a "change".
  let initialContent = "";
  try {
    initialContent = await readFile(fullPath, "utf8");
  } catch {
    initialContent = "";
  }

  const route = routeFor(fullPath);
  const artifact: Artifact = {
    path: fullPath,
    dir: dirname(fullPath),
    route,
    rawHash: hash(initialContent),
    markdown: isMarkdownPath(fullPath),
    versions: [initialContent],
    vIndex: 0,
    clients: new Set(),
    keepalive: setInterval(() => broadcast(artifact.clients, ": ping\n\n"), 25000),
  };
  artifactsByPath.set(fullPath, artifact);
  artifactsByRoute.set(route, artifact);

  let debounce: NodeJS.Timeout | null = null;
  watchFile(fullPath, { interval: 250 }, () => {
    if (debounce) return;
    debounce = setTimeout(async () => {
      debounce = null;
      if (artifactsByPath.get(fullPath) !== artifact) return;
      try {
        const content = await readFile(fullPath, "utf8");
        const nextHash = hash(content);
        if (nextHash === artifact.rawHash) return;
        artifact.rawHash = nextHash;
        if (content !== artifact.versions[artifact.vIndex]) {
          artifact.versions = artifact.versions.slice(0, artifact.vIndex + 1);
          artifact.versions.push(content);
          artifact.vIndex = artifact.versions.length - 1;
        }
        broadcastChanged(artifact);
      } catch {
        /* file temporarily unreadable; ignore */
      }
    }, 150);
  });

  const url = `http://127.0.0.1:${port}${route}?t=${token}`;
  openBrowser(url);
  ctx.ui.notify(`retouche: editing ${basename(fullPath)} — ${url}`, "info");
}

function closeArtifact(artifact: Artifact): void {
  if (artifactsByPath.get(artifact.path) === artifact) artifactsByPath.delete(artifact.path);
  if (artifactsByRoute.get(artifact.route) === artifact) artifactsByRoute.delete(artifact.route);
  unwatchFile(artifact.path);
  clearInterval(artifact.keepalive);
  for (const res of artifact.clients) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  artifact.clients.clear();
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

function broadcastChanged(art: Artifact): void {
  broadcast(art.clients, `data: ${JSON.stringify({ type: "changed", ...historyState(art) })}\n\n`);
}

/** Close every artifact and shut the localhost server down. */
async function stopServer(): Promise<void> {
  for (const artifact of [...artifactsByPath.values()]) closeArtifact(artifact);

  const server = httpServer;
  httpServer = null;
  serverToken = "";
  httpPort = 0;
  if (!server) return;

  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
    // Force-close lingering keep-alive sockets after a grace period.
    setTimeout(() => {
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      resolveClose();
    }, 500);
  });
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

/**
 * Resolve an artifact on disk to the HTML retouche serves:
 * - Markdown Marp decks render through the Marp CLI with `--template bare`.
 * - Other Markdown renders to a plain document.
 * - Pre-rendered HTML Marp decks are sanitised so their built-in on-screen
 *   controller is removed and only retouche's deck navigation remains.
 * - Any other HTML is served as-is.
 */
async function renderArtifactHtml(artifact: Artifact, raw: string): Promise<string> {
  const isMd = isMarkdownPath(artifact.path);
  if (isMd && isMarpFrontmatter(raw)) {
    return renderMarpPage(raw, artifact.path, getMarked(), (artifact.marpCache ??= {}));
  }
  if (isMd) {
    return renderMarkdownDocument(raw, basename(artifact.path), getMarked());
  }
  if (/data-marpit-svg/i.test(raw)) {
    return buildMarpDocument(raw, basename(artifact.path));
  }
  return raw;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;

  // Every route requires the token: a document is opened with it in the query
  // string and sets a cookie so that same-origin asset requests (which carry
  // the cookie but no query token) still pass.
  if (!tokenOk(req)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  // The page lives at "/<route>"; its API lives at "/<route>/__...".
  const split = splitRoute(pathname);
  const artifact = split ? artifactsByRoute.get(split.route) : undefined;
  const rest = split?.rest ?? "";

  // Document page.
  if (artifact && rest === "" && req.method === "GET") {
    const raw = await readFile(artifact.path, "utf8").catch(() => null);
    if (raw === null) {
      sendJson(res, 404, { error: "artifact unavailable" });
      return;
    }
    res.setHeader("Set-Cookie", `hme_token=${serverToken}; HttpOnly; SameSite=Lax; Path=/`);
    // Keep the access token out of the address bar: once the cookie is set,
    // redirect the tokenized URL to the clean route.
    if (url.searchParams.has("t")) {
      res.writeHead(302, { Location: artifact.route });
      res.end();
      return;
    }
    const page = await renderArtifactHtml(artifact, raw);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectEditor(page, serverToken, isMarkdownPath(artifact.path), artifact.route));
    return;
  }

  // Index of everything currently open. Cookie-authenticated, so a saved
  // http://127.0.0.1:<port>/ keeps working even after a tab is closed.
  if (pathname === "/" && req.method === "GET") {
    res.setHeader("Set-Cookie", `hme_token=${serverToken}; HttpOnly; SameSite=Lax; Path=/`);
    if (url.searchParams.has("t")) {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(renderIndexPage());
    return;
  }

  // Raw artifact source (no injection) — used by the client on refresh.
  if (artifact && rest === "/__source" && req.method === "GET") {
    const raw = await readFile(artifact.path, "utf8").catch(() => null);
    if (raw === null) {
      sendJson(res, 404, { error: "artifact unavailable" });
      return;
    }
    const page = await renderArtifactHtml(artifact, raw);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }

  // Version history: real file-level undo/redo. The file on disk stays the
  // single source of truth; every external change is pushed as a version.
  if (artifact && rest === "/__history" && req.method === "GET") {
    sendJson(res, 200, historyState(artifact));
    return;
  }

  if (artifact && (rest === "/__undo" || rest === "/__redo") && req.method === "POST") {
    const art = artifact;
    const step = rest === "/__undo" ? -1 : 1;
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
    broadcastChanged(art);
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
  if (artifact && rest === "/__replace" && req.method === "POST") {
    const rawBody = await readBody(req, 4 * 1024 * 1024);
    let body: { oldText?: unknown; newText?: unknown; anchorText?: unknown; startOffset?: unknown; slide?: unknown };
    try {
      body = JSON.parse(rawBody) as { oldText?: unknown; newText?: unknown; anchorText?: unknown; startOffset?: unknown; slide?: unknown };
    } catch {
      sendJson(res, 400, { error: "invalid json" });
      return;
    }
    const oldText = typeof body.oldText === "string" ? body.oldText : "";
    const newText = typeof body.newText === "string" ? body.newText : "";
    const anchorText = typeof body.anchorText === "string" ? body.anchorText : "";
    const startOffset = typeof body.startOffset === "number" ? body.startOffset : -1;
    const slide = typeof body.slide === "number" ? body.slide : -1;
    if (!oldText) {
      sendJson(res, 400, { error: "oldText required" });
      return;
    }
    const targetPath = artifact.path;
    let content: string;
    try {
      content = await readFile(targetPath, "utf8");
    } catch {
      sendJson(res, 404, { error: "artifact unavailable" });
      return;
    }
    let search = content;
    let offset = 0;
    if (slide >= 0) {
      const region = slideSourceRegion(content, slide);
      if (region) {
        search = content.slice(region.start, region.end);
        offset = region.start;
      }
    }

    // Prefer the slide-scoped match; fall back to the whole file so frontmatter
    // text (e.g. the header) can still be edited when it isn't on the slide.
    let span = locateSelection(search, oldText, anchorText, startOffset);
    if (!span && offset !== 0) {
      search = content;
      offset = 0;
      span = locateSelection(search, oldText, anchorText, startOffset);
    }
    if (!span) {
      sendJson(res, 409, { error: "selected text wasn't found in the source; use Other to instruct the agent" });
      return;
    }
    const absStart = span.start + offset;
    const absEnd = span.end + offset;
    const updated = content.slice(0, absStart) + newText + content.slice(absEnd);
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
  if (artifact && rest === "/__editor/editor.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    res.end(await readFile(join(__dirname, "dist", "editor.js"), "utf8"));
    return;
  }

  // Vendored rasterizer.
  if (artifact && rest === "/__editor/html-to-image.js" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    res.end(await readFile(join(ASSET_DIR, "html-to-image.js"), "utf8"));
    return;
  }

  // Server-sent events for file-change notifications.
  if (artifact && rest === "/__events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    artifact.clients.add(res);
    req.on("close", () => artifact.clients.delete(res));
    return;
  }

  // Annotation submissions.
  if (artifact && rest === "/__submit" && req.method === "POST") {
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
    if (body.mode !== "rect" && body.mode !== "text" && body.mode !== "node" && body.mode !== "general") {
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
      pendingSubmits.push({ artifact, snapshotHash, kind: body.kind === "explain" ? "explain" : "edit" });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Static sibling assets referenced by an open artifact (styles, images,
  // linked pages). The Referer pins the request to the tab's own artifact when
  // several open files share a filename.
  if (req.method === "GET") {
    const file = await readStaticAsset(pathname, req);
    if (file) {
      res.writeHead(200, { "Content-Type": file.type, "Cache-Control": "no-cache" });
      res.end(file.data);
      return;
    }
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
    if (!pending) return;
    const artifact = pending.artifact;
    // The tab may have been closed while the agent was working.
    if (artifactsByPath.get(artifact.path) !== artifact) return;
    const currentHash = await hashFile(artifact.path);
    const edited = currentHash !== "" && currentHash !== pending.snapshotHash;
    const reply = lastAssistantText.slice(0, pending.kind === "explain" ? 6000 : 400);
    const payload = JSON.stringify({
      type: "settled",
      kind: pending.kind,
      edited,
      reply,
      replyHtml: pending.kind === "explain" ? getMarked().parse(reply, { gfm: true, breaks: false }) : undefined,
    });
    broadcast(artifact.clients, `data: ${payload}\n\n`);
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
        await openArtifact(target, ctx);
      } catch (err) {
        ctx.ui.notify(`retouche: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  pi.on("session_shutdown", () => {
    void stopServer();
  });
}