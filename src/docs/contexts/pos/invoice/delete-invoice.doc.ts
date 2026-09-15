// src/docs/contexts/pos/d-invoice/delete-d-invoice.doc.ts
export const deleteDInvoiceDoc = {
  operation: {
    summary: 'Delete d-invoice',
    description: 'Deletes a digital invoice by its ID.',
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
