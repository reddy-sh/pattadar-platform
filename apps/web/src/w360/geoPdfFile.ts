/** Read a georeferenced PDF's outlines in the browser. Free and local: the file
 *  is never sent to the document reader for this. */
import { readGeoPdf } from '@pattadar/core';
import type { GeoPdfReading } from '@pattadar/core';

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The sheet's candidate outlines, or null when it carries no georeference
 *  (a scan, a photo, or a PDF drawn without one). Never throws. */
export async function readGeoPdfFile(file: Blob): Promise<GeoPdfReading | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (!String.fromCharCode(...head).includes('%PDF')) return null;
    const reading = await readGeoPdf(new Uint8Array(await file.arrayBuffer()), inflate);
    return reading && reading.outlines.length ? reading : null;
  } catch {
    return null;
  }
}
