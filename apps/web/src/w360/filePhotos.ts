/** Filing a photo against a record, in one place.
 *
 *  Its one consumer is the Media hanger, which offers two ways in — the header
 *  control and the empty state's drop zone (click or drop) — and both are the
 *  same pick, so neither can drift from the other. It was two consumers when the
 *  record's front page carried a Photos card of its own.
 */
import { useState } from 'react';

import { useAddPhoto, useRefreshW360 } from './api';
import { STORAGE_OFFLINE_MSG, uploadToDrive } from '../pages/documents/storage';

/** Ten megabytes, in bytes. The gateway itself accepts a hundred, but a photo
 *  or a clip filed against a record is evidence, not a film: the cap is here
 *  so a caretaker on a village connection is told before the upload, not after
 *  it has spent four minutes failing. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** '12.4 MB' — the size a person can compare against the limit they were told. */
export const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/** Pixel dimensions, read from the file itself before it is sent.
 *  HEIC throws in every browser — that is exactly why the gateway transcodes
 *  server-side — so 0×0 is a normal answer, not a failure. Callers already
 *  guard on `width > 0` before printing them. */
async function probe(file: File): Promise<{ w: number; h: number }> {
  if (!file.type.startsWith('image/')) return { w: 0, h: 0 };
  try {
    const bmp = await createImageBitmap(file);
    const out = { w: bmp.width, h: bmp.height };
    bmp.close();
    return out;
  } catch {
    return { w: 0, h: 0 };
  }
}

/** The file's own mtime, shaped like every other capture stamp here. It is the
 *  honest answer: nothing in a browser upload proves when the shutter fell. */
function stampOf(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
    + ` ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function useFilePhotos(recordId: string | undefined) {
  /** Every other write in the module refreshes the w360 tree itself. A pick is
   *  N writes, and refreshing after each one refetched the portfolio, the
   *  orders and this record once per file — N-1 answers nobody reads, racing
   *  the uploads still in flight. The refresh is owed once, when the pick is
   *  done, and the `finally` below pays it. */
  const add = useAddPhoto(false);
  const refresh = useRefreshW360();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lastAdded, setLastAdded] = useState('');

  /** Files a pick against the record. `caption` is written onto every file in
   *  the pick — the drawer asks for it once, because a batch is almost always
   *  one visit, and correcting an individual one afterwards is the gallery's own
   *  caption box. It used to be hard-coded empty, so every photo filed from the
   *  web arrived unlabelled and had to be captioned one at a time later. */
  async function file(files: File[], caption = '') {
    if (!files.length || !recordId) return;
    // The WHOLE pick is sized before a single byte of any of it is sent. This
    // check used to sit inside the loop and break out of it, so picking five
    // photos with an oversize third one filed the first two and then said
    // "nothing was uploaded" — a false sentence about what had just happened
    // to the owner's own files, which they answered by picking all five again
    // and filing two of them twice. Refusing the pick up front makes the
    // sentence true and leaves no half-filed batch to reconcile.
    const tooBig = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length) {
      const names = tooBig.map((f) => `${f.name} (${mb(f.size)})`).join(', ');
      setErr(
        `${names} ${tooBig.length > 1 ? 'are' : 'is'} over the ${mb(MAX_UPLOAD_BYTES)} limit`
        + ` — nothing was uploaded. Shrink or drop ${tooBig.length > 1 ? 'them' : 'it'}`
        + ' and pick again.');
      return;
    }
    setBusy(true);
    setErr('');
    let last = '';
    try {
      for (const f of files) {
        const { w, h } = await probe(f);
        /** `uploadToDrive` THROWS on every failure — it is typed
         *  `Promise<StoredNode>` and its own catch re-raises as a
         *  StorageUploadError (storage.ts). So `if (!node)` was dead code, and a
         *  storage gateway that was down fell through to the filing catch below,
         *  which deliberately says nothing because "storage succeeded" — so the
         *  upload failed in total silence. The reason storage gives is the
         *  reason worth printing. */
        let node;
        try {
          node = await uploadToDrive(f);
        } catch {
          /** One message for the batch, never N — the gateway is either there for
           *  all of these files or for none of them. And it is this composed
           *  sentence rather than the thrown one: a StorageUploadError often
           *  carries the gateway's own words, which belong in a toast's mono
           *  detail line and not in the sentence a person is asked to act on. */
          setErr(STORAGE_OFFLINE_MSG);
          break;
        }
        try {
          const res = await add.mutateAsync({
            recordId, fileRef: node.id, fileName: node.name, caption, category: '',
            mediaKind: f.type.startsWith('video/') ? 'video' : 'photo',
            width: w, height: h, sha256: '', capturedAt: stampOf(f.lastModified),
          });
          if (!res.web.addPhoto) {
            setErr('The photo was uploaded but could not be filed against this record.');
            break;
          }
          last = res.web.addPhoto;
        } catch {
          // useAddPhoto owns the mutation failure toast. Storage succeeded, so
          // do not overwrite that truthful message with a gateway outage.
          break;
        }
      }
    } finally {
      setBusy(false);
      // `last` is the id of the last file that was filed, so it is also the
      // answer to "did anything land": a pick that filed nothing has nothing
      // to refresh for.
      if (last) { setLastAdded(last); refresh(); }
    }
  }

  return {
    file, busy, err, lastAdded,
    clearLastAdded: () => setLastAdded(''),
    clearError: () => setErr(''),
  };
}
