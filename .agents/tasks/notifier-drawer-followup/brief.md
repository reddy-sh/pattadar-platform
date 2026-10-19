# Follow-up brief: Inactivity notifications editor (approved by Reddy, 03/10/2026)

Reddy said "go with recommendations" for every item on the audit board:
/Users/reddy.sh/reddy.sh/projects/pattadar-platform/.local/ux-audits/2026-10-03-inactivity-notifications-dialog/board.html
(its evidence/ folder holds the BEFORE captures).

Start only after the build run `families-safeguard-tab-filters-print` (wf_676360f390174935) has finished. That run edits the same files.

## Approved changes (board marker numbers)
1. Move the NotifierDialog (apps/web/src/w360/Groups.tsx) into the shared right-side Drawer (apps/web/src/components/Drawer.tsx). Give it an eyebrow, title, sub line and a pinned footer with the primary action first, as the Properties add/edit flows do (RecordPeople.tsx:216, RecordMoney.tsx:141, PropertyActions.tsx:1015).
2. Style the radio group like the existing borderless picker (w360.css .share-paper-picker legend, about lines 5679-5685: 13px 700, top hairline). Drop the browser's groove border.
3. Take the radios out from under `.field > label`. Options become 400-weight sentence-case body text at 14px, with `accent-color: var(--w-accent)`. Each radio stays on its label's line at 390px.
4. Show the excluded-members sentence as a warn StatusChip, matching the Safeguard tab.
5. Use one source for the contact gap in the tab and the editor: the server's `inactiveContactGaps`. Stop the dialog filtering members on its own conditions. Use one wording in both places. If the server's notion of a gap includes consent, the shared wording must say so. Invent nothing beyond that.
6. Link the gap to the Members tab. With 0 eligible recipients, disable Save and show the existing "No family member has a verified email yet." line as its primaryWhy, pinned above the footer.
7. Remove the 3 inline margins on the notes and let the container gap do the spacing.
8. In "together" mode, list the recipients as read-only rows: the same rows the ordered mode uses, without its controls.
9. Once settings load, put the first focus on the checked radio (initialFocus or the Drawer's panel focus), not on Cancel.
10. After a failed save, keep focus on Save, drop the raw server message line, and word the toast for the mode that was saved (apps/web/src/w360/groupsData.ts:350).

## Constraints
- Do not commit. Work in the main working tree.
- Use the shared components only.
- Bloom identity: Atkinson 400/700, dates DD/MM/YYYY, amber only on the one filled action.
- Update design.md or docs where they describe this editor.

## Verification
- typecheck
- all scripts/*-tests.ts guards plus the UX and icon guards
- relevant sealed tests/e2e-app specs (never e2e-web360, never live)
- functional-acceptance in the sealed harness, covering:
  - open the editor
  - both modes
  - the 0-recipient state (Save disabled)
  - the some-verified state
  - the Members link
  - a successful save
  - a failed save (focus stays on Save, toast worded for the mode)
  - Escape and Cancel
- sealed BEFORE | AFTER captures at 1512 and 390, saved to `.local/ux-audits/2026-10-03-inactivity-notifications-dialog/after/`
- read images back through sips -Z 2000 copies
- a semantic review step last in the implement/review loop
