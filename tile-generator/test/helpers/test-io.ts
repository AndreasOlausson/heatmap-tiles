import { createHash, type BinaryLike } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

export async function createTempDir(
  t: TestContext,
  prefix = 'tile-generator-test-'
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

export function sha256(value: BinaryLike): string {
  return createHash('sha256').update(value).digest('hex');
}

async function walkFiles(rootDirectory: string, currentDirectory: string): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(rootDirectory, entryPath);
      }
      return [path.relative(rootDirectory, entryPath)];
    })
  );

  return files.flat().sort();
}

export async function collectDirectoryHashes(
  rootDirectory: string
): Promise<Record<string, string>> {
  const relativePaths = await walkFiles(rootDirectory, rootDirectory);
  const hashes: Record<string, string> = {};

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDirectory, relativePath);
    hashes[relativePath.split(path.sep).join('/')] = sha256(await readFile(absolutePath));
  }

  return hashes;
}
