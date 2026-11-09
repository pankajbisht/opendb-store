// Serves the repository for the examples in public/. Local development only.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { URL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 4321;
const host = '127.0.0.1';
const ALLOWED = [join(root, 'public'), join(root, 'dist')];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

function isDirectory(path) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

createServer((request, response) => {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  if (pathname === '/') {
    response.writeHead(302, { location: '/public/' }).end();
    return;
  }

  const target = join(root, pathname);

  // Only the examples and the built library are served, never .git or source.
  const allowed = ALLOWED.some(
    (folder) => target === folder || target.startsWith(folder + sep)
  );

  if (!allowed) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  // Relative links in a page need a trailing slash on its folder.
  if (isDirectory(target) && !pathname.endsWith('/')) {
    response.writeHead(302, { location: `${pathname}/` }).end();
    return;
  }

  const file = isDirectory(target) ? join(target, 'index.html') : target;

  if (!isFile(file)) {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`Examples: http://${host}:${port}/public/`);
});
