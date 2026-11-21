import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { MEDIA_SCHEME } from '@trifold/api';
import type { IconResources } from './icons';
import type { LibrarySession } from './library/session';

/**
 * `trifold-media://` serves local files to the renderer: `library/<Library-relative path>` for
 * scene images and token art inside the open Library, `icons/<name>.svg` for bundled glyphs and
 * `track/<id>` for music files wherever they live. Library paths that escape the root are
 * refused by `LibraryStore.resolvePath`. Must be registered before `app.whenReady()`.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
        // The renderer runs from file:// in production; fetch() and Web Audio need CORS to read
        // scene images, glyphs and tracks (a media element without it is muted by Web Audio).
        corsEnabled: true,
      },
    },
  ]);
}

/** Serves a local file with the CORS header every origin in this app may read it with. */
async function serveFile(path: string, request: Request): Promise<Response> {
  const upstream = await net.fetch(pathToFileURL(path).toString(), { headers: request.headers });
  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Accept-Ranges', 'bytes');
  return new Response(upstream.body, { status: upstream.status, headers });
}

function mediaUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === `${MEDIA_SCHEME}:` ? url : null;
  } catch {
    return null;
  }
}

/**
 * The SVG text of the bundled glyph a `trifold-media://icons/<name>.svg` URL names, or null.
 * Glyphs live in one bundle file, not one file each (`IconResources`), so they are served as text.
 */
export function resolveMediaIcon(rawUrl: string, icons: IconResources): string | null {
  const url = mediaUrl(rawUrl);
  if (url?.host !== 'icons') return null;
  return icons.svg(decodeURIComponent(url.pathname.replace(/^\//, '')));
}

/**
 * The file a `trifold-media://` URL names, or null when it names no servable file: a music track
 * or a file inside the open Library (bundled icons go through `resolveMediaIcon`). The table
 * server reuses it to serve token art to browsers (ADR 0043).
 */
export function resolveMediaPath(rawUrl: string, session: LibrarySession): string | null {
  const url = mediaUrl(rawUrl);
  if (!url) return null;
  if (url.host === 'track') {
    return session.music?.trackPath(decodeURIComponent(url.pathname.replace(/^\//, ''))) ?? null;
  }
  if (url.host !== 'library' || !session.store) return null;
  const relative = url.pathname
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))
    .join('/');
  try {
    return session.store.resolvePath(relative);
  } catch {
    return null;
  }
}

export function installMediaHandler(session: LibrarySession, icons: IconResources): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host === 'library' && !session.store) {
      return new Response('no library', { status: 503 });
    }
    if (!['icons', 'track', 'library'].includes(url.host)) {
      return new Response('not found', { status: 404 });
    }
    if (url.host === 'icons') {
      const svg = resolveMediaIcon(request.url, icons);
      if (svg === null) return new Response('not found', { status: 404 });
      return new Response(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'max-age=86400',
        },
      });
    }
    const file = resolveMediaPath(request.url, session);
    if (!file) {
      return new Response(url.host === 'library' ? 'forbidden' : 'not found', {
        status: url.host === 'library' ? 403 : 404,
      });
    }
    return serveFile(file, request);
  });
}
