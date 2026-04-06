import assert from 'node:assert/strict';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';

import { createPreviewServer } from '../src/server.ts';
import { createTempDir, writeJson } from './helpers/test-io.ts';

interface ResponseSnapshot {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

async function startPreviewServer(
  t: TestContext,
  outputRoot: string
): Promise<{ baseUrl: string }> {
  const server = createPreviewServer({
    outputRoot,
    frontendOrigin: 'http://127.0.0.1:5173'
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function request(
  baseUrl: string,
  method: 'GET' | 'HEAD',
  pathname: string,
  headers: Record<string, string> = {}
): Promise<ResponseSnapshot> {
  const targetUrl = new URL(pathname, baseUrl);

  return new Promise((resolve, reject) => {
    const request = httpRequest(
      targetUrl,
      {
        method,
        headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks)
          });
        });
      }
    );

    request.on('error', reject);
    request.end();
  });
}

async function createStaticOutput(t: TestContext): Promise<{
  baseUrl: string;
  metadataBody: string;
  pngBody: Buffer;
}> {
  const tempDirectory = await createTempDir(t);
  const outputRoot = path.join(tempDirectory, 'output');
  const metadataBody = `${JSON.stringify({ metric: { key: 'demo' }, zoom: { min: 1, max: 1 } }, null, 2)}\n`;
  const pointsBody = [{ id: 'point-0001', latitude: 58.41, longitude: 15.62, value: 1 }];
  const pngBody = Buffer.from('fake-png-binary');

  await writeJson(path.join(outputRoot, 'metadata.json'), JSON.parse(metadataBody));
  await writeJson(path.join(outputRoot, 'points.json'), pointsBody);
  await writeJson(path.join(outputRoot, 'sales.json'), pointsBody);
  await mkdir(path.join(outputRoot, 'tiles', '1', '2'), { recursive: true });
  await writeFile(path.join(outputRoot, 'tiles', '1', '2', '3.png'), pngBody);

  const { baseUrl } = await startPreviewServer(t, outputRoot);
  return {
    baseUrl,
    metadataBody,
    pngBody
  };
}

test('GET /metadata.json returns JSON with ETag', async (t) => {
  const { baseUrl, metadataBody } = await createStaticOutput(t);
  const response = await request(baseUrl, 'GET', '/metadata.json');

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.match(String(response.headers.etag ?? ''), /^"[0-9a-f]{64}"$/);
  assert.equal(response.body.toString('utf8'), metadataBody);
});

test('GET tile PNG returns image/png with ETag', async (t) => {
  const { baseUrl, pngBody } = await createStaticOutput(t);
  const response = await request(baseUrl, 'GET', '/tiles/1/2/3.png');

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.match(String(response.headers.etag ?? ''), /^"[0-9a-f]{64}"$/);
  assert.deepEqual(response.body, pngBody);
});

test('If-None-Match returns 304 without a body for metadata and tile resources', async (t) => {
  const { baseUrl } = await createStaticOutput(t);
  const metadataResponse = await request(baseUrl, 'GET', '/metadata.json');
  const tileResponse = await request(baseUrl, 'GET', '/tiles/1/2/3.png');

  const metadataNotModified = await request(baseUrl, 'GET', '/metadata.json', {
    'If-None-Match': String(metadataResponse.headers.etag)
  });
  const tileNotModified = await request(baseUrl, 'GET', '/tiles/1/2/3.png', {
    'If-None-Match': String(tileResponse.headers.etag)
  });

  assert.equal(metadataNotModified.statusCode, 304);
  assert.equal(metadataNotModified.body.length, 0);
  assert.equal(metadataNotModified.headers.etag, metadataResponse.headers.etag);

  assert.equal(tileNotModified.statusCode, 304);
  assert.equal(tileNotModified.body.length, 0);
  assert.equal(tileNotModified.headers.etag, tileResponse.headers.etag);
});

test('HEAD returns the same relevant headers as GET but no body', async (t) => {
  const { baseUrl } = await createStaticOutput(t);
  const metadataGet = await request(baseUrl, 'GET', '/metadata.json');
  const metadataHead = await request(baseUrl, 'HEAD', '/metadata.json');
  const tileGet = await request(baseUrl, 'GET', '/tiles/1/2/3.png');
  const tileHead = await request(baseUrl, 'HEAD', '/tiles/1/2/3.png');

  assert.equal(metadataHead.statusCode, 200);
  assert.equal(metadataHead.body.length, 0);
  assert.equal(metadataHead.headers['content-type'], metadataGet.headers['content-type']);
  assert.equal(metadataHead.headers['content-length'], metadataGet.headers['content-length']);
  assert.equal(metadataHead.headers.etag, metadataGet.headers.etag);

  assert.equal(tileHead.statusCode, 200);
  assert.equal(tileHead.body.length, 0);
  assert.equal(tileHead.headers['content-type'], tileGet.headers['content-type']);
  assert.equal(tileHead.headers['content-length'], tileGet.headers['content-length']);
  assert.equal(tileHead.headers.etag, tileGet.headers.etag);
});

test('ETag remains stable across repeated GET requests for the same resource', async (t) => {
  const { baseUrl } = await createStaticOutput(t);
  const firstResponse = await request(baseUrl, 'GET', '/metadata.json');
  const secondResponse = await request(baseUrl, 'GET', '/metadata.json');

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstResponse.headers.etag, secondResponse.headers.etag);
});

test('missing resources still return 404', async (t) => {
  const { baseUrl } = await createStaticOutput(t);
  const response = await request(baseUrl, 'GET', '/tiles/9/9/9.png');

  assert.equal(response.statusCode, 404);
  assert.match(response.body.toString('utf8'), /Not found: \/tiles\/9\/9\/9\.png/);
});
