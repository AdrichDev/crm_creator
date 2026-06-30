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
          email: { type: 'string', format: 'email', nullable: true },
          telefono: { type: 'string', nullable: true },
          visitas: { type: 'integer', nullable: true },
          gastoTotal: { type: 'number', nullable: true },
          segmento: { type: 'string', nullable: true },
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
    ...crudPaths({ tag: 'Customers', schema: 'Customer', collection: 'customers' }),
    ...crudPaths({ tag: 'Employees', schema: 'Employee', collection: 'employees' }),
    ...crudPaths({ tag: 'Bookings', schema: 'Booking', collection: 'bookings' }),
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
  },
};
