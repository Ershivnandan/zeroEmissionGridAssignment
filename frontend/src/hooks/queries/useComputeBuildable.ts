import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, type ComputeRequest } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useDebounced } from "@/hooks/common/useDebounced";

export function useComputeBuildable(request: ComputeRequest, debounceMs = 250) {
  const debounced = useDebounced(request, debounceMs);
  const enabled = Boolean(debounced.parcel_id || debounced.parcel_geometry);

  return useQuery({
    queryKey: queryKeys.compute(debounced),
    queryFn: () => api.compute(debounced),
    enabled,
    placeholderData: keepPreviousData,
  });
}
