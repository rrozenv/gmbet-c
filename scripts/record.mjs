// Screenshots at 390x844 and 1440x900, and a 15 s scroll recording (Playwright video, converted to mp4).
// Usage: node scripts/record.mjs <url> <out-dir>
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";

const url = process.argv[2] || "https://rrozenv.github.io/gmbet-c/";
const out = process.argv[3] || "/tmp/gmbet-c-media";
const only = process.argv[4] || "all";
mkdirSync(out, { recursive: true });
const CHROME =
  process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
});

// The waitlist is real; screenshots use a stubbed reply so no test rows reach the table.
const stub = async (page) => {
  await page.route("**/rest/v1/rpc/join_waitlist", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "demo234", referrals: 0, position: 1, already: false }) }),
  );
};

const toProgress = (page, p) =>
  page.evaluate((p) => {
    const d = document.getElementById("dive");
    const span = d.offsetHeight - window.innerHeight;
    window.lenis ? window.lenis.scrollTo(d.offsetTop + span * p, { immediate: true }) : window.scrollTo(0, d.offsetTop + span * p);
  }, p);

async function stills(name, viewport, dpr, mobile) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  const beats = [
    ["01-hero", 0],
    ["02-orbit", 0.2],
    ["03-descent", 0.3],
    ["04-board-matched", 0.52],
    ["05-stakes-locked", 0.68],
    ["06-checkmate", 0.835],
    ["07-win", 0.97],
  ];
  for (const [label, p] of beats) {
    await toProgress(page, p);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}/${name}-${label}.png` });
  }
  for (const id of ["how", "friends", "join"]) {
    await page.evaluate((id) => (window.lenis ? window.lenis.scrollTo("#" + id, { immediate: true }) : document.getElementById(id).scrollIntoView()), id);
    await page.waitForTimeout(700);
    if (id === "how") {
      await page.fill("#cc-user", "hikaru");
      await page.click(".lookup button");
      await page.waitForSelector(".me, .lookup-msg.err", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (mobile) await page.locator(".lookup").scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: `${out}/${name}-0${["how", "friends", "join"].indexOf(id) + 8}-${id}.png` });
  }
  await page.fill('input[name="email"]', "you@example.com");
  await page.fill('input[name="chess_username"]', "magnus");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1400);
  await page.locator("[data-done]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${name}-11-waitlist-done.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(name, "horizontal overflow px:", overflow, "errors:", errors.length ? errors : "none");
  await page.close();
}

async function recording(name, viewport) {
  const dir = `/tmp/gmbet-c-video-${name}`;
  rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, recordVideo: { dir, size: viewport } });
  const page = await ctx.newPage();
  await stub(page);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(6500);
  const start = (Date.now() - t0) / 1000;
  // 1 s on the turning globe, 11.5 s through the dive (25 beats), 2.5 s across the sections to the waitlist.
  const geo = await page.evaluate(() => {
    const d = document.getElementById("dive");
    return { diveTop: d.offsetTop, diveEnd: d.offsetTop + d.offsetHeight - window.innerHeight, joinTop: document.getElementById("join").offsetTop };
  });
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const s0 = Date.now();
  for (;;) {
    const t = (Date.now() - s0) / 1000;
    if (t > 15.2) break;
    let y = 0;
    if (t < 1) y = 0;
    else if (t < 12.5) y = geo.diveTop + (geo.diveEnd - geo.diveTop) * ((t - 1) / 11.5);
    else y = geo.diveEnd + (geo.joinTop - geo.diveEnd) * ease(Math.min(1, (t - 12.5) / 2.5));
    await page.evaluate((y) => (window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y)), y);
    await page.waitForTimeout(16);
  }
  const fps = 0;
  await ctx.close();
  const webm = readdirSync(dir).find((f) => f.endsWith(".webm"));
  const mp4 = `${out}/${name}-scroll-15s.mp4`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", start.toFixed(2), "-t", "15", "-i", `${dir}/${webm}`, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  console.log(name, "recording:", mp4);
}

if (only === "all" || only === "stills") {
  await stills("desktop-1440x900", { width: 1440, height: 900 }, 1, false);
  await stills("phone-390x844", { width: 390, height: 844 }, 3, true);
}
if (only === "all" || only === "video") {
  await recording("desktop-1440x900", { width: 1440, height: 900 });
}
await browser.close();
