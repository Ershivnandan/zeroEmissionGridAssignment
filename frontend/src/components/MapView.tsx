"use client";

import { useCallback, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { ComputeResponse } from "@/lib/api";

import { mapTileUrlWithKey, env } from "@/lib/env";

function baseStyle(theme: "light" | "dark"): maplibregl.StyleSpecification {
  const streets = `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${env.maptilerKey}`;
  void streets;
  const lightTiles = env.maptilerKey
    ? [
        `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${env.maptilerKey}`,
      ]
    : ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"];
  const tiles = theme === "dark" ? [mapTileUrlWithKey()] : lightTiles;
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution:
          '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © OpenStreetMap contributors',
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

export interface MapActions {
  deleteSelected: () => void;
  clearAll: () => void;
  clearParcel: () => void;
  undoLastPoint: () => void;
}

const DRAW_STYLES = [
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint: { "fill-color": "#3987e5", "fill-outline-color": "#3987e5", "fill-opacity": 0.15 },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3987e5", "line-width": 2 },
  },
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3987e5", "line-dasharray": ["literal", [0.2, 2]], "line-width": 2 },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-halo-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
    paint: { "circle-radius": 5, "circle-color": "#ffffff" },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-active",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
    paint: { "circle-radius": 3, "circle-color": "#3987e5" },
  },
];

export type DrawMode = "parcel" | "carve" | "restore" | null;

