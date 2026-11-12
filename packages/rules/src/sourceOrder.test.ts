import { describe, expect, it } from 'vitest';
import { moveInOrder, placeInOrder, sourceOrder } from './sourceOrder';

const srd24 = { id: 'srd-2024', name: 'SRD 5.2.1', kind: 'srd', defaultEdition: '2024' };
const srd14 = { id: 'srd-2014', name: 'SRD 5.1', kind: 'srd', defaultEdition: '2014' };
const brew = { id: 'homebrew', name: 'Homebrew', kind: 'homebrew' };
const bookB = { id: 'x2', name: 'Beta file', kind: 'xml' };
const bookA = { id: 'x1', name: 'alpha file', kind: 'xml' };

describe('sourceOrder', () => {
  it('defaults to homebrew, imported files by name, then the 2024 SRD ahead of the legacy one', () => {
    expect(sourceOrder([srd14, bookB, srd24, brew, bookA], [])).toEqual([
      'homebrew',
      'x1',
      'x2',
      'srd-2024',
      'srd-2014',
    ]);
  });

  it('follows the saved order, drops ids that are gone, and appends new sources by default', () => {
    expect(sourceOrder([srd14, srd24, brew, bookA], ['srd-2014', 'gone', 'srd-2024'])).toEqual([
      'srd-2014',
      'srd-2024',
      'homebrew',
      'x1',
    ]);
  });

  it('ignores a repeated id in the saved order', () => {
    expect(sourceOrder([srd14, srd24], ['srd-2014', 'srd-2014'])).toEqual(['srd-2014', 'srd-2024']);
  });
});

describe('moveInOrder', () => {
  it('swaps with the neighbour and stays put at the ends', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'z', 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('placeInOrder', () => {
  it('puts the dragged id at the index among the others', () => {
    expect(placeInOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(placeInOrder(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(placeInOrder(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
    expect(placeInOrder(['a', 'b', 'c'], 'z', 0)).toEqual(['a', 'b', 'c']);
  });
});
