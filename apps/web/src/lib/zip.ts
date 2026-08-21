/**
 * A ZIP writer, stored (uncompressed), with no dependencies.
 *
 * Downloading eight selected documents used to fire eight separate browser
 * downloads, which most browsers block after the third and all of them scatter
 * across the downloads folder. A selection is one thing the person asked for,
 * so it arrives as one file.
 *
 * Stored rather than deflated ON PURPOSE: a vault holds PDFs, JPEGs and MP4s,
 * all already compressed. Deflating them costs CPU and time to save a fraction
 * of a percent, and it would mean pulling in a compression library to do it.
 *
 * Deliberately not supported: ZIP64. The archive and every member must be under
 * 4 GB, which the 1 GB batch ceiling already guarantees. `zipStore` throws
 * rather than writing an archive that silently truncates — a corrupt download
 * of somebody's land records is worse than a refused one.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
/** Bit 11: the filename is UTF-8. Telugu filenames are ordinary here. */
const UTF8_FLAG = 0x0800;
const MAX_SIZE = 0xffffffff;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time, which is what ZIP stores. Seconds have 2s resolution and
 *  nothing before 1980 is representable — both are the format's, not ours. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  /** Path inside the archive. */
  name: string;
  bytes: Uint8Array;
}

/**
 * Two documents can carry the same display name — the vault lists rows, not
 * filenames, and nothing stops a person naming two scans "Sale Deed". Colliding
 * names inside one archive silently overwrite each other in most extractors, so
 * they are made unique the same way the uploader does it: `deed (2).pdf`.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    // A display name is user-controlled, so it is sanitised rather than
    // trusted: separators (backslash included — Windows treats it as one)
    // would let a member decide where the extractor writes it, and a leading
    // run of dots and dashes is how "../../etc/passwd" survives that.
    const safe =
      (raw || 'document')
        .replace(/[/\\]/g, '-')
        .replace(/^[.\-\s]+/, '')
        .trim() || 'document';
    if (!seen.has(safe)) {
      seen.add(safe);
      return safe;
    }
    const dot = safe.lastIndexOf('.');
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : '';
    for (let n = 2; ; n += 1) {
      const candidate = `${stem} (${n})${ext}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        return candidate;
      }
    }
  });
}

/** Build a stored ZIP. Names are used verbatim — call `uniqueNames` first. */
export function zipStore(entries: ZipEntry[], now: Date = new Date()): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const size = entry.bytes.length;
    if (size > MAX_SIZE) {
      throw new Error(`"${entry.name}" is too large for a zip file — download it on its own`);
    }
    const crc = crc32(entry.bytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_HEADER, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed
    lv.setUint32(22, size, true); // uncompressed
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // no extra field
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL_HEADER, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true); // stored
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, entry.bytes);
    centrals.push(central);
    offset += local.length + size;
    if (offset > MAX_SIZE) {
      throw new Error('That selection is too large for one zip — download it in smaller batches');
    }
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, END_OF_CENTRAL, true);
  ev.setUint16(4, 0, true); // this disk
  ev.setUint16(6, 0, true); // disk with central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // no comment

  // The parts are all Uint8Array; TS's BlobPart wants ArrayBuffer-backed
  // views specifically, which these are.
  const parts = [...locals, ...centrals, end] as unknown as BlobPart[];
  return new Blob(parts, { type: 'application/zip' });
}

/** "pattadar-vault-2026-08-14.zip" */
export function archiveName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `pattadar-vault-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
}
