// src/queries.ts
import { createQueries } from '@resonance-components/datahandler';
import { hrQueryDefs } from '@/contexts/hr/hr.queries';
import { purchaseQueryDefs } from '@/contexts/purchase/purchase.queries';
import { posQueryDefs } from '@/contexts/pos/pos.queries';
import { generalQueryDefs } from '@general/general.queries';
import { inventoryQueries } from '@/contexts/inventory/inventory.queries';
import { financesQueries } from '@/contexts/finances/finances.queries';

export const queries = createQueries({
  ...hrQueryDefs,
  ...purchaseQueryDefs,
  ...posQueryDefs,
  ...generalQueryDefs,
  ...inventoryQueries,
  ...financesQueries,
});
