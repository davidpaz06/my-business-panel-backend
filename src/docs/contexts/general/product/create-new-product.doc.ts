// src/docs/contexts/general/product/create-new-product.doc.ts
export const createNewProductDoc = {
  dto: {
    products: {
      description:
        'Array of product variants to insert. Duplicate SKUs per tenant are silently ignored (ON CONFLICT DO NOTHING).',
      example: [
        {
          tenant_id: '123e4567-e89b-12d3-a456-426614174000',
          sku: 'SKU-001',
          variant_name: 'Red T-Shirt M',
          product_id: '123e4567-e89b-12d3-a456-426614174111',
          unit_price: 15000,
        },
      ],
    },
  },

  operation: {
    summary: 'Create new products',
    description:
      'Inserts one or more product variants. Duplicate SKUs within the same tenant are silently ignored.',
  },

  responses: {
    201: {
      status: 201,
      description: 'Products created successfully.',
      schema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            example: 'Products created successfully!',
          },
          product: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_variant_id: {
                  type: 'string',
                  example: '123e4567-e89b-12d3-a456-426614174000',
                },
              },
            },
          },
        },
      },
    },
    400: {
      status: 400,
      description: 'Invalid or missing fields in the products array.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Bad Request' },
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
