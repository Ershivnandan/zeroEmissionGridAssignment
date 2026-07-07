import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useConstraints() {
  return useQuery({
    queryKey: queryKeys.constraints,
    queryFn: api.constraints,
  });
}
