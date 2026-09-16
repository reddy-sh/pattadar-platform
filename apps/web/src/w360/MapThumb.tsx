/**
 * A picture of a map, on a card. No Leaflet.
 *
 * The property grid shows every card the ground it stands on, and forty
 * Leaflet instances on the app's landing screen is not a thumbnail — it is
 * forty maps. Measured in the real box: forty `still` MapCanvases cost 949 DOM
 * nodes, 80 ResizeObservers, 40 window resize listeners and 107 tile requests,
 * against 235 nodes and 39 tiles for the same forty pictures built from tile
 * arithmetic. And that Leaflet figure is a floor — it excludes the geocoding
 * cascade a card would need to locate a record with no ring.
 *
 * So: `<img>` tiles positioned by hand, with the boundary drawn over them as
 * one inline SVG path. The path carries the same `w-ring` class the real map
 * uses, which is not a shortcut — it is how the token colours and the light/
 * dark toggle keep following the boundary onto a card.
 *
 * Esri imagery and NOT OpenStreetMap, which is a finding rather than a taste:
 * fetched over the founder's own Chintagunta parcel, the OSM tile at z16 is
 * 103 bytes and 100% one colour — OSM's land fill. Rural Andhra is not drawn.
 * A street-tile grid here would be a beige rectangle, forty times over.
 */
import { useEffect, useRef, useState } from 'react';
import { TILE_PX, boundsZoom, lonLatToPixel, snapZoom } from '@pattadar/core';

import { centreOf, isLocated } from './portfolioGeo';
import type { Located } from './portfolioGeo';

const ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

/** Note the order: Esri puts {z}/{y}/{x}, not the {z}/{x}/{y} OSM uses. */
const tileUrl = (z: number, x: number, y: number) => `${ESRI}/${z}/${y}/${x}`;

/** Four rungs, and the reason there are four rather than one or forty.
 *
 *  Neighbouring parcels in a village sit on the same tiles, so they share a
 *  tile REQUEST only when they share a zoom: measured, forty cards on a ladder
 *  issue 114 <img> that collapse to 39 distinct URLs in the browser cache,
 *  while forty cards each fitted to their own parcel share nothing. One fixed
 *  zoom would share the most and is still wrong — the founder's largest parcel
 *  is 355 m across and would overflow the band at z16. */
const LADDER = [14, 15, 16, 17] as const;

/** A record with a pin and no survey has no box to fit, so no zoom follows
 *  from it. z16 is about 2 m a pixel here: near enough to read a field
 *  boundary or a roofline, far enough not to be an unplaceable green blur. */
const PIN_ZOOM = 16;

export interface MapThumbProps extends Located {
  /** Read out to screen readers — a card's art is not decorative here, it says
   *  where the land is. */
  title: string;
}

export function MapThumb({ ring, lat, lon, title }: MapThumbProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // The grid track stretches (`minmax(19rem, 1fr)`), so the box width is not a
  // constant and the tile offsets must be computed from the real one or the
  // ring lands off the ground it describes. Rounded before it is stored, so a
  // sub-pixel reflow cannot spin this.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const read = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (!w || !h) return;
      setSize((was) => (was && was.w === w && was.h === h ? was : { w, h }));
    };
    read();
    const seen = new ResizeObserver(read);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const located = isLocated({ ring, lat, lon });
  // Rendered even when there is nothing to draw, so the box can be measured
  // once and the caller's own artwork shows through it.
  if (!located) return null;

  let body = null;
  if (size) {
    const { w, h } = size;
    const [cLat, cLon] = centreOf({ ring, lat, lon });

    let z = PIN_ZOOM;
    if (ring.length >= 3) {
      const lats = ring.map((p) => p[0]);
      const lons = ring.map((p) => p[1]);
      z = snapZoom(
        boundsZoom(Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons),
          w, h, 8),
        LADDER,
      );
    }

    // The box's own origin in the world pixel grid. Every tile and every corner
    // is placed relative to this one number pair, which is what keeps the
    // photograph and the boundary in register.
    const c = lonLatToPixel(cLat, cLon, z);
    const left = Math.round(c.x - w / 2);
    const top = Math.round(c.y - h / 2);

    const tiles = [];
    for (let tx = Math.floor(left / TILE_PX); tx <= Math.floor((left + w - 1) / TILE_PX); tx += 1) {
      for (let ty = Math.floor(top / TILE_PX); ty <= Math.floor((top + h - 1) / TILE_PX); ty += 1) {
        tiles.push(
          <img
            key={`${tx}/${ty}`}
            src={tileUrl(z, tx, ty)}
            alt=""
            aria-hidden
            decoding="async"
            loading="lazy"
            style={{ left: tx * TILE_PX - left, top: ty * TILE_PX - top }}
          />,
        );
      }
    }

    const d = ring.length >= 3
      ? `${ring.map((p, i) => {
        const q = lonLatToPixel(p[0], p[1], z);
        return `${i ? 'L' : 'M'}${(q.x - left).toFixed(1)} ${(q.y - top).toFixed(1)}`;
      }).join(' ')} Z`
      : '';

    body = (
      <>
        {/* Tiles that never arrive need no handling. An <img alt=""> that fails
            renders as nothing at all, so the card's own gradient shows through
            and the ring — which comes from the record, not the network — is
            still drawn on top of it. That is the whole offline story, and it
            is worth less state than it first looks: an onError that blanked
            the mosaic was the first attempt, and it let ONE flaky tile at the
            edge throw away a photograph that had otherwise arrived. */}
        {tiles}
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Where ${title} is`}>
          {d
            ? <path className="w-ring" d={d} />
            /* A pin, not a little square: a record with no survey has a
               POSITION and not an extent, and drawing it as a shape would claim
               a boundary the record does not have. */
            : <circle className="pf-pin" cx={w / 2} cy={h / 2} r={6} />}
        </svg>
      </>
    );
  }

  return <div className="mapart" ref={boxRef}>{body}</div>;
}

export default MapThumb;
