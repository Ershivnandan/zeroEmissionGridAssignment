export const env = {
  apiBase:
    process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1",
  maptilerKey: process.env.NEXT_PUBLIC_MAPTILER_KEY || "",
  mapTileUrl:
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    "https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg",
};

export function mapTileUrlWithKey(): string {
  const sep = env.mapTileUrl.includes("?") ? "&" : "?";
  return env.maptilerKey
    ? `${env.mapTileUrl}${sep}key=${env.maptilerKey}`
    : env.mapTileUrl;
}
