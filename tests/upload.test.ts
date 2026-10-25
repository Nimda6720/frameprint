import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { importLetterboxd, importCsvFiles, filmKey } from '../src/lib/import';

const watched = 'Date,Name,Year,Letterboxd URI\n2025-01-01,Arrival,2016,https://letterboxd.com/film/arrival-2016/\n';
async function zipFile(files: Record<string,string>) {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name,text);
  const bytes = await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  return new File([bytes as Uint8Array<ArrayBuffer>], 'export.zip');
}
describe('safe browser imports',()=>{
  test('reads the supplied sample ZIP',async()=>{
    const bytes = await readFile(new URL('../examples/sample-letterboxd-export.zip',import.meta.url));
    const result=await importLetterboxd(new File([bytes],'sample.zip'));
    expect(result.films.length).toBeGreaterThan(0);
    expect(result.films.some(f=>f.diaryDates.length>0)).toBe(true);
  });
  test('reads a CSV directly',async()=>expect((await importLetterboxd(new File([watched],'watched.csv'))).films[0].title).toBe('Arrival'));
  test('supports nested Letterboxd likes/films.csv',async()=>{
    const result=await importLetterboxd(await zipFile({'export/watched.csv':watched,'export/likes/films.csv':'Name,Year\nArrival,2016\n'}));
    expect(result.films[0].liked).toBe(true);
  });
  test('rejects multiple exports with conflicting CSV names',async()=>{
    await expect(importLetterboxd(await zipFile({'one/watched.csv':watched,'two/watched.csv':watched}))).rejects.toThrow(/multiple/);
  });
  test('rejects a compressed bomb before expanding it',async()=>{
    const file=await zipFile({'watched.csv':'x'.repeat(21*1024*1024)});
    expect(file.size).toBeLessThan(25000);
    await expect(importLetterboxd(file)).rejects.toThrow(/too large/);
  });
  test('does not inflate unrelated entries',async()=>{
    const result=await importLetterboxd(await zipFile({'watched.csv':watched,'reviews/large.txt':'x'.repeat(21*1024*1024)}));
    expect(result.films).toHaveLength(1);
  });
  test('enforces actual inflated bytes even when ZIP size headers are forged',async()=>{
    const zip = new JSZip();
    zip.file('watched.csv','x'.repeat(21*1024*1024));
    const bytes = await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i <= bytes.length - 4; i++) {
      const sig = view.getUint32(i, true);
      if (sig === 0x04034b50) view.setUint32(i + 22, 64, true);
      if (sig === 0x02014b50) view.setUint32(i + 24, 64, true);
    }
    const forged = new File([bytes as Uint8Array<ArrayBuffer>], 'forged.zip');
    await expect(importLetterboxd(forged)).rejects.toThrow(/20 MB/);
  });
  test('rejects invalid archives, oversized CSV and unsupported files',async()=>{
    await expect(importLetterboxd(new File(['bad'],'export.zip'))).rejects.toThrow(/valid ZIP/);
    await expect(importLetterboxd(new File(['x'.repeat(21*1024*1024)],'watched.csv'))).rejects.toThrow(/20 MB/);
    await expect(importLetterboxd(new File(['bad'],'payload.html'))).rejects.toThrow(/Upload a Letterboxd/);
  });
  test('rejects malformed CSV and missing title headers',()=>{
    expect(()=>importCsvFiles({'watched.csv':'Name,Year\n"broken,2016'})).toThrow(/malformed/);
    expect(()=>importCsvFiles({'watched.csv':'Anything,Year\nArrival,2016'})).toThrow(/Name or Title/);
  });
  test('preserves punctuation and Unicode in film identity',()=>{
    expect(filmKey('C++',2020)).not.toBe(filmKey('C',2020));
    expect(filmKey('東京',2020)).not.toBe(filmKey('大阪',2020));
  });
  test('does not accept impossible dates or unsafe links',()=>{
    const result=importCsvFiles({'diary.csv':'Name,Year,Watched Date,Letterboxd URI\nArrival,2016,2025-02-30,javascript:alert(1)\n'});
    expect(result.films[0].diaryDates).toEqual([]);
    expect(result.films[0].letterboxdUrl).toBeUndefined();
  });
});
