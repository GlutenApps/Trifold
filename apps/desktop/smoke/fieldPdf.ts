/**
 * A small fillable PDF, written byte by byte for tests (ADR 0073): text fields and check boxes
 * with names, values and rectangles, on as many pages as asked. `withForm: false` leaves out the
 * document's form dictionary, as the export a character app makes does, so only the pages'
 * widgets name the fields. Content is whatever the test passes: SRD-only, by the content rule.
 */

export interface FieldSpec {
  name: string;
  /** A text value, or true/false for a check box. */
  value: string | boolean;
  rect: [number, number, number, number];
  page?: number;
}

function pdfString(text: string): string {
  // Latin-1 literal strings: escape the delimiters and the backslash.
  return `(${text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')})`;
}

export function fieldPdf(fields: FieldSpec[], { withForm = true } = {}): Uint8Array {
  const pageCount = Math.max(1, ...fields.map((f) => f.page ?? 1));
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  // 1 catalog, 2 pages; page objects and widgets follow.
  objects.push('', '');
  const widgetIds: number[][] = Array.from({ length: pageCount }, () => []);
  const pageIds: number[] = [];
  for (let p = 1; p <= pageCount; p++) pageIds.push(add(''));
  fields.forEach((f) => {
    const page = (f.page ?? 1) - 1;
    const rect = `[${f.rect.join(' ')}]`;
    const id =
      typeof f.value === 'boolean'
        ? add(
            `<< /Type /Annot /Subtype /Widget /FT /Btn /T ${pdfString(f.name)} /Rect ${rect} /P ${pageIds[page]} 0 R /V /${f.value ? 'Yes' : 'Off'} /AS /${f.value ? 'Yes' : 'Off'} /AP << /N << /Yes ${0} 0 R /Off ${0} 0 R >> >> >>`,
          )
        : add(
            `<< /Type /Annot /Subtype /Widget /FT /Tx /T ${pdfString(f.name)} /Rect ${rect} /P ${pageIds[page]} 0 R /V ${pdfString(f.value)} >>`,
          );
    widgetIds[page]!.push(id);
  });
  // Check boxes need on and off appearances to be read as check boxes.
  const appearance = add(
    '<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] /Length 0 >>\nstream\n\nendstream',
  );
  for (let i = 0; i < objects.length; i++) {
    objects[i] = objects[i]!.replace(/ 0 0 R/g, ` ${appearance} 0 R`);
  }
  const all = widgetIds.flat();
  objects[0] = `<< /Type /Catalog /Pages 2 0 R${withForm ? ` /AcroForm << /Fields [${all.map((i) => `${i} 0 R`).join(' ')}] >>` : ''} >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  pageIds.forEach((id, p) => {
    objects[id - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [${widgetIds[p]!.map((i) => `${i} 0 R`).join(' ')}] >>`;
  });

  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
}
