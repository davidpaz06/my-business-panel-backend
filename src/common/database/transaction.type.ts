import type Database from '@resonance-components/datahandler';

/** Transaccion manual devuelta por Database.transaction() (el paquete no exporta el tipo por nombre). */
export type ITransaction = Awaited<ReturnType<Database['transaction']>>;
