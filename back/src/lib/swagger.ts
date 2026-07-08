// Especificación OpenAPI 3.0 del back de CRM (OperaOS), escrita inline.
// Se monta con swagger-ui-express en GET /api/docs (solo en dev/staging).
// No usa decoradores JSDoc en rutas: la spec se mantiene aquí, centralizada.

const bearerAuth = [{ BearerAuth: [] as string[] }];

const paginationParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Página (>= 1)' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, description: 'Tamaño de página (1–100)' },
  { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Texto de búsqueda' },
] as const;

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Identificador del recurso',
} as const;

const unauthorizedResponse = {
  description: 'No autenticado',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

const notFoundResponse = {
  description: 'Recurso no encontrado',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

// Respuesta de límite de peticiones alcanzado (publicRateLimiter: 100 req/IP cada 15 min).
// Solo aplica a los endpoints públicos sin auth (/public/*).
const tooManyRequestsResponse = {
  description: 'Demasiadas peticiones (límite por IP alcanzado: 100 cada 15 min)',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
};

// Parámetros de ordenación por cabecera (?sort=&order=). `fields` es puramente documental
// (la whitelist real vive server-side en cada build*OrderBy); sin `sort` válido el back
// aplica createdAt desc por defecto.
function sortParams(fields: readonly string[]) {
  return [
    { name: 'sort', in: 'query', schema: { type: 'string', enum: [...fields] }, description: `Campo de ordenación (${fields.join(', ')}); sin valor válido → createdAt desc` },
    { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Sentido de la ordenación' },
  ] as const;
}

function listResponse(schemaName: string) {
  return {
    '200': {
      description: `Lista paginada de ${schemaName}`,
      content: {
        'application/json': {
          schema: {
            allOf: [
              { $ref: '#/components/schemas/PaginatedResponse' },
              { type: 'object', properties: { items: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } } } },
            ],
          },
        },
      },
    },
    '401': unauthorizedResponse,
  };
}

// Como listResponse, pero además adjunta `metrics` (calculadas server-side sobre TODO el
// negocio, no solo la página). Usado por /invoices y /pedidos (crm-operaos 10.3+PR-3).
function listWithMetricsResponse(schemaName: string) {
  return {
    '200': {
      description: `Lista paginada de ${schemaName} + métricas`,
      content: {
        'application/json': {
          schema: {
            allOf: [
              { $ref: '#/components/schemas/PaginatedResponse' },
              {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } },
                  metrics: { type: 'object', description: 'KPIs agregados sobre todo el negocio (no solo la página devuelta)' },
                },
              },
            ],
          },
        },
      },
    },
    '401': unauthorizedResponse,
  };
}

function entityResponse(schemaName: string) {
  return {
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
  };
}

function bodyRef(schemaName: string) {
  return {
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
  };
}

function invalidResponse(message: string) {
  return { description: message, content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } };
}

