# Agent Skills upstream review and adaptation

Reviewed 16 September 2026. No upstream executable code, datasets, fonts,
renderers, templates, or packages were imported or run.

| Upstream | License reviewed | Pattern adapted | Deliberately not imported |
|---|---|---|---|
| [Agent Skills](https://agentskills.io/) | open specification/docs | folder/frontmatter/progressive disclosure; trigger and with-skill/baseline eval method | no external runtime |
| [Archify](https://github.com/tt-a1i/archify) | MIT | evidence-first tracing; diagram type routing; semantic labels; validation vs visual-review distinction | Node renderer, schemas, HTML viewer, assets, update checker |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | accessibility-first priority; touch/safe-area/theme/performance critique; recommendations cannot override project authority | catalogs, Python search scripts, generic palettes/fonts/stacks, design persistence |
| [Anthropic skills](https://github.com/anthropics/skills) | per relevant skill: Apache-2.0 | skill evaluation loop, subject-specific design critique, test reconnaissance/black-box helper principle | skill-creator runtime/viewer/agents, generic Playwright helpers, frontend styling instructions that conflict with Bloom |
| [Material Web docs](https://github.com/material-components/material-web/tree/main/docs) and [Material 3](https://m3.material.io/) (reviewed 27 September 2026) | Apache-2.0 (material-web repository) | button emphasis, chip types, tabs, lists, dialogs, progress, text fields, icon buttons and typescale roles, paraphrased and linked in the `heuristic-ux-audit` checklist | no components, tokens, fonts, icons, images or Google brand identity; no text copied |
| [Android Developers: window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes) (reviewed 27 September 2026) | Apache-2.0 (documentation) | M3 width breakpoints for the audit's 390/1512 layout pass | no code |
| [NN/g: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) by Jakob Nielsen (reviewed 27 September 2026) | copyright NN/g; use permitted with credit and a link, as the page asks | the ten heuristic names as the audit's coverage check | no descriptions, posters or examples |
| [W3C: Understanding SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) (reviewed 27 September 2026) | W3C Document License | the pause/stop/hide conditions used by the audit's motion pass, paraphrased | no text copied |
| [typesafe-ai/skills](https://github.com/typesafe-ai/skills) (reviewed 24 September 2026, tree `65a39f3`) | MIT | TypeSafe System One programming model and live-docs entry points; adapted with Pattadar frontmatter, safety boundaries, and companion/ownership deferral | no scripts, dependencies, hooks, or `allowed-tools` existed upstream; nothing executable imported; upstream `SKILL.md` body retained verbatim with a Pattadar-boundaries preface, and the MIT `LICENSE` was copied into the skill folder by the installer |

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

Exception — `typesafe-ai`: this skill was installed with the `skills` CLI, which
copied the upstream `SKILL.md` (instructional text, adapted) and its MIT `LICENSE`
into `.kiro/skills/typesafe-ai/`. The vendored `LICENSE` is retained because the
upstream instruction body was copied and adapted rather than merely referenced. No
upstream scripts, dependencies, or executables were imported.
