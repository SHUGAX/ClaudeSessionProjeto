// Minimal API gateway for the local test stack (replaces Kong): routes
//   /auth/v1/*    → GoTrue
//   /rest/v1/*    → PostgREST
//   /storage/v1/* → Storage API
// and answers CORS preflights. Local testing only.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const ROUTES = [
  { prefix: "/auth/v1", target: process.env.GOTRUE_URL ?? "http://127.0.0.1:9999" },
  { prefix: "/rest/v1", target: process.env.POSTGREST_URL ?? "http://127.0.0.1:54330" },
  { prefix: "/storage/v1", target: process.env.STORAGE_URL ?? "http://127.0.0.1:5000" },
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "access-control-allow-headers":
    "authorization,apikey,content-type,x-client-info,x-upsert,cache-control,prefer,range,accept-profile,content-profile,x-supabase-api-version",
  "access-control-expose-headers": "content-range,content-length,etag",
  "access-control-max-age": "3600",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    const route = ROUTES.find((r) => req.url === r.prefix || req.url.startsWith(`${r.prefix}/`) || req.url.startsWith(`${r.prefix}?`));
    if (!route) {
      res.writeHead(404, { "content-type": "application/json", ...CORS });
      return res.end(JSON.stringify({ message: "no route" }));
    }
    const target = new URL(route.target);
    const path = req.url.slice(route.prefix.length) || "/";
    const headers = { ...req.headers, host: target.host };
    const upstream = http.request(
      { hostname: target.hostname, port: target.port, path, method: req.method, headers },
      (up) => {
        const outHeaders = { ...up.headers, ...CORS };
        res.writeHead(up.statusCode ?? 502, outHeaders);
        up.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(502, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ message: `upstream error: ${err.message}` }));
    });
    req.pipe(upstream);
  })
  .listen(PORT, "0.0.0.0", () => console.log(`gateway listening on ${PORT}`));
