import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { crudRouter } from '../lib/crud.js';
import { authRouter } from './auth.js';
import { bookingsRouter } from './bookings.js';
import { timeOffRouter } from './timeoff.js';
import { packagesRouter } from './packages.js';
import { dashboardRouter } from './dashboard.js';
import { brandingRouter } from './branding.js';

export const api = Router();

// Público
api.use('/auth', authRouter);
// Extracción de diseño de la landing con IA (setup de proyecto, sin tenant aún).
api.use('/branding', brandingRouter);

// A partir de aquí, todo requiere token (y resuelve el tenant activo)
api.use(authenticate);

api.use('/locations', crudRouter('location', { fields: ['name', 'address', 'timezone', 'currency', 'phone', 'email', 'onlineBookingEnabled', 'active'] }));
api.use('/employees', crudRouter('employee', { fields: ['locationId', 'firstName', 'lastName', 'email', 'phone', 'specialty', 'color', 'status', 'hireDate', 'vacationTotal', 'vacationUsed', 'commission'] }));
api.use('/customers', crudRouter('customer', { fields: ['firstName', 'lastName', 'phone', 'email', 'birthDate', 'gender', 'address', 'acquisitionChannel', 'notes', 'preferences', 'consentComms', 'status'], include: { tags: true } }));
api.use('/services', crudRouter('service', { fields: ['name', 'description', 'category', 'durationMin', 'price', 'tax', 'requiresResource', 'resourceType', 'requiresProfessional', 'onlineBookable', 'color', 'bufferBefore', 'bufferAfter', 'requiresConsent', 'requiresPackage', 'active'] }));
api.use('/resources', crudRouter('resource', { fields: ['locationId', 'name', 'type', 'capacity', 'status', 'locationNote', 'description', 'metadata'] }));
api.use('/products', crudRouter('product', { fields: ['name', 'category', 'stock', 'stockMinimo', 'price', 'supplier'] }));
api.use('/sales', crudRouter('sale', { fields: ['customerId', 'customerName', 'date', 'paymentMethod', 'total'], include: { lines: true } }));
api.use('/invoices', crudRouter('invoice', { fields: ['numero', 'cliente', 'servicio', 'fecha', 'total', 'estado', 'documentos'] }));
api.use('/campaigns', crudRouter('campaign', { fields: ['name', 'channel', 'status', 'sent', 'opens'] }));
api.use('/fichajes', crudRouter('fichaje', { fields: ['employeeId', 'employeeName', 'date', 'checkIn', 'checkOut', 'hours'] }));
api.use('/tags', crudRouter('tag', { fields: ['name', 'color'] }));

// Custom
api.use('/bookings', bookingsRouter);
api.use('/time-off', timeOffRouter);
api.use('/packages', packagesRouter);
api.use('/dashboard', dashboardRouter);
