// Unit tests for theme resolution and the Marp render cache key.
// Loaded via jiti so they can stay TS; no `marp` binary required.
const assert = require("node:assert");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const jiti = require("jiti").createJiti(__filename);
const { marpThemeFiles, marpThemeArgs, marpRenderKey } = jiti("./render.ts");

let failures = 0;
const tests = [];
function ok(name, fn) {
  tests.push([name, fn]);
}

const DECK = "---\nmarp: true\ntheme: tribe\n---\n\n# Hello\n";

ok("no theme frontmatter yields no theme files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  try {
    await writeFile(join(dir, "tribe.css"), "/* @theme tribe */\n");
    assert.deepEqual(await marpThemeFiles("# Hello\n", join(dir, "deck.md")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

ok("theme is found by file name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  try {
    const css = join(dir, "tribe.css");
    await writeFile(css, "section { color: red }\n");
    assert.deepEqual(await marpThemeFiles(DECK, join(dir, "deck.md")), [css]);
    assert.deepEqual(await marpThemeArgs(DECK, join(dir, "deck.md")), ["--theme", css]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

ok("theme is found by its @theme declaration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  try {
    const css = join(dir, "brand.css");
    await writeFile(css, "/* @theme tribe */\nsection { color: red }\n");
    assert.deepEqual(await marpThemeFiles(DECK, join(dir, "deck.md")), [css]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

ok("a theme in another directory is not found", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  const other = await mkdtemp(join(tmpdir(), "retouche-other-"));
  try {
    await writeFile(join(other, "tribe.css"), "/* @theme tribe */\n");
    assert.deepEqual(await marpThemeFiles(DECK, join(dir, "deck.md")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});

ok("the key is stable while nothing changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  try {
    await writeFile(join(dir, "tribe.css"), "/* @theme tribe */\n");
    const a = await marpRenderKey(DECK, join(dir, "deck.md"));
    const b = await marpRenderKey(DECK, join(dir, "deck.md"));
    assert.equal(a, b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

ok("editing the theme changes the key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  try {
    await writeFile(join(dir, "tribe.css"), "/* @theme tribe */\nsection { color: red }\n");
    const before = await marpRenderKey(DECK, join(dir, "deck.md"));
    await writeFile(join(dir, "tribe.css"), "/* @theme tribe */\nsection { color: blue }\n");
    const after = await marpRenderKey(DECK, join(dir, "deck.md"));
    assert.notEqual(before, after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

ok("adding a theme changes the key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retouche-theme-"));
  try {
    const unthemed = await marpRenderKey(DECK, join(dir, "deck.md"));
    await writeFile(join(dir, "tribe.css"), "/* @theme tribe */\n");
    const themed = await marpRenderKey(DECK, join(dir, "deck.md"));
    assert.notEqual(unthemed, themed);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("  ✓", name);
    } catch (e) {
      failures++;
      console.error("  ✗", name, "\n   ", e.message);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nall render checks passed");
})();
