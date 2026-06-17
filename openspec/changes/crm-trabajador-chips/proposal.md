# Proposal — Chips de la vista del trabajador (control admin)

**Nivel Gru: 2 — Media** (1 dominio, datos persistentes, reversible).
**Estado: PENDIENTE.**

## Intención
La vista del trabajador (rol `trabajador`) tendrá "chips" — widgets/acciones rápidas en su panel —
configurables por el admin (activar/desactivar por negocio/rol). Hoy solo existe el módulo Fichaje suelto.

## Alcance
- Catálogo de chips para el dashboard del trabajador.
- Panel de control del admin (en Configuración → tab Usuarios/Equipo o Módulos) para activar/desactivar chips.
- Persistencia en `config` (patrón `modules`).

## Brainstorm de chips (candidatos)
| Chip | Qué hace | Depende de |
|---|---|---|
| **Fichaje rápido** | Entrada/salida con un toque + horas de hoy | módulo fichaje |
| **Próxima cita** | Siguiente cita del trabajador + acceso | citas |
| **Mis citas de hoy** | Lista del día | citas |
| **Disponibilidad** | Toggle disponible/ocupado/pausa | — |
| **Pausa/descanso** | Timer de descanso con registro | fichaje |
| **Pedir ausencia** | Atajo a solicitud de vacaciones/ausencia | vacaciones |
| **Mis ventas hoy** | Total vendido + comisión estimada | ventas |
| **Objetivos del día** | KPIs personales (citas atendidas, ticket medio) | estadísticas |
| **Tareas del turno** | Checklist asignado por el admin | (nuevo) |
| **Avisos** | Notificaciones internas del admin | notifications |
| **Caja** | Apertura/cierre rápido de caja | ventas |

## Fuera de alcance
- Chat en tiempo real. Geolocalización del fichaje (futuro).

## Riesgos
- Bajo. Reversible. Solo persiste preferencias de visualización + (opcional) checklist de turno.
