/**
 * The archive has to open. A zip a browser accepts and an extractor rejects is
 * a download of somebody's land records that turns out to be rubble.
 *
 * So the archive is read back by a SECOND, independent implementation written
 * below — a small central-directory walker with its own CRC, deliberately
 * formulated differently from the one in zip.ts (bitwise, no lookup table) so a
 * bug in that table cannot hide behind itself.
 *
 * Reading it back in-process rather than shelling out to `unzip` is not
 * squeamishness: `bun test` cannot spawn child processes at all when it is
 * invoked from the repo root against a file under `apps/web/` — even
 * `/bin/echo` fails — so a shell-based check passes or fails depending on which
 * directory you happened to be standing in. These run anywhere.
 */
import { describe, expect, test } from 'bun:test';

import { archiveName, crc32, uniqueNames, zipStore } from './zip';

const bytes = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

/** CRC-32, computed the slow way — no table, so it shares no code or data with
 *  the implementation under test. */
function slowCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ReadEntry {
  name: string;
  contents: Uint8Array;
  utf8Flag: boolean;
  stored: boolean;
}

/**
 * Walk a ZIP the way an extractor does: find the end-of-central-directory
 * record, read the central directory it points at, then follow each entry to
 * its local header. Verifies every CRC and throws on the first thing that does
 * not line up — which is exactly what a real extractor would do.
 */
