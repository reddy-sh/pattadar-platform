/**
 * Reading the metadata a camera wrote into a JPEG, in the browser, with no
 * library.
 *
 * EXIF lives INSIDE the JPEG bytes, so the stored file already carries it —
 * nothing has to be copied into the database to keep it. This reads it back on
 * demand: the gallery fetches a photo's bytes to render it anyway, and parses
 * the metadata off the same bytes to (a) show what the camera recorded and
 * (b) check the photo's own GPS against the land it is filed against.
 *
 * It parses IFD0 (camera, software, orientation, the capture-time carried
 * there on some devices), the EXIF sub-IFD (DateTimeOriginal, dimensions), and
 * the GPS IFD (lat/lon/alt/direction). Anything it does not understand — a PNG,
 * a HEIC, a copy a share sheet stripped — yields an empty result, which the
 * caller treats as "no metadata", never as an error.
 *
 * WARNING on trust: every field here is the file's OWN claim, not proof. A
 * coordinate is checked against the record precisely because it can be absent,
 * stale, or edited; a "Software: Photoshop" line is a hint, not a verdict. The
 * embedded thumbnail is deliberately skipped — it is binary bulk, not evidence.
 */

export interface ExifGps {
  latitude: number;
  longitude: number;
}

export interface ExifData {
  /** Decimal degrees from the GPS block, or null when absent/zeroed. */
  gps: ExifGps | null;
  /** GPS altitude in metres, signed (below sea level is negative). */
  altitudeM: number | null;
  /** Compass direction the camera faced, degrees 0–360, or null. */
  imgDirection: number | null;
  /** DateTimeOriginal as ISO, the real shutter time. '' when absent. */
  capturedAt: string;
  /** Camera maker, e.g. "Apple". */
  make: string;
  /** Camera model, e.g. "iPhone 15 Pro". */
  model: string;
  /** Software/firmware; often reveals an edit ("Adobe Photoshop 25.0"). */
  software: string;
  /** Lens model, when the file names it. */
  lens: string;
  /** EXIF orientation code 1–8, or 0. */
  orientation: number;
  /** Pixel dimensions from EXIF, when present (0 otherwise). */
  width: number;
  height: number;
  /** Every scalar tag read, keyed by human name — for a full "raw" panel.
   *  Values are strings/numbers only; the thumbnail is never included. */
  raw: Record<string, string | number>;
}

const EMPTY: ExifData = {
  gps: null, altitudeM: null, imgDirection: null, capturedAt: '',
  make: '', model: '', software: '', lens: '', orientation: 0, width: 0, height: 0, raw: {},
};

// The tag ids we name. Everything else still lands in `raw` under its hex id.
const IFD0_TAGS: Record<number, string> = {
  0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x0112: 'Orientation',
  0x0132: 'DateTime', 0x011a: 'XResolution', 0x011b: 'YResolution',
  0x013b: 'Artist', 0x8298: 'Copyright',
};
const EXIF_TAGS: Record<number, string> = {
  0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
  0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension',
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8827: 'ISOSpeedRatings',
  0x920a: 'FocalLength', 0x9209: 'Flash', 0xa434: 'LensModel',
};
const GPS_TAGS: Record<number, string> = {
  0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef',
  0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude',
  0x0007: 'GPSTimeStamp', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection',
  0x001d: 'GPSDateStamp',
};
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** Degrees-minutes-seconds (each a rational) + ref → signed decimal degrees. */
function dmsToDegrees(dms: number[], ref: string): number | null {
  if (dms.length < 3) return null;
  const [d, m, s] = dms;
  if (![d, m, s].every((n) => Number.isFinite(n))) return null;
  let deg = d + m / 60 + s / 3600;
  const r = ref.trim().toUpperCase();
  if (r === 'S' || r === 'W') deg = -deg;
  return deg;
}

interface Entry { type: number; count: number; rationals: number[]; ascii: string; nums: number[]; }

