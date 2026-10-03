import { defineConfig } from "vite";

export default defineConfig({
  base: "/gmbet-c/",
  build: {
    target: "es2020",
    // Inlines the 29 KB font into the CSS so text never reflows when it loads.
    assetsInlineLimit: 40000,
    rollupOptions: { input: { main: "index.html" } },
  },
  server: { port: 5183, strictPort: true },
});
