// lib/matching.ts
function isMarkdownPath(path) {
  return /\.(md|markdown|mdown|mkd)$/i.test(path);
}
function isMarpFrontmatter(raw) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  return !!m && /^\s*marp\s*:\s*true\s*$/im.test(m[1]);
}
function marpTheme(raw) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return null;
  const tm = /^\s*theme\s*:\s*([^\s'"\n]+|'[^']*'|"[^"]*")\s*$/im.exec(m[1]);
  if (!tm) return null;
  return tm[1].replace(/^['"]|['"]$/g, "") || null;
}
function findSourceSpan(source, needle) {
  const exact = source.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };
  const map = [];
  let plain = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "<") {
      const close = source.indexOf(">", i + 1);
      if (close !== -1) {
        i = close + 1;
        continue;
      }
    }
    if (ch === "*" || ch === "_" || ch === "~" || ch === "`") {
      i++;
      continue;
    }
    plain += ch;
    map.push(i);
    i++;
  }
  const p = plain.indexOf(needle);
  if (p !== -1) return { start: map[p], end: map[p + needle.length - 1] + 1 };
  const normNeedle = needle.replace(/\s+/g, " ").trim();
  const wmap = [];
  let wplain = "";
  for (let k = 0; k < plain.length; ) {
    const ch = plain[k];
    if (/\s/.test(ch)) {
      const first = k;
      while (k < plain.length && /\s/.test(plain[k])) k++;
      wplain += " ";
      wmap.push(first);
    } else {
      wplain += ch;
      wmap.push(k);
      k++;
    }
  }
  const wp = wplain.indexOf(normNeedle);
  if (wp === -1) return null;
  return { start: map[wmap[wp]], end: map[wmap[wp + normNeedle.length - 1]] + 1 };
}
function slideSourceRegion(source, slideIndex) {
  const seps = [];
  let pos = 0;
  for (const line of source.split("\n")) {
    if (line.trim() === "---") seps.push(pos);
    pos += line.length + 1;
  }
  const open = seps[slideIndex + 1];
  const close = seps[slideIndex + 2];
  if (open === void 0 || close === void 0) return null;
  return { start: open, end: close };
}
function locateSelection(source, oldText, anchorText, startOffset) {
  if (anchorText && startOffset >= 0) {
    const anchorSpan = findSourceSpan(source, anchorText);
    if (anchorSpan) {
      const map = [];
      let plain = "";
      let i = anchorSpan.start;
      while (i < anchorSpan.end) {
        const ch = source[i];
        if (ch === "<") {
          const close = source.indexOf(">", i + 1);
          if (close !== -1) {
            i = close + 1;
            continue;
          }
        }
        if (ch === "*" || ch === "_" || ch === "~" || ch === "`") {
          i++;
          continue;
        }
        plain += ch;
        map.push(i);
        i++;
      }
      if (startOffset + oldText.length <= map.length && plain.slice(startOffset, startOffset + oldText.length) === oldText) {
        return { start: map[startOffset], end: map[startOffset + oldText.length - 1] + 1 };
      }
    }
  }
  return findSourceSpan(source, oldText);
}

// lib/render.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, basename } from "node:path";
var execFileAsync = promisify(execFile);
var hash = (text) => createHash("sha1").update(text, "utf8").digest("hex");
var MARKDOWN_STYLE = `
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
var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
function renderMarkdownDocument(raw, title, marked) {
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
function buildMarpDocument(cliHtml, title) {
  const withoutScripts = cliHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(withoutScripts);
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(withoutScripts);
  const styles = head ? head[1].match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [] : [];
  const slides = (bodyMatch ? bodyMatch[1] : withoutScripts).replace(/<div\s+class="bespoke-marp-osc"[^>]*>[\s\S]*?<\/div>\s*/i, "");
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
async function marpThemeArgs(raw, filePath) {
  const theme = marpTheme(raw);
  if (!theme || ["default", "gaia", "uncover"].includes(theme)) return [];
  const dir = dirname(filePath);
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const themeRe = /@theme\s+("([^"]*)"|'([^']*)'|([^\s;]+))/i;
  const out = [];
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
    }
    if (namedFile || declaresTheme) out.push("--theme", p);
  }
  return out;
}
async function renderMarpPage(raw, filePath, marked, cache) {
  const key = hash(raw);
  if (cache && cache.hash === key) return cache.page;
  const tmp = await mkdtemp(join(tmpdir(), "retouche-marp-"));
  const out = join(tmp, "out.html");
  const themeArgs = await marpThemeArgs(raw, filePath);
  try {
    await execFileAsync("marp", [filePath, ...themeArgs, "--template", "bare", "--allow-local-files", "--no-stdin", "--output", out], { timeout: 3e4 });
    const cliHtml = await readFile(out, "utf8");
    const page = buildMarpDocument(cliHtml, basename(filePath));
    if (cache) {
      cache.hash = key;
      cache.page = page;
    }
    return page;
  } catch {
    const fallback = renderMarkdownDocument(raw, basename(filePath), marked);
    if (cache) {
      cache.hash = key;
      cache.page = fallback;
    }
    return fallback;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {
    });
  }
}
export {
  MARKDOWN_STYLE,
  buildMarpDocument,
  escapeHtml,
  findSourceSpan,
  isMarkdownPath,
  isMarpFrontmatter,
  locateSelection,
  marpTheme,
  marpThemeArgs,
  renderMarkdownDocument,
  renderMarpPage,
  slideSourceRegion
};
