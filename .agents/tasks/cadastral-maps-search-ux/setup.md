# Setup

- HEAD: 8c6a2d4 (same as at planning)
- Date: 02/10/2026 19:46 PDT
- curl http://localhost:5173/app: 200
- Baseline copies: .local/impl-scratch/cadastral-search-baseline/<repo path>, all 10 verified identical with cmp.

## git status --short (at setup)

```
 M .kiro/skill-evals/portfolio.json
 M .kiro/skills/README.md
 M .kiro/skills/heuristic-ux-audit/SKILL.md
 M .kiro/skills/heuristic-ux-audit/assets/board-template.html
 M .kiro/skills/heuristic-ux-audit/references/board-format.md
 M apps/web/src/api/client.test.ts
 M apps/web/src/pages/families/PersonDialog.tsx
 M apps/web/src/w360/FenceStudio.tsx
 M apps/web/src/w360/pages/CombinedProperty.tsx
 M apps/web/src/w360/pages/Dashboard.tsx
 M apps/web/src/w360/pages/Properties.tsx
 M apps/web/src/w360/pages/Tools.tsx
 M apps/web/src/w360/pages/Vault.tsx
 M apps/web/src/w360/pages/VillageMaps.tsx
 M apps/web/src/w360/w360.css
 M docs/runbooks/aadhaar-kms-rollout.md
 M docs/specs/2026-08-15-web-360-design.md
 M packages/core/src/land/landcalc.ts
 M scripts/fence-tests.ts
 M services/api/src/aadhaar.py
 M services/api/src/ai_reading/jobs.py
 M services/api/src/ai_reading/operations.py
 M services/api/src/main.py
 M services/api/tests/test_aadhaar_security.py
 M services/api/tests/test_ai_reading.py
 M services/api/tests/test_import_jobs.py
 M tests/e2e-app/specs/07-record-people.spec.ts
 M tests/e2e-app/specs/17-villages.spec.ts
 M tests/e2e-app/specs/19-sections-legacy.spec.ts
?? .agents/
?? apps/web/src/w360/FenceParts.tsx
?? apps/web/src/w360/fenceBill.ts
?? docs/architecture/2026-09-21-dynamodb-migration-findings.md
?? docs/architecture/2026-09-21-dynamodb-migration-review.md
?? semantic-review/2026-09-23-013707-pr-0.md
?? services/api/tests/test_sro_offices_order.py
?? tests/e2e-app/specs/28-combined-overview.spec.ts
```