// Genera los 5 paths CRUD estándar (colección + recurso) para una entidad.
function crudPaths(opts: { tag: string; schema: string; collection: string }) {
  const { tag, schema, collection } = opts;
  return {
    [`/${collection}`]: {
      get: {
        tags: [tag],
        summary: `Listar ${collection}`,
        security: bearerAuth,
        parameters: [...paginationParams],
        responses: listResponse(schema),
      },
      post: {
        tags: [tag],
        summary: `Crear ${schema}`,
        security: bearerAuth,
        requestBody: bodyRef(schema),
        responses: {
          '201': { description: `${schema} creado`, ...entityResponse(schema) },
          '401': unauthorizedResponse,
        },
      },
    },
    [`/${collection}/{id}`]: {
      get: {
        tags: [tag],
        summary: `Obtener ${schema} por id`,
        security: bearerAuth,
        parameters: [idParam],
        responses: { '200': { description: schema, ...entityResponse(schema) }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      patch: {
        tags: [tag],
        summary: `Actualizar ${schema}`,
        security: bearerAuth,
        parameters: [idParam],
        requestBody: bodyRef(schema),
        responses: { '200': { description: `${schema} actualizado`, ...entityResponse(schema) }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      delete: {
        tags: [tag],
        summary: `Eliminar ${schema}`,
        security: bearerAuth,
        parameters: [idParam],
        responses: { '204': { description: `${schema} eliminado` }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
    },
  };
}

// Colecciones genéricas cuyo router (customers/employees/bookings) tiene lógica propia
// pero cuyas rutas base siguen el shape CRUD estándar; se generan una vez y se sobreescriben
// puntualmente (parameters/description) donde el router real difiere del genérico.
const customersCrud = crudPaths({ tag: 'Customers', schema: 'Customer', collection: 'customers' });
const employeesCrud = crudPaths({ tag: 'Employees', schema: 'Employee', collection: 'employees' });
const bookingsCrud = crudPaths({ tag: 'Bookings', schema: 'Booking', collection: 'bookings' });

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'OperaOS CRM API',
    version: '0.1.0',
    description: 'API REST del back de CRM. Autenticación vía Bearer token (Supabase).',
  },
  servers: [
    { url: '/api', description: 'Base path del API' },
  ],
  tags: [
    { name: 'Auth', description: 'Autenticación y sesión' },
    { name: 'Customers', description: 'Clientes del tenant' },
    { name: 'Employees', description: 'Empleados' },
    { name: 'Bookings', description: 'Citas / reservas' },
    { name: 'Services', description: 'Catálogo de servicios' },
    { name: 'Products', description: 'Catálogo de productos' },
    { name: 'Projects', description: 'Proyectos' },
    { name: 'Contactos', description: 'Agenda de contactos comerciales (leads / prospectos)' },
    { name: 'Pedidos', description: 'Presupuestos / pedidos documentales' },
    { name: 'Invoices', description: 'Facturas' },
    { name: 'Config', description: 'Configuración del negocio (horario de apertura)' },
    { name: 'Public', description: 'API pública headless sin auth (scoped por businessId, rate-limited). Para landings/integraciones externas.' },
    { name: 'Exports', description: 'Exportación del proyecto a ZIP/instaladores (job asíncrono, un job activo por negocio).' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'not_found' },
              message: { type: 'string', example: 'Recurso no encontrado' },
              details: { type: 'object', nullable: true },
            },
            required: ['code', 'message'],
          },
        },
        required: ['error'],
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          items: { type: 'array', items: {} },
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
        },
        required: ['items', 'total', 'page', 'limit'],
      },
      Customer: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          razonSocial: { type: 'string', nullable: true, description: 'Empresa / razón social (persona de contacto sigue en nombre/apellido)' },
          email: { type: 'string', format: 'email', nullable: true },
          telefono: { type: 'string', nullable: true },
          direccion: { type: 'string', nullable: true },
          numero: { type: 'string', nullable: true, description: 'Número de la dirección estructurada (crm-operaos 9.2)' },
          piso: { type: 'string', nullable: true },
          codigoPostal: { type: 'string', nullable: true },
          localidad: { type: 'string', nullable: true },
          provincia: { type: 'string', nullable: true },
          visitas: { type: 'integer', nullable: true },
          gastoTotal: { type: 'number', nullable: true },
          gastoPendiente: { type: 'number', nullable: true, description: 'Importe de facturas no "Pagada" agregado por nombre de cliente (ver loadInvoicePendingByName)' },
          segmento: { type: 'string', nullable: true },
          latitud: { type: 'number', nullable: true },
          longitud: { type: 'number', nullable: true },
          geoEstado: { type: 'string', enum: ['PENDING', 'OK', 'FAILED'], nullable: true },
        },
      },
      Employee: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          email: { type: 'string', format: 'email', nullable: true },
          telefono: { type: 'string', nullable: true },
          rol: { type: 'string', nullable: true },
          activo: { type: 'boolean' },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          customerId: { type: 'string', nullable: true },
          serviceId: { type: 'string', nullable: true },
          employeeId: { type: 'string', nullable: true },
          inicio: { type: 'string', format: 'date-time' },
          fin: { type: 'string', format: 'date-time', nullable: true },
          estado: { type: 'string' },
          notes: { type: 'string', nullable: true, description: 'Puede incluir el string canónico "Acción: X | Canal: Y" generado por el flujo de agenda' },
        },
      },
      Service: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          categoria: { type: 'string', nullable: true },
          duracion: { type: 'integer', nullable: true },
          precio: { type: 'number', nullable: true },
          activo: { type: 'boolean' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          categoria: { type: 'string', nullable: true },
          stock: { type: 'integer', nullable: true },
          minimo: { type: 'integer', nullable: true },
          precio: { type: 'number', nullable: true },
          proveedor: { type: 'string', nullable: true },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          vertical: { type: 'string', nullable: true },
          config: { type: 'object', nullable: true },
        },
      },
      Contacto: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          codigo: { type: 'string', description: 'Autogenerado, secuencial por negocio (pc-NN)' },
          tipo: { type: 'string', enum: ['lead', 'prospecto'] },
          nombre: { type: 'string' },
          telefono: { type: 'string', nullable: true },
          email: { type: 'string', format: 'email', nullable: true },
          sector: { type: 'string', nullable: true },
          direccion: { type: 'string', nullable: true },
          numero: { type: 'string', nullable: true },
          piso: { type: 'string', nullable: true },
          codigoPostal: { type: 'string', nullable: true },
          localidad: { type: 'string', nullable: true },
          peticion: { type: 'string', nullable: true },
          latitud: { type: 'number', nullable: true },
          longitud: { type: 'number', nullable: true },
          geoEstado: { type: 'string', enum: ['PENDING', 'OK', 'FAILED'] },
          contactado: { type: 'string', enum: ['si', 'no', 'nc'] },
          contactadoEn: { type: 'string', format: 'date-time', nullable: true },
          clienteId: { type: 'string', nullable: true, description: 'Cliente vinculado tras POST /contactos/convert' },
        },
      },
      PedidoLine: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          servicioId: { type: 'string' },
          nombre: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          cantidad: { type: 'number' },
          precioImpl: { type: 'number', description: 'Precio de puesta en marcha por unidad' },
          precioMant: { type: 'number', description: 'Precio de mantenimiento mensual por unidad' },
          posicion: { type: 'integer' },
        },
      },
      Pedido: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          numero: { type: 'string' },
          customerId: { type: 'string', nullable: true },
          clienteSnapshot: { type: 'object' },
          emisorSnapshot: { type: 'object' },
          estado: { type: 'string', enum: ['generada', 'aceptada', 'rechazada', 'caducada'] },
          subtotalImpl: { type: 'number' },
          subtotalMant: { type: 'number' },
          totalImpl: { type: 'number' },
          totalMant: { type: 'number' },
          tasaIva: { type: 'number' },
          diasValidez: { type: 'integer' },
          notas: { type: 'string', nullable: true },
          lines: { type: 'array', items: { $ref: '#/components/schemas/PedidoLine' } },
        },
      },
      InvoiceLine: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          descripcion: { type: 'string', nullable: true },
          cantidad: { type: 'integer' },
          precioUnit: { type: 'number', description: 'Precio unitario sin IVA' },
          importe: { type: 'number', description: 'Total de línea sin IVA (snapshot, no derivado)' },
          posicion: { type: 'integer' },
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          numero: { type: 'string' },
          cliente: { type: 'string' },
          servicio: { type: 'string', nullable: true },
          fecha: { type: 'string', description: 'YYYY-MM-DD' },
          subtotal: { type: 'number', description: 'Base imponible = suma de importe de las líneas' },
          tasaIva: { type: 'number', description: 'Fracción aplicada (0.21). Legacy pre-10.3: 0' },
          total: { type: 'number', description: 'Snapshot server-side (subtotal + IVA de las líneas); NO editable por PATCH' },
          estado: { type: 'string', enum: ['Pendiente', 'Pagada', 'Anulada'], description: 'Set cerrado; solo se transiciona vía PUT /invoices/{id}/status' },
          pagadaEn: { type: 'string', format: 'date-time', nullable: true, description: 'Se fija al pasar a Pagada; se limpia al salir de Pagada' },
          lines: { type: 'array', items: { $ref: '#/components/schemas/InvoiceLine' } },
          documentos: { type: 'object', nullable: true },
        },
      },
      HorarioTramo: {
        type: 'object',
        description: 'Tramo de apertura de un día. Varios tramos del mismo día = horario partido.',
        properties: {
          diaSemana: { type: 'integer', minimum: 0, maximum: 6, description: '0=domingo … 6=sábado' },
          inicio: { type: 'string', description: 'Hora de apertura HH:MM (< fin)' },
          fin: { type: 'string', description: 'Hora de cierre HH:MM (> inicio)' },
        },
        required: ['diaSemana', 'inicio', 'fin'],
      },
      HorarioNegocio: {
        type: 'object',
        properties: {
          locationId: { type: 'string', description: 'Sucursal del negocio activo' },
          tramos: { type: 'array', items: { $ref: '#/components/schemas/HorarioTramo' } },
        },
      },
      // ─── API pública (sin auth; businessId en el body/query en lugar de token) ───────────
      PublicLeadInput: {
        type: 'object',
        description: 'Alta de lead desde una landing externa. `businessId` sustituye al Bearer token: identifica el negocio destino.',
        properties: {
          businessId: { type: 'string', description: 'CUID del negocio destino (obligatorio; reemplaza a la auth)' },
          nombre: { type: 'string', description: 'Nombre del lead (obligatorio, min 1)' },
          email: { type: 'string', format: 'email', nullable: true, description: 'Email o cadena vacía' },
          telefono: { type: 'string', nullable: true },
          peticion: { type: 'string', nullable: true, description: 'Texto libre de la petición' },
          sector: { type: 'string', nullable: true },
          direccion: { type: 'string', nullable: true },
          numero: { type: 'string', nullable: true },
          piso: { type: 'string', nullable: true },
          codigoPostal: { type: 'string', nullable: true },
          localidad: { type: 'string', nullable: true },
        },
        required: ['businessId', 'nombre'],
      },
      PublicBookingInput: {
        type: 'object',
        description: 'Reserva desde una landing externa. `businessId` sustituye al Bearer token. Se valida que locationId/employeeId pertenezcan al negocio.',
        properties: {
          businessId: { type: 'string', description: 'CUID del negocio destino (obligatorio; reemplaza a la auth)' },
          locationId: { type: 'string', description: 'CUID de la sucursal (debe pertenecer al negocio)' },
          serviceId: { type: 'string', description: 'CUID del servicio' },
          employeeId: { type: 'string', nullable: true, description: 'CUID del empleado (opcional; si se envía debe pertenecer al negocio)' },
          start: { type: 'string', format: 'date-time', description: 'Inicio de la cita en ISO 8601 (z.string().datetime())' },
          notes: { type: 'string', nullable: true },
          customer: {
            type: 'object',
            description: 'Datos del cliente. Upsert por email o teléfono dentro del negocio; si no existe, se crea.',
            properties: {
              nombre: { type: 'string', description: 'Nombre completo (obligatorio, min 1)' },
              email: { type: 'string', format: 'email', nullable: true },
              telefono: { type: 'string', nullable: true },
            },
            required: ['nombre'],
          },
        },
        required: ['businessId', 'locationId', 'serviceId', 'start', 'customer'],
      },
      AvailabilitySlot: {
        type: 'object',
        description: 'Hueco horario de un día para el servicio/ubicación consultados.',
        properties: {
          hora: { type: 'string', description: 'Hora del hueco HH:MM' },
          disponible: { type: 'boolean', description: 'true si el hueco admite reserva' },
        },
        required: ['hora', 'disponible'],
      },
      PublicCreatedResponse: {
        type: 'object',
        description: 'Respuesta de creación de los endpoints públicos.',
        properties: {
          id: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['id', 'message'],
      },
      // ─── Exportador de proyecto (job asíncrono en background) ────────────────────────────
      PerFormatState: {
        type: 'object',
        description: 'Progreso de un formato concreto dentro del job.',
        properties: {
          status: { type: 'string', enum: ['pending', 'running', 'done', 'error'] },
          pct: { type: 'integer', minimum: 0, maximum: 100, description: 'Progreso del formato (0-100)' },
          outputPath: { type: 'string', nullable: true, description: 'Ruta del artefacto generado (server-side; disponible al terminar)' },
          error: { type: 'string', nullable: true },
        },
        required: ['status', 'pct'],
      },
      ExportJob: {
        type: 'object',
        description: 'Estado de un job de exportación. Se consulta por polling tras arrancarlo (POST /exports).',
        properties: {
          id: { type: 'string', description: 'UUID del job (randomUUID)' },
          projectId: { type: 'string', description: 'Negocio/proyecto exportado' },
          formats: { type: 'array', items: { type: 'string', enum: ['web-zip'] }, description: 'Formatos solicitados' },
          status: { type: 'string', enum: ['running', 'done', 'error'], description: 'Estado global del job' },
          currentFormat: { type: 'string', enum: ['web-zip'], nullable: true, description: 'Formato en curso' },
          step: { type: 'string', nullable: true, description: 'Texto del paso actual' },
          pct: { type: 'integer', minimum: 0, maximum: 100, description: 'Progreso global ponderado por formato (0-100)' },
          perFormat: {
            type: 'object',
            description: 'Progreso por formato, indexado por nombre de formato.',
            additionalProperties: { $ref: '#/components/schemas/PerFormatState' },
          },
          error: { type: 'string', nullable: true },
          createdAt: { type: 'integer', description: 'Epoch ms de creación' },
          finishedAt: { type: 'integer', nullable: true, description: 'Epoch ms de finalización' },
        },
        required: ['id', 'projectId', 'formats', 'status', 'pct', 'perFormat', 'createdAt'],
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Sesión iniciada',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] },
              },
            },
          },
          '401': {
            description: 'Credenciales inválidas',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Cerrar sesión',
        responses: {
          '200': {
            description: 'Logout reconocido',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { message: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    // Customers: colección genérica + filtros de comercial de campo (localidad/provincia/
    // codigoPostal) y ordenación por cabecera (crm-operaos 9.x). GET/POST /customers/{id}
    // sin cambios respecto al CRUD genérico.
    '/customers': {
      ...customersCrud['/customers'],
      get: {
        ...customersCrud['/customers'].get,
        parameters: [
          ...paginationParams,
          ...sortParams(['id', 'razonSocial', 'nombre', 'email']),
          { name: 'localidad', in: 'query', schema: { type: 'string' }, description: 'Filtro por localidad (contiene, insensible a mayúsculas)' },
          { name: 'provincia', in: 'query', schema: { type: 'string' }, description: 'Filtro por provincia (contiene, insensible a mayúsculas)' },
          { name: 'codigoPostal', in: 'query', schema: { type: 'string' }, description: 'Filtro por código postal (contiene, insensible a mayúsculas)' },
        ],
      },
    },
    '/customers/{id}': customersCrud['/customers/{id}'],
    // Employees: vertical "comerciales" materializa al admin como Employee asignable
    // (best-effort, idempotente) antes de listar; documentado en la descripción, sin path nuevo.
    '/employees': {
      ...employeesCrud['/employees'],
      get: {
        ...employeesCrud['/employees'].get,
        description: 'En el vertical "comerciales", materializa (idempotente, best-effort) al admin del negocio como Employee asignable antes de listar, para que aparezca en el selector de citas. Fallo de materialización no rompe la lectura de la lista.',
      },
    },
    '/employees/{id}': employeesCrud['/employees/{id}'],
    // Bookings: sin cambio de contrato; `notes` puede llevar el string canónico de acción/canal.
    '/bookings': {
      ...bookingsCrud['/bookings'],
      post: {
        ...bookingsCrud['/bookings'].post,
        description: 'serviceId sigue siendo obligatorio. `notes` puede incluir el string canónico "Acción: X | Canal: Y" generado por el flujo de agenda; se persiste tal cual, sin cambio de contrato.',
      },
    },
    '/bookings/{id}': bookingsCrud['/bookings/{id}'],
    // Horario de apertura del negocio (OpeningHour de su sucursal). Fuente de los chips
    // de "horas disponibles" del calendario. Reemplazo atómico, espejo de /employees/:id/horario.
    '/config/horario': {
      get: {
        tags: ['Config'],
        summary: 'Horario de apertura del negocio',
        description: 'Devuelve los tramos de apertura (OpeningHour) de la sucursal del negocio activo. 404 si el negocio no tiene sucursal.',
        security: bearerAuth,
        responses: {
          '200': { description: 'Horario del negocio', content: { 'application/json': { schema: { $ref: '#/components/schemas/HorarioNegocio' } } } },
          '401': unauthorizedResponse,
          '404': notFoundResponse,
        },
      },
      put: {
        tags: ['Config'],
        summary: 'Reemplazar el horario de apertura del negocio',
        description: 'Reemplaza atómicamente TODOS los tramos de la sucursal (deleteMany + createMany). `tramos` vacío = negocio cerrado toda la semana. Valida diaSemana 0-6, formato HH:MM, inicio < fin, y colapsa tramos duplicados.',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { tramos: { type: 'array', items: { $ref: '#/components/schemas/HorarioTramo' } } }, required: ['tramos'] } } },
        },
        responses: {
          '200': { description: 'Horario reemplazado', content: { 'application/json': { schema: { $ref: '#/components/schemas/HorarioNegocio' } } } },
          '400': invalidResponse('diaSemana fuera de 0-6, HH:MM inválido o inicio >= fin'),
          '401': unauthorizedResponse,
          '404': notFoundResponse,
        },
      },
    },
    ...crudPaths({ tag: 'Services', schema: 'Service', collection: 'services' }),
    ...crudPaths({ tag: 'Products', schema: 'Product', collection: 'products' }),
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'Listar projects',
        security: bearerAuth,
        parameters: [...paginationParams],
        responses: listResponse('Project'),
      },
      post: {
        tags: ['Projects'],
        summary: 'Crear Project',
        security: bearerAuth,
        requestBody: bodyRef('Project'),
        responses: { '201': { description: 'Project creado', ...entityResponse('Project') }, '401': unauthorizedResponse },
      },
    },
    '/projects/{id}': {
      patch: {
        tags: ['Projects'],
        summary: 'Actualizar Project',
        description: 'Persiste `config` en BusinessSetting (categoria="config") y espeja campos clave (nombre/vertical/marca primario-secundario/logo) a columnas de Business.',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: bodyRef('Project'),
        responses: { '200': { description: 'Project actualizado', ...entityResponse('Project') }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      delete: {
        tags: ['Projects'],
        summary: 'Eliminar Project',
        security: bearerAuth,
        parameters: [idParam],
        responses: { '204': { description: 'Project eliminado' }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
    },
    // ─── Contactos (agenda de leads/prospectos, crm-operaos WU4/9.12) ───────────────────
    '/contactos': {
      get: {
        tags: ['Contactos'],
        summary: 'Listar contactos (leads/prospectos)',
        security: bearerAuth,
        parameters: [
          ...paginationParams,
          ...sortParams(['codigo', 'tipo', 'nombre', 'email', 'sector', 'createdAt']),
          { name: 'tipo', in: 'query', schema: { type: 'string', enum: ['lead', 'prospecto'] }, description: 'Filtro por tipo' },
          { name: 'contactado', in: 'query', schema: { type: 'string', enum: ['si', 'no', 'nc'] }, description: 'Filtro por estado de contacto' },
        ],
        responses: listResponse('Contacto'),
      },
      post: {
        tags: ['Contactos'],
        summary: 'Crear contacto',
        description: 'Código pc-NN autogenerado y secuencial por negocio. Geocodifica una sola vez al alta si hay dirección (best-effort, nunca bloquea).',
        security: bearerAuth,
        requestBody: bodyRef('Contacto'),
        responses: { '201': { description: 'Contacto creado', ...entityResponse('Contacto') }, '401': unauthorizedResponse, '422': invalidResponse('Datos inválidos') },
      },
    },
    // Registrado antes de "/:id" en el router real (Express no confunda el literal con un id).
    '/contactos/pending-count': {
      get: {
        tags: ['Contactos'],
        summary: 'Contador de contactos pendientes de contactar',
        security: bearerAuth,
        responses: {
          '200': { description: 'Conteo (contactado != "si") acotado al negocio', content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' } } } } } },
          '401': unauthorizedResponse,
        },
      },
    },
    '/contactos/geocode/rerun': {
      post: {
        tags: ['Contactos'],
        summary: 'Re-geolocalizar contactos pendientes',
        description: 'Geocodifica en lote (máx. 60 por invocación) contactos PENDING/FAILED con dirección. `force=true` incluye también los OK (corrige coords sembradas a mano). Rol ADMIN/MANAGER.',
        security: bearerAuth,
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: { force: { type: 'boolean', default: false } } } } },
        },
        responses: {
          '200': {
            description: 'Resultado del lote',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'integer' }, failed: { type: 'integer' }, skipped: { type: 'integer' } } } } },
          },
          '401': unauthorizedResponse,
        },
      },
    },
    '/contactos/convert': {
      post: {
        tags: ['Contactos'],
        summary: 'Convertir contactos en clientes',
        description: 'Best-effort por id: crea un Customer por cada contacto (datos copiados) y lo vincula/soft-borra. Devuelve { created, failed }.',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } } },
        },
        responses: {
          '200': {
            description: 'Resultado de la conversión',
            content: { 'application/json': { schema: { type: 'object', properties: { created: { type: 'array', items: { type: 'object' } }, failed: { type: 'array', items: { type: 'object' } } } } } },
          },
          '401': unauthorizedResponse,
          '404': invalidResponse('No se encontraron contactos'),
          '422': invalidResponse('Datos inválidos'),
        },
      },
    },
    '/contactos/{id}': {
      get: {
        tags: ['Contactos'],
        summary: 'Obtener contacto por id',
        security: bearerAuth,
        parameters: [idParam],
        responses: { '200': { description: 'Contacto', ...entityResponse('Contacto') }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      patch: {
        tags: ['Contactos'],
        summary: 'Actualizar contacto',
        description: 'Re-geocodifica automáticamente si cambia algún campo de dirección (direccion/numero/localidad/codigoPostal).',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: bodyRef('Contacto'),
        responses: { '200': { description: 'Contacto actualizado', ...entityResponse('Contacto') }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      delete: {
        tags: ['Contactos'],
        summary: 'Eliminar contacto (soft delete)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { '204': { description: 'Contacto eliminado' }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
    },
    // ─── Pedidos / Presupuestos documentales (crm-paridad-facturas-pedidos-aa) ──────────
    '/pedidos': {
      get: {
        tags: ['Pedidos'],
        summary: 'Listar presupuestos/pedidos',
        description: 'Incluye las líneas de cada pedido. `metrics` se calcula sobre TODOS los pedidos del negocio (no solo la página).',
        security: bearerAuth,
        parameters: [...paginationParams, ...sortParams(['numero', 'estado', 'createdAt'])],
        responses: listWithMetricsResponse('Pedido'),
      },
      post: {
        tags: ['Pedidos'],
        summary: 'Crear presupuesto/pedido',
        description: 'Nace siempre en estado "generada" (la única vía a "aceptada" es PUT /pedidos/{id}/status). Totales calculados server-side desde `lines`, nunca confiados al cliente.',
        security: bearerAuth,
        requestBody: bodyRef('Pedido'),
        responses: { '201': { description: 'Pedido creado', ...entityResponse('Pedido') }, '401': unauthorizedResponse, '422': invalidResponse('Datos inválidos') },
      },
    },
    '/pedidos/{id}': {
      get: {
        tags: ['Pedidos'],
        summary: 'Obtener pedido por id (con líneas)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { '200': { description: 'Pedido', ...entityResponse('Pedido') }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      patch: {
        tags: ['Pedidos'],
        summary: 'Editar presupuesto/pedido',
        description: 'Edita en cualquier estado EXCEPTO si ya está aceptado (tiene factura vinculada) → 409. No admite `estado` (usar PUT /pedidos/{id}/status). Si se reenvían `lines`, se reemplaza el conjunto y los totales se recalculan server-side.',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: bodyRef('Pedido'),
        responses: {
          '200': { description: 'Pedido actualizado', ...entityResponse('Pedido') },
          '401': unauthorizedResponse,
          '404': notFoundResponse,
          '409': invalidResponse('Pedido ya aceptado (factura vinculada); no se puede editar'),
          '422': invalidResponse('Datos inválidos'),
        },
      },
    },
    '/pedidos/{id}/status': {
      put: {
        tags: ['Pedidos'],
        summary: 'Transicionar estado del pedido',
        description: 'Set cerrado generada|aceptada|rechazada|caducada. Al entrar en "aceptada" auto-crea la factura vinculada (idempotente vía factura.pedido_id @unique) dentro de la misma transacción que el cambio de estado. Salir de "aceptada" con factura ya creada → 400.',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { estado: { type: 'string', enum: ['generada', 'aceptada', 'rechazada', 'caducada'] } }, required: ['estado'] } } },
        },
        responses: {
          '200': { description: 'Pedido actualizado', ...entityResponse('Pedido') },
          '400': invalidResponse('No se puede cambiar el estado: el pedido ya tiene una factura asociada'),
          '401': unauthorizedResponse,
          '404': notFoundResponse,
          '422': invalidResponse('Estado inválido'),
        },
      },
    },
    // ─── Invoices / Facturas (crm-paridad-facturas-pedidos-aa PR-3, detalle 10.3) ───────
    // GET / es custom (metrics + líneas); GET/:id, PATCH, DELETE y POST (→405) los hereda
    // del crudRouter genérico con disableCreate:true (ver routes/invoices.ts).
    '/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'Listar facturas',
        description: 'Incluye las líneas de cada factura (snapshot documental, 10.3). `metrics` (incl. importe cobrado/pagado) se calcula sobre TODAS las facturas del negocio, no solo la página.',
        security: bearerAuth,
        parameters: [...paginationParams, ...sortParams(['numero', 'cliente', 'fecha', 'estado'])],
        responses: listWithMetricsResponse('Invoice'),
      },
      post: {
        tags: ['Invoices'],
        summary: 'Crear factura (deshabilitado)',
        description: 'La creación manual está cerrada: las facturas nacen automáticamente al aceptar un pedido (PUT /pedidos/{id}/status → aceptada). Responde 405 siempre.',
        security: bearerAuth,
        responses: { '405': invalidResponse('Creación deshabilitada por esta ruta') },
      },
    },
    '/invoices/{id}': {
      get: {
        tags: ['Invoices'],
        summary: 'Obtener factura por id',
        security: bearerAuth,
        parameters: [idParam],
        responses: { '200': { description: 'Invoice', ...entityResponse('Invoice') }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      patch: {
        tags: ['Invoices'],
        summary: 'Actualizar factura (campos documentales)',
        description: 'Whitelist: numero, cliente, servicio, fecha, documentos. `estado` y `total` NO son editables por esta vía desde crm-operaos 10.3 (usar PUT /invoices/{id}/status; `total` se recalcula server-side a partir de las líneas).',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: bodyRef('Invoice'),
        responses: { '200': { description: 'Invoice actualizado', ...entityResponse('Invoice') }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
      delete: {
        tags: ['Invoices'],
        summary: 'Eliminar factura (soft delete)',
        security: bearerAuth,
        parameters: [idParam],
        responses: { '204': { description: 'Invoice eliminado' }, '401': unauthorizedResponse, '404': notFoundResponse },
      },
    },
    '/invoices/{id}/status': {
      put: {
        tags: ['Invoices'],
        summary: 'Transicionar estado de la factura',
        description: 'Set cerrado Pendiente|Pagada|Anulada. Al entrar en Pagada fija `pagadaEn = now()`; al salir de Pagada lo limpia a null (espejo de PUT /api/invoices/{id}/status en agents-agency).',
        security: bearerAuth,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { estado: { type: 'string', enum: ['Pendiente', 'Pagada', 'Anulada'] } }, required: ['estado'] } } },
        },
        responses: {
          '200': { description: 'Invoice actualizado', ...entityResponse('Invoice') },
          '401': unauthorizedResponse,
          '404': notFoundResponse,
          '422': invalidResponse('Estado inválido'),
        },
      },
    },
    // ─── API pública headless (sin auth, scoped por businessId, rate-limited) ────────────
    // Montada en /api/public (routes/index.ts). publicRateLimiter: 100 req/IP cada 15 min
    // → 429. NO llevan security: bearerAuth; el negocio se identifica con businessId.
    '/public/leads': {
      post: {
        tags: ['Public'],
        summary: 'Crear lead desde una landing externa',
        description: 'Sin auth: el negocio se identifica con `businessId` en el body. Código pc-NN autogenerado; geocodifica al alta si hay dirección (best-effort). Rate-limited (100 req/IP cada 15 min).',
        requestBody: bodyRef('PublicLeadInput'),
        responses: {
          '201': { description: 'Lead creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicCreatedResponse' } } } },
          '404': invalidResponse('Negocio no encontrado o inactivo'),
          '422': invalidResponse('Datos no válidos'),
          '429': tooManyRequestsResponse,
        },
      },
    },
    '/public/availability': {
      get: {
        tags: ['Public'],
        summary: 'Consultar huecos disponibles de un día',
        description: 'Sin auth: el negocio se identifica con `businessId` (query). Devuelve los huecos del día para el servicio/ubicación indicados. Rate-limited (100 req/IP cada 15 min).',
        parameters: [
          { name: 'businessId', in: 'query', required: true, schema: { type: 'string' }, description: 'CUID del negocio destino (reemplaza a la auth)' },
          { name: 'date', in: 'query', required: true, schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, description: 'Día a consultar (YYYY-MM-DD)' },
          { name: 'serviceId', in: 'query', required: true, schema: { type: 'string' }, description: 'CUID del servicio' },
          { name: 'locationId', in: 'query', required: true, schema: { type: 'string' }, description: 'CUID de la sucursal (debe pertenecer al negocio y estar activa)' },
          { name: 'employeeId', in: 'query', required: false, schema: { type: 'string' }, description: 'CUID del empleado (opcional)' },
        ],
        responses: {
          '200': {
            description: 'Lista de huecos del día',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AvailabilitySlot' } } } },
          },
          '404': invalidResponse('Negocio o ubicación no encontrada/inactiva'),
          '422': invalidResponse('Parámetros no válidos'),
          '429': tooManyRequestsResponse,
        },
      },
    },
    '/public/bookings': {
      post: {
        tags: ['Public'],
        summary: 'Crear reserva desde una landing externa',
        description: 'Sin auth: el negocio se identifica con `businessId` en el body. `start` en ISO 8601. Valida que locationId/employeeId pertenezcan al negocio (400) y la disponibilidad real (409, evita double-booking). Upsert de cliente por email/teléfono. Rate-limited (100 req/IP cada 15 min).',
        requestBody: bodyRef('PublicBookingInput'),
        responses: {
          '201': { description: 'Reserva creada', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicCreatedResponse' } } } },
          '400': invalidResponse('location_not_found o employee_not_found: recurso no pertenece al negocio'),
          '404': invalidResponse('Negocio no encontrado'),
          '409': invalidResponse('No disponible (hueco ocupado / recurso inactivo)'),
          '422': invalidResponse('Datos no válidos (incluye `start` no ISO 8601)'),
          '429': tooManyRequestsResponse,
        },
      },
    },
    // ─── Exportador de proyecto (job asíncrono; Bearer auth heredado de staffOnly) ───────
    // El build corre en background: POST devuelve 202 { jobId } y el front consulta el
    // progreso por polling (GET /exports/{id}/status). Un solo build a la vez (lock → 409).
    '/exports': {
      post: {
        tags: ['Exports'],
        summary: 'Arrancar una exportación (job en background)',
        description: 'Valida body/ownership/config, arranca el build en background y responde 202 { jobId }. El progreso se consulta por polling en GET /exports/{id}/status. 409 si ya hay un build en curso (lock ocupado, code build_in_progress).',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  projectId: { type: 'string', description: 'CUID del negocio/proyecto a exportar (debe existir membership del usuario)' },
                  formats: { type: 'array', minItems: 1, items: { type: 'string', enum: ['web-zip'] }, description: 'Formatos a generar (array no vacío; único válido: web-zip)' },
                  outputDir: { type: 'string', nullable: true, description: 'Directorio de salida server-side (opcional; por defecto exports/<slug>)' },
                },
                required: ['projectId', 'formats'],
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Job arrancado',
            content: { 'application/json': { schema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
          },
          '400': invalidResponse('Body inválido: missing_project_id, missing_formats o invalid_format'),
          '401': unauthorizedResponse,
          '404': invalidResponse('Proyecto no encontrado (sin membership del usuario)'),
          '409': invalidResponse('Ya hay un build en curso (build_in_progress)'),
          '422': invalidResponse('config_not_found: el proyecto no tiene configuración (completar onboarding)'),
        },
      },
    },
    '/exports/active': {
      get: {
        tags: ['Exports'],
        summary: 'Job activo (en curso o último retenido)',
        description: 'Devuelve el job en curso o el último terminado en ventana de retención. 204 (sin body) si no hay ninguno.',
        security: bearerAuth,
        responses: {
          '200': { description: 'Job activo', ...entityResponse('ExportJob') },
          '204': { description: 'No hay job activo' },
          '401': unauthorizedResponse,
        },
      },
    },
    '/exports/{id}/status': {
      get: {
        tags: ['Exports'],
        summary: 'Estado de un job por id (polling)',
        description: 'Devuelve el ExportJob serializado (status/pct/perFormat). 404 (job_not_found) si el id no existe o el job ya expiró de la retención.',
        security: bearerAuth,
        parameters: [idParam],
        responses: {
          '200': { description: 'Estado del job', ...entityResponse('ExportJob') },
          '401': unauthorizedResponse,
          '404': invalidResponse('job_not_found: job no encontrado'),
        },
      },
    },
    '/exports/{id}/download': {
      get: {
        tags: ['Exports'],
        summary: 'Descargar el ZIP generado por el job',
        description: 'Devuelve el fichero ZIP (res.download) del job terminado. 400 (job_not_done) si aún no ha terminado; 404 (job_not_found / file_not_found) si el job o el fichero no existen.',
        security: bearerAuth,
        parameters: [idParam],
        responses: {
          '200': { description: 'Fichero ZIP', content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } } },
          '400': invalidResponse('job_not_done: la exportación aún no ha terminado'),
          '401': unauthorizedResponse,
          '404': invalidResponse('job_not_found o file_not_found'),
        },
      },
    },
    '/exports/{id}': {
      delete: {
        tags: ['Exports'],
        summary: 'Cancelar un job en curso',
        description: 'Aborta el job si está corriendo. 404 (job_not_cancellable) si no existe o ya finalizó.',
        security: bearerAuth,
        parameters: [idParam],
        responses: {
          '204': { description: 'Job cancelado' },
          '401': unauthorizedResponse,
          '404': invalidResponse('job_not_cancellable: job no encontrado o ya finalizado'),
        },
      },
    },
  },
};
