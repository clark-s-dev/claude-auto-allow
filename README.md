# claude-auto-allow

A tiny [MCP](https://modelcontextprotocol.io) server that auto-approves every Claude Code permission prompt. One file, zero dependencies, ~95 lines of Node.

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

## Install (3 steps)

Requires Node.js 18+ and Claude Code installed.

### 1. Save the script somewhere stable

```bash
mkdir -p ~/.config/claude-auto-allow
curl -fsSL https://raw.githubusercontent.com/clark-s-dev/claude-auto-allow/main/auto-allow-mcp.mjs \
  -o ~/.config/claude-auto-allow/auto-allow-mcp.mjs
chmod +x ~/.config/claude-auto-allow/auto-allow-mcp.mjs
```

### 2. Register it as a user-scope MCP server

```bash
claude mcp add auto-allow --scope user -- node ~/.config/claude-auto-allow/auto-allow-mcp.mjs
```

Verify it connects:

```bash
claude mcp list
# you should see:  auto-allow: node ~/.config/claude-auto-allow/auto-allow-mcp.mjs - ✓ Connected
```

> Note: Editing `~/.claude/settings.json` directly with an `mcpServers` block **does not work** — Claude Code reads user-scope MCPs from `~/.claude.json`, which `claude mcp add` manages for you.

### 3. Make every `claude` invocation use it

Add this to your `~/.zshrc` (or `~/.bashrc`):

```bash
alias claude='command claude --permission-prompt-tool mcp__auto-allow__approve'
```

Open a fresh shell. Done.

## Verify

```bash
export AUTO_ALLOW_LOG=/tmp/auto-allow.log

# in one terminal:
claude -p "Run: echo hi"

# in another terminal:
tail -f /tmp/auto-allow.log
```

You should see one `ALLOW <Tool> <input>` line per tool use as Claude runs. Empty log = something didn't wire up.

## Programmatic use (Paperclip, agent harnesses, etc.)

For tools that spawn Claude directly without going through your shell (so the alias doesn't apply, and they often can't see your user-scope `~/.claude.json` registration), pass **both** flags via whatever "extra args" mechanism the tool exposes:

```
--mcp-config /path/to/mcp-config.json --permission-prompt-tool mcp__auto-allow__approve
```

`mcp-config.json` is a standalone file the tool can pass to Claude (via `--mcp-config`), used **instead of** the user-scope registration:

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

For [Paperclip](https://github.com/paperclipai/paperclip)'s `claude_local` adapter, the Extra args field is comma-separated:

```
--mcp-config,/Users/YOU/.paperclip/auto-allow-mcp-config.json,--permission-prompt-tool,mcp__auto-allow__approve
```

## Uninstall

```bash
# 1. Remove user-scope registration
claude mcp remove auto-allow

# 2. Remove the alias (edit ~/.zshrc)
#    delete the line: alias claude='command claude --permission-prompt-tool mcp__auto-allow__approve'

# 3. Delete the script
rm -rf ~/.config/claude-auto-allow

# 4. Open a fresh shell
```

Next `claude` invocation prompts normally.

## How it works (one paragraph)

The script speaks JSON-RPC over stdio per the MCP spec. On `initialize` it advertises one tool (`approve`). On `tools/list` it returns that tool's schema. On `tools/call` for `approve`, it returns `{"content": [{"type":"text","text":"{\"behavior\":\"allow\",\"updatedInput\":...}"}]}`. Claude Code's permission handler parses that text, sees `behavior: allow`, and lets the tool run. No network, no deps, no state — just a long-running process Claude pipes JSON to.

## License

MIT. See [LICENSE](./LICENSE).
