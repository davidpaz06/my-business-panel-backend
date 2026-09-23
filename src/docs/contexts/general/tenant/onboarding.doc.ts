/**
 * POST /tenant — Flujo completo de onboarding
 *
 * Cuando el body incluye los campos opcionales `user` y `subscription`,
 * el endpoint ejecuta todo el proceso de alta de tenant dentro de una
 * sola transacción:
 *
 *  1. Crea el tenant.
 *  2. Crea la sucursal principal.
 *  3. Crea el usuario administrador y su empleado/contrato asociado.
 *  4. Crea el customer en Stripe, adjunta el método de pago y crea la
 *     suscripción.
 *  5. Registra el pago y la suscripción en la base de datos.
 *  6. Hace commit de la transacción.
 *  7. Genera un JWT y lo coloca como cookie `auth_token` (httpOnly).
 *
 * Si algún paso falla:
 *  - Se revierte toda la transacción (rollback).
 *  - Si la suscripción de Stripe ya se había creado, se cancela como
 *    compensación.
 *
 * Si los campos opcionales NO están presentes, el endpoint se comporta
 * igual que antes: solo crea el tenant y lo devuelve.
 */
export const onboardingDoc = {
  operation: {
    summary: 'Onboarding completo de tenant',
    description:
      'Crea un tenant junto con su sucursal principal, usuario administrador ' +
      'y suscripción con Stripe en una sola solicitud transaccional. ' +
      'El token JWT se devuelve como cookie httpOnly.',
  },

  dto: {
    // ── Tenant (campos existentes) ──────────────────────────────────────
    tenant_name: {
      description: 'Nombre legal o comercial del tenant.',
      example: 'Acme Corp',
    },
    contact_email: {
      description: 'Correo de contacto principal del tenant.',
      example: 'admin@acme.com',
    },
    contact_phone: {
      description: 'Teléfono de contacto. Opcional.',
      example: '+506 8888-0000',
    },
    region_id: {
      description: 'ID de la región donde opera el tenant.',
      example: 1,
    },
    identification: {
      description: 'Número de identificación legal (cédula jurídica, etc.).',
      example: '3-101-123456',
    },
    economic_activity: {
      description: 'Actividad económica del tenant.',
      example: 'Desarrollo de Software',
    },
    sign: {
      description: 'Nombre comercial corto.',
      example: 'ACME',
    },

    // ── Branch (opcional) ───────────────────────────────────────────────
    branch: {
      description:
        'Datos de la sucursal principal. Si se omite, se crea con valores por defecto.',
      example: {
        branch_name: 'Acme Corp - Principal',
        branch_number: '1',
        branch_address: 'San José, Costa Rica',
      },
    },

    // ── User ────────────────────────────────────────────────────────────
    user: {
      description:
        'Datos del usuario administrador que se creará junto con el tenant.',
      example: {
        email: 'admin@acme.com',
        password: 'SecureP@ss123',
        first_name: 'Juan',
        last_name: 'Pérez',
        doc_number: '123456789',
        phone: '+506 8888-0000',
      },
    },

    // ── Subscription ────────────────────────────────────────────────────
    subscription: {
      description:
        'Datos de la suscripción. El stripe_payment_method_id proviene de Stripe.js en el frontend.',
      example: {
        stripe_payment_method_id: 'pm_1234567890',
        plan: 'standard',
        payment_method_id: 1,
        payment_amount: 99.99,
        subscription_type_id: 1,
        start_date: '2026-04-16',
        end_date: '2026-05-16',
      },
    },
  },

  responses: {
    201: {
      status: 201,
      description:
        'Onboarding completado. La cookie auth_token se incluye en la respuesta.',
      schema: {
        type: 'object',
        properties: {
          tenant: {
            type: 'object',
            properties: {
              tenant_id: {
                type: 'string',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              tenant_name: { type: 'string', example: 'Acme Corp' },
            },
          },
          branch: {
            type: 'object',
            properties: {
              branch_id: {
                type: 'string',
                example: '223e4567-e89b-12d3-a456-426614174001',
              },
              branch_name: {
                type: 'string',
                example: 'Acme Corp - Principal',
              },
            },
          },
          user: {
            type: 'object',
            properties: {
              user_id: {
                type: 'string',
                example: '323e4567-e89b-12d3-a456-426614174002',
              },
              email: { type: 'string', example: 'admin@acme.com' },
            },
          },
          subscription: {
            type: 'object',
            properties: {
              subscriptionId: { type: 'string', example: 'sub_abc123' },
              clientSecret: {
                type: 'string',
                example: 'pi_xxx_secret_yyy',
              },
              invoice: { type: 'string', example: 'in_abc123' },
              status: { type: 'string', example: 'incomplete' },
            },
          },
        },
      },
    },
    400: {
      status: 400,
      description: 'Campos requeridos faltantes o con formato inválido.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Bad Request' },
        },
      },
    },
    500: {
      status: 500,
      description:
        'Error interno. La transacción se revierte automáticamente y la suscripción de Stripe se cancela si ya fue creada.',
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Internal Server Error' },
        },
      },
    },
  },
};
