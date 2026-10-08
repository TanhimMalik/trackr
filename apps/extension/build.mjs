// Bundles the extension into dist/: one file per context (service worker,
// content script, popup), plus the manifest and static assets.
//   node build.mjs            production build, pointing at the live site
//   node build.mjs --dev      points at http://localhost:3000
//   node build.mjs --watch    rebuilds on change
//   TRACKR_URL=https://… node build.mjs   points at another deployment
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";

const args = new Set(process.argv.slice(2));
const dev = args.has("--dev");
const watch = args.has("--watch");
const trackrUrl = new URL(
  process.env.TRACKR_URL ??
    (dev ? "http://localhost:3000" : "https://trackr-coral-gamma.vercel.app"),
).origin;

const outdir = "dist";
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

// Supported job boards: where the content script runs.
const JOB_BOARDS = [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://boards.eu.greenhouse.io/*",
  "https://job-boards.eu.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.eu.lever.co/*",
  "https://jobs.ashbyhq.com/*",
];

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = {
  manifest_version: 3,
  name: dev ? "Trackr (development)" : "Trackr",
  version: pkg.version,
  description:
    "Adds job applications to Trackr as you submit them on Greenhouse, Lever and Ashby.",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_title: "Trackr",
    default_popup: "popup.html",
    default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
  },
  background: { service_worker: "background.js", type: "module" },
  // activeTab and scripting only let the popup read the page it was opened
  // on, to pre-fill the form on sites without a detector.
  permissions: ["storage", "alarms", "activeTab", "scripting"],
  host_permissions: [`${trackrUrl}/*`],
  content_scripts: [
    {
      matches: JOB_BOARDS,
      js: ["content.js"],
      run_at: "document_idle",
      // Greenhouse boards are often embedded in company sites as an iframe.
      all_frames: true,
    },
  ],
  externally_connectable: { matches: [`${trackrUrl}/*`] },
};

const shared = {
  bundle: true,
  target: "chrome120",
  sourcemap: dev ? "inline" : false,
  minify: !dev,
  define: { __TRACKR_URL__: JSON.stringify(trackrUrl) },
  logLevel: "info",
};

const contexts = [
  // The service worker is an ES module; the others are classic scripts.
  {
    entryPoints: ["src/background/index.ts"],
    outfile: `${outdir}/background.js`,
    format: "esm",
  },
  {
    entryPoints: ["src/content/index.ts"],
    outfile: `${outdir}/content.js`,
    format: "iife",
  },
  {
    entryPoints: ["src/popup/index.ts"],
    outfile: `${outdir}/popup.js`,
    format: "iife",
  },
];

await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2));
await cp("public", outdir, { recursive: true });
await cp("src/popup/popup.html", `${outdir}/popup.html`);
await cp("src/popup/popup.css", `${outdir}/popup.css`);

if (watch) {
  for (const options of contexts) {
    const context = await esbuild.context({ ...shared, ...options });
    await context.watch();
  }
  console.log(
    `Watching for changes. Load ${outdir}/ as an unpacked extension.`,
  );
} else {
  await Promise.all(
    contexts.map((options) => esbuild.build({ ...shared, ...options })),
  );
  console.log(
    `Built for ${trackrUrl}. Load ${outdir}/ as an unpacked extension.`,
  );
}
