import "./style.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

const CFG = {
  brand: "GM Bet",
  siteUrl: "https://rrozenv.github.io/gmbet-c/",
  supabaseUrl: "https://dxsptaffwzefavffhrfk.supabase.co",
  // Publishable key: it can only call join_waitlist and waitlist_place.
  supabaseKey: "sb_publishable_YRKJHEES6HwLRlD4vmr69g_V7c7P6Bx",
  sourceTag: "concept-c",
};

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const stillMode = params.has("still");
const ogMode = params.has("og");
const posterMode = params.has("poster");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || stillMode || ogMode || posterMode;
if (stillMode) document.documentElement.classList.add("still");
if (ogMode) document.documentElement.classList.add("og");
if (posterMode) document.documentElement.classList.add("still", "poster");
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

gsap.registerPlugin(ScrollTrigger);

const dive = $("#dive");
const stage = $("[data-stage]");
const canvas = $("[data-globe]");
const hero = $("[data-hero]");
const tag = $("[data-preview-tag]");
const lines = $$("[data-line]");
const hud = $("[data-hud]");
const caps = $$("[data-cap]");
const steps = $$("[data-step]");
const pot = $("[data-pot]");
const potValue = $("[data-pot-value]");
const potLabel = $("[data-pot-label]");
const chipMin = $('[data-chip="min"]');
const chipYou = $('[data-chip="you"]');
const payout = $("[data-payout]");
const win = $("[data-win]");

/* Smooth scroll */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.2 });
  lenis.on("scroll", ScrollTrigger.update);
  window.lenis = lenis;
}
// One requestAnimationFrame loop for everything: Lenis, ScrollTrigger (via Lenis), the timeline, and the WebGL frame.
gsap.ticker.lagSmoothing(0);
gsap.ticker.add((t) => {
  if (lenis) lenis.raf(t * 1000);
  if (world.tick) world.tick(performance.now());
});
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id.length < 2 || a.hasAttribute("data-jump")) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(el, { duration: 1.6 });
    else el.scrollIntoView();
    if (id === "#join") setTimeout(() => $('input[name="email"]').focus({ preventScroll: true }), lenis ? 1700 : 0);
  });
});

/* The 3D world: globe, arc, and the board at the arc's apex */
const S0 = { cam: 0, drift: 0, lock: 0, move: 0, check: 0, tip: 0, win: 0 };
let world = { S: S0 };
const webgl = (() => {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch (_) {
    return false;
  }
})();
const boot = () =>
  import("./scene.js").then(({ createScene, CITIES }) => {
    world = createScene({
      canvas,
      stage,
      base: BASE,
      reducedMotion: reduced,
      S: S0,
      anchors: { top: $(".hud-top"), bottom: $(".hud-bottom") },
      still: stillMode,
      poster: posterMode,
      onFirstFrame: () => {
        canvas.classList.add("ready");
        stage.classList.add("live");
      },
    });
    world.addLabel($('[data-city="nyc"]'), CITIES.nyc);
    world.addLabel($('[data-city="seoul"]'), CITIES.seoul);
    new IntersectionObserver(([e]) => world.setVisible(e.isIntersecting), { rootMargin: "64px" }).observe(stage);
  });
