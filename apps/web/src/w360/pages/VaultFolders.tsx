/** Documents' file-manager parts: what a file IS at a glance, the owner's
 *  own folders, and the tags they write — each a dialog or a glyph Vault.tsx
 *  composes, so the page itself stays a list.
 *
 *  Folders hold files by pointer (`documents.folder_id`), never by storage
 *  key; every write here is owner-scoped on the server. */
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import AudiotrackOutlined from '@mui/icons-material/AudiotrackOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import NotesOutlined from '@mui/icons-material/NotesOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import SlideshowOutlined from '@mui/icons-material/SlideshowOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import { FILE_KIND_LABEL } from '@pattadar/core';
import type { FileKind } from '@pattadar/core';

import { useCreateVaultFolder, useRenameVaultFolder, useTagPapers } from '../api';
import type { VaultFolder } from '../api';
import { Dialog } from '../Dialog';
import { reasonOf } from '../Toast';
import { Chip, plural } from '../ui';

// ── What a file is ───────────────────────────────────────────────────────

const KIND_GLYPH: Record<FileKind, typeof InsertDriveFileOutlined> = {
  pdf: PictureAsPdfOutlined,
  image: ImageOutlined,
  video: VideocamOutlined,
  audio: AudiotrackOutlined,
  sheet: TableChartOutlined,
  doc: ArticleOutlined,
  slides: SlideshowOutlined,
  map: MapOutlined,
  archive: FolderZipOutlined,
  text: NotesOutlined,
  other: InsertDriveFileOutlined,
};

/** The file's kind as a glyph. Shape carries the meaning; the tint (w360.css
 *  `.fk-*`) only helps the eye group a column, so the kind is also named for a
 *  screen reader rather than left to colour. */
export function FileKindGlyph({ kind, size = 20 }: { kind: FileKind | 'folder'; size?: number }) {
  const G = kind === 'folder' ? FolderOutlined : KIND_GLYPH[kind];
  return (
    <span className={`fk fk-${kind}`} role="img"
          aria-label={kind === 'folder' ? 'Folder' : FILE_KIND_LABEL[kind]}>
      <G sx={{ fontSize: size }} aria-hidden />
    </span>
  );
}

// ── The folder tree ──────────────────────────────────────────────────────

/** Folder ids from the top level down to `id` — [] for the top level, and for
 *  a folder that no longer exists. Guarded against a loop in bad data. */
export function folderPath(id: string, byId: Map<string, VaultFolder>): VaultFolder[] {
  const out: VaultFolder[] = [];
  const seen = new Set<string>();
  let at = byId.get(id);
  while (at && !seen.has(at.id)) {
    seen.add(at.id);
    out.unshift(at);
    at = at.parentId ? byId.get(at.parentId) : undefined;
  }
  return out;
}

/** Every folder in the tree, depth-first and alphabetical, with its depth —
 *  the order a picker draws them in. */
function flatTree(folders: VaultFolder[]): { folder: VaultFolder; depth: number }[] {
  const kids = new Map<string, VaultFolder[]>();
  const known = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    const parent = f.parentId && known.has(f.parentId) ? f.parentId : '';
    kids.set(parent, [...(kids.get(parent) ?? []), f]);
  }
  const out: { folder: VaultFolder; depth: number }[] = [];
  const walk = (parent: string, depth: number, seen: Set<string>) => {
    for (const f of (kids.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ folder: f, depth });
      walk(f.id, depth + 1, seen);
    }
  };
  walk('', 0, new Set());
  return out;
}

/** A folder and everything under it — the places a folder cannot move into. */
export function subtreeOf(id: string, folders: VaultFolder[]): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (!out.has(f.id) && out.has(f.parentId)) { out.add(f.id); grew = true; }
    }
  }
  return out;
}

// ── Dialogs ──────────────────────────────────────────────────────────────

/** Name a new folder, or rename one. The server refuses a clash or a bad
 *  name with its reason, and the dialog stays open and says it. */
export function FolderNameDialog({ parentId, folder, parentName, onDone, onClose }: {
  parentId: string; folder?: VaultFolder; parentName: string;
  onDone: (id: string) => void; onClose: () => void;
}) {
  const create = useCreateVaultFolder();
  const rename = useRenameVaultFolder();
  const [name, setName] = useState(folder?.name ?? '');
  const [error, setError] = useState('');
  const busy = create.isPending || rename.isPending;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    setError('');
    try {
      if (folder) {
        const ok = (await rename.mutateAsync({ folderId: folder.id, name: name.trim() })).web.renameVaultFolder;
        if (!ok) { setError('That folder is no longer here. Reload to check.'); return; }
        onDone(folder.id);
      } else {
        const id = (await create.mutateAsync({ name: name.trim(), parentId })).web.createVaultFolder;
        if (!id) { setError('The folder could not be made. Nothing has changed.'); return; }
        onDone(id);
      }
    } catch (err) {
      setError(reasonOf(err) || 'The folder could not be saved. Nothing has changed.');
    }
  };

  return (
    <Dialog title={folder ? `Rename “${folder.name}”` : 'New folder'} onClose={onClose} busy={busy}
            dismissable={false} initialFocus="#vault-folder-name"
            footer={
              <>
                <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
                <button type="submit" form="vault-folder-form" className="btn primary"
                        disabled={!name.trim() || busy}>
                  {busy ? 'Saving…' : folder ? 'Rename' : 'Create folder'}
                </button>
              </>
            }>
      <form id="vault-folder-form" onSubmit={(e) => { void submit(e); }}>
        <div className="field">
          <label htmlFor="vault-folder-name">Folder name</label>
          <input id="vault-folder-name" type="text" value={name} maxLength={80}
                 onChange={(e) => { setName(e.target.value); setError(''); }}
                 placeholder="Sale deeds" autoComplete="off" />
        </div>
        {!folder && <p className="note" style={{ margin: 0 }}>In {parentName}</p>}
        {error && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>}
      </form>
    </Dialog>
  );
}

