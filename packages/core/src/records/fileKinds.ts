/**
 * What kind of FILE a document is — PDF, photo, spreadsheet — as opposed to
 * what kind of PAPER it is (docFamilies: title, revenue record, map…).
 *
 * The two answer different questions. A sale deed can arrive as a PDF or as a
 * phone photo; the shelf says "Title" either way, and the file kind says which
 * viewer opens it and which icon a person scanning a list looks for. Decided
 * from the MIME type first and the filename's extension second, because a
 * browser upload often sends `application/octet-stream` for a KMZ or a HEIC.
 */

export type FileKind =
  | 'pdf' | 'image' | 'video' | 'audio' | 'sheet' | 'doc'
  | 'slides' | 'map' | 'archive' | 'text' | 'other';

/** The word shown for each kind. "Recording", not "audio" (design.md § App
 *  vocabulary: one word per kind). */
export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  image: 'Photo',
  video: 'Video',
  audio: 'Recording',
  sheet: 'Spreadsheet',
  doc: 'Document',
  slides: 'Presentation',
  map: 'Map file',
  archive: 'Archive',
  text: 'Text',
  other: 'File',
};

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  heic: 'image', heif: 'image', tif: 'image', tiff: 'image', bmp: 'image',
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video', '3gp': 'video', avi: 'video', mkv: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', amr: 'audio',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet', tsv: 'sheet',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', pages: 'doc',
  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides',
  kml: 'map', kmz: 'map', geojson: 'map', gpx: 'map', shp: 'map',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  txt: 'text', md: 'text', json: 'text', xml: 'text',
};

/** "Sale deed.PDF" → "pdf"; a name with no dot, or a leading-dot name like
 *  ".env", has no extension. */
export function fileExtension(name: string): string {
  const base = String(name || '').trim().split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function fileKindOf(mimeType: string, name = ''): FileKind {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('spreadsheet') || mime.includes('ms-excel') || mime === 'text/csv') return 'sheet';
  if (mime.includes('presentation') || mime.includes('ms-powerpoint')) return 'slides';
  if (mime.includes('wordprocessing') || mime === 'application/msword' || mime.includes('opendocument.text')) return 'doc';
  if (mime.includes('kml') || mime.includes('kmz') || mime === 'application/geo+json') return 'map';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('x-tar')) return 'archive';
  const byName = BY_EXTENSION[fileExtension(name)];
  if (byName) return byName;
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

/** "1.4 MB" — decimal units, as the operating system told the owner the file
 *  weighed. An unknown size is '' so the caller can leave it out rather than
 *  print "0 B" as if it were a fact. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 1000 ** i;
  return `${i === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** A thumbnail can be drawn for this kind without opening a viewer. */
export const hasPictureThumb = (kind: FileKind) => kind === 'image' || kind === 'video';
