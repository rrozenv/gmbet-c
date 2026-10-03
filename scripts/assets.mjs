// Renders the share-card still, the link preview, and the icons from the running dev server.
// Usage: node scripts/assets.mjs [base-url]
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const url = process.argv[2] || "http://127.0.0.1:5183/gmbet-c/";
const CHROME =
  process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: CHROME, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
mkdirSync("public/img", { recursive: true });

async function shot(query, viewport, out, wait = 7000, opts = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(url + query, { waitUntil: "networkidle" });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out, ...opts });
  await page.close();
}

await shot("?still", { width: 640, height: 640 }, "public/img/final-board.jpg", 7000, { type: "jpeg", quality: 86 });
await shot("?og", { width: 1200, height: 630 }, "public/og.png");
await shot("?poster", { width: 1000, height: 1000 }, "/tmp/globe-poster.png");
execFileSync("cwebp", ["-quiet", "-q", "78", "/tmp/globe-poster.png", "-o", "public/img/globe-poster.webp"]);

const svg = readFileSync("public/favicon.svg", "utf8");
for (const [size, name] of [
  [32, "favicon-32.png"],
  [180, "apple-touch-icon.png"],
  [512, "icon-512.png"],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("assets written");
