# Agent Skills upstream review and adaptation

Reviewed 16 September 2026. No upstream executable code, datasets, fonts,
renderers, templates, or packages were imported or run.

| Upstream | License reviewed | Pattern adapted | Deliberately not imported |
|---|---|---|---|
| [Agent Skills](https://agentskills.io/) | open specification/docs | folder/frontmatter/progressive disclosure; trigger and with-skill/baseline eval method | no external runtime |
| [Archify](https://github.com/tt-a1i/archify) | MIT | evidence-first tracing; diagram type routing; semantic labels; validation vs visual-review distinction | Node renderer, schemas, HTML viewer, assets, update checker |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | accessibility-first priority; touch/safe-area/theme/performance critique; recommendations cannot override project authority | catalogs, Python search scripts, generic palettes/fonts/stacks, design persistence |
| [Anthropic skills](https://github.com/anthropics/skills) | per relevant skill: Apache-2.0 | skill evaluation loop, subject-specific design critique, test reconnaissance/black-box helper principle | skill-creator runtime/viewer/agents, generic Playwright helpers, frontend styling instructions that conflict with Bloom |

## Project override policy

Pattadar's executable source, `design.md`, `apps/ios/design.md`, security
invariants, runbooks, and CI are authoritative. Upstream patterns improve the
workflow but never change product identity, install dependencies, authorize
network/cloud/device actions, weaken test isolation, or create a second source
of truth.

Adapted project skills carry `metadata.upstream-inspiration` where useful. Since
no substantial upstream file/code was copied, upstream license files were not
vendored; links and reviewed license identifiers are retained here for
provenance. Re-review before importing any upstream asset or executable.
