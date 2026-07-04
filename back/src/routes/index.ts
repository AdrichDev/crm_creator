import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { staffOnly, staffOrClient } from '../middleware/rbac.js';
import { crudRouter } from '../lib/crud.js';
import { authRouter } from './auth.js';
import { meRouter } from './me.js';
import { bookingsRouter } from './bookings.js';
import { timeOffRouter } from './timeoff.js';
import { packagesRouter } from './packages.js';
import { dashboardRouter } from './dashboard.js';
import { brandingRouter } from './branding.js';
import { usersRouter } from './users.js';
import { customersRouter } from './customers.js';
import { tenantsRouter } from './tenants.js';
import { projectsRouter } from './projects.js';
import { employeesRouter } from './employees.js';
import { uploadRouter } from './upload.js';
import { exportsRouter } from './exports.js';
import { categoriesRouter } from './categories.js';
import { visitStatesRouter } from './visit-states.js';
import { visitsRouter } from './visits.js';
import { customerNotesRouter } from './customer-notes.js';
import { remindersRouter } from './reminders.js';
import { saleLinesRouter } from './sale-lines.js';
import { pedidosRouter } from './pedidos.js';
import { documentsRouter } from './documents.js';
import { notificationsRouter } from './notifications.js';
import { settingsRouter } from './settings.js';
import { calendarRouter } from './calendar.js';
import { integrationsRouter } from './integrations.js';

export const api = Router();

// Público
api.use('/auth', authRouter);
// Extracción de diseño de la landing con IA (setup de proyecto, sin tenant aún).
api.use('/branding', brandingRouter);
// crm-citas-google-calendar: feed ICS por token en la URL (sin Bearer, Google/Outlook
// lo piden por suscripción); los endpoints de autoservicio dentro del router llaman
// `authenticate` explícitamente (mismo patrón que /auth).
api.use('/calendar', calendarRouter);
// crm-integraciones-comunicacion (WU1): el callback OAuth es público (Google redirige
// sin Bearer, identidad en el `state` nonce); connect/revoke exigen sesión de staff
// vía middleware propio dentro del router (mismo patrón mixto que /calendar).
api.use('/integrations', integrationsRouter);

// A partir de aquí, todo requiere token (y resuelve el tenant activo)
api.use(authenticate);

// Endpoints client-scoped (CLIENT solo ve SUS datos). ANTES del guard staffOnly.
api.use('/me', meRouter);

// Catálogo: lectura para cualquier miembro (incl. CLIENT, para reservar); escritura solo staff.
api.use('/locations', staffOrClient, crudRouter('location', { fields: ['nombre', 'direccion', 'zonaHoraria', 'moneda', 'telefono', 'email', 'reservaOnline', 'activo'], searchFields: ['nombre'] }));
api.use('/services', staffOrClient, crudRouter('service', { fields: ['nombre', 'descripcion', 'categoria', 'duracion', 'precio', 'impuesto', 'requiereRecurso', 'tipoRecurso', 'requiereProfesional', 'reservableOnline', 'color', 'margenAntes', 'margenDespues', 'requiereConsentimiento', 'requiereBono', 'imagenUrl', 'activo'], searchFields: ['nombre', 'categoria'] }));
api.use('/products', staffOrClient, crudRouter('product', { fields: ['nombre', 'categoria', 'stock', 'minimo', 'precio', 'proveedor', 'imagenUrl'], searchFields: ['nombre', 'categoria'] }));
// A partir de aquí, SOLO staff (empleo). El rol CLIENT recibe 403 en todo lo de gestión.
// Cierra el hallazgo CRÍTICO F1/F2 de sec-review.md (crud/dashboard/bookings/packages sin guard).
api.use(staffOnly);

api.use('/employees', employeesRouter); // castellano + nombre combinado + rol
api.use('/customers', customersRouter); // castellano + agregados (visitas/gastoTotal/segmento)
api.use('/resources', crudRouter('resource', { fields: ['locationId', 'nombre', 'tipo', 'capacidad', 'estado', 'notaUbicacion', 'descripcion', 'metadatos'], fkFields: { locationId: 'location' }, searchFields: ['nombre'] }));
// Líneas de venta anidadas (/:id/lineas) ANTES del crud de ventas: rutas distintas, sin colisión.
api.use('/sales', saleLinesRouter);
api.use('/sales', crudRouter('sale', { fields: ['customerId', 'cliente', 'fecha', 'metodo', 'total'], include: { lines: true }, fkFields: { customerId: 'customer' } }));
api.use('/invoices', crudRouter('invoice', { fields: ['numero', 'cliente', 'servicio', 'fecha', 'total', 'estado', 'documentos'] }));
// Presupuestos/Pedidos documentales (crm-paridad-facturas-pedidos-aa): superficie NUEVA,
// separada de /sales (TPV). La factura se auto-crea al aceptar en PR-2b.
api.use('/pedidos', pedidosRouter);
api.use('/campaigns', crudRouter('campaign', { fields: ['nombre', 'canal', 'estado', 'enviados', 'aperturas'] }));
api.use('/fichajes', crudRouter('fichaje', { fields: ['employeeId', 'empleado', 'fecha', 'entrada', 'salida', 'horas'], fkFields: { employeeId: 'employee' } }));
api.use('/tags', crudRouter('tag', { fields: ['nombre', 'color'], searchFields: ['nombre'] }));
api.use('/documents', documentsRouter); // documentos (DELETE hard: sin eliminadoEn)
api.use('/notifications', notificationsRouter); // solo lectura; las escribe el sistema
api.use('/settings', settingsRouter); // ajustes por categoría (config reservada al generador)
api.use('/upload', uploadRouter);
api.use('/categories', categoriesRouter); // equipos deportivos (crm.equipo + crm.miembro_equipo)
// Comercial de campo (crm-comercial-campo): estados de visita, visitas, notas, recordatorios.
api.use('/visit-states', visitStatesRouter);
api.use('/visits', visitsRouter);
api.use('/customer-notes', customerNotesRouter);
api.use('/reminders', remindersRouter);

// Custom
api.use('/tenants', tenantsRouter); // clientes de AA (aa.tenant, raw cross-schema) → FK de proyectos
api.use('/projects', projectsRouter); // proyectos = Business + BusinessSetting(config) (row-level, soft delete)
api.use('/users', usersRouter);
api.use('/bookings', bookingsRouter);
api.use('/time-off', timeOffRouter);
api.use('/packages', packagesRouter);
api.use('/dashboard', dashboardRouter);
api.use('/exports', exportsRouter);
