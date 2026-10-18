import { describe, it, expect } from 'vitest';
import { ruleParse, slugify } from '../src/services/aiBotParse.js';
import { matchFolder } from '../src/routes/aiBot.js';

const NOW = Date.parse('2026-10-18T06:00:00Z');

describe('AI Bot rule parser', () => {
  it('saves a named file with a label', () => {
    expect(ruleParse("this is Ravi Kumar's PAN card", 1, NOW)).toEqual({ action: 'save', lead: 'Ravi Kumar', date: '', label: 'PAN' });
  });
  it('lists a customer on a date', () => {
    expect(ruleParse('show Ravi Kumar documents 18/10/2026', 0, NOW)).toMatchObject({ action: 'list', lead: 'Ravi Kumar', date: '2026-10-18' });
  });
  it('understands yesterday', () => {
    expect(ruleParse('Sita Devi yesterday', 0, NOW).date).toBe('2026-10-17');
  });
  it('lists all folders', () => {
    expect(ruleParse('leads', 0, NOW).action).toBe('leads');
  });
  it('asks for help when no name is given', () => {
    expect(ruleParse('save this', 1, NOW).action).toBe('help');
  });
});

describe('matchFolder', () => {
  const folders = ['ravi-kumar', 'ravi-teja', 'sita-devi'];
  it('matches exactly, case-insensitive', () => {
    expect(matchFolder(folders, 'RAVI kumar').slug).toBe('ravi-kumar');
  });
  it('matches a unique partial name', () => {
    expect(matchFolder(folders, 'Sita').slug).toBe('sita-devi');
  });
  it('refuses an ambiguous partial name', () => {
    expect(matchFolder(folders, 'Ravi')).toEqual({ slug: null, matches: ['ravi-kumar', 'ravi-teja'] });
  });
  it('slugifies names into folder keys', () => {
    expect(slugify('  Ravi  Kumar. ')).toBe('ravi-kumar');
  });
});
