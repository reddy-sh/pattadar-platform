import type { ServiceVisual as ServiceVisualData } from './api';

const SAFE_ASSET = /^[a-z0-9_-]{1,80}$/;

const FALLBACK_SRC = '/service-visuals/site_visit.webp';

export function serviceVisualSrc(assetKey: string): string {
  return SAFE_ASSET.test(assetKey) ? `/service-visuals/${assetKey}.webp` : FALLBACK_SRC;
}

export function ServiceVisual({
  serviceKey,
  label,
  visual,
  variant = 'thumb',
  showCaption = false,
  eager = false,
}: {
  serviceKey: string;
  label?: string;
  visual?: ServiceVisualData | null;
  variant?: 'thumb' | 'admin';
  showCaption?: boolean;
  eager?: boolean;
}) {
  const assetKey = visual?.assetKey || serviceKey;
  const alt = visual?.alt || `Illustration explaining ${label || serviceKey.replaceAll('_', ' ')}.`;
  const caption = visual?.caption || label || serviceKey.replaceAll('_', ' ');

  return (
    <figure className={`service-visual ${variant}`}>
      <img
        src={visual?.src || serviceVisualSrc(assetKey)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        // shortcut: a service with no bundled image yet (the bore point has none) shows the
        // generic visit image instead of a broken one; draw its own .webp to replace it.
        onError={(e) => { if (!e.currentTarget.src.endsWith(FALLBACK_SRC)) e.currentTarget.src = FALLBACK_SRC; }}
      />
      {showCaption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
