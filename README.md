# claude-auto-allow

A tiny [MCP](https://modelcontextprotocol.io) server that auto-approves every Claude Code permission prompt. One file, zero dependencies, ~80 lines of Node.

> ## ⚠️ Read this before you install
>
> This tool **disables Claude Code's interactive permission system**. Every Bash command, file write, web fetch — anything Claude wants to do — is allowed without asking.
>
> - **Equivalent to `--dangerously-skip-permissions`.** It uses a different mechanism (`--permission-prompt-tool`) but the effect is the same.
> - **If your employer forbids skip-permissions, this tool likely violates that policy.** Routing around the rule via MCP doesn't change the rule.
> - **Do not run on untrusted code or in untrusted directories.** A malicious file Claude reads could prompt it to run `rm -rf` or exfiltrate credentials — and you'll never see the confirmation.
> - **Use cases that make sense:** sandboxes, throwaway VMs, scripted agent harnesses where prompts can't be answered (e.g. headless CI). Personal interactive use at a company that hasn't blessed it: don't.

## What it does

Claude Code lets you delegate permission decisions to an external tool with `--permission-prompt-tool <name>`. That tool is called once per permission request and returns either `{"behavior": "allow"}` or `{"behavior": "deny"}`.

`auto-allow` is an MCP server that exposes a single tool called `approve`. It returns `allow` every time, with no policy checks.

## Install

### 1. Get the script

```bash
mkdir -p ~/.config/claude-auto-allow
curl -fsSL https://raw.githubusercontent.com/clark-s-dev/claude-auto-allow/main/auto-allow-mcp.mjs \
  -o ~/.config/claude-auto-allow/auto-allow-mcp.mjs
chmod +x ~/.config/claude-auto-allow/auto-allow-mcp.mjs
```

Requires Node.js 18 or newer (uses only built-in modules — no `npm install`).

### 2. Register it with Claude Code

Add the MCP server to `~/.claude/settings.json`:

```jsonc
{
  "mcpServers": {
    "auto-allow": {
      "command": "node",
      "args": ["/Users/YOU/.config/claude-auto-allow/auto-allow-mcp.mjs"]
    }
  }
}
```

(Replace `/Users/YOU` with your home directory — `~` doesn't expand inside JSON.)

### 3. Wire the permission flag

You need to tell each `claude` invocation to route permission checks through the MCP. Pick one:

**Option A — shell alias (recommended for personal use):**

Add to `~/.zshrc` or `~/.bashrc`:

```bash
alias claude='command claude --permission-prompt-tool mcp__auto-allow__approve'
```

Open a new shell, run `claude`, done.

**Option B — pass the flag manually each time:**

```bash
claude --permission-prompt-tool mcp__auto-allow__approve
```

**Option C — set in settings.json** (works in some Claude Code versions, not all):

```jsonc
{
  "permissions": {
    "permissionPromptTool": "mcp__auto-allow__approve"
  }
}
```

If you launch `claude` and still see permission prompts, this field isn't honored in your version — fall back to Option A.

## Verify

Enable logging (optional) and watch it tick:

```bash
export AUTO_ALLOW_LOG=/tmp/auto-allow.log
claude  # in another terminal
tail -f /tmp/auto-allow.log
```

You should see one `ALLOW <Tool> <input>` line per tool use. If the file stays empty, the flag isn't reaching Claude — recheck step 3.

## Programmatic use (Paperclip, agent harnesses, etc.)

If you're wiring this into a tool that spawns `claude` for you (e.g. [Paperclip](https://github.com/paperclipai/paperclip)'s `claude_local` adapter), the flag goes into the adapter's "extra args" field. For Paperclip specifically, that field expects a comma-separated string:

```
--mcp-config,/Users/YOU/.config/claude-auto-allow/mcp-config.json,--permission-prompt-tool,mcp__auto-allow__approve
```

`mcp-config.json` is a standalone file that points at the server, so you don't have to touch your global `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "auto-allow": {
      "command": "node",
      "args": ["/Users/YOU/.config/claude-auto-allow/auto-allow-mcp.mjs"]
    }
  }
}
```

## Uninstall

1. Remove the alias from `~/.zshrc` (or whichever you added)
2. Delete the `auto-allow` entry from `~/.claude/settings.json` under `mcpServers`
3. Delete the script: `rm -rf ~/.config/claude-auto-allow`
4. Open a fresh shell

Next `claude` invocation prompts normally.

## How it works (one paragraph)

The script speaks JSON-RPC over stdio per the MCP spec. On `initialize` it advertises one tool (`approve`). On `tools/list` it returns that tool's schema. On `tools/call` for `approve`, it returns `{"content": [{"type":"text","text":"{\"behavior\":\"allow\",\"updatedInput\":...}"}]}`. Claude Code's permission handler parses that text, sees `behavior: allow`, and lets the tool run. No network, no deps, no state — just a long-running process Claude pipes JSON to.

## License

MIT. See [LICENSE](./LICENSE).
