import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const outputRoot = path.join(projectRoot, 'output');
const port = Number(process.env.PORT ?? 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';

const contentTypes = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png']
]);

function isPathInsideOutput(resolvedPath: string): boolean {
  const relativePath = path.relative(outputRoot, resolvedPath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function createIndexHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tile Generator Preview</title>
    <style>
      body {
        margin: 0;
        padding: 2rem;
        font: 16px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        color: #0f172a;
        background: #f8fafc;
      }
      main {
        max-width: 52rem;
      }
      .callout {
        margin: 0 0 1.5rem;
        padding: 1rem 1.25rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.75rem;
        background: #ffffff;
      }
      .callout strong {
        display: block;
        margin-bottom: 0.35rem;
      }
      a {
        color: #0f172a;
      }
      code {
        background: #e2e8f0;
        padding: 0.125rem 0.25rem;
        border-radius: 0.25rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Tile Generator Output</h1>
      <div class="callout">
        <strong>This page is only the tile/data server.</strong>
        The Leaflet map UI lives in the repo root Vite app.
        Start it with <code>npm run dev</code> from the repo root, then open
        <a href="${frontendOrigin}">${frontendOrigin}</a>.
      </div>
      <p>Served from <code>${outputRoot}</code>.</p>
      <p>Useful files:</p>
      <ul>
        <li><a href="/metadata.json">/metadata.json</a></li>
        <li><a href="/points.json">/points.json</a></li>
        <li><a href="/sales.json">/sales.json</a> <small>(legacy alias)</small></li>
        <li><code>/tiles/{z}/{x}/{y}.png</code></li>
      </ul>
    </main>
  </body>
</html>`;
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  response.setHeader('Access-Control-Allow-Origin', '*');

  if (!request.url) {
    response.statusCode = 400;
    response.end('Missing request URL.');
    return;
  }

  const requestPath = new URL(request.url, `http://127.0.0.1:${port}`).pathname;

  if (requestPath === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(createIndexHtml());
    return;
  }

  const resolvedPath = path.resolve(outputRoot, `.${requestPath}`);
  if (!isPathInsideOutput(resolvedPath)) {
    response.statusCode = 403;
    response.end('Forbidden.');
    return;
  }

  try {
    const file = await readFile(resolvedPath);
    response.setHeader(
      'Content-Type',
      contentTypes.get(path.extname(resolvedPath)) ?? 'application/octet-stream'
    );
    response.end(file);
  } catch (error) {
    response.statusCode = 404;
    response.end(`Not found: ${requestPath}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${outputRoot} on http://127.0.0.1:${port}`);
});
