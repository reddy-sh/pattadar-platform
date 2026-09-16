import { describe, expect, test } from 'bun:test';
import { parseBoundaryFile } from './boundaryFile';

describe('MultiPolygon boundary import', () => {
  const parcel = [[79,15], [79.02,15], [79.02,15.02], [79,15.02], [79,15]];
  const shed = [[79,15], [79.001,15], [79.001,15.001], [79.0005,15.001], [79,15.001], [79,15]];
  test('chooses the larger parcel even when its outbuilding has more corners', () => {
    for (const polygons of [[parcel,shed],[shed,parcel]]) {
      const result = parseBoundaryFile(JSON.stringify({type:'MultiPolygon', coordinates:polygons.map(p=>[p])}));
      expect(result.ring).toEqual([[15,79],[15,79.02],[15.02,79.02],[15.02,79]]);
    }
  });
  test('area selection is independent of winding and closing duplicates', () => {
    const result = parseBoundaryFile(JSON.stringify({type:'MultiPolygon',coordinates:[[shed],[parcel.slice(0,-1).reverse()]]}));
    expect(result.ring).toHaveLength(4);
    expect(Math.max(...result.ring.map(p=>p[0]))).toBe(15.02);
  });
});

describe('damaged boundary files', () => {
  const good = [[79, 15], [79.01, 15], [79.01, 15.01], [79, 15.01], [79, 15]];
  test('refuses every malformed GeoJSON corner instead of connecting its neighbours', () => {
    for (const bad of [[181, 15], [79, 91], [79], [null, 15], ['79', 15], null, '79,15', {}]) {
      expect(() => parseBoundaryFile(JSON.stringify({
        type: 'Polygon', coordinates: [[...good.slice(0, 2), bad, ...good.slice(2)]],
      }))).toThrow('invalid corner');
    }
  });
  test('does not replace a damaged multipolygon parcel with a valid outbuilding', () => {
    expect(() => parseBoundaryFile(JSON.stringify({ type: 'MultiPolygon', coordinates: [
      [good], [[...good.slice(0, 2), [500, 15], ...good.slice(2)]],
    ] }))).toThrow('invalid corner');
  });
  test('refuses missing, nonnumeric and out-of-range KML coordinates', () => {
    for (const bad of ['79,', ',15', '79', '181,15,0', '79,91,0', 'bad,15', '0x4f,15']) {
      expect(() => parseBoundaryFile(`<kml><Polygon><coordinates>
        79,15,0 79.01,15,0 ${bad} 79.01,15.01,0 79,15.01,0 79,15,0
      </coordinates></Polygon></kml>`)).toThrow('invalid corner');
    }
  });
  test('retains valid scientific notation and optional altitude in KML', () => {
    const result = parseBoundaryFile('<kml><Polygon><coordinates>7.9e1,1.5e1 79.01,15,3 79.01,15.01,0 79,15.01 79,15</coordinates></Polygon></kml>');
    expect(result.ring).toEqual(good.slice(0, -1).map(([lon, lat]) => [lat, lon]));
  });
});
