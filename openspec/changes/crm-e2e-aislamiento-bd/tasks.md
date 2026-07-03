# Tasks: crm-e2e-aislamiento-bd

- [x] T1 — `package.json`: `test` = solo tests puros (excluir `*.e2e.test.ts`),
      `test:e2e` = solo e2e, `test:all` = ambos. README actualizado.
      Verificado: `npm test` 250/250 verde, cero ficheros e2e en el runner (glob
      extglob `src/**/!(*.e2e).test.ts`, soportado por node --test en Node 22).
- [x] T2 — Cleanup fiable: `dotenv/config` en el proceso de test e2e
      (`_shared.e2e.ts` + 10 ficheros con cleanup local) y errores de cleanup
      loggeados (`[e2e cleanup]`) en vez de tragados.
      Verificado: run de `settings.e2e.test.ts` con back vivo → conteos de
      `Biz %`/`%@test.local` idénticos antes/después (16/45/47).
- [x] T3 — `scripts/purge-test-residue.mjs`: barrido de `Biz %`/`TzBiz%` y
      `%@test.local` con `--dry-run` default y `--apply`. Documentado en README.
      Verificado dry-run real: 16 negocios, 45 crm.usuario, 47 auth.users.
      `--apply` NO ejecutado — lo decide el usuario.
