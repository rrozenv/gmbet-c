# GM Bet, concept C: Globe at night

Landing page concept. The world is the board: a night Earth lit for 3 a.m. in New York and 4 p.m. in Seoul, an arc between the two players, and one continuous camera move from orbit down onto a chess board that hangs at the arc's apex. The mate plays out on the board, then the payout.

Live: https://rrozenv.github.io/gmbet-c/

## Stack

- Vite, three.js, postprocessing (depth of field, bloom, ACES tone mapping, vignette, film grain).
- GSAP ScrollTrigger scrubs one timeline on a 25-beat grid. Lenis smooths the scroll.
- Waitlist: the same Supabase project and `join_waitlist` / `waitlist_place` functions as the main site. Signups from this page carry the source tag `concept-c`.

## Assets and credits

- Chess set: "Chess Set" by Riley Queen, CC0, Poly Haven. Optimized with glTF-Transform (meshopt, WebP), every piece kept as its own node.
- Studio HDRI: "Studio Small 09" by Sergej Majboroda, CC0, Poly Haven.
- Earth day, night lights, clouds, water mask: NASA Visible Earth and Earth Observatory (public domain), via the three-globe examples.

## Commands

```sh
npm install
npm run dev                  # http://127.0.0.1:5183/gmbet-c/
node scripts/assets.mjs      # re-render share-card still, link preview, icons (dev server running)
node scripts/record.mjs      # screenshots and 15 s scroll recording
bash scripts/deploy.sh       # build and publish to gh-pages
```

`?still` and `?og` render the share-card board and the link preview. Visitors never see them.
