/** What a document is called on Documents: what it IS, not the name its file
 *  arrived with (founder, 07/10/2026).
 *
 *  Pure, so the rule is tested without a page:
 *    · The owner renamed it (`nameSet`): their name, without a file extension.
 *    · A title deed with a known deed number: "Sale deed 1842/2019".
 *    · A name that is already words (a reading named it "Sale deed 4412 of
 *      1998"): kept as it is.
 *    · A raw file name ("IMG_4482.jpg", "Scan 2026-08-02.pdf"): "<Kind> ·
 *      <property>" when it is linked to one ("FMB · Sy 1-C1"), else the file
 *      name without its extension.
 *  The original file name then becomes the small line under the title. */

export interface TitledPaper {
  title: string;
  shelf: string;
  detail?: string;
  mimeType?: string;
  docNo?: string;
  nameSet?: boolean;
  fileName?: string;
  aadhaarCard?: boolean;
  linkedProperties?: { title: string }[];
}

const EXT = /\.[a-z0-9]{2,5}$/i;
/** Camera, scanner and messenger names: words nobody chose. */
const MACHINE = /^(img|vid|video|dsc|dscn|pxl|mvimg|screenshot|scan|scanned|whatsapp|document|doc|file|cam|photo)[\s_-]?\d|^(whatsapp (image|video)|scan|screenshot)\b|^[\d\s_.-]+$/i;

export const withoutExtension = (name: string): string => name.replace(EXT, '').trim() || name;

export function looksLikeFileName(name: string): boolean {
  const n = name.trim();
  return EXT.test(n) || MACHINE.test(n);
}

/** The word for what the document is, from its type (and, for a map, whether
 *  it is an FMB; for photos and video, which one). '' when the type says
 *  nothing (not sorted yet). */
export function kindWord(p: TitledPaper): string {
  const text = `${p.title} ${p.detail ?? ''}`;
  switch (p.shelf) {
    case 'title': return 'Title deed';
    case 'revenue': return /passbook/i.test(text) ? 'Passbook' : 'Revenue record';
    case 'map': return /\bfmb\b/i.test(text) ? 'FMB' : 'Map';
    case 'search': return /\bec\b|encumbrance/i.test(text) ? 'EC' : 'Tax receipt';
    case 'identity': return 'Identity document';
    case 'old': return 'Old record';
    case 'photos': return (p.mimeType ?? '').startsWith('video/') ? 'Video' : 'Photo';
    default: return '';
  }
}

export function paperTitle(p: TitledPaper): string {
  const raw = (p.title || '').trim();
  if (p.nameSet || p.aadhaarCard) return withoutExtension(raw);
  const docNo = (p.docNo ?? '').trim();
  if (p.shelf === 'title' && docNo) return `Sale deed ${docNo}`;
  if (!looksLikeFileName(raw)) return raw;
  const kind = kindWord(p);
  const place = p.linkedProperties?.[0]?.title ?? '';
  if (kind && place) return `${kind} · ${place}`;
  return withoutExtension(raw);
}

/** The small line's file name: shown only when the title is not already it. */
export function paperFileName(p: TitledPaper): string {
  const name = (p.fileName || p.title || '').trim();
  return paperTitle(p) === name ? '' : name;
}