interface Props {
  result: ComputeResponse | null;
  drawMode: DrawMode;
  theme: "light" | "dark";
  onDrawChange: (
    carves: GeoJSON.Feature[],
    restores: GeoJSON.Feature[]
  ) => void;
  onParcelDraw?: (geometry: GeoJSON.Geometry | null) => void;
  onReady?: (actions: MapActions) => void;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export default function MapView({
  result,
  drawMode,
  theme,
  onDrawChange,
  onParcelDraw,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const resultRef = useRef<ComputeResponse | null>(result);
  resultRef.current = result;
  const drawRef = useRef<MapboxDraw | null>(null);
  const readyRef = useRef(false);
  const modeRef = useRef<DrawMode>(null);

  const applyResult = useCallback((fit: boolean) => {
    const map = mapRef.current;
    const res = resultRef.current;
    if (!map || !readyRef.current) return;

    if (!res) {
      (map.getSource("parcel") as maplibregl.GeoJSONSource)?.setData(emptyFC());
      (map.getSource("buildable") as maplibregl.GeoJSONSource)?.setData(
        emptyFC()
      );
      (map.getSource("excluded") as maplibregl.GeoJSONSource)?.setData(
        emptyFC()
      );
      return;
    }

    (map.getSource("parcel") as maplibregl.GeoJSONSource)?.setData(
      res.parcel_geojson as GeoJSON.Feature
    );
    (map.getSource("buildable") as maplibregl.GeoJSONSource)?.setData(
      res.buildable_geojson as GeoJSON.Feature
    );
    (map.getSource("excluded") as maplibregl.GeoJSONSource)?.setData(
      res.excluded_geojson as GeoJSON.Feature
    );

    if (!fit) return;
    const geom = res.parcel_geojson?.geometry;
    if (!geom) return;
    const b = new maplibregl.LngLatBounds();
    const coords =
      geom.type === "Polygon"
        ? (geom.coordinates as number[][][])
        : geom.type === "MultiPolygon"
        ? (geom.coordinates as number[][][][]).flat()
        : [];
    for (const ring of coords) {
      for (const pt of ring) b.extend(pt as [number, number]);
    }
    if (!b.isEmpty()) map.fitBounds(b, { padding: 80, maxZoom: 17 });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(theme),
      center: [-97.74, 30.31],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("error", (e) => console.error("maplibre:", e.error?.message || e));

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      styles: DRAW_STYLES,
    });
    drawRef.current = draw;

    const resize = () => map.resize();
    window.addEventListener("resize", resize);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on("load", () => {
      map.resize();
      map.addControl(draw as unknown as maplibregl.IControl);

      map.addSource("parcel", { type: "geojson", data: emptyFC() });
      map.addSource("buildable", { type: "geojson", data: emptyFC() });
      map.addSource("excluded", { type: "geojson", data: emptyFC() });

      map.addLayer({
        id: "excluded-fill",
        type: "fill",
        source: "excluded",
        paint: { "fill-color": "#d03b3b", "fill-opacity": 0.5 },
      });
      map.addLayer({
        id: "excluded-line",
        type: "line",
        source: "excluded",
        paint: { "line-color": "#f26b6b", "line-width": 1 },
      });
      map.addLayer({
        id: "buildable-fill",
        type: "fill",
        source: "buildable",
        paint: { "fill-color": "#1ee11e", "fill-opacity": 0.45 },
      });
      map.addLayer({
        id: "buildable-line",
        type: "line",
        source: "buildable",
        paint: { "line-color": "#43ff43", "line-width": 1.5 },
      });
      map.addLayer({
        id: "parcel-outline",
        type: "line",
        source: "parcel",
        paint: {
          "line-color": theme === "dark" ? "#ffffff" : "#0b0b0b",
          "line-width": 2.5,
        },
      });

      readyRef.current = true;
      applyResult(true);

      const emit = () => {
        const all = draw.getAll();
        const carves: GeoJSON.Feature[] = [];
        const restores: GeoJSON.Feature[] = [];
        let parcel: GeoJSON.Feature | null = null;
        for (const f of all.features) {
          const kind = f.properties?.editKind;
          if (kind === "parcel") parcel = f;
          else if (kind === "restore") restores.push(f);
          else carves.push(f);
        }
        onDrawChange(carves, restores);
        onParcelDraw?.(parcel ? parcel.geometry : null);
      };

      onReady?.({
        deleteSelected: () => {
          const ids = draw.getSelectedIds();
          if (ids.length) {
            draw.delete(ids);
          } else {
            const all = draw.getAll();
            if (all.features.length) draw.delete(all.features[0].id as string);
          }
          emit();
        },
        clearAll: () => {
          draw.deleteAll();
          emit();
        },
        clearParcel: () => {
          for (const f of draw.getAll().features) {
            if (f.properties?.editKind === "parcel") {
              draw.delete(f.id as string);
            }
          }
          emit();
        },
        undoLastPoint: () => {
          const d = draw as unknown as { trash: () => void };
          d.trash();
        },
      });

      map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
        const mode = modeRef.current;
        const kind =
          mode === "parcel" ? "parcel" : mode === "restore" ? "restore" : "carve";
        if (mode === "parcel") {
          for (const f of draw.getAll().features) {
            if (
              f.properties?.editKind === "parcel" &&
              !e.features.some((n) => n.id === f.id)
            ) {
              draw.delete(f.id as string);
            }
          }
        }
        for (const f of e.features) {
          draw.setFeatureProperty(f.id as string, "editKind", kind);
        }
        emit();
      });
      map.on("draw.update", emit);
      map.on("draw.delete", emit);
    });

    return () => {
      window.removeEventListener("resize", resize);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDrawChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const next = baseStyle(theme);
    const src = next.sources.base as maplibregl.RasterSourceSpecification;
    if (map.getLayer("base")) map.removeLayer("base");
    if (map.getSource("base")) map.removeSource("base");
    map.addSource("base", src);
    map.addLayer({ id: "base", type: "raster", source: "base" }, "excluded-fill");
    if (map.getLayer("parcel-outline")) {
      map.setPaintProperty(
        "parcel-outline",
        "line-color",
        theme === "dark" ? "#ffffff" : "#0b0b0b"
      );
    }
  }, [theme]);

  useEffect(() => {
    modeRef.current = drawMode;
    const draw = drawRef.current;
    if (!draw || !readyRef.current) return;
    if (drawMode === null) {
      draw.changeMode("simple_select");
    } else {
      draw.changeMode("draw_polygon");
    }
  }, [drawMode]);

  const prevParcelRef = useRef<string | null>(null);
  useEffect(() => {
    const parcelId = result?.parcel_id ?? null;
    const shouldFit = parcelId !== prevParcelRef.current;
    prevParcelRef.current = parcelId;
    applyResult(shouldFit);
  }, [result, applyResult]);

  return <div ref={containerRef} className="h-full w-full" />;
}