/** Parse the full EXIF of a JPEG. Returns EMPTY when there is none to read. */
export async function readExif(file: File | Blob): Promise<ExifData> {
  try {
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return EMPTY; // not a JPEG

    // Find the APP1 EXIF segment.
    let offset = 2;
    let tiffStart = -1;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2);
      if (size < 2) break;
      if (marker === 0xe1) {
        const exifId = offset + 4;
        if (exifId + 6 <= view.byteLength
          && view.getUint32(exifId) === 0x45786966 && view.getUint16(exifId + 4) === 0x0000) {
          tiffStart = exifId + 6;
        }
        break;
      }
      if (marker === 0xda) break; // start of scan
      offset += 2 + size;
    }
    if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return EMPTY;

    const bom = view.getUint16(tiffStart);
    const le = bom === 0x4949;
    if (!le && bom !== 0x4d4d) return EMPTY;
    const u16 = (p: number) => view.getUint16(p, le);
    const u32 = (p: number) => view.getUint32(p, le);
    const i32 = (p: number) => view.getInt32(p, le);

    const readEntry = (e: number): Entry | null => {
      const type = u16(e + 2);
      const count = u32(e + 4);
      const unit = TYPE_SIZE[type] || 0;
      const size = unit * count;
      if (!size) return null;
      const valAt = size <= 4 ? e + 8 : tiffStart + u32(e + 8);
      if (valAt + size > view.byteLength) return null;
      const rationals: number[] = [];
      const nums: number[] = [];
      let ascii = '';
      for (let k = 0; k < count; k++) {
        if (type === 5) {
          const num = u32(valAt + k * 8), den = u32(valAt + k * 8 + 4);
          rationals.push(den ? num / den : 0);
        } else if (type === 10) {
          const num = i32(valAt + k * 8), den = i32(valAt + k * 8 + 4);
          rationals.push(den ? num / den : 0);
        } else if (type === 2) {
          const c = view.getUint8(valAt + k);
          if (c) ascii += String.fromCharCode(c);
        } else if (type === 3) {
          nums.push(u16(valAt + k * 2));
        } else if (type === 4 || type === 9) {
          nums.push(type === 9 ? i32(valAt + k * 4) : u32(valAt + k * 4));
        } else if (type === 1) {
          nums.push(view.getUint8(valAt + k));
        }
      }
      return { type, count, rationals, ascii, nums };
    };

    const raw: Record<string, string | number> = {};
    const scalar = (en: Entry): string | number => {
      if (en.ascii) return en.ascii.trim();
      if (en.rationals.length) return en.rationals.length === 1 ? en.rationals[0] : en.rationals.join(', ');
      if (en.nums.length) return en.nums.length === 1 ? en.nums[0] : en.nums.join(', ');
      return '';
    };

    // Read one IFD's entries into a name→Entry map, applying a tag-name table.
    // Returns the map plus any sub-IFD pointers it found (EXIF/GPS).
    const readIfd = (ifdAt: number, names: Record<number, string>) => {
      const out = new Map<number, Entry>();
      let exifPtr = 0, gpsPtr = 0;
      if (ifdAt + 2 > view.byteLength) return { out, exifPtr, gpsPtr };
      const n = u16(ifdAt);
      for (let i = 0; i < n; i++) {
        const e = ifdAt + 2 + i * 12;
        if (e + 12 > view.byteLength) break;
        const tag = u16(e);
        if (tag === 0x8769) { exifPtr = tiffStart + u32(e + 8); continue; }
        if (tag === 0x8825) { gpsPtr = tiffStart + u32(e + 8); continue; }
        const en = readEntry(e);
        if (en) {
          out.set(tag, en);
          const name = names[tag] || `0x${tag.toString(16)}`;
          const v = scalar(en);
          if (v !== '') raw[name] = v;
        }
      }
      return { out, exifPtr, gpsPtr };
    };

    const ifd0 = tiffStart + u32(tiffStart + 4);
    const { out: t0, exifPtr, gpsPtr } = readIfd(ifd0, IFD0_TAGS);
    const t1 = exifPtr ? readIfd(exifPtr, EXIF_TAGS).out : new Map<number, Entry>();
    const tg = gpsPtr ? readIfd(gpsPtr, GPS_TAGS).out : new Map<number, Entry>();

    // GPS
    let gps: ExifGps | null = null;
    const latE = tg.get(0x0002), lonE = tg.get(0x0004);
    if (latE?.rationals.length && lonE?.rationals.length) {
      const lat = dmsToDegrees(latE.rationals, tg.get(0x0001)?.ascii || 'N');
      const lon = dmsToDegrees(lonE.rationals, tg.get(0x0003)?.ascii || 'E');
      if (lat !== null && lon !== null && !(lat === 0 && lon === 0)
        && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        gps = { latitude: lat, longitude: lon };
      }
    }
    let altitudeM: number | null = null;
    const altE = tg.get(0x0006);
    if (altE?.rationals.length) {
      altitudeM = altE.rationals[0];
      if (tg.get(0x0005)?.nums?.[0] === 1) altitudeM = -altitudeM; // ref 1 = below sea level
    }
    const dirE = tg.get(0x0011);
    const imgDirection = dirE?.rationals.length ? dirE.rationals[0] : null;

    // Capture time: EXIF DateTimeOriginal preferred, IFD0 DateTime as fallback.
    // Both are "YYYY:MM:DD HH:MM:SS" local — kept as a readable string.
    const rawTime = (t1.get(0x9003)?.ascii || t0.get(0x0132)?.ascii || '').trim();
    const capturedAt = rawTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');

    return {
      gps, altitudeM, imgDirection, capturedAt,
      make: (t0.get(0x010f)?.ascii || '').trim(),
      model: (t0.get(0x0110)?.ascii || '').trim(),
      software: (t0.get(0x0131)?.ascii || '').trim(),
      lens: (t1.get(0xa434)?.ascii || '').trim(),
      orientation: t0.get(0x0112)?.nums?.[0] || 0,
      width: t1.get(0xa002)?.nums?.[0] || 0,
      height: t1.get(0xa003)?.nums?.[0] || 0,
      raw,
    };
  } catch {
    return EMPTY;
  }
}

/** Just the GPS, for callers that only want a coordinate. */
export async function readExifGps(file: File | Blob): Promise<ExifGps | null> {
  return (await readExif(file)).gps;
}
