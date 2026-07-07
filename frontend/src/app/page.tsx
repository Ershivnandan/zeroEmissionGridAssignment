"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  Scissors,
  Undo2,
  Layers,
  MapPin,
  Loader2,
  Info,
  Trash2,
  Eraser,
  ChevronDown,
  MousePointer2,
  Pencil,
  Upload,
} from "lucide-react";
import { ConstraintInfo, ConstraintOverride } from "@/lib/api";
import { useParcels } from "@/hooks/queries/useParcels";
import { useConstraints } from "@/hooks/queries/useConstraints";
import { useComputeBuildable } from "@/hooks/queries/useComputeBuildable";
import type { DrawMode, MapActions } from "@/components/MapView";
import { StatTile } from "@/components/StatTile";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Page() {
  const parcelsQuery = useParcels();
  const constraintsQuery = useConstraints();
  const { resolvedTheme } = useTheme();
  const mapTheme = resolvedTheme === "light" ? "light" : "dark";

  const [parcelSource, setParcelSource] = useState<"sample" | "draw" | "upload">(
    "sample"
  );
  const [selectedParcel, setSelectedParcel] = useState<string>("");
  const [drawnParcel, setDrawnParcel] = useState<GeoJSON.Geometry | null>(null);
  const [uploadError, setUploadError] = useState<string>("");
  const [overridesState, setOverridesState] = useState<
    Record<string, { enabled: boolean; setback_m: number }>
  >({});
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [carves, setCarves] = useState<GeoJSON.Feature[]>([]);
  const [restores, setRestores] = useState<GeoJSON.Feature[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const mapActions = useRef<MapActions | null>(null);

  useEffect(() => {
    const parcels = parcelsQuery.data;
    if (parcels?.length && !selectedParcel) {
      setSelectedParcel(parcels[0].parcel_id);
    }
  }, [parcelsQuery.data, selectedParcel]);

  useEffect(() => {
    const cs = constraintsQuery.data;
    if (cs && Object.keys(overridesState).length === 0) {
      setOverridesState(
        Object.fromEntries(
          cs.map((c) => [
            c.key,
            { enabled: c.enabled, setback_m: c.default_setback_m },
          ])
        )
      );
    }
  }, [constraintsQuery.data, overridesState]);

  const constraints: ConstraintInfo[] = constraintsQuery.data ?? [];

  const overrides = useMemo<ConstraintOverride[]>(
    () =>
      constraints.map((c) => ({
        key: c.key,
        enabled: overridesState[c.key]?.enabled ?? c.enabled,
        setback_m: overridesState[c.key]?.setback_m ?? c.default_setback_m,
      })),
    [constraints, overridesState]
  );

  const useDrawn = parcelSource !== "sample";
  const computeQuery = useComputeBuildable({
    parcel_id: useDrawn ? undefined : selectedParcel || undefined,
    parcel_geometry: useDrawn ? drawnParcel ?? undefined : undefined,
    overrides,
    carve_outs: carves.map((f) => ({ geometry: f.geometry })),
    restores: restores.map((f) => ({ geometry: f.geometry })),
  });

  const result = computeQuery.data;
  const busy =
    computeQuery.isFetching ||
    parcelsQuery.isLoading ||
    constraintsQuery.isLoading;
  const error =
    parcelsQuery.error || constraintsQuery.error || computeQuery.error;

  const onDrawChange = useCallback(
    (c: GeoJSON.Feature[], r: GeoJSON.Feature[]) => {
      setCarves(c);
      setRestores(r);
    },
    []
  );

  const onReady = useCallback((actions: MapActions) => {
    mapActions.current = actions;
  }, []);

  const onParcelDraw = useCallback((geometry: GeoJSON.Geometry | null) => {
    setDrawnParcel(geometry);
  }, []);

  const switchSource = (src: "sample" | "draw" | "upload") => {
    setParcelSource(src);
    setUploadError("");
    setDrawMode(null);
    if (src !== "draw") {
      mapActions.current?.clearParcel();
    }
    if (src === "sample") {
      setDrawnParcel(null);
    }
  };

  const onUpload = async (file: File) => {
    setUploadError("");
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      let geom: GeoJSON.Geometry | null = null;
      if (json.type === "FeatureCollection") {
        const feat = json.features?.find(
          (f: GeoJSON.Feature) =>
            f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
        );
        geom = feat?.geometry ?? null;
      } else if (json.type === "Feature") {
        geom = json.geometry;
      } else if (json.type === "Polygon" || json.type === "MultiPolygon") {
        geom = json;
      }
      if (!geom) {
        setUploadError("No Polygon/MultiPolygon found in file.");
        return;
      }
      setDrawnParcel(geom);
    } catch {
      setUploadError("Invalid GeoJSON file.");
    }
  };

  const updateConstraint = (
    key: string,
    patch: Partial<{ enabled: boolean; setback_m: number }>
  ) => {
    setOverridesState((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const removedByKey = useMemo(() => {
    const m = new Map<string, number>();
    result?.breakdown.forEach((b) => m.set(b.key, b.removed_acres));
    return m;
  }, [result]);

  const parcels = parcelsQuery.data ?? [];
  const buildablePct = result
    ? (result.buildable_acres / Math.max(result.parcel_acres, 0.0001)) * 100
    : 0;

  const hasEdits = carves.length > 0 || restores.length > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid h-screen grid-cols-[340px_1fr] bg-background">
        <aside className="flex h-screen flex-col overflow-hidden border-r border-border">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Layers className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">
                Buildable Land Analysis
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Parcel minus constraints
              </p>
            </div>
            {busy && (
              <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            )}
            <div className={cn(busy ? "" : "ml-auto")}>
              <ThemeToggle />
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <section className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Parcel
              </Label>

              <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
                {(["draw", "upload", "sample"] as const).map((src) => (
                  <button
                    key={src}
                    onClick={() => switchSource(src)}
                    className={cn(
                      "rounded px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                      parcelSource === src
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {src}
                  </button>
                ))}
              </div>

              {parcelSource === "sample" && (
                <Select value={selectedParcel} onValueChange={setSelectedParcel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a parcel" />
                  </SelectTrigger>
                  <SelectContent>
                    {parcels.map((p) => (
                      <SelectItem key={p.parcel_id} value={p.parcel_id}>
                        {p.parcel_id} — {p.acres.toFixed(1)} ac
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {parcelSource === "draw" && (
                <div className="space-y-2">
                  <Button
                    variant={drawMode === "parcel" ? "default" : "outline"}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setDrawMode(drawMode === "parcel" ? null : "parcel")
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {drawMode === "parcel"
                      ? "Click on map to draw…"
                      : drawnParcel
                      ? "Redraw parcel"
                      : "Draw parcel on map"}
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Click points on the map to outline your land, then double-click
                    to finish. Wetlands & other constraints will be subtracted.
                  </p>
                </div>
              )}

              {parcelSource === "upload" && (
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground hover:bg-accent">
                    <Upload className="h-4 w-4" />
                    {drawnParcel ? "Replace GeoJSON" : "Upload parcel GeoJSON"}
                    <input
                      type="file"
                      accept=".geojson,.json,application/geo+json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpload(f);
                      }}
                    />
                  </label>
                  {uploadError && (
                    <p className="text-[11px] text-[var(--excluded)]">
                      {uploadError}
                    </p>
                  )}
                </div>
              )}

              {useDrawn && !drawnParcel && (
                <p className="text-[11px] text-muted-foreground">
                  No parcel yet — {parcelSource === "draw" ? "draw" : "upload"} one
                  to see the analysis.
                </p>
              )}
            </section>

            <AnimatePresence>
              {result && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile label="Parcel acres" value={result.parcel_acres} />
                    <StatTile
                      label="Buildable"
                      value={result.buildable_acres}
                      tone="buildable"
                    />
                    <StatTile
                      label="Excluded"
                      value={result.excluded_acres}
                      tone="excluded"
                    />
                    <StatTile
                      label="Buildable %"
                      value={buildablePct}
                      decimals={0}
                      suffix="%"
                    />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      className="h-full bg-[var(--buildable)]"
                      animate={{ width: `${Math.min(buildablePct, 100)}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            <section className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Constraints &amp; setbacks
              </Label>
              <div className="overflow-hidden rounded-lg border border-border">
                {constraints.map((c, i) => {
                  const state = overridesState[c.key] ?? {
                    enabled: c.enabled,
                    setback_m: c.default_setback_m,
                  };
                  const isOpen = expanded === c.key;
                  return (
                    <div
                      key={c.key}
                      className={cn(
                        i > 0 && "border-t border-border",
                        "bg-card"
                      )}
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Checkbox
                          checked={state.enabled}
                          onCheckedChange={(v) =>
                            updateConstraint(c.key, { enabled: Boolean(v) })
                          }
                        />
                        <button
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          onClick={() => setExpanded(isOpen ? null : c.key)}
                        >
                          <span className="truncate text-[13px] font-medium">
                            {c.label}
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-180"
                            )}
                          />
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-muted-foreground">
                              <Info className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {c.source}
                          </TooltipContent>
                        </Tooltip>
                        <span className="tabular w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                          {(removedByKey.get(c.key) ?? 0).toFixed(1)} ac
                        </span>
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen && state.enabled && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center gap-3 px-3 pb-3">
                              <Slider
                                min={0}
                                max={150}
                                step={0.5}
                                value={[state.setback_m]}
                                onValueChange={([v]) =>
                                  updateConstraint(c.key, { setback_m: v })
                                }
                              />
                              <span className="tabular w-16 shrink-0 text-right text-xs text-secondary-foreground">
                                {state.setback_m.toFixed(1)} m
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </section>

            {result && (
              <p className="tabular text-[11px] text-muted-foreground">
                Manual edits · carved {result.manual_carved_acres.toFixed(2)} ac
                · restored {result.manual_restored_acres.toFixed(2)} ac
              </p>
            )}

            {error && (
              <p className="rounded-md border border-[var(--excluded)]/40 bg-[var(--excluded)]/10 p-2 text-xs text-[var(--excluded)]">
                {error.message}
              </p>
            )}
          </div>
        </aside>

        <main className="relative h-screen w-full overflow-hidden">
          <MapView
            result={result ?? null}
            drawMode={drawMode}
            theme={mapTheme}
            onDrawChange={onDrawChange}
            onParcelDraw={onParcelDraw}
            onReady={onReady}
          />

          <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur">
            <Button
              variant={drawMode === null ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDrawMode(null)}
            >
              <MousePointer2 className="h-3.5 w-3.5" /> Select
            </Button>
            {parcelSource === "draw" && (
              <Button
                variant={drawMode === "parcel" ? "default" : "ghost"}
                size="sm"
                onClick={() =>
                  setDrawMode(drawMode === "parcel" ? null : "parcel")
                }
              >
                <Pencil className="h-3.5 w-3.5" /> Draw parcel
              </Button>
            )}
            <Button
              variant={drawMode === "carve" ? "default" : "ghost"}
              size="sm"
              disabled={!result}
              onClick={() => setDrawMode(drawMode === "carve" ? null : "carve")}
            >
              <Scissors className="h-3.5 w-3.5" /> Carve out
            </Button>
            <Button
              variant={drawMode === "restore" ? "default" : "ghost"}
              size="sm"
              disabled={!result}
              onClick={() =>
                setDrawMode(drawMode === "restore" ? null : "restore")
              }
            >
              <Undo2 className="h-3.5 w-3.5" /> Add back
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete selected"
              disabled={!hasEdits}
              onClick={() => mapActions.current?.deleteSelected()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear all edits"
              disabled={!hasEdits}
              onClick={() => mapActions.current?.clearAll()}
            >
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-border bg-card/90 px-3 py-2 text-xs backdrop-blur">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ background: "var(--buildable)" }}
              />
              Buildable
            </div>
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ background: "var(--excluded)" }}
              />
              Excluded
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-3 w-3 rounded-sm border-2",
                  mapTheme === "dark" ? "border-white" : "border-black"
                )}
              />
              Parcel boundary
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
