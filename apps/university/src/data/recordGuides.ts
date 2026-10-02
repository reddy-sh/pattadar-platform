import guides from './recordGuides.json';

export interface RecordField {
  label: string;
  example: string;
  meaning: string;
  verify: string;
}

export interface RecordGuide {
  stateCode: 'AP' | 'TS';
  slug: string;
  title: string;
  shortTitle: string;
  kind: string;
  lessonId: string;
  courseSlug: string;
  graphic: 'passbook' | 'register' | 'map' | 'timeline';
  summary: string;
  purpose: string;
  limit: string;
  fields: RecordField[];
  watchFor: string[];
  practice: string;
  sourceIds: string[];
  videoTakeaways: string[];
}

export const recordGuides = guides as RecordGuide[];

export function recordGuidesForState(code: 'AP' | 'TS'): RecordGuide[] {
  return recordGuides.filter((guide) => guide.stateCode === code);
}

export function recordGuidesForModule(moduleId: string): RecordGuide[] {
  return recordGuides.filter((guide) => guide.lessonId === moduleId);
}

export function recordGuidePath(guide: RecordGuide): string {
  const stateSlug = guide.stateCode === 'AP' ? 'andhra-pradesh' : 'telangana';
  return `/states/${stateSlug}/records/${guide.slug}`;
}

export function recordGuideBySlug(stateSlug: string | undefined, guideSlug: string | undefined): RecordGuide | undefined {
  const stateCode = stateSlug === 'andhra-pradesh' ? 'AP' : stateSlug === 'telangana' ? 'TS' : undefined;
  return recordGuides.find((guide) => guide.stateCode === stateCode && guide.slug === guideSlug);
}

export function recordVideoUrl(guide: RecordGuide, extension: 'mp4' | 'vtt' | 'txt' | 'jpg'): string {
  return `/record-videos/${guide.stateCode}/${guide.slug}.${extension}`;
}
