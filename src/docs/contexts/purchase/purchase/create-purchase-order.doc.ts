// src/docs/contexts/purchase/purchase/create-purchase-order.doc.ts
export const createPurchaseOrderDoc = {
  dto: {
    supplier_id: {
      description: 'UUID del proveedor.',
      example: '123e4567-e89b-12d3-a456-426614174000',
    },
    warehouse_id: {
      description: 'UUID del almacén de destino.',
      example: '223e4567-e89b-12d3-a456-426614174000',
    },
    expected_delivery_date: {
      description: 'Fecha de entrega esperada en formato ISO 8601.',
      example: '2026-05-01',
    },
    items: {
      description:
        'Arreglo de productos a ordenar. unit_price esta deprecado: el costo se resuelve server-side desde el producto (general_schema.product_variant.cost_price, USD) y cualquier valor enviado aqui se ignora.',
      example: [
        {
          product_variant_id: '323e4567-e89b-12d3-a456-426614174000',
          quantity_ordered: 10,
        },
      ],
    },
    has_invoice: {
      description: 'Indica si la orden incluye factura del proveedor.',
      example: true,
    },
    payment_condition: {
      description: 'Condición de pago: CREDIT o IN_FULL.',
      example: 'CREDIT',
    },
    payment_due_date: {
      description:
        'Fecha límite de pago en formato ISO 8601. Obligatoria cuando payment_condition es CREDIT; ignorada para IN_FULL.',
      example: '2026-06-01',
    },
  },

  operation: {
    summary: 'Crear orden de compra',
    description:
      'Registra una nueva orden de compra para un proveedor con los productos y detalles de entrega especificados.',
  },

  responses: {
    201: {
      status: 201,
      description: 'Orden de compra creada exitosamente.',
      schema: {
        type: 'object',
        properties: {
          purchase_order_id: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
          supplier_id: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
          warehouse_id: {
            type: 'string',
            example: '223e4567-e89b-12d3-a456-426614174000',
          },
          purchase_order_status_id: { type: 'number', example: 1 },
          expected_delivery_date: { type: 'string', example: '2026-05-01' },
          payment_condition: { type: 'string', example: 'CREDIT' },
        },
      },
    },
    401: {
      status: 401,
      description: 'No autorizado — token ausente o inválido.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
        },
      },
    },
  },
};