function readZip(buf: Uint8Array): ReadEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // The EOCD is at the end, after a variable-length comment, so it is found by
  // scanning backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record — this is not a zip');

  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset + cdSize > buf.length) throw new Error('central directory runs past the end of the file');

  const out: ReadEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error(`central header ${n} has a bad signature`);
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const rawSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localAt = view.getUint32(p + 42, true);
    const name = decode(buf.subarray(p + 46, p + 46 + nameLen));

    // Follow it to the local header and pull the bytes out.
    if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error(`"${name}" has a bad local header`);
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;
    const contents = buf.subarray(dataAt, dataAt + compSize);

    if (contents.length !== rawSize) throw new Error(`"${name}" is truncated`);
    const actual = slowCrc32(contents);
    if (actual !== crc) throw new Error(`"${name}" fails its CRC (${actual} vs ${crc})`);

    out.push({ name, contents, utf8Flag: (flags & 0x0800) !== 0, stored: method === 0 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function open(blob: Blob): Promise<ReadEntry[]> {
  return readZip(new Uint8Array(await blob.arrayBuffer()));
}

describe('crc32', () => {
  test('matches the standard check value for "123456789"', () => {
    // If this drifts, every archive we write is one an extractor calls corrupt.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  test('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  test('agrees with a table-free implementation across many inputs', () => {
    for (let n = 0; n < 64; n += 1) {
      const data = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) data[i] = (i * 31 + n) % 256;
      expect(crc32(data)).toBe(slowCrc32(data));
    }
  });
});

describe('zipStore', () => {
  test('an independent reader opens it and every CRC checks out', async () => {
    const entries = await open(
      zipStore([
        { name: 'deed.pdf', bytes: bytes('sale deed contents') },
        { name: 'passbook.pdf', bytes: bytes('passbook contents') },
      ]),
    );
    expect(entries.map((e) => e.name).sort()).toEqual(['deed.pdf', 'passbook.pdf']);
    expect(decode(entries[0].contents)).toBe('sale deed contents');
    expect(decode(entries[1].contents)).toBe('passbook contents');
  });

  test('it starts with the local-file-header signature', async () => {
    const buf = new Uint8Array(await zipStore([{ name: 'a.pdf', bytes: bytes('a') }]).arrayBuffer());
    expect(Array.from(buf.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
  });

  test('three files stay three files', async () => {
    const entries = await open(
      zipStore([
        { name: 'a.pdf', bytes: bytes('a') },
        { name: 'b.pdf', bytes: bytes('b') },
        { name: 'c.pdf', bytes: bytes('c') },
      ]),
    );
    expect(entries).toHaveLength(3);
  });

  test('members are stored, not deflated', async () => {
    // A vault holds PDFs and JPEGs, already compressed. Deflating them costs
    // CPU to save nothing, and would mean a compression library.
    const entries = await open(zipStore([{ name: 'scan.pdf', bytes: bytes('x'.repeat(500)) }]));
    expect(entries[0].stored).toBe(true);
  });

  test('a Telugu filename survives, flagged UTF-8', async () => {
    // Bit 11 says the name is UTF-8. Without it a Telugu filename arrives as
    // mojibake in every modern extractor.
    const entries = await open(zipStore([{ name: 'పట్టాదారు.pdf', bytes: bytes('telugu') }]));
    expect(entries[0].name).toBe('పట్టాదారు.pdf');
    expect(entries[0].utf8Flag).toBe(true);
    expect(decode(entries[0].contents)).toBe('telugu');
  });

  test('an empty member is still a member', async () => {
    const entries = await open(zipStore([{ name: 'empty.pdf', bytes: new Uint8Array(0) }]));
    expect(entries).toHaveLength(1);
    expect(entries[0].contents).toHaveLength(0);
  });

  test('binary bytes come back byte-for-byte', async () => {
    // A PDF is not text. High bytes and NULs have to survive untouched.
    const raw = new Uint8Array(1024);
    for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 7) % 256;
    const entries = await open(zipStore([{ name: 'scan.bin', bytes: raw }]));
    expect(new Uint8Array(entries[0].contents)).toEqual(raw);
  });

  test('an archive of one is still a valid archive', async () => {
    expect(await open(zipStore([{ name: 'only.pdf', bytes: bytes('one') }]))).toHaveLength(1);
  });

  test('many members all survive', async () => {
    const many = Array.from({ length: 40 }, (_v, i) => ({
      name: `doc-${i}.pdf`,
      bytes: bytes(`contents of ${i}`),
    }));
    const entries = await open(zipStore(many));
    expect(entries).toHaveLength(40);
    expect(decode(entries[39].contents)).toBe('contents of 39');
  });
});

describe('uniqueNames', () => {
  test('two rows named the same do not overwrite each other', () => {
    expect(uniqueNames(['Sale Deed.pdf', 'Sale Deed.pdf'])).toEqual([
      'Sale Deed.pdf',
      'Sale Deed (2).pdf',
    ]);
  });

  test('the suffix goes before the extension', () => {
    const [, second] = uniqueNames(['deed.pdf', 'deed.pdf']);
    expect(second.endsWith('.pdf')).toBe(true);
  });

  test('keeps counting past the second collision', () => {
    expect(uniqueNames(['a.pdf', 'a.pdf', 'a.pdf'])).toEqual(['a.pdf', 'a (2).pdf', 'a (3).pdf']);
  });

  test('a name with no extension still gets a suffix', () => {
    expect(uniqueNames(['scan', 'scan'])).toEqual(['scan', 'scan (2)']);
  });

  test('path separators cannot escape the archive', () => {
    // A display name is user-controlled. "../../etc/passwd" must land as a
    // plain member name, not a path an extractor writes outside its folder.
    expect(uniqueNames(['../../etc/passwd'])).toEqual(['etc-passwd']);
    expect(uniqueNames(['a/b.pdf'])).toEqual(['a-b.pdf']);
    expect(uniqueNames(['a\\b.pdf'])).toEqual(['a-b.pdf']);
  });

  test('an empty name becomes something openable', () => {
    expect(uniqueNames([''])).toEqual(['document']);
    expect(uniqueNames(['...'])).toEqual(['document']);
  });

  test('sanitised names that collide are still made unique', async () => {
    const names = uniqueNames(['a/b.pdf', 'a\\b.pdf']);
    expect(names).toEqual(['a-b.pdf', 'a-b (2).pdf']);
    // And the archive built from them really does hold two members.
    const entries = await open(
      zipStore(names.map((n, i) => ({ name: n, bytes: bytes(`file ${i}`) }))),
    );
    expect(entries).toHaveLength(2);
  });
});

describe('archiveName', () => {
  test('is dated', () => {
    expect(archiveName(new Date(2026, 7, 14))).toBe('pattadar-vault-2026-08-14.zip');
  });
});
