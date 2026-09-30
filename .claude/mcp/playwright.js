#!/usr/bin/env node
// Launches the Playwright MCP server with settings that fit where Claude Code
// runs. Locally: a visible browser window. In Claude Code cloud sessions
// (CLAUDE_CODE_REMOTE=true, no display): headless, using the preinstalled
// Chromium and the session's HTTPS proxy. Any PLAYWRIGHT_MCP_* variable you
// set yourself wins over these defaults.
const { spawn } = require("child_process");
const fs = require("fs");

const VERSION = "0.0.83";
const env = { ...process.env };
const setDefault = (key, value) => {
  if (env[key] === undefined) env[key] = value;
};

const remote = env.CLAUDE_CODE_REMOTE === "true";
const noDisplay = process.platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY;
if (remote || noDisplay) setDefault("PLAYWRIGHT_MCP_HEADLESS", "true");
// Chromium's sandbox cannot start as root (the case in cloud containers).
if (process.getuid?.() === 0) setDefault("PLAYWRIGHT_MCP_SANDBOX", "false");

if (remote) {
  const preinstalled = "/opt/pw-browsers/chromium";
  if (fs.existsSync(preinstalled)) setDefault("PLAYWRIGHT_MCP_EXECUTABLE_PATH", preinstalled);
  const proxy = env.HTTPS_PROXY || env.https_proxy;
  if (proxy) {
    setDefault("PLAYWRIGHT_MCP_PROXY_SERVER", proxy);
    setDefault("PLAYWRIGHT_MCP_PROXY_BYPASS", "localhost,127.0.0.1"); // pages served locally for testing
    // The session proxy re-signs TLS with its own CA, which Chromium doesn't trust.
    setDefault("PLAYWRIGHT_MCP_IGNORE_HTTPS_ERRORS", "true");
  }
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(npx, ["-y", `@playwright/mcp@${VERSION}`, "--isolated", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