if (webgl) {
  // The poster paints first; WebGL boots once the page is idle or the visitor starts to scroll or touch.
  let booted = false;
  const go = () => {
    if (booted) return;
    booted = true;
    boot();
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  window.addEventListener("load", () => idle(go, { timeout: 2500 }), { once: true });
  ["pointerdown", "wheel", "touchstart", "keydown"].forEach((ev) => window.addEventListener(ev, go, { once: true, passive: true }));
  if (stillMode || ogMode || posterMode) go();
} else {
  document.documentElement.classList.add("no-webgl");
}
const S = S0;

/* DOM that follows the scene state. Text is written only when it changes. */
const last = {};
const setText = (el, key, v) => {
  if (last[key] !== v) {
    last[key] = v;
    el.textContent = v;
  }
};
const setClass = (el, cls, on) => {
  const k = cls + (el.dataset.chip || el.className);
  if (last[k] !== on) {
    last[k] = on;
    el.classList.toggle(cls, on);
  }
};
function syncHud() {
  const lockMin = clamp(S.lock * 2);
  const lockYou = clamp(S.lock * 2 - 1);
  const paid = S.win > 0.02;
  chipMin.style.opacity = String(1 - lockMin);
  chipMin.style.transform = `translate3d(0, ${(-8 * lockMin).toFixed(1)}px, 0) scale(${(1 - 0.25 * lockMin).toFixed(3)})`;
  if (paid) {
    chipYou.style.opacity = "1";
    chipYou.style.transform = "none";
  } else {
    chipYou.style.opacity = String(1 - lockYou);
    chipYou.style.transform = `translate3d(0, ${(8 * lockYou).toFixed(1)}px, 0) scale(${(1 - 0.25 * lockYou).toFixed(3)})`;
  }
  setClass(chipYou, "won", paid);
  setText(chipYou, "chip", paid ? "+$40" : "$20");
  setText(potValue, "pot", "$" + Math.round(20 * lockMin + 20 * lockYou));
  setClass(pot, "locked", S.lock > 0.99 && !paid);
  setClass(pot, "paid", paid);
  setText(potLabel, "potLabel", paid ? "Paid to you" : S.lock > 0.99 ? "Pot locked" : "Pot");
  setText(win, "win", String(Math.round(40 * clamp(S.win * 1.4))));
}

/* One timeline, scrubbed by scroll, on a grid of 25 beats (4 units each). Every move starts on a beat or half-beat. */
const BEAT = 4;
function buildTimeline() {
  const tl = gsap.timeline({ defaults: { ease: "none" }, paused: true, onUpdate: syncHud });
  const b = (n) => n * BEAT;
  tl.set({}, {}, b(25));
  tl.to(hero, { autoAlpha: 0, y: -40, duration: b(2), ease: "power2.in" }, b(0));
  tl.to(tag, { autoAlpha: 0, duration: b(1) }, b(0));
  tl.to(S, { cam: 1, duration: b(11), ease: "power2.inOut" }, b(1));
  const lineIn = (el, at) => tl.fromTo(el, { autoAlpha: 0, y: 24, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: b(1), ease: "power3.out" }, at);
  const lineOut = (el, at) => tl.to(el, { autoAlpha: 0, y: -24, scale: 1.02, duration: b(1), ease: "power2.in" }, at);
  lineIn(lines[0], b(3));
  lineOut(lines[0], b(5));
  lineIn(lines[1], b(6));
  lineOut(lines[1], b(9));

  tl.to(S, { drift: 1, duration: b(14), ease: "none" }, b(11));
  tl.set(hud, { autoAlpha: 1 }, b(11));
  tl.fromTo(".hud-player", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: b(1), stagger: b(0.5), ease: "power3.out" }, b(11));
  tl.fromTo([".eyebrow", ".pot", ".steps"], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: b(1), stagger: b(0.5), ease: "power3.out" }, b(12));

  const capIn = (i, at) => tl.fromTo(caps[i], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: b(1), ease: "power3.out" }, at);
  const capOut = (i, at) => tl.to(caps[i], { autoAlpha: 0, y: -24, duration: b(0.5), ease: "power2.in" }, at);
  capIn(0, b(12));
  capOut(0, b(14.5));
  capIn(1, b(15));
  tl.to(S, { lock: 1, duration: b(2), ease: "power1.inOut" }, b(15));
  capOut(1, b(17.5));
  capIn(2, b(18));
  tl.to(S, { move: 1, duration: b(1), ease: "power2.inOut" }, b(18));
  tl.to(S, { check: 1, duration: b(0.5), ease: "power2.out" }, b(19));
  tl.to(S, { tip: 1, duration: b(1), ease: "power3.in" }, b(20));
  capOut(2, b(21.5));

  tl.to([".hud-side", ".hud-player"], { autoAlpha: 0, duration: b(0.5) }, b(21.5));
  tl.to(S, { win: 1, duration: b(1.5), ease: "power2.out" }, b(22));
  tl.fromTo(payout, { autoAlpha: 0, scale: 0.86 }, { autoAlpha: 1, scale: 1, duration: b(1.5), ease: "expo.out" }, b(22));

  const segs = [
    [12, 15],
    [15, 18],
    [18, 21.5],
    [22, 24],
  ];
  segs.forEach(([x, y], i) => tl.fromTo(steps[i].firstElementChild, { scaleX: 0 }, { scaleX: 1, duration: b(y - x) }, b(x)));
  return tl;
}

