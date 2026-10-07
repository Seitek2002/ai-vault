import { queryOptions } from '@tanstack/react-query';
import { esfApi } from '../api/esf';

// All invoice views share one request and one cache. Per-settlement filtering
// belongs in the observer's select, never in the cached query result.
export const esfInvoicesQuery = queryOptions({
  queryKey: ['esf', 'all'],
  queryFn: () => esfApi.list(),
});
