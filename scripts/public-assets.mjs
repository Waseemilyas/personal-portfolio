import monitoring from "../src/_data/monitoring.js";

// Exact passthrough paths. Adding a file beside a public asset does not publish it.
export const publicAssets = {
  "src/static/CNAME": "CNAME",
  "src/static/apple-touch-icon.png": "apple-touch-icon.png",
  "src/static/favicon.ico": "favicon.ico",
  "src/static/humans.txt": "humans.txt",
  "src/static/robots.txt": "robots.txt",
  "src/static/site.webmanifest": "site.webmanifest",
  "src/assets/css/styles.css": "assets/css/styles.css",
  "src/assets/fonts/Geist-Core.woff2": "assets/fonts/Geist-Core.woff2",
  "src/assets/fonts/Geist-Italic-Core.woff2": "assets/fonts/Geist-Italic-Core.woff2",
  "src/assets/fonts/Geist-Italic-LatinExtra.woff2": "assets/fonts/Geist-Italic-LatinExtra.woff2",
  "src/assets/fonts/Geist-Italic-Variable.woff2": "assets/fonts/Geist-Italic-Variable.woff2",
  "src/assets/fonts/Geist-LatinExtra.woff2": "assets/fonts/Geist-LatinExtra.woff2",
  "src/assets/fonts/Geist-Variable.woff2": "assets/fonts/Geist-Variable.woff2",
  "src/assets/fonts/GeistMono-Core.woff2": "assets/fonts/GeistMono-Core.woff2",
  "src/assets/fonts/GeistMono-LatinExtra.woff2": "assets/fonts/GeistMono-LatinExtra.woff2",
  "src/assets/fonts/GeistMono-Variable.woff2": "assets/fonts/GeistMono-Variable.woff2",
  "src/assets/fonts/OFL.txt": "assets/fonts/OFL.txt",
  "src/assets/img/favicon.svg": "assets/img/favicon.svg",
  "src/assets/img/icon-192.png": "assets/img/icon-192.png",
  "src/assets/img/icon-512.png": "assets/img/icon-512.png",
  [`vendor/${monitoring.sdkFile}`]: `assets/js/${monitoring.sdkFile}`,
  // Home Assistant fetches these paths even though no page links to them.
  "audio/adhan.mp3": "audio/adhan.mp3",
  "audio/iftar.mp3": "audio/iftar.mp3",
  "audio/sehri.mp3": "audio/sehri.mp3",
};