const tl = buildTimeline();
if (stillMode) {
  Object.assign(S, { cam: 1, drift: 0.5, lock: 1, move: 1, check: 1, tip: 1, win: 0 });
}
if (stillMode || ogMode || posterMode) {
  // Asset renders: no scroll binding.
} else if (!reduced) {
  ScrollTrigger.create({
    trigger: dive,
    start: "top top",
    end: "bottom bottom",
    scrub: 0.6,
    animation: tl,
  });
} else {
  // Reduced motion: no flight. The scene cuts between the globe and the finished board.
  ScrollTrigger.create({
    trigger: dive,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (st) => {
      const p = st.progress;
      tl.progress(p < 0.12 ? 0 : p < 0.86 ? 0.86 : 0.98);
    },
  });
}

/* "Watch a match" glides to the board. */
$("[data-jump]").addEventListener("click", (e) => {
  e.preventDefault();
  const span = dive.offsetHeight - stage.offsetHeight;
  const top = dive.offsetTop + span * 0.5;
  if (lenis) lenis.scrollTo(top, { duration: 3.2, easing: (t) => 1 - Math.pow(1 - t, 3) });
  else window.scrollTo(0, top);
});

/* Live Chess.com lookup from the public API (client side). Nothing is stored. */
(() => {
  const form = $("[data-lookup]");
  const out = $("[data-lookup-out]");
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const USER = /^[A-Za-z0-9_-]{3,25}$/;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const say = (html) => (out.innerHTML = html);
  const getJSON = (url, signal) => fetch(url, { signal, headers: { Accept: "application/json" } }).then((r) => {
    if (r.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
  const pickMode = (stats) => {
    const modes = [
      ["chess_blitz", "Blitz"],
      ["chess_rapid", "Rapid"],
      ["chess_bullet", "Bullet"],
      ["chess_daily", "Daily"],
    ]
      .map(([k, label]) => {
        const m = stats[k];
        if (!m || !m.last || !m.record) return null;
        const r = m.record;
        return { label, rating: m.last.rating, win: r.win || 0, loss: r.loss || 0, draw: r.draw || 0, games: (r.win || 0) + (r.loss || 0) + (r.draw || 0) };
      })
      .filter(Boolean);
    return modes.sort((x, y) => y.games - x.games)[0] || null;
  };
  let ctrl = null;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = input.value.trim().replace(/^@/, "");
    if (!USER.test(u)) {
      say('<p class="lookup-msg err">Chess.com usernames are 3 to 25 letters, numbers, dashes, or underscores.</p>');
      input.focus();
      return;
    }
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    button.disabled = true;
    say('<p class="lookup-msg">Looking up <b>' + esc(u) + "</b> on Chess.com…</p>");
    try {
      const base = "https://api.chess.com/pub/player/" + encodeURIComponent(u.toLowerCase());
      const [profile, stats] = await Promise.all([getJSON(base, ctrl.signal), getJSON(base + "/stats", ctrl.signal).catch(() => ({}))]);
      const mode = pickMode(stats);
      const country = (profile.country || "").split("/").pop();
      const name = profile.username || u;
      const avatar = profile.avatar
        ? '<img class="me-avatar" src="' + esc(profile.avatar) + '" width="48" height="48" alt="" referrerpolicy="no-referrer" />'
        : '<span class="me-avatar me-initial" aria-hidden="true">' + esc(name[0].toUpperCase()) + "</span>";
      const title = profile.title ? '<span class="me-title">' + esc(profile.title) + "</span>" : "";
      const sub = [profile.name, country].filter(Boolean).map(esc).join(" · ");
      const statsHtml = mode
        ? '<dl class="me-stats num"><div><dt>' + esc(mode.label) + "</dt><dd>" + esc(mode.rating) + "</dd></div><div><dt>Record</dt><dd>" + esc(mode.win) + "–" + esc(mode.loss) + "–" + esc(mode.draw) + "</dd></div></dl>"
        : '<p class="lookup-msg">No rated games yet.</p>';
      say(
        '<div class="me">' +
          '<div class="me-head">' + avatar + '<div class="me-id"><b>' + title + esc(name) + "</b>" + (sub ? "<span>" + sub + "</span>" : "") + "</div></div>" +
          statsHtml +
          '<p class="me-ready">This is you? You’re ready to play.</p>' +
          '<a class="btn btn-primary btn-sm" href="#join" data-claim>Join with this account</a>' +
        "</div>",
      );
      out.querySelector("[data-claim]").addEventListener("click", (ev) => {
        ev.preventDefault();
        $('input[name="chess_username"]').value = name;
        if (lenis) lenis.scrollTo("#join", { duration: 1.4 });
        else $("#join").scrollIntoView();
        setTimeout(() => $('input[name="email"]').focus({ preventScroll: true }), lenis ? 1500 : 0);
      });
    } catch (err) {
      if (err.notFound) say('<p class="lookup-msg err">No Chess.com account called <b>' + esc(u) + "</b>. Check the spelling.</p>");
      else say('<p class="lookup-msg">Chess.com didn’t answer just now. You can still add your username when you join.</p>');
    } finally {
      clearTimeout(timer);
      button.disabled = false;
    }
  });
})();

/* Waitlist: the same Supabase project and functions as the main site. */
(() => {
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    },
  };
  const form = $("[data-form]");
  const team = $("[data-team]");
  const teamBox = form.querySelector('input[value="team"]');
  const status = $("[data-status]");
  const button = form.querySelector('button[type="submit"]');
  const invited = $("[data-invited]");
  const done = $("[data-done]");
  const doneMsg = $("[data-done-msg]");
  const place = $("[data-place]");
  const refs = $("[data-refs]");
  const invite = $("[data-invite]");
  const copy = $("[data-copy]");
  const share = $("[data-share]");
  const CODE = /^[a-z2-9]{7}$/;

  const rpc = (fn, body) =>
    fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const incoming = (new URLSearchParams(location.search).get("ref") || "").toLowerCase();
  if (CODE.test(incoming)) store.set("gm_ref", incoming);
  const ref = store.get("gm_ref");
  if (ref && ref !== store.get("gm_code")) invited.hidden = false;

  const countTo = (to) => {
    if (reduced) {
      place.textContent = "#" + to;
      return;
    }
    const from = Math.max(to + 1, to * 3);
    const t0 = performance.now();
    const step = (now) => {
      const t = clamp((now - t0) / 900);
      const e = 1 - Math.pow(1 - t, 3);
      place.textContent = "#" + Math.round(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const show = (info, already) => {
    store.set("gm_code", info.code);
    if (already) doneMsg.textContent = "You were already on it. We’ll email you when the beta opens in October.";
    const n = Number(info.referrals) || 0;
    refs.textContent = n + (n === 1 ? " friend" : " friends") + " joined with your link";
    invite.value = CFG.siteUrl + "?ref=" + info.code;
    if (navigator.share) share.hidden = false;
    form.hidden = true;
    done.hidden = false;
    countTo(Number(info.position) || 1);
  };

  const saved = store.get("gm_code");
  if (saved && CODE.test(saved)) {
    rpc("waitlist_place", { p_code: saved })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => info && info.code && show(info, false))
      .catch(() => {});
  }

  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(invite.value);
    } catch (_) {
      invite.select();
      document.execCommand("copy");
    }
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1600);
  });
  share.addEventListener("click", () => {
    navigator
      .share({ title: CFG.brand, text: "Play anyone in the world at chess, for real money. Join the " + CFG.brand + " beta:", url: invite.value })
      .catch(() => {});
  });

  form.addEventListener("change", () => {
    team.hidden = !teamBox.checked;
  });

  const say = (text, isError) => {
    status.textContent = text;
    status.classList.toggle("err", !!isError);
  };
  const clean = (v, max) => {
    const s = String(v || "").trim().slice(0, max);
    return s || null;
  };
  const sourceTag = () => {
    const q = new URLSearchParams(location.search);
    const parts = [CFG.sourceTag];
    ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => q.get(k) && parts.push(k + "=" + q.get(k)));
    const t = q.get("ref");
    if (t && !CODE.test(t.toLowerCase())) parts.push("ref=" + t);
    try {
      const r = document.referrer && new URL(document.referrer);
      if (r && r.host !== location.host) parts.push("referrer=" + r.host);
    } catch (_) {}
    return parts.join(" ").slice(0, 300);
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      say("Enter a valid email address.", true);
      form.querySelector('input[name="email"]').focus();
      return;
    }
    if (data.get("company")) return;
    const roles = data.getAll("roles");
    button.disabled = true;
    say("Sending…");
    try {
      const res = await rpc("join_waitlist", {
        p_email: email,
        p_roles: roles,
        p_chess_username: clean(data.get("chess_username"), 50),
        p_team_note: roles.includes("team") ? clean(data.get("team_note"), 500) : null,
        p_source: sourceTag(),
        p_ref: store.get("gm_ref"),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const info = await res.json();
      say("");
      show(info, info.already);
      done.focus();
    } catch (_) {
      say("That didn’t go through. Check your connection and try again.", true);
      button.disabled = false;
    }
  });
})();
