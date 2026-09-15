// src/docs/contexts/pos/invoice/delete-invoice.doc.ts
export const deleteInvoiceDoc = {
  operation: {
    summary: 'Delete invoice',
    description: 'Deletes an invoice by its ID.',
  },

  responses: {
    200: {
      status: 200,
      description: 'Invoice deleted.',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Invoice deleted successfully' },
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
