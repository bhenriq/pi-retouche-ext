// Shared rendering helpers used by both the pi extension (index.ts) and the
// Claude/MCP server (claude/mcp-server.mjs). Markdown is rendered via a
// caller-supplied marked instance; Marp decks are rendered through the `marp`
// CLI (one invocation, the client shows slides one at a time).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, basename } from "node:path";
import { marpTheme } from "./matching";

export type Marked = { parse: (src: string, opts?: Record<string, unknown>) => string };

const execFileAsync = promisify(execFile);
const hash = (text: string): string => createHash("sha1").update(text, "utf8").digest("hex");

export const MARKDOWN_STYLE = `
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

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function renderMarkdownDocument(raw: string, title: string, marked: Marked): string {
  const body = marked.parse(raw, { gfm: true, breaks: false });
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

export function buildMarpDocument(cliHtml: string, title: string): string {
  const withoutScripts = cliHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(withoutScripts);
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(withoutScripts);
  const styles = head ? head[1].match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [] : [];
  const slides = (bodyMatch ? bodyMatch[1] : withoutScripts)
    // The Marp default template ships its own on-screen controller ("Page N of
    // M"). Strip it so the caller's deck navigation is the only one shown.
    .replace(/<div\s+class="bespoke-marp-osc"[^>]*>[\s\S]*?<\/div>\s*/i, "");
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

/**
 * Find local CSS files that define the deck's frontmatter theme and return
 * `--theme <file>` arguments so the Marp CLI renders with the same theme a
 * user would get from `marp deck.md --theme theme.css`.
 */
export async function marpThemeArgs(raw: string, filePath: string): Promise<string[]> {
  const theme = marpTheme(raw);
  if (!theme || ["default", "gaia", "uncover"].includes(theme)) return [];
  const dir = dirname(filePath);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const themeRe = /@theme\s+("([^"]*)"|'([^']*)'|([^\s;]+))/i;
  const out: string[] = [];
  for (const name of entries) {
    if (!/\.css$/i.test(name)) continue;
    const p = join(dir, name);
    const namedFile = name.toLowerCase() === `${theme.toLowerCase()}.css`;
    let declaresTheme = false;
    try {
      const text = await readFile(p, "utf8");
      const m = themeRe.exec(text);
      if (m) {
        const val = (m[2] || m[3] || m[4] || "").toLowerCase();
        declaresTheme = val === theme.toLowerCase();
      }
    } catch {
      /* skip unreadable files */
    }
    if (namedFile || declaresTheme) out.push("--theme", p);
  }
  return out;
}

export async function renderMarpPage(
  raw: string,
  filePath: string,
  marked: Marked,
  cache?: { hash?: string; page?: string } | null,
): Promise<string> {
  const key = hash(raw);
  if (cache && cache.hash === key) return cache.page;
  const tmp = await mkdtemp(join(tmpdir(), "retouche-marp-"));
  const out = join(tmp, "out.html");
  const themeArgs = await marpThemeArgs(raw, filePath);
  try {
    await execFileAsync("marp", [filePath, ...themeArgs, "--template", "bare", "--allow-local-files", "--no-stdin", "--output", out], { timeout: 30000 });
    const cliHtml = await readFile(out, "utf8");
    const page = buildMarpDocument(cliHtml, basename(filePath));
    if (cache) {
      cache.hash = key;
      cache.page = page;
    }
    return page;
  } catch {
    // Marp CLI unavailable or failed: fall back to plain Markdown rendering.
    const fallback = renderMarkdownDocument(raw, basename(filePath), marked);
    if (cache) {
      cache.hash = key;
      cache.page = fallback;
    }
    return fallback;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}