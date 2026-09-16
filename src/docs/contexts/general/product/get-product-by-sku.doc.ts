// src/docs/contexts/general/product/get-product-by-sku.doc.ts
export const getProductBySkuDoc = {
  operation: {
    summary: 'Get product by SKU',
    description: 'Retrieves a product variant by its SKU code.',
  },

  responses: {
    200: {
      status: 200,
      description: 'Product found.',
      schema: {
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
