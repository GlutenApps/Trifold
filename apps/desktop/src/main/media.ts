import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { MEDIA_SCHEME } from '@trifold/api';
import type { LibrarySession } from './library/session';

/**
 * `trifold-media://library/<library-relative path>` serves files from the open Library to the
 * renderer (scene images, later tokens and portraits). Paths that escape the Library are refused
 * by LibraryStore.resolvePath. Must be registered before `app.whenReady()`.
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
      },
    },
  ]);
}

export function installMediaHandler(session: LibrarySession): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== 'library') return new Response('not found', { status: 404 });
    const store = session.store;
    if (!store) return new Response('no library', { status: 503 });
    const relative = url.pathname
      .split('/')
      .filter(Boolean)
      .map((p) => decodeURIComponent(p))
      .join('/');
    let absolute: string;
    try {
      absolute = store.resolvePath(relative);
    } catch {
      return new Response('forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(absolute).toString());
  });
}
