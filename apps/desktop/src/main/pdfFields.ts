import type { PdfField } from '@trifold/importers';
import type * as PdfJsModule from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Import from PDF (ADR 0073): a PDF's form fields, read with pdf.js in this process. Fields are
 * read from each page's widgets, not only the document's form: the export a character app makes
 * keeps its named, filled widgets but drops the form that lists them, so a reader that asks the
 * form finds nothing. Nothing is drawn, no script in the PDF runs, and a locked PDF is refused,
 * never opened.
 */

/** The PDF needs a password. */
export class PdfLockedError extends Error {
  constructor() {
    super('This PDF is password-protected. Trifold does not open locked files.');
    this.name = 'PdfLockedError';
  }
}

/** A larger sheet is not a character sheet; the 25-page extended sheet is the biggest seen. */
const MAX_PAGES = 60;

interface WidgetData {
  subtype?: string;
  fieldName?: string;
  fieldType?: string;
  fieldValue?: unknown;
  buttonValue?: unknown;
  exportValue?: unknown;
  checkBox?: boolean;
  radioButton?: boolean;
  rect?: number[];
}

type PdfJs = typeof PdfJsModule;
let loading: Promise<PdfJs> | null = null;

/** pdf.js, with its worker run in this thread: a packaged app has no worker file to point at. */
function pdfjs(): Promise<PdfJs> {
  loading ??= (async () => {
    const g = globalThis as { pdfjsWorker?: unknown };
    // @ts-expect-error The worker module ships without type declarations.
    g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })();
  return loading;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(', ');
  return '';
}

export async function readPdfFields(data: Uint8Array): Promise<PdfField[]> {
  const lib = await pdfjs();
  const task = lib.getDocument({
    data,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (err) {
    if ((err as { name?: string }).name === 'PasswordException') throw new PdfLockedError();
    throw err;
  }
  try {
    const out: PdfField[] = [];
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const annotations = (await page.getAnnotations({ intent: 'display' })) as WidgetData[];
      for (const a of annotations) {
        if (a.subtype !== 'Widget' || !a.fieldName) continue;
        const r = a.rect ?? [0, 0, 0, 0];
        const rect: PdfField['rect'] = [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 0];
        if (a.fieldType === 'Btn' && (a.checkBox || a.radioButton)) {
          const value = asText(a.fieldValue);
          const on = a.radioButton
            ? value !== '' && value === asText(a.buttonValue)
            : value !== '' && value !== 'Off';
          out.push({ page: p, name: a.fieldName, kind: 'check', value: '', checked: on, rect });
          continue;
        }
        const kind = a.fieldType === 'Tx' ? 'text' : a.fieldType === 'Ch' ? 'choice' : 'other';
        out.push({
          page: p,
          name: a.fieldName,
          kind,
          value: asText(a.fieldValue),
          checked: false,
          rect,
        });
      }
      page.cleanup();
    }
    return out;
  } finally {
    await task.destroy();
  }
}
