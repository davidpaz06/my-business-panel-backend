// src/docs/contexts/general/product/update-product.doc.ts
export const updateProductDoc = {
  dto: {
    sku: {
      description: 'New SKU code for the product variant. Optional.',
      example: 'SKU-002',
    },
    variant_name: {
      description: 'New display name for the product variant. Optional.',
      example: 'Blue T-Shirt L',
    },
    product_id: {
      description:
        'New product catalog entry to link this variant to. Optional.',
      example: '123e4567-e89b-12d3-a456-426614174111',
    },
    unit_price: {
      description: 'New unit price in local currency. Optional.',
      example: 18000,
    },
  },

  operation: {
    summary: 'Update a product',
    description:
      'Partially updates the fields of a product variant. At least one field must be provided.',
  },

  responses: {
    200: {
      status: 200,
      description: 'Product updated successfully.',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Product updated successfully!' },
          product: {
            type: 'object',
            properties: {
              product_variant_id: {
                type: 'string',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              sku: { type: 'string', example: 'SKU-002' },
              variant_name: { type: 'string', example: 'Blue T-Shirt L' },
              unit_price: { type: 'number', example: 18000 },
            },
          },
        },
      },
    },
    400: {
      status: 400,
      description: 'No valid fields provided to update.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'No valid fields to update' },
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
