// src/docs/contexts/pos/d-invoice/get-d-invoice-by-id.doc.ts
export const getDInvoiceByIdDoc = {
  operation: {
    summary: 'Get d-invoice details',
    description: 'Returns the full detail of a digital invoice by its ID.',
  },

  responses: {
    200: {
      status: 200,
      description: 'Digital invoice found.',
      schema: {
        type: 'object',
        properties: {
          invoice_id: {
            type: 'string',
            example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          },
          tenant_id: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
          total: { type: 'number', example: 12500 },
          created_at: { type: 'string', example: '2024-04-01T10:00:00.000Z' },
        },
      },
    },
    401: {
      status: 401,
      description: 'Unauthorized.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
        },
      },
    },
    404: {
      status: 404,
      description: 'Invoice not found.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invoice not found' },
        },
      },
    },
  },
};
