import { describe, it, expect } from 'vitest';
import { SelectionStore } from '../src/selectionStore.js';

describe('SelectionStore', () => {
  it('starts empty', () => {
    const s = new SelectionStore();
    expect(s.size).toBe(0);
    expect(s.distinctFolderCount).toBe(0);
    expect(s.toArray()).toEqual([]);
    expect(s.reviewMode).toBe(false);
  });

  it('adds and removes paths', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.add('/a/y.png');
    expect(s.size).toBe(2);
    expect(s.has('/a/x.png')).toBe(true);
    s.remove('/a/x.png');
    expect(s.size).toBe(1);
    expect(s.has('/a/x.png')).toBe(false);
  });

  it('toggle flips membership', () => {
    const s = new SelectionStore();
    s.toggle('/a/x.png');
    expect(s.has('/a/x.png')).toBe(true);
    s.toggle('/a/x.png');
    expect(s.has('/a/x.png')).toBe(false);
  });

  it('distinctFolderCount counts unique parent dirs', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.add('/a/y.png');
    s.add('/b/z.png');
    expect(s.distinctFolderCount).toBe(2);
  });

  it('clear empties the set and resets review mode', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.reviewMode = true;
    s.clear();
    expect(s.size).toBe(0);
    expect(s.reviewMode).toBe(false);
  });

  it('add is idempotent', () => {
    const s = new SelectionStore();
    s.add('/a/x.png');
    s.add('/a/x.png');
    expect(s.size).toBe(1);
  });

  it('toArray returns insertion order', () => {
    const s = new SelectionStore();
    s.add('/a/2.png');
    s.add('/a/1.png');
    expect(s.toArray()).toEqual(['/a/2.png', '/a/1.png']);
  });
});
