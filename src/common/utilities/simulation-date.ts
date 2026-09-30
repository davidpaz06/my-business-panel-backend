import { ForbiddenException } from '@nestjs/common';

/**
 * Resuelve la fecha "hoy" para calculos HR que dependen del reloj real
 * (mora proyectada, tope de anticipo vigente, etc.), permitiendo
 * sobreescribirla SOLO fuera de produccion para pruebas de calculos
 * dependientes del tiempo (liquidacion, prestaciones) sin esperar
 * el paso real del tiempo.
 *
 * `simulationDate` viajando desde el cliente en NODE_ENV=production
 * lanza 403 -- nunca se ignora en silencio, para que un uso indebido
 * en produccion falle de forma ruidosa.
 */
export function resolveSimulationDate(simulationDate?: string): string {
  if (simulationDate) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'simulationDate no esta permitido en produccion.',
      );
    }
    return simulationDate;
  }
  return new Date().toISOString().slice(0, 10);
}
