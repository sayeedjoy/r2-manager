function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Shared file</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f4f4f5; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
  .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); width: 100%; max-width: 360px; }
  h1 { font-size: 1.1rem; margin: 0 0 1rem; }
  input { width: 100%; padding: 0.6rem; border: 1px solid #d4d4d8; border-radius: 8px; margin-bottom: 0.75rem; box-sizing: border-box; }
  button { width: 100%; padding: 0.6rem; border: none; border-radius: 8px; background: #18181b; color: white; font-weight: 600; cursor: pointer; }
  .error { color: #b91c1c; font-size: 0.875rem; margin-bottom: 0.75rem; }
</style>
</head>
<body>
<div class="card">${bodyHtml}</div>
</body>
</html>`;
}

/** SHARE-02: small server-rendered password prompt. No management auth, no client bundle. */
export function renderPasswordPage(token: string, invalid: boolean): string {
  const errorHtml = invalid ? `<p class="error">Incorrect password. Please try again.</p>` : "";
  return layout(`
    <h1>This file is password protected</h1>
    ${errorHtml}
    <form method="post" action="/s/${escapeHtml(token)}">
      <input type="password" name="password" placeholder="Password" autofocus required />
      <button type="submit">View file</button>
    </form>
  `);
}

export function renderErrorPage(message: string): string {
  return layout(`<h1>Unavailable</h1><p>${escapeHtml(message)}</p>`);
}
