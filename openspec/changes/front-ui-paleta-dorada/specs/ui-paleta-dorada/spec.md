# Spec ? front-ui-paleta-dorada

## ADDED Requirements

### Requirement: Console tab and project cards use user-facing labels

The CRM console MUST show the first dashboard tab as `Proyecto` and MUST NOT show internal project codes in the main project cards.

#### Scenario: User opens project console
- **GIVEN** the user is on the project console
- **WHEN**the tab bar and project cards render
- **THEN**the first tab reads `Proyecto`
- AND the cards show business-facing project data, not `crm-XX` codes

### Requirement: Golden platform palette is used in onboarding controls

The onboarding UI MUST use the platform gold palette for primary navigation and selection states instead of the previous blue accent.

#### Scenario: User navigates onboarding
- **GIVEN** the user is in onboarding
- **WHEN**buttons, vertical cards, and module cards render
- **THEN**selected/primary states use `--gold` or derived gold tint
- AND hardcoded blue selection states are not used for those interactions

### Requirement: Light theme contrast remains readable

The onboarding light theme MUST keep text readable on gold hover states.

#### Scenario: User hovers primary button in light mode
- **GIVEN** `data-theme="light"`
- **WHEN**the user hovers a primary onboarding button
- **THEN**the text is dark on gold background

### Requirement: Export UI follows current spreadsheet-style table design

The export tab MUST use the current table/spreadsheet-style export flow. It MUST NOT show a separate editable destination input with a `Buscar` button, nor a standalone `Seleccionar carpeta` toolbar action.

#### Scenario: User opens export tab
- **GIVEN** the user opens `Exportar`
- **WHEN**the export table renders
- **THEN**export actions appear per row
- AND folder picking is integrated into the row export flow
