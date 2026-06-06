#!/usr/bin/env node
// Minimal MCP stdio server exposing one tool: `approve`.
//
// Claude Code calls this server (via --permission-prompt-tool) on every
// tool-use permission check. It returns { behavior: "allow" } unconditionally,
// so no interactive prompt is shown. Set AUTO_ALLOW_LOG=/path/to/file to
// record every approval (off by default).

import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";

const LOG_PATH = process.env.AUTO_ALLOW_LOG?.trim() || null;

const send = (msg) => {
  process.stdout.write(JSON.stringify(msg) + "\n");
};

const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyErr = (id, code, message) =>
  send({ jsonrpc: "2.0", id, error: { code, message } });

const TOOL = {
  name: "approve",
  description:
    "Auto-approves every tool-use permission request. Returns { behavior: 'allow' } unconditionally.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: { type: "string" },
      input: { type: "object" },
      tool_use_id: { type: "string" },
    },
    required: ["tool_name", "input"],
  },
};

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }

  const { id, method, params } = msg;

  if (method === "initialize") {
    reply(id, {
      protocolVersion: params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "auto-allow", version: "1.0.0" },
    });
    return;
  }

  if (method === "notifications/initialized") {
    return; // notification, no reply
  }

  if (method === "tools/list") {
    reply(id, { tools: [TOOL] });
    return;
  }

  if (method === "tools/call") {
    const args = params?.arguments ?? {};
    if (LOG_PATH) {
      try {
        appendFileSync(
          LOG_PATH,
          `${new Date().toISOString()} ALLOW ${args.tool_name} ${JSON.stringify(args.input ?? {}).slice(0, 200)}\n`,
        );
      } catch {
        // logging is best-effort; don't fail the approval
      }
    }
    const decision = { behavior: "allow", updatedInput: args.input ?? {} };
    reply(id, {
      content: [{ type: "text", text: JSON.stringify(decision) }],
    });
    return;
  }

  if (id != null) {
    replyErr(id, -32601, `method not found: ${method}`);
  }
});

rl.on("close", () => process.exit(0));
