#!/usr/bin/env node
// PostToolUse hook: after Claude edits index.html, syntax-check every inline
// <script> block. A syntax error there makes the page render blank with no
// visible error, so we surface it to Claude immediately (exit code 2).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let filePath;
  try {
    filePath = JSON.parse(input).tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (!filePath || !filePath.endsWith(".html") || !fs.existsSync(filePath)) {
    process.exit(0);
  }

  const html = fs.readFileSync(filePath, "utf8");
  const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const errors = [];
  let match;
  while ((match = scriptRe.exec(html))) {
    const startLine = html.slice(0, match.index + match[0].indexOf(">") + 1).split("\n").length;
    try {
      new vm.Script(match[1], { filename: path.basename(filePath) });
    } catch (err) {
      const line = (err.stack.match(/:(\d+)\n/) || [])[1];
      const where = line ? ` near line ${startLine + Number(line) - 1}` : "";
      errors.push(`${err.name}: ${err.message}${where}`);
    }
  }

  if (errors.length) {
    console.error(
      `${path.basename(filePath)}: inline script has a syntax error — the page would render blank.\n` +
        errors.join("\n")
    );
    process.exit(2);
  }
});
