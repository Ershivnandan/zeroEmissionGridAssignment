import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useParcels() {
  return useQuery({
    queryKey: queryKeys.parcels,
    queryFn: api.parcels,
  });
}
