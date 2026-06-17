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
api.use('/locations', staffOrClient, crudRouter('location', { fields: ['name', 'address', 'timezone', 'currency', 'phone', 'email', 'onlineBookingEnabled', 'active'] }));
api.use('/services', staffOrClient, crudRouter('service', { fields: ['name', 'description', 'category', 'durationMin', 'price', 'tax', 'requiresResource', 'resourceType', 'requiresProfessional', 'onlineBookable', 'color', 'bufferBefore', 'bufferAfter', 'requiresConsent', 'requiresPackage', 'active'] }));
api.use('/products', staffOrClient, crudRouter('product', { fields: ['name', 'category', 'stock', 'stockMinimo', 'price', 'supplier'] }));

// A partir de aquí, SOLO staff (empleo). El rol CLIENT recibe 403 en todo lo de gestión.
// Cierra el hallazgo CRÍTICO F1/F2 de sec-review.md (crud/dashboard/bookings/packages sin guard).
api.use(staffOnly);

api.use('/employees', crudRouter('employee', { fields: ['locationId', 'firstName', 'lastName', 'email', 'phone', 'specialty', 'color', 'status', 'hireDate', 'vacationTotal', 'vacationUsed', 'commission'] }));
api.use('/customers', crudRouter('customer', { fields: ['firstName', 'lastName', 'phone', 'email', 'birthDate', 'gender', 'address', 'acquisitionChannel', 'notes', 'preferences', 'consentComms', 'status'], include: { tags: true } }));
api.use('/resources', crudRouter('resource', { fields: ['locationId', 'name', 'type', 'capacity', 'status', 'locationNote', 'description', 'metadata'] }));
api.use('/sales', crudRouter('sale', { fields: ['customerId', 'customerName', 'date', 'paymentMethod', 'total'], include: { lines: true } }));
api.use('/invoices', crudRouter('invoice', { fields: ['numero', 'cliente', 'servicio', 'fecha', 'total', 'estado', 'documentos'] }));
api.use('/campaigns', crudRouter('campaign', { fields: ['name', 'channel', 'status', 'sent', 'opens'] }));
api.use('/fichajes', crudRouter('fichaje', { fields: ['employeeId', 'employeeName', 'date', 'checkIn', 'checkOut', 'hours'] }));
api.use('/tags', crudRouter('tag', { fields: ['name', 'color'] }));

// Custom
api.use('/users', usersRouter);
api.use('/bookings', bookingsRouter);
api.use('/time-off', timeOffRouter);
api.use('/packages', packagesRouter);
api.use('/dashboard', dashboardRouter);
