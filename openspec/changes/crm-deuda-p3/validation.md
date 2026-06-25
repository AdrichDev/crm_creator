# Validación — crm-deuda-p3

Regla: cada tarea OK SOLO con su test/verificación en verde. Refactor = no regresión.

## WU1 — model-effort unificado
Historia: como dev, quiero un solo componente de selección modelo+effort para no
mantener dos casi idénticos.
AC: los 3 call-sites se ven y funcionan igual que antes; no quedan los 2 componentes
viejos; tsc + build verdes.
- Given el componente con `variant='opera'`, When se renderiza en estadísticas/marketing,
  Then muestra optgroups de `LLM_PROVIDERS` y el select de effort deshabilitado si el
  modelo no soporta effort. (test: vitest render)
- Given `variant='config'`, When se renderiza en ai-branding-suggest, Then mismo
  comportamiento con las clases de onboarding. (test: vitest render)
- Given el repo tras el cambio, When `grep model-effort-select|model-effort-picker`,
  Then 0 referencias a los viejos. (test: grep + tsc)

## WU2 — projects POST refactor
Historia: como dev, quiero el POST /projects partido en funciones legibles sin cambiar
su contrato.
AC: misma respuesta/códigos para crear, revivir (soft-deleted) y duplicado (P2002).
- Given un tenant sin proyecto, When POST /projects, Then 201 + Business+config+membership
  igual que antes. (test: back tests existentes verdes)
- Given un proyecto soft-deleted del mismo tenant, When POST /projects, Then se revive
  (no error unique). (test: back tests / e2e existentes verdes)
- Given el código, When tsc, Then limpio. (test: tsc)
