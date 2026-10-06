"use client";

/** Last-resort boundary (renders its own <html>; no providers available). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-PT">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Ocorreu um erro · Something went wrong</h1>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "8px 16px" }}>
            Tentar novamente · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
