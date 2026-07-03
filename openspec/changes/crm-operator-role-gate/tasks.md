# Tasks: crm-operator-role-gate

- [x] T1 — `require-operator.ts`: parsear body de `/auth/v1/user` y exigir
      `app_metadata.role === 'operator'` (fail-closed en todo lo demás).
      Test unitario con fetch mockeado cubriendo AC1-AC3.
- [x] T2 — Operativa manual (usuario): asignar `app_metadata: { role: 'operator' }` a los
      usuarios operador reales vía Supabase (dashboard o Admin API). Documentar comando en
      el propio guard como comentario o en README del front.
      Aplicado 03/07/2026 a achozas9@gmail.com vía SQL (raw_app_meta_data). owner@estudiolua.com
      descartado a propósito: credencial demo pública, darle rol operator anularía el gate.
