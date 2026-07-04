# Design ? front-ui-paleta-dorada

## Technical Approach

Close the UI polish scope by aligning the existing dashboard/onboarding implementation with the updated spreadsheet-style export design. This is a frontend-only change; no backend or export engine changes are required.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Dashboard tab label | Keep internal state as `dashboard`, render label `Proyecto` | Avoids state churn while fixing user-facing copy. |
| Main cards | Hide generated `crm-XX` code in project cards | Users need business identity, not internal IDs. |
| Palette | Use `--gold`/`--gold-light` and light-theme overrides | Centralizes platform palette and fixes contrast. |
| Export UX | Accept current table/spreadsheet-style flow | Later design replaced the old separate destination picker requirement. |

## File Evidence

| File | Evidence |
|---|---|
| `front/components/dashboard/dashboard-tabs.tsx` | Renders `Proyecto`; cards omit `crm-XX` code. |
| `front/app/dashboard/page.tsx` | Logout hover uses red classes. |
| `front/app/globals.css` | Onboarding gold palette + light hover contrast override. |
| `front/components/config/vertical-picker.tsx` | Selected vertical uses gold border/ring/tint. |
| `front/components/config/module-toggle-grid.tsx` | Active module uses gold border/tint. |
| `front/components/dashboard/export-table.tsx` | Spreadsheet-style table; no separate `Buscar`/`Seleccionar carpeta` toolbar. |

## Testing Strategy

| Layer | Evidence |
|---|---|
| Static inspection | Verified selectors/classes in affected files. |
| Unit suite | `npm test -- --reporter=basic` passed: 62 files, 421 tests. |
| Manual visual | Not run in this pass; verify-report records this note. |

## Migration / Rollout

No migration required.
