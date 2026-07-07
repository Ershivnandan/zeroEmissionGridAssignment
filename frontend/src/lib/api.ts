import { env } from "@/lib/env";

export interface ConstraintInfo {
  key: string;
  label: string;
  default_setback_m: number;
  enabled: boolean;
  source: string;
}

export interface ParcelSummary {
  parcel_id: string;
  acres: number;
  centroid: [number, number];
}

export interface ConstraintBreakdown {
  key: string;
  label: string;
  setback_m: number;
  removed_acres: number;
  source: string;
}

export interface ComputeResponse {
  parcel_id: string | null;
  parcel_acres: number;
  buildable_acres: number;
  excluded_acres: number;
  manual_carved_acres: number;
  manual_restored_acres: number;
  breakdown: ConstraintBreakdown[];
  parcel_geojson: GeoJSON.Feature;
  buildable_geojson: GeoJSON.Feature;
  excluded_geojson: GeoJSON.Feature;
}

export interface ConstraintOverride {
  key: string;
  enabled?: boolean;
  setback_m?: number;
}

export interface ComputeRequest {
  parcel_id?: string;
  parcel_geometry?: GeoJSON.Geometry;
  overrides?: ConstraintOverride[];
  carve_outs?: { geometry: GeoJSON.Geometry }[];
  restores?: { geometry: GeoJSON.Geometry }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiBase}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${path} failed: ${res.status} ${detail}`.trim());
  }
  return res.json();
}

export const api = {
  constraints: () => request<ConstraintInfo[]>("/constraints"),
  parcels: () => request<ParcelSummary[]>("/parcels"),
  compute: (body: ComputeRequest) =>
    request<ComputeResponse>("/compute", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