/** Choose where files — or a folder — go. The top level is always a choice;
 *  a folder's own subtree is not, because a folder inside itself is a loop. */
export function MoveToFolderDialog({ title, folders, currentId, exclude, busy, error, onMove, onClose }: {
  title: string; folders: VaultFolder[]; currentId: string; exclude?: Set<string>;
  busy: boolean; error: string; onMove: (folderId: string) => void; onClose: () => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const rows = useMemo(() => flatTree(folders).filter(({ folder }) => !exclude?.has(folder.id)),
    [folders, exclude]);
  const choice = (id: string, label: string, depth: number, count?: string) => {
    const here = id === currentId;
    return (
      <button key={id || 'top'} type="button" className="vault-move-opt" aria-pressed={target === id}
              disabled={busy || here} onClick={() => setTarget(id)}
              style={{ paddingInlineStart: `calc(0.75rem + ${depth * 1.25}rem)` }}>
        <FileKindGlyph kind="folder" size={18} />
        <span className="grow">{label}</span>
        <span className="note">{here ? 'Here now' : count}</span>
      </button>
    );
  };
  return (
    <Dialog title={title} onClose={onClose} busy={busy}
            footer={
              <>
                <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
                <button type="button" className="btn primary" disabled={target === null || busy}
                        onClick={() => target !== null && onMove(target)}>
                  {busy ? 'Moving…' : 'Move here'}
                </button>
              </>
            }>
      <div className="vault-move-list" role="group" aria-label="Folders">
        {choice('', 'My files', 0, 'Top level')}
        {rows.map(({ folder, depth }) => choice(folder.id, folder.name, depth + 1,
          plural(folder.fileCount, 'file')))}
      </div>
      {rows.length === 0 && (
        <p className="note" style={{ margin: 0 }}>You have no folders yet. Make one with New folder.</p>
      )}
      {error && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>}
    </Dialog>
  );
}

/** One file's tags: take one off, add one, or pick one already used on
 *  another file. Each change is its own write, so nothing is lost to a
 *  half-finished edit. */
export function EditTagsDialog({ paperId, title, tags, known, onClose }: {
  paperId: string; title: string; tags: string[]; known: string[]; onClose: () => void;
}) {
  const tag = useTagPapers();
  const [word, setWord] = useState('');
  const [error, setError] = useState('');
  const suggestions = known.filter((t) => !tags.includes(t)).slice(0, 12);

  const change = async (t: string, on: boolean) => {
    const w = t.trim();
    if (!w || tag.isPending) return;
    if (on && tags.includes(w)) { setWord(''); return; }
    setError('');
    try {
      await tag.mutateAsync({ paperIds: [paperId], tag: w, on });
      if (on) setWord('');
    } catch (err) {
      setError(reasonOf(err) || 'That tag could not be saved. Nothing has changed.');
    }
  };

  return (
    <Dialog title={`Tags on ${title}`} onClose={onClose} busy={tag.isPending}
            initialFocus="#vault-tag-word"
            footer={<button type="button" className="btn" onClick={onClose}>Done</button>}>
      {tags.length > 0 ? (
        <ul className="vault-tag-edit" aria-label="Tags on this file">
          {tags.map((t) => (
            <li key={t}>
              <span className="tag">{t}</span>
              <button type="button" className="vault-tag-x" disabled={tag.isPending}
                      aria-label={`Remove the tag ${t}`} onClick={() => { void change(t, false); }}>
                <CloseOutlined sx={{ fontSize: 14 }} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="note" style={{ margin: 0 }}>No tags on this file yet.</p>}
      <form className="row tight" onSubmit={(e) => { e.preventDefault(); void change(word, true); }}>
        <div className="field grow" style={{ margin: 0 }}>
          <label htmlFor="vault-tag-word">Add a tag</label>
          <input id="vault-tag-word" type="text" value={word} maxLength={40} autoComplete="off"
                 onChange={(e) => { setWord(e.target.value); setError(''); }} placeholder="give to lawyer" />
        </div>
        <button type="submit" className="btn" disabled={!word.trim() || tag.isPending}
                style={{ alignSelf: 'flex-end' }}>
          {tag.isPending ? 'Saving…' : 'Add'}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="row tight" aria-label="Tags used on other files" role="group">
          {suggestions.map((t) => (
            <Chip key={t} onClick={() => { void change(t, true); }}>{t}</Chip>
          ))}
        </div>
      )}
      {error && <p className="note" role="alert" style={{ margin: 0, color: 'var(--w-danger)' }}>{error}</p>}
    </Dialog>
  );
}
