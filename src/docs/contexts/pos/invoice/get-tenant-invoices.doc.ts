// src/docs/contexts/pos/d-invoice/get-tenant-d-invoices.doc.ts
export const getTenantDInvoicesDoc = {
  operation: {
    summary: 'Get d-invoices by tenant',
    description: 'Returns all digital invoices associated with a tenant.',
  },

  responses: {
    200: {
      status: 200,
      description: 'List of digital invoices for the tenant.',
      schema: {
        type: 'array',
        items: {
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
            created_at: { type: 'string', example: '2024-04-01T10:00:00.000Z' },
          },
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
  },
};
