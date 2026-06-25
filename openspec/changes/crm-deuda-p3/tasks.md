# Tareas — crm-deuda-p3

## WU1 — dedup model-effort (front)
- [ ] T1.1 Crear componente único (p.ej. `components/ai/model-effort.tsx`) con prop
  `variant: 'opera' | 'config'` que encapsule `LLM_PROVIDERS/REASONING_EFFORTS/
  modelSupportsEffort` y la rejilla select+optgroup. API de props estable
  (`model, effort, onModel, onEffort`).
- [ ] T1.2 Migrar los 3 call-sites al componente unificado (adaptar nombres de prop).
- [ ] T1.3 Borrar los 2 componentes viejos. Sin imports huérfanos.
- [ ] T1.4 Test vitest de render: ambas variantes pintan modelos/efforts; `disabled`
  cuando el modelo no soporta effort.

## WU2 — projects POST (back)
- [ ] T2.1 Extraer la rama "revivir soft-deleted" y la rama "crear nuevo" del `POST /`
  a funciones privadas en el mismo archivo, sin cambiar respuesta/estado/códigos.
- [ ] T2.2 Mantener la `$transaction`, el espejo config→columnas y el membership.

## Verificación
- [ ] tsc limpio (back+front).
- [ ] CRM back tests (`node --import tsx --test "src/**/*.test.ts"`) verde.
- [ ] CRM front vitest verde + `next build` OK.
