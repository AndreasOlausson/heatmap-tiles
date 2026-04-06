import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, '..');
const defaultOutputRoot = path.join(projectRoot, 'output');
const defaultPort = Number(process.env.PORT ?? 3001);
const defaultFrontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';

const contentTypes = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png']
]);

export interface PreviewServerOptions {
  outputRoot?: string;
  frontendOrigin?: string;
}

function isPathInsideOutput(outputRoot: string, resolvedPath: string): boolean {
  const relativePath = path.relative(outputRoot, resolvedPath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function createEntityTag(file: Buffer): string {
  return `"${createHash('sha256').update(file).digest('hex')}"`;
}

function sendBody(
  request: IncomingMessage,
  response: ServerResponse,
  body: Buffer | string
): void {
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  response.end(body);
}

function createIndexHtml(outputRoot: string, frontendOrigin: string): string {
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

export function createPreviewServer(
  options: PreviewServerOptions = {}
): Server {
  const outputRoot = options.outputRoot ?? defaultOutputRoot;
  const frontendOrigin = options.frontendOrigin ?? defaultFrontendOrigin;

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Access-Control-Allow-Origin', '*');

    if (!request.url) {
      response.statusCode = 400;
      sendBody(request, response, 'Missing request URL.');
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      sendBody(request, response, 'Method not allowed.');
      return;
    }

    const requestPath = new URL(request.url, `http://127.0.0.1:${defaultPort}`).pathname;

    if (requestPath === '/') {
      const html = createIndexHtml(outputRoot, frontendOrigin);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Content-Length', Buffer.byteLength(html));
      sendBody(request, response, html);
      return;
    }

    const resolvedPath = path.resolve(outputRoot, `.${requestPath}`);
    if (!isPathInsideOutput(outputRoot, resolvedPath)) {
      response.statusCode = 403;
      sendBody(request, response, 'Forbidden.');
      return;
    }

    try {
      const file = await readFile(resolvedPath);
      const entityTag = createEntityTag(file);

      response.setHeader(
        'Content-Type',
        contentTypes.get(path.extname(resolvedPath)) ?? 'application/octet-stream'
      );
      response.setHeader('Content-Length', file.byteLength);
      response.setHeader('ETag', entityTag);

      if (request.headers['if-none-match'] === entityTag) {
        response.statusCode = 304;
        response.removeHeader('Content-Length');
        sendBody(request, response, '');
        return;
      }

      sendBody(request, response, file);
    } catch (error) {
      response.statusCode = 404;
      sendBody(request, response, `Not found: ${requestPath}`);
    }
  });
}

function isExecutedDirectly(metaUrl: string): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && pathToFileURL(path.resolve(entryPoint)).href === metaUrl;
}

async function main(): Promise<void> {
  const server = createPreviewServer();
  server.listen(defaultPort, '127.0.0.1', () => {
    console.log(`Serving ${defaultOutputRoot} on http://127.0.0.1:${defaultPort}`);
  });
}

if (isExecutedDirectly(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
