# ─────────────────────────────────────────────────────────────────────────
# reorg.ps1 — Reestructura de carpetas de creador_CRM/front
#
# Hace, de forma segura y preservando historial (git mv):
#   1. Renombra el grupo de rutas (panel) -> (crm)         [panel del CRM generado]
#   2. Crea el grupo (dashboard) y mueve la consola         [app/page.tsx -> (dashboard)]
#   3. Junta todos los tests en una sola carpeta: tests/
#
# Los grupos entre paréntesis NO cambian las URLs, así que ningún router.push
# ni enlace se rompe. Los tests usan alias "@/", así que moverlos no rompe
# imports y vitest los sigue encontrando (include: **/*.test.*).
#
# USO (desde creador_CRM/front):
#   powershell -ExecutionPolicy Bypass -File .\reorg.ps1
#   npm test ; npm run dev   # verificar
# ─────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function GitMv($from, $to) {
  if (Test-Path $from) {
    git mv -- "$from" "$to"
    Write-Host "moved: $from -> $to" -ForegroundColor Green
  } else {
    Write-Host "skip (no existe): $from" -ForegroundColor Yellow
  }
}

Write-Host "== 1. (panel) -> (crm) ==" -ForegroundColor Cyan
GitMv "app/(panel)" "app/(crm)"

Write-Host "== 2. consola -> (dashboard) ==" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "app/(dashboard)" | Out-Null
GitMv "app/page.tsx" "app/(dashboard)/page.tsx"

Write-Host "== 3. tests en una sola carpeta (tests/) ==" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "tests" | Out-Null
GitMv "lib/config/__tests__/sector-data.test.ts"   "tests/sector-data.test.ts"
GitMv "lib/generate/__tests__/tenant-schema.test.ts" "tests/tenant-schema.test.ts"
GitMv "lib/clients/__tests__/picker.test.ts"        "tests/picker.test.ts"
GitMv "lib/ai/__tests__/usage-client.test.ts"       "tests/usage-client.test.ts"
GitMv "lib/theme/__tests__/crm-theme.test.ts"       "tests/crm-theme.test.ts"

Write-Host "`nListo. Revisa con:  npm test  y  npm run dev" -ForegroundColor Green
