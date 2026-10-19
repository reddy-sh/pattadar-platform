# Approved decisions (Reddy, 09/10/2026)

Reddy replied "go" in chat to the lean plan and to these defaults. They replace the approval gate. Anything not covered here keeps today's behaviour (no new policy) and is listed in the report as open.

Scope: backup, delete and restore on the web only. The run gets one design review, one code reviewer and the round-trip feature check. It excludes iOS, Expo and web-next work, architecture and compliance doc rewrites, and dark-mode screenshots.

1. **Backup:** a plain ZIP downloaded in the browser, holding all records and all files. Every file name ends in its unique 5-character code (a code on every file, not only on clashes). No password and no signature in this version.
2. **Deletion:** still started by an operator, using the existing runner `services/api/scripts/erase_account.py`. Fix the runner so it deletes files stored under the `{node}/{version}` layout. Automatic processing is a follow-up.
3. **Money block:** a deletion request is refused while the wallet balance is above zero or an order is open.
4. **Restore target:** restore only goes into an account that has no data yet. After deletion, the person signs up again and gets a fresh, empty account.
5. **Restore scope:** restore brings back records and files in their folders. Payments, wallet, orders, shares, consents, audit history and assistant chats are not restored; they stay in the archive for reference. The Aadhaar number has to be re-entered, because only the last four digits are exported.
6. **Restore and AI:** restore never calls an AI provider. A file that cannot be placed goes into the import report. There is no catch-all or fallback root folder.
7. **Clients:** web only for now. iOS and Expo come later.

Known gaps to report but not fix in this run:
- Automatic deletion processing.
- Personal data about the user inside other owners' rows (`gap-analysis.md` §1.4).
- The backup-retention claim in `docs/compliance/gdpr-dpdp.md:55`. Manual final snapshots are never pruned, so that claim is untrue.
