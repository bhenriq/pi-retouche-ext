// Unit tests for the pure matching helpers, loaded via jiti so they can stay TS.
const assert = require("node:assert");
const jiti = require("/Users/baptiste/.pi/agent/install/releases/1.1.0/node_modules/jiti").createJiti(__filename);
const {
  isMarkdownPath,
  isMarpFrontmatter,
  marpTheme,
  findSourceSpan,
  locateSelection,
  slideSourceRegion,
} = jiti("/Users/baptiste/.pi/agent/extensions/html-editor/lib/matching.ts");

let failures = 0;
function ok(name, fn) {
  try {
    fn();
    console.log("  ✓", name);
  } catch (e) {
    failures++;
    console.error("  ✗", name, "\n   ", e.message);
  }
}

console.log("isMarkdownPath");
ok(".md", () => assert.equal(isMarkdownPath("foo.md"), true));
ok(".markdown", () => assert.equal(isMarkdownPath("foo.MARKDOWN"), true));
ok(".html is not", () => assert.equal(isMarkdownPath("foo.html"), false));

console.log("isMarpFrontmatter");
ok("marp: true", () => assert.equal(isMarpFrontmatter("---\nmarp: true\n---\n# Hello"), true));
ok("with theme + paginate", () => assert.equal(isMarpFrontmatter("---\nmarp: true\ntheme: gaia\npaginate: true\n---\n"), true));
ok("marp: false", () => assert.equal(isMarpFrontmatter("---\nmarp: false\n---\n# Hello"), false));
ok("no frontmatter", () => assert.equal(isMarpFrontmatter("# Hello"), false));
ok("frontmatter without marp", () => assert.equal(isMarpFrontmatter("---\nauthor: me\n---\n# Hello"), false));

console.log("findSourceSpan");
ok("exact", () => {
  const s = findSourceSpan("abc def ghi", "def");
  assert.ok(s);
  assert.equal("abc def ghi".slice(s.start, s.end), "def");
});
ok("spans markdown bold", () => {
  const s = findSourceSpan("Hello **world** here", "Hello world");
  assert.ok(s);
  assert.equal(s.start, 0);
  assert.equal("Hello **world** here".slice(s.start, s.end).replace(/\*/g, "").replace(/\s+/g, " ").trim(), "Hello world");
});
ok("whitespace collapse across newline", () => {
  const src = "Line one\nLine two";
  const s = findSourceSpan(src, "Line one Line two");
  assert.ok(s);
  assert.equal(src.slice(s.start, s.end), "Line one\nLine two");
});
ok("not found", () => assert.equal(findSourceSpan("abc", "xyz"), null));

console.log("locateSelection");
ok("targets the second occurrence via anchor+offset", () => {
  const src = "A short **Markdown** file. I tried a joke about Markdown.";
  const anchor = "I tried a joke about Markdown.";
  const offset = anchor.indexOf("Markdown");
  const s = locateSelection(src, "Markdown", anchor, offset);
  assert.ok(s);
  assert.equal(src.slice(s.start, s.end), "Markdown");
  assert.ok(s.start > src.indexOf("Markdown"), "expected the second occurrence");
});
ok("falls back to first occurrence without anchor", () => {
  const src = "A short **Markdown** file. I tried a joke about Markdown.";
  const s = locateSelection(src, "Markdown", "", -1);
  assert.ok(s);
  assert.equal(s.start, src.indexOf("Markdown"));
});

console.log("slideSourceRegion");
ok("finds slide 0 between frontmatter close and next separator", () => {
  const src = "---\nmarp: true\nheader: 'Weekly Notesss'\n---\n\n# Weekly Note\n\n---\n\n# Slide 2\n";
  const r = slideSourceRegion(src, 0);
  assert.ok(r);
  const region = src.slice(r.start, r.end);
  assert.ok(region.includes("# Weekly Note"));
  assert.ok(!region.includes("Weekly Notesss"));
});
ok("returns null when slide index out of range", () => {
  assert.equal(slideSourceRegion("---\nmarp: true\n---\n# One\n", 3), null);
});

console.log("marpTheme");
ok("extracts the theme value", () => {
  assert.equal(marpTheme("---\nmarp: true\ntheme: weekly\n---\n# Slide\n"), "weekly");
});
ok("handles quoted theme and returns null otherwise", () => {
  assert.equal(marpTheme("---\nmarp: true\ntheme: 'weekly'\n---\n"), "weekly");
  assert.equal(marpTheme("---\nmarp: true\n---\n"), null);
  assert.equal(marpTheme("# no frontmatter\n"), null);
});

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);