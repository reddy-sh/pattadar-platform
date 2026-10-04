/** What Documents' Folder column says about where a file lives.
 *
 *  Pure, so the rule is tested without a page:
 *    · In a folder: the folder's name when no other folder of the owner has
 *      it (case-insensitive), else `Parent › Name` — "Ravi › Aadhaar" when
 *      every person's tree has an Aadhaar folder.
 *    · In no folder but filed against properties: their names, as today, until
 *      property folders exist.
 *    · Neither: "My files", the top level's own name. */
export interface FolderRef { id: string; name: string; parentId: string }

export type FolderLabel =
  | { kind: 'folder'; folderId: string; text: string }
  | { kind: 'property'; text: string; more: number; all: string }
  | { kind: 'root'; text: string };

export function folderLabel(
  paper: { folderId?: string; linkedProperties: { title: string }[] },
  byId: Map<string, FolderRef>,
): FolderLabel {
  const folder = paper.folderId ? byId.get(paper.folderId) : undefined;
  if (folder) {
    const lower = folder.name.toLowerCase();
    let namesakes = 0;
    for (const f of byId.values()) if (f.name.toLowerCase() === lower) namesakes += 1;
    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    const text = namesakes > 1 && parent ? `${parent.name} › ${folder.name}` : folder.name;
    return { kind: 'folder', folderId: folder.id, text };
  }
  const linked = paper.linkedProperties;
  if (linked.length) {
    return { kind: 'property', text: linked[0].title, more: linked.length - 1,
             all: linked.map((l) => l.title).join(', ') };
  }
  return { kind: 'root', text: 'My files' };
}
