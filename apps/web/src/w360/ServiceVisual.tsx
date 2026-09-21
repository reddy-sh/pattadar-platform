import type { ServiceVisual as ServiceVisualData } from './api';

const SAFE_ASSET = /^[a-z0-9_-]{1,80}$/;

export function serviceVisualSrc(assetKey: string): string {
  return `/service-visuals/${SAFE_ASSET.test(assetKey) ? assetKey : 'site_visit'}.webp`;
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
  variant?: 'thumb' | 'card' | 'admin';
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
      />
      {showCaption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
