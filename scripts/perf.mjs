// Full-page scroll under 4x CPU throttling with a Chrome performance trace.
// Usage: node scripts/perf.mjs <url> <out-dir> [phone|desktop]
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";

const url = process.argv[2] || "https://rrozenv.github.io/gmbet-c/";
const out = process.argv[3] || "/tmp/gmbet-c-perf";
const kind = process.argv[4] || "phone";
mkdirSync(out, { recursive: true });
const CHROME =
  process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const phone = kind === "phone";
const ctx = await browser.newContext(
  phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(7000);
const tier = await page.evaluate(() => document.querySelector("[data-stage]").dataset.tier);

const chunks = [];
cdp.on("Tracing.dataCollected", (e) => chunks.push(...e.value));
const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
await cdp.send("Tracing.start", {
  categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "blink.user_timing", "loading", "latencyInfo", "cc", "gpu", "viz"].join(","),
  transferMode: "ReportEvents",
});

const DURATION = 24;
const stats = await page.evaluate(
  (DURATION) =>
    new Promise((resolve) => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const deltas = [];
      let longTasks = 0;
      let longest = 0;
      const po = new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => {
          longTasks += 1;
          longest = Math.max(longest, e.duration);
        }),
      );
      po.observe({ type: "longtask", buffered: false });
      let cls = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (cls += e.value))).observe({ type: "layout-shift", buffered: false });
      const t0 = performance.now();
      let prev = t0;
      const step = (now) => {
        deltas.push(now - prev);
        prev = now;
        const t = (now - t0) / 1000;
        const p = Math.min(1, t / DURATION);
        const y = total * p;
        if (window.lenis) window.lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
        if (p < 1) requestAnimationFrame(step);
        else {
          po.disconnect();
          const d = deltas.slice(2).sort((a, b) => a - b);
          const sum = d.reduce((a, b) => a + b, 0);
          const q = (x) => d[Math.min(d.length - 1, Math.floor(d.length * x))];
          resolve({
            frames: d.length,
            avgFps: (1000 * d.length) / sum,
            medianMs: q(0.5),
            p95Ms: q(0.95),
            p99Ms: q(0.99),
            maxMs: d[d.length - 1],
            over20ms: d.filter((x) => x > 20).length,
            over25ms: d.filter((x) => x > 25).length,
            over34ms: d.filter((x) => x > 34).length,
            longTasks,
            longestTaskMs: longest,
            cls,
          });
        }
      };
      requestAnimationFrame(step);
    }),
  DURATION,
);
await cdp.send("Tracing.end");
await done;
const tierAfter = await page.evaluate(() => document.querySelector("[data-stage]").dataset.tier);

// Frames the compositor reports as dropped (PipelineReporter states).
const states = {};
for (const e of chunks) {
  if (e.name === "PipelineReporter" && e.ph === "b" && e.args && e.args.chrome_frame_reporter) {
    const s = e.args.chrome_frame_reporter.state || "unknown";
    states[s] = (states[s] || 0) + 1;
  }
}
const traceFile = `${out}/trace-${kind}-4x-cpu.json`;
writeFileSync(traceFile, JSON.stringify({ traceEvents: chunks }));
const result = { url, kind, cpuThrottle: "4x", qualityTierStart: tier, qualityTierEnd: tierAfter, scrollSeconds: DURATION, ...stats, compositorFrames: states, traceFile };
writeFileSync(`${out}/perf-${kind}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
