import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractZip, isZip } from '../src/utils/unzip.js';
import { downloadName, zipName, downloadDate, contentDisposition } from '../src/utils/downloadName.js';

describe('extractZip', () => {
  it('unpacks supported files from nested folders and skips junk', () => {
    const zip = zipSync({
      'docs/PAN.pdf': strToU8('pdf'),
      'docs/photo.JPG': strToU8('jpg'),
      'notes.txt': strToU8('x'),
      '__MACOSX/docs/._PAN.pdf': strToU8('junk'),
      '.DS_Store': strToU8('junk'),
    });
    const { files, skipped } = extractZip(Buffer.from(zip));
    expect(files.map((f) => [f.name, f.mimetype]).sort()).toEqual([['PAN.pdf', 'application/pdf'], ['photo.JPG', 'image/jpeg']]);
    expect(skipped).toEqual(['notes.txt']);
  });
  it('rejects zips with too many files', () => {
    const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`f${i}.pdf`, strToU8('a')]));
    expect(() => extractZip(Buffer.from(zipSync(many)))).toThrow(/more than 200/);
  });
  it('recognises zip uploads by type or name', () => {
    expect(isZip({ mimetype: 'application/x-zip-compressed', originalname: 'a' })).toBe(true);
    expect(isZip({ mimetype: 'application/octet-stream', originalname: 'docs.ZIP' })).toBe(true);
    expect(isZip({ mimetype: 'application/pdf', originalname: 'a.pdf' })).toBe(false);
  });
});

describe('download names', () => {
  const NOW = Date.parse('2026-10-18T20:00:00Z'); // 19 Oct in India
  it('uses the India date', () => expect(downloadDate(NOW)).toBe('19-10-2026'));
  it('names a file lead_document_date.ext', () => {
    expect(downloadName('Shiva Varma', 'scan01.PDF', 'PAN Card', NOW)).toBe('Shiva Varma_PAN Card_19-10-2026.PDF');
    expect(downloadName('Shiva Varma', 'Bank_Statement.pdf', '', NOW)).toBe('Shiva Varma_Bank_Statement_19-10-2026.pdf');
  });
  it('names a zip lead_date.zip and strips unsafe characters', () => {
    expect(zipName('A/B: Kumar', NOW)).toBe('A B Kumar_19-10-2026.zip');
  });
  it('builds a header that survives non-English names', () => {
    expect(contentDisposition('రవి_19-10-2026.zip')).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''%E0/);
  });
});
