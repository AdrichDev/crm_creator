# Design: Onboarding guardado por paso

## Archivo
`front/app/onboarding/page.tsx` (client component `OnboardingInner`). Front-only.

## Approach

### 1. Extraer `buildConfig()` (sin cambio de comportamiento)
Mover la construcción de `cfg` (hoy inline en `finish()`, líneas 175-178) a un helper:
```
function buildConfig(): TenantConfig {
  const name = draft.business.name.trim() || VERTICAL_MAP[draft.business.vertical].label;
  return { ...draft, business: { ...draft.business, name },
    branding: { ...draft.branding, logoText: draft.branding.logoText || name.slice(0,2).toUpperCase() },
    setupComplete: true };
}
```

### 2. Extraer `persist(cfg)` — guardado SIN navegación
```
async function persist(cfg: TenantConfig): Promise<boolean> {
  if (!(isEdit && editing)) return false;   // solo edición
  setErrorMsg('');
  try {
    await updateProject(editing.id, cfg);
    openProject(editing.id);
    await syncHorarioConAviso(cfg);
    return true;
  } catch (e) {
    setErrorMsg((e as {message?:string})?.message || 'No se pudieron guardar los cambios…');
    return false;
  }
}
```
La rama de edición de `finish()` pasa a:
```
const cfg = buildConfig();
if (await persist(cfg)) router.push('/dashboard');
```
La rama de alta nueva queda **intacta** (usa `createProject`, no `persist`).

### 3. `saveStep()` — botón Guardar por paso
```
const [saveState, setSaveState] = useState<'idle'|'saving'|'saved'>('idle');
async function saveStep() {
  setSaveState('saving');
  const ok = await persist(buildConfig());
  setSaveState(ok ? 'saved' : 'idle');   // se queda en el paso
}
```
Reset a `idle` cuando el usuario vuelve a editar o cambia de paso:
```
useEffect(() => { setSaveState('idle'); }, [draft, step]);
```
(No dispara tras `saveStep`, que no muta `draft` ni `step`.)

### 4. UI
- **Botón Guardar** en el footer (líneas 370-379), a la derecha junto a "Siguiente"/
  "Crear proyecto", **solo si `isEdit`**. `variant="ghost"` (mismo estilo que
  "Volver a proyectos"). Label dinámico por `saveState`: "Guardar" / "Guardando…" /
  "Guardado ✓". `disabled` mientras `saving`. Colocarlo en el footer cubre TODOS los
  pasos con una sola instancia (no duplicar en cada render condicional).
- **Stepper clicable** (líneas 238-247): en edición cada círculo recibe
  `onClick={() => setStep(i)}` + `cursor-pointer`. En alta se mantiene no interactivo
  (flujo guiado). Envolver el círculo en `<button type="button">` cuando `isEdit`.

## Data flow
Guardar por-paso → `buildConfig()` (draft completo) → `updateProject` (`PATCH
/projects/:id`, body `{ config }`) → back escribe `BusinessSetting.datos` íntegro +
espeja columnas Business. Idéntico al submit final; sin endpoint nuevo.

## Test strategy
Vitest + Testing Library sobre `OnboardingInner`, mock de `useProjects`
(`updateProject`, `openProject`, `createProject`, `projects`) y `useRouter`. Patrón:
`tests/onboarding-edit-persist.test.tsx`.
- T1 caracterización finish edición → updateProject + push.
- T2 saveStep → updateProject llamado, router.push NO llamado.
- T3 alta (sin projectId) → sin botón "Guardar" por paso.
- T4 stepper click en edición → cambia paso.

## No cambia
`back/src/routes/projects.ts`, contrato `PATCH`, `tenant-config-context.tsx`,
`edit-mode.ts`. Sin migraciones.
