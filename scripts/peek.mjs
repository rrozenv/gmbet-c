// Quick look while building: node scripts/peek.mjs <url> <out-dir> [progress values...]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:5183/gmbet-c/";
const out = process.argv[3] || "/tmp/gmbet-c-peek";
const stops = (process.argv.slice(4).length ? process.argv.slice(4) : ["0", "0.2", "0.45", "0.56", "0.75", "0.95"]).map(Number);
mkdirSync(out, { recursive: true });

export const CHROME =
  process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
for (const [name, vp, mobile] of [
  ["desktop", { width: 1440, height: 900 }, false],
  ["phone", { width: 390, height: 844 }, true],
]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const logs = [];
  page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  for (const p of stops) {
    await page.evaluate((p) => {
      const d = document.getElementById("dive");
      const span = d.offsetHeight - window.innerHeight;
      window.scrollTo(0, d.offsetTop + span * p);
    }, p);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${name}-${String(p).replace(".", "_")}.png` });
  }
  for (const id of ["how", "friends", "join"]) {
    await page.evaluate((id) => document.getElementById(id).scrollIntoView(), id);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-${id}.png` });
  }
  console.log(name, logs.join("\n"));
  await page.close();
}
await browser.close();
