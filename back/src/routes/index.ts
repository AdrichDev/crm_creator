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

export const api = Router();

// Público
api.use('/auth', authRouter);
// Extracción de diseño de la landing con IA (setup de proyecto, sin tenant aún).
api.use('/branding', brandingRouter);

// A partir de aquí, todo requiere token (y resuelve el tenant activo)
api.use(authenticate);

// Endpoints client-scoped (CLIENT solo ve SUS datos). ANTES del guard staffOnly.
api.use('/me', meRouter);

// Catálogo: lectura para cualquier miembro (incl. CLIENT, para reservar); escritura solo staff.
api.use('/locations', staffOrClient, crudRouter('location', { fields: ['nombre', 'direccion', 'zonaHoraria', 'moneda', 'telefono', 'email', 'reservaOnline', 'activo'], searchFields: ['nombre'] }));
api.use('/services', staffOrClient, crudRouter('service', { fields: ['nombre', 'descripcion', 'categoria', 'duracion', 'precio', 'impuesto', 'requiereRecurso', 'tipoRecurso', 'requiereProfesional', 'reservableOnline', 'color', 'margenAntes', 'margenDespues', 'requiereConsentimiento', 'requiereBono', 'activo'], searchFields: ['nombre', 'categoria'] }));
api.use('/products', staffOrClient, crudRouter('product', { fields: ['nombre', 'categoria', 'stock', 'minimo', 'precio', 'proveedor'], searchFields: ['nombre', 'categoria'] }));

// A partir de aquí, SOLO staff (empleo). El rol CLIENT recibe 403 en todo lo de gestión.
// Cierra el hallazgo CRÍTICO F1/F2 de sec-review.md (crud/dashboard/bookings/packages sin guard).
api.use(staffOnly);

api.use('/employees', employeesRouter); // castellano + nombre combinado + rol
api.use('/customers', customersRouter); // castellano + agregados (visitas/gastoTotal/segmento)
api.use('/resources', crudRouter('resource', { fields: ['locationId', 'nombre', 'tipo', 'capacidad', 'estado', 'notaUbicacion', 'descripcion', 'metadatos'], fkFields: { locationId: 'location' }, searchFields: ['nombre'] }));
api.use('/sales', crudRouter('sale', { fields: ['customerId', 'cliente', 'fecha', 'metodo', 'total'], include: { lines: true }, fkFields: { customerId: 'customer' } }));
api.use('/invoices', crudRouter('invoice', { fields: ['numero', 'cliente', 'servicio', 'fecha', 'total', 'estado', 'documentos'] }));
api.use('/campaigns', crudRouter('campaign', { fields: ['nombre', 'canal', 'estado', 'enviados', 'aperturas'] }));
api.use('/fichajes', crudRouter('fichaje', { fields: ['employeeId', 'empleado', 'fecha', 'entrada', 'salida', 'horas'], fkFields: { employeeId: 'employee' } }));
api.use('/tags', crudRouter('tag', { fields: ['nombre', 'color'], searchFields: ['nombre'] }));

// Custom
api.use('/tenants', tenantsRouter); // clientes de AA (aa.tenant, raw cross-schema) → FK de proyectos
api.use('/projects', projectsRouter); // proyectos = Business + BusinessSetting(config) (row-level, soft delete)
api.use('/users', usersRouter);
api.use('/bookings', bookingsRouter);
api.use('/time-off', timeOffRouter);
api.use('/packages', packagesRouter);
api.use('/dashboard', dashboardRouter);
