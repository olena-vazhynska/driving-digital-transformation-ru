#!/usr/bin/env node
// Smoke test for index.html: loads the page in headless Chromium, plays the
// simulation from intro to debrief along two routes (always the first choice,
// always the last choice), and fails on anything that would break it for a
// learner: blank page, console/page errors, failed CDN loads, horizontal
// scroll at phone width. Saves screenshots for a visual check.
//
// Usage: node smoke-test.js [path/to/index.html] [--out <dir>] [--local-react]
//   --local-react  serve the React/ReactDOM UMD bundles from the npm registry
//                  instead of unpkg (for sandboxes whose network blocks unpkg)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { pathToFileURL } = require("url");

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {}
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "playwright"));
  } catch {}
  console.error(
    "Playwright not found. Install it with:\n  npm install -g playwright && npx playwright install chromium"
  );
  process.exit(3);
}

const args = process.argv.slice(2);
const localReact = args.includes("--local-react");
if (localReact) args.splice(args.indexOf("--local-react"), 1);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.join(os.tmpdir(), "smoke-test");
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const htmlPath = path.resolve(args[0] || path.join(projectDir, "index.html"));
fs.mkdirSync(outDir, { recursive: true });

// Download react@18 and react-dom@18 via npm and return {"react": file, "react-dom": file}.
function fetchLocalReact() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-react-"));
  const files = {};
  for (const pkg of ["react", "react-dom"]) {
    const tarball = execSync(`npm pack ${pkg}@18 --silent`, { cwd: dir, encoding: "utf8" }).trim().split("\n").pop();
    const pkgDir = path.join(dir, pkg);
    fs.mkdirSync(pkgDir);
    execSync(`tar -xzf "${path.join(dir, tarball)}" -C "${pkgDir}"`);
    files[pkg] = path.join(pkgDir, "package", "umd", `${pkg}.production.min.js`);
  }
  return files;
}

const VIEWPORTS = { phone: { width: 360, height: 780 }, desktop: { width: 1280, height: 900 } };
const ROUTES = ["first", "last"];

// Web fonts are cosmetic (the CSS falls back to system fonts), so a font that
// fails to load is a warning rather than a failure.
const isFont = (url) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url || "");

async function playRoute(browser, viewportName, route, problems, warnings, reactFiles) {
  const tag = `[${viewportName}/${route}]`;
  const context = await browser.newContext({ viewport: VIEWPORTS[viewportName] });
  if (reactFiles) {
    await context.route(/^https:\/\/unpkg\.com\/(react|react-dom)@18\//, (r) => {
      const pkg = r.request().url().match(/unpkg\.com\/(react-dom|react)@/)[1];
      r.fulfill({ path: reactFiles[pkg], contentType: "application/javascript" });
    });
  }
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && !isFont(m.location().url)) problems.push(`${tag} console error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${tag} page error: ${e.message}`));
  page.on("requestfailed", (r) => {
    const msg = `failed to load: ${r.url()} (${r.failure()?.errorText})`;
    if (!isFont(r.url())) problems.push(`${tag} ${msg}`);
    else if (!warnings.includes(msg)) warnings.push(msg);
  });

  const shot = async (name) => {
    if (route === "first") await page.screenshot({ path: path.join(outDir, `${viewportName}-${name}.png`), fullPage: true });
  };
  const checkOverflow = async (where) => {
    if (viewportName !== "phone") return;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`${tag} horizontal scroll on ${where}: content is ${overflow}px wider than the screen`);
  };

  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(30000); // CDN scripts and fonts can be slow
  let stages = 0;
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    const rendered = await page.locator("#root > *").count();
    if (!rendered) {
      problems.push(`${tag} blank page: #root has no content`);
      return 0;
    }
    await shot("1-intro");
    await checkOverflow("intro");

    await page.locator("button.btn").click();
    for (; stages < 50; stages++) {
      const choices = page.locator("button.choice");
      if (!(await choices.count())) break;
      if (stages === 0) {
        await shot("2-stage");
        await checkOverflow("first stage");
      }
      await (route === "first" ? choices.first() : choices.last()).click();
      await page.locator("button.btn").click();
    }

    if (!(await page.locator(".verdict").count())) {
      problems.push(`${tag} debrief screen did not appear after ${stages} stages`);
    } else {
      await page.waitForTimeout(900); // let gauge animations settle
      await shot("3-debrief");
      await checkOverflow("debrief");
    }
  } catch (err) {
    // A click that never becomes possible means the UI got stuck; the page
    // errors collected above usually say why.
    problems.push(`${tag} stuck at stage ${stages + 1}: ${err.message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
  return stages;
}

(async () => {
  if (!fs.existsSync(htmlPath)) {
    console.error(`File not found: ${htmlPath}`);
    process.exit(3);
  }
  const { chromium } = loadPlaywright();
  const reactFiles = localReact ? fetchLocalReact() : null;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const problems = [];
  const warnings = [];
  const summary = [];
  try {
    for (const viewportName of Object.keys(VIEWPORTS)) {
      for (const route of ROUTES) {
        const stages = await playRoute(browser, viewportName, route, problems, warnings, reactFiles);
        summary.push(`${viewportName}/${route}: ${stages} stages played`);
      }
    }
  } finally {
    await browser.close();
  }

  if (reactFiles) summary.push("(React served from npm via --local-react; the unpkg CDN itself was not tested)");
  console.log(summary.join("\n"));
  console.log(`Screenshots: ${outDir}`);
  if (warnings.length) {
    console.log(`\nWarnings (page still works, system fonts used):\n` + warnings.map((w) => `- ${w}`).join("\n"));
  }
  if (problems.length) {
    console.log(`\nFAIL — ${problems.length} problem(s):\n` + problems.map((p) => `- ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("\nPASS — page renders and plays through to the debrief on phone and desktop.");
})().catch((err) => {
  console.error(`Smoke test crashed: ${err.message}`);
  process.exit(2);
});
