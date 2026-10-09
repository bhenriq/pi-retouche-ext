# html-editor · Claude build

This is the Claude Code version of the `html-editor` visual editor. It is a
single **MCP server** that also hosts the localhost HTTP server and browser
overlay. The browser assets (`../editor.js`, `../assets/*`) are shared with
the pi build and are not duplicated.

## Install

```bash
cd claude
npm install

# Register the MCP server with Claude Code
claude mcp add html-editor -- node "$(pwd)/mcp-server.mjs"
```

Restart Claude Code, then confirm it's connected: `claude mcp list`.

## Usage

1. Start by asking Claude to open a file:

   ```
   Use the html-editor tools: call open with path example.html, then keep
   calling next_request until I tell you to stop.
   ```

2. The file opens in your browser at a URL that shows the filename.
3. Select text (or a region) and use the quick actions. Selections and
   instructions are returned by the `next_request` tool, so the agent applies
   them in the main conversation context.
4. Direct edits, undo, and redo happen in the browser and are surfaced to the
   agent as `notice` items on the next `next_request`.

### Tools

| Tool | Purpose |
| --- | --- |
| `open` | Serve an HTML/Markdown artifact, open the browser, return the URL |
| `list_artifacts` | List editable files under the working directory |
| `next_request` | Long-poll; returns the next selection / notice / `{type:"none"}` |
| `notify_browser` | Push Markdown to the browser popup (used for `explain` replies) |

## Optional: a `/edit` slash command

Copy `claude-code/commands/edit.md` into `.claude/commands/` of your project.
It turns the parked-loop pattern into a single command:

```
/edit demo-artifact.html
```

## Known trade-offs of the MCP-only design

- **Parked loop.** The agent must be inside `next_request` for a browser click
  to reach it. A click while the agent is idle waits until the next turn.
- **`explain` returns via a tool.** The agent must call `notify_browser` with
  its explanation; MCP gives no way to read the assistant's reply. A Claude
  Code `Stop` hook (reading `transcript_path`) would let us capture replies and
  deliver explanations automatically — a small, optional follow-up.