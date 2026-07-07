import type { ComputeRequest } from "@/lib/api";

export const queryKeys = {
  constraints: ["constraints"] as const,
  parcels: ["parcels"] as const,
  compute: (req: ComputeRequest) => ["compute", req] as const,
};
