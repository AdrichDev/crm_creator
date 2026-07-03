# Tasks: crm-generador-exclusiones

- [x] T1 — `generar.mjs`: predicado `shouldCopy(name, isDir)` con denylist de dirs
      (+`backups`, `coverage`, `tmp`) y patrones de fichero (`*.sql`, `*.dump`,
      `*.log`, `.env*` salvo `*.example`, `*.pem`, `*.key`). Tests unitarios.
- [x] T2 — Test de integración: generación desde origen sintético en tmpdir,
      verifica AC1/AC2.
- [x] T3 — Purga de `generated/*/back/backups/` existentes (dump vitaldent + logs).
