// src/docs/contexts/pos/sale/create-full-sale.doc.ts
export const createFullSaleDoc = {
  dto: {
    branch_id: {
      description: 'UUID de la sucursal donde se realiza la venta.',
      example: '7e3f91bc-4a82-4d5c-b0e7-2c6d3f8a1b94',
    },
    tenant_id: {
      description: 'UUID del tenant al que pertenece la venta.',
      example: 'd3a97c14-2e5f-4b8d-9a1c-6f0e8b3d7c52',
    },
    tenant_customer_id: {
      description: 'UUID del cliente que realiza la compra.',
      example: 'c3d4e5f6-a1b2-3456-cdef-012345678901',
    },
    currency_id: {
      description: 'ID de la moneda utilizada.',
      example: 1,
    },
    sale_condition: {
      description: 'Condición de pago de la venta.',
      example: 'CONTADO',
    },
    sale_date: {
      description: 'Fecha de la venta.',
      example: '2024-04-01',
    },
    subtotal_amount: {
      description: 'Monto subtotal antes de impuestos.',
      example: 84745,
    },
    tax_amount: {
      description: 'Monto de impuestos aplicados.',
      example: 11034,
    },
    total_amount: {
      description: 'Monto total de la venta.',
      example: 95779,
    },
    is_completed: {
      description: 'Indica si la venta se completó.',
      example: true,
    },
    seller_user_id: {
      description: 'UUID del usuario vendedor. Opcional.',
      example: 'd4e5f6a1-b2c3-4567-defa-123456789012',
    },
    items: {
      description: 'Arreglo de productos incluidos en la venta.',
      example: [
        {
          tenant_id: 'd3a97c14-2e5f-4b8d-9a1c-6f0e8b3d7c52',
          product_variant_id: 'e5f6a1b2-c3d4-5678-efab-234567890123',
          quantity: 2,
          unit_price: 10000,
          total_price: 20000,
        },
      ],
    },
    payments: {
      description: 'Medios de pago utilizados en la venta.',
      example: [
        {
          tenant_customer_id: 'c3d4e5f6-a1b2-3456-cdef-012345678901',
          payment_method_id: 1,
          payment_amount: 95779,
          payment_date: '2024-04-01',
          currency_id: 1,
          is_points_redemption: false,
          points_redeemed: 0,
          points_to_currency_rate: 0,
          verified: true,
        },
      ],
    },
  },

  operation: {
    summary: 'Registrar venta completa',
  },

  responses: {
    201: {
      status: 201,
      description:
        'Venta creada. Si se solicitó factura electrónica y hubo un problema generándola, se incluye eInvoiceWarning.',
      schema: {
        type: 'object',
        properties: {
          saleId: {
            type: 'string',
            example: 'f6a1b2c3-d4e5-6789-fabc-345678901234',
          },
          eInvoiceWarning: {
            type: 'string',
            example: 'Error generating e-invoice',
          },
        },
      },
    },
    400: {
      status: 400,
      description: 'Datos inválidos en la solicitud.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Bad Request' },
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
    500: {
      status: 500,
      description: 'Error interno al crear la venta.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Error creating sale' },
        },
      },
    },
  },
};
