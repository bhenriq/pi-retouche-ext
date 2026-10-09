---
description: Open an HTML or Markdown artifact in the visual editor and apply selections
argument-hint: [path]
---

Start the visual editing loop using the `html-editor` MCP tools.

${ARGUMENTS ? `Call \`open\` with path ${ARGUMENTS}.` : `Call \`list_artifacts\` and then \`open\` with a chosen path.`}

Then loop:

1. Call `next_request` (timeout 30 seconds).
2. If it returns `{type:"none"}`, call it again.
3. If `{type:"text"}` or `{type:"rect"}`: apply the requested change to the underlying source file with your normal editing tools. Use the `selection`/`anchorHtml`/`selector` context to locate the right text.
4. If `kind` is `"explain"`: do **not** edit the file. Explain the selected content, then call `notify_browser` with a concise Markdown explanation.
5. If `{type:"notice"}`: acknowledge it and continue looping.
6. Keep looping until the user tells you to stop.