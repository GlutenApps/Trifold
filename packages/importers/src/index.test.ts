import { describe, expect, it } from 'vitest';
import { detectXmlKind } from './index';

const BOM = String.fromCharCode(0xfeff);

describe('detectXmlKind', () => {
  it('recognises a compendium file with BOM, prolog and comment', () => {
    const xml = `${BOM}<?xml version="1.0" encoding="UTF-8"?>\n<!-- exported -->\n<compendium version="5" auto_indent="NO">\n<monster>`;
    expect(detectXmlKind(xml)).toBe('compendium');
  });

  it('recognises a campaign file', () => {
    expect(detectXmlKind('<campaign version="5"><name>x</name></campaign>')).toBe('campaign');
  });

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(detectXmlKind('  \n< Compendium >')).toBe('compendium');
  });

  it('returns unknown for anything else', () => {
    expect(detectXmlKind('<html></html>')).toBe('unknown');
    expect(detectXmlKind('')).toBe('unknown');
    expect(detectXmlKind('not xml at all')).toBe('unknown');
  });
});
