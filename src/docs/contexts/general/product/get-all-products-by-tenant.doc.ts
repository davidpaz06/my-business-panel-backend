// src/docs/contexts/general/product/get-all-products-by-tenant.doc.ts
export const getAllProductsByTenantDoc = {
  operation: {
    summary: 'Get all products by tenant',
    description:
      'Returns all product variants belonging to a specific tenant. The tenantId must be a valid UUID.',
  },

  responses: {
    200: {
      status: 200,
      description: 'Products retrieved successfully.',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            product_variant_id: {
              type: 'string',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            tenant_id: {
              type: 'string',
              example: '123e4567-e89b-12d3-a456-426614174000',
            },
            sku: { type: 'string', example: 'SKU-001' },
            variant_name: { type: 'string', example: 'Red T-Shirt M' },
            product_id: {
              type: 'string',
              example: '123e4567-e89b-12d3-a456-426614174111',
            },
            unit_price: { type: 'number', example: 15000 },
          },
        },
      },
    },
    400: {
      status: 400,
      description: 'Invalid or missing tenant ID — must be a valid UUID.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Tenant ID is required' },
        },
      },
    },
    401: {
      status: 401,
      description: 'Unauthorized — Missing or invalid authentication token.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
        },
      },
    },
  },
};
