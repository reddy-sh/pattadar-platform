import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

/**
 * Capturing a land photograph together with the metadata that makes it
 * evidence (CL-563).
 *
 * The metadata is read here and stored in our own columns rather than left in
 * the file, because EXIF does not survive the journey: share sheets, WhatsApp,
 * and most upload pipelines strip it. A boundary photo whose coordinates were
 * quietly removed in transit proves nothing.
 */

export interface CapturedPhoto {
  /** Raw EXIF, kept so the screening rules can read provenance (CL-601). */
  exif: Record<string, unknown> | null;
  uri: string;
  name: string;
  mimeType: string;
  /** null, never 0 — a missing fix must not read as the Gulf of Guinea. */
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  capturedAt: string;
  /** True when the position came from the phone now, not from the image. */
  liveLocation: boolean;
}

/** EXIF GPS, in whichever of the several shapes the platform hands back. */
function exifLatLng(exif: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!exif) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  let lat = num(exif.GPSLatitude) ?? num((exif as Record<string, unknown>)['{GPS}'] && null);
  let lng = num(exif.GPSLongitude);
  if (lat === null || lng === null) {
    const gps = exif['{GPS}'] as Record<string, unknown> | undefined;
    lat = num(gps?.Latitude);
    lng = num(gps?.Longitude);
    // iOS reports the hemisphere separately; without applying it a southern or
    // western coordinate lands in the wrong quadrant of the world.
    if (lat !== null && String(gps?.LatitudeRef ?? '').toUpperCase() === 'S') lat = -lat;
    if (lng !== null && String(gps?.LongitudeRef ?? '').toUpperCase() === 'W') lng = -lng;
  } else {
    if (String(exif.GPSLatitudeRef ?? '').toUpperCase() === 'S') lat = -lat;
    if (String(exif.GPSLongitudeRef ?? '').toUpperCase() === 'W') lng = -lng;
  }
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** EXIF capture date ("2026:07:27 10:14:03") → ISO. '' when absent. */
function exifCapturedAt(exif: Record<string, unknown> | null | undefined): string {
  const raw = String(exif?.DateTimeOriginal ?? exif?.DateTime ?? '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return '';
  const [, y, mo, d, h, mi, s] = m;
  const parsed = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

/**
 * Where the photo was taken, and which way the camera faced.
 *
 * Only consulted for a photo taken *now*: for a library pick, the phone's
 * current position says where the user is standing today, which has nothing to
 * do with where an old photo was taken.
 */
async function liveFix(): Promise<{ lat: number; lng: number; heading: number | null } | null> {
  const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  const granted =
    perm?.granted || (await Location.requestForegroundPermissionsAsync().catch(() => null))?.granted;
  if (!granted) return null;
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
  if (!loc) return null;
  // A phone flat on a table gives no usable heading; absent is honest.
  const h = await Location.getHeadingAsync().catch(() => null);
  const heading = h && Number.isFinite(h.trueHeading) && h.trueHeading >= 0 ? h.trueHeading : null;
  return { lat: loc.coords.latitude, lng: loc.coords.longitude, heading };
}

export async function capturePhoto(source: 'camera' | 'library'): Promise<CapturedPhoto | { error: string } | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { error: 'Camera permission denied — allow it in Settings.' };
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { error: 'Photo access denied — allow it in Settings.' };
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8, exif: true };
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;

  const a = res.assets[0];
  const exif = a.exif as Record<string, unknown> | undefined;
  const fromExif = exifLatLng(exif);
  const live = source === 'camera' ? await liveFix() : null;
  // EXIF wins when present: it describes the photo. The live fix is a fallback
  // for a camera shot whose EXIF carried no GPS.
  const fix = fromExif ?? (live ? { lat: live.lat, lng: live.lng } : null);

  return {
    exif: exif ?? null,
    uri: a.uri,
    name: a.fileName ?? `land-${Date.now()}.jpg`,
    mimeType: a.mimeType ?? 'image/jpeg',
    latitude: fix?.lat ?? null,
    longitude: fix?.lng ?? null,
    heading: live?.heading ?? null,
    capturedAt: exifCapturedAt(exif) || new Date().toISOString(),
    liveLocation: !fromExif && !!live,
  };
}
