// Copies the pdf.js worker to /public so it is served from our own origin
// (keeps the Content-Security-Policy strict: worker-src 'self').
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const source = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const target = path.join(process.cwd(), "public", "pdf.worker.min.mjs");
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
