// src/docs/contexts/pos/d-invoice/get-customer-d-invoices.doc.ts
export const getCustomerDInvoicesDoc = {
  operation: {
    summary: 'Get customer d-invoices',
    description:
      'Returns digital invoices for a customer filtered by tenant and document number.',
  },

  responses: {
    200: {
      status: 200,
      description: 'List of digital invoices matching the filter.',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            invoice_id: {
              type: 'string',
              example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            },
            document_number: { type: 'string', example: 'INV-0001' },
            total: { type: 'number', example: 8750 },
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
