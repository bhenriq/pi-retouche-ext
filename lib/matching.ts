// Pure source-matching helpers shared by the editor server(s).
// Kept dependency-free so they can be unit-tested in isolation.

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(path);
}

export function isMarpFrontmatter(raw: string): boolean {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  return !!m && /^\s*marp\s*:\s*true\s*$/im.test(m[1]);
}

/**
 * Find the selected (rendered) text in the raw source.
 *
 * 1. Exact match.
 * 2. Ignore HTML tags and inline Markdown markers (selections spanning
 *    bold or tagged text). Whitespace is preserved.
 * 3. Collapse whitespace runs to single spaces (selections crossing newlines
 *    or hard-wrapped source).
 *
 * Returns a source range, or null when not found.
 */
export function findSourceSpan(source: string, needle: string): { start: number; end: number } | null {
  const exact = source.indexOf(needle);
  if (exact !== -1) return { start: exact, end: exact + needle.length };

  const map: number[] = [];
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

  // Whitespace-insensitive fallback.
  const normNeedle = needle.replace(/\s+/g, " ").trim();
  const wmap: number[] = [];
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

/**
 * Resolve the exact occurrence of the selection using its element's full text
 * plus the selection's offset within that text. Falls back to findSourceSpan.
 */
/**
 * Return the source range of one Marp slide (0-based index) between its
 * `---` separators, or null when the deck has no such slide.
 */
export function slideSourceRegion(source: string, slideIndex: number): { start: number; end: number } | null {
  const seps: number[] = [];
  let pos = 0;
  for (const line of source.split("\n")) {
    if (line.trim() === "---") seps.push(pos);
    pos += line.length + 1;
  }
  const open = seps[slideIndex + 1];
  const close = seps[slideIndex + 2];
  if (open === undefined || close === undefined) return null;
  return { start: open, end: close };
}

export function locateSelection(
  source: string,
  oldText: string,
  anchorText: string,
  startOffset: number,
): { start: number; end: number } | null {
  if (anchorText && startOffset >= 0) {
    const anchorSpan = findSourceSpan(source, anchorText);
    if (anchorSpan) {
      const map: number[] = [];
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
      if (
        startOffset + oldText.length <= map.length &&
        plain.slice(startOffset, startOffset + oldText.length) === oldText
      ) {
        return { start: map[startOffset], end: map[startOffset + oldText.length - 1] + 1 };
      }
    }
  }
  return findSourceSpan(source, oldText);
}