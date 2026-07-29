/**
 * Screening a picture before it is accepted as evidence about land (CL-600..602).
 *
 * This module contains only the checks that need no machine learning: EXIF
 * provenance. They are cheap, deterministic, testable, and — critically — they
 * run before a single byte leaves the phone.
 *
 * The classifier-dependent rules (is this a field, a face, an ID card) are NOT
 * here. Guessing at them with heuristics would be worse than not doing them:
 * the founder's own caution applies — a dusty fallow field, a stone in scrub, a
 * bund at dusk look nothing like stock "farmland", and a user rejected twice
 * stops adding photos at all.
 */

export type ScreeningVerdict = 'ok' | 'warn' | 'block';

export interface Screening {
  verdict: ScreeningVerdict;
  /** Short title for the dialog. '' when ok. */
  title: string;
  /** What is wrong, in the user's terms. '' when ok. */
  body: string;
  /** True when the right home for this image is Documents, not Photos. */
  offerAsDocument: boolean;
}

export const SCREENING_OK: Screening = { verdict: 'ok', title: '', body: '', offerAsDocument: false };

export interface ExifLike {
  [key: string]: unknown;
}

/** What the classifier said about a picture (CL-600). */
export interface Classification {
  kind: 'land' | 'document' | 'id_document' | 'person' | 'screenshot' | 'other' | '';
  category: string;
  confidence: 'high' | 'medium' | 'low' | string;
  reason: string;
}

/**
 * Turn a classification into a decision (CL-600..602).
 *
 * Two tiers, and the split matters:
 *
 * BLOCK, with no override — identity documents and people. These are privacy
 * failures rather than tidiness failures. An Aadhaar in the photo store has no
 * masking, no encryption and no reveal gate, and it would surface as a list
 * thumbnail; a face belongs on a member record. No caption is worth that.
 *
 * WARN, always overridable — everything else, including "I don't know". A
 * fallow field, a stone in scrub and a bund at dusk all look like nothing to a
 * classifier, and a farmer who is refused twice stops recording evidence
 * altogether. Being wrong in this direction costs a stray picture; being wrong
 * in the other direction costs the feature.
 */
export function screenClassification(c: Classification | null | undefined): Screening {
  if (!c) return SCREENING_OK;
  const why = c.reason ? ` (${c.reason})` : '';
  if (c.kind === 'id_document') {
    return {
      verdict: 'block',
      title: 'Identity documents cannot go here',
      body: `This looks like an ID card${why}. Aadhaar, PAN, licences and similar belong in Documents, where the number is encrypted and access is recorded. A parcel photo has none of those protections.`,
      offerAsDocument: true,
    };
  }
  if (c.kind === 'person') {
    return {
      verdict: 'block',
      title: 'This is a photo of a person',
      body: 'Photos of people belong on the member record, not on a parcel. Someone standing in a field is fine — a portrait is not.',
      offerAsDocument: false,
    };
  }
  if (c.kind === 'screenshot') {
    return {
      verdict: 'warn',
      title: 'This looks like a screenshot',
      body: `Captured from a screen rather than photographed${why}. Parcel photos should show the land itself.`,
      offerAsDocument: true,
    };
  }
  if (c.kind === 'document') {
    return {
      verdict: 'warn',
      title: 'This looks like a document',
      body: `A printed or scanned page${why}. Filed as a document it gets classified, linked and searchable; as a photo it is just an image.`,
      offerAsDocument: true,
    };
  }
  if (c.kind === 'other') {
    return {
      verdict: 'warn',
      title: 'This doesn’t look like land',
      body: `We couldn’t identify ground, boundaries or crops${why}. Parcel photos should show the land itself.`,
      offerAsDocument: false,
    };
  }
  // 'land', or an answer we did not understand. Low confidence is worth saying
  // out loud, but never worth refusing over.
  if (c.kind === '' || c.confidence === 'low') {
    return {
      verdict: 'warn',
      title: 'Not sure what this shows',
      body: 'We couldn’t tell whether this is land. If it shows your parcel, add it anyway.',
      offerAsDocument: false,
    };
  }
  return SCREENING_OK;
}

/** The CL-562 category the classifier suggests, when it is confident (CL-603). */
export function suggestedCategory(c: Classification | null | undefined, fallback = 'boundary'): string {
  if (!c || c.kind !== 'land') return fallback;
  return c.category && c.category !== 'general' ? c.category : fallback;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * A photograph taken by a camera carries the camera's identity. A screenshot
 * carries none: no make, no model, no lens, no aperture.
 *
 * iOS additionally exposes UserComment "Screenshot" on some captures, but that
 * is not dependable, so the absence of every camera field is the real signal.
 */
export function looksLikeScreenshot(exif: ExifLike | null | undefined): boolean {
  if (!exif) return false;
  const tiff = (exif['{TIFF}'] ?? {}) as ExifLike;
  const camera = [
    str(exif.Make), str(exif.Model), str(exif.LensModel), str(exif.LensMake),
    str(tiff.Make), str(tiff.Model),
  ].filter(Boolean);
  if (camera.length > 0) return false;
  // No camera fields at all AND no aperture/exposure — nothing optical made it.
  const optics = [exif.FNumber, exif.ExposureTime, exif.ISOSpeedRatings, exif.FocalLength].filter(
    (v) => v !== undefined && v !== null,
  );
  const aux = (exif['{Exif}'] ?? {}) as ExifLike;
  const optics2 = [aux.FNumber, aux.ExposureTime, aux.FocalLength].filter(
    (v) => v !== undefined && v !== null,
  );
  return optics.length === 0 && optics2.length === 0;
}

/**
 * Screen a captured image.
 *
 * `hasExif` distinguishes "the picker gave us no metadata at all" (common for
 * some library assets, and NOT evidence of anything) from "metadata exists and
 * says no camera was involved" (a screenshot or a re-saved file).
 */
export function screenPhoto(exif: ExifLike | null | undefined): Screening {
  const hasExif = !!exif && Object.keys(exif).length > 0;
  if (!hasExif) return SCREENING_OK;
  if (looksLikeScreenshot(exif)) {
    return {
      verdict: 'warn',
      title: 'This looks like a screenshot',
      body: 'It carries no camera information, so it was probably captured from a screen rather than photographed. Parcel photos should show the land itself — a screenshot of a report belongs in Documents.',
      offerAsDocument: true,
    };
  }
  return SCREENING_OK;
}
