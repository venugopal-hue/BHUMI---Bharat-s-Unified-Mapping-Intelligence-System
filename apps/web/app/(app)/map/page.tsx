"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// centroid/normGeoName removed — shapes pre-computed at build time
import { BarChart2, Home, Info, Layers, Map as MapIcon, ZoomIn, ZoomOut } from "lucide-react";

import { Card, EmptyState, LoadingState, PageHeader } from "@/components/ui/primitives";
import { insightsApi, mappingApi } from "@/lib/api";
import { formatArea, formatNumber } from "@/lib/utils";
import type { Parcel, ProgressItem } from "@/lib/types";
import { INDIA_STATE_SHAPES } from "@/lib/india-state-shapes";

/* ─────────────────────────────────────────────
   Cadastral map constants
───────────────────────────────────────────── */
const INDIA_CENTER: [number, number] = [82.0, 22.5];
const INDIA_ZOOM = 4;
const CADASTRAL_MIN_ZOOM = 13;

interface StateEntry { label: string; center: [number, number]; zoom: number }
const INDIA_STATES: StateEntry[] = [
  { label: "Andhra Pradesh",    center: [79.7400, 15.9129], zoom: 7 },
  { label: "Arunachal Pradesh", center: [94.7278, 28.2180], zoom: 7 },
  { label: "Assam",             center: [92.9376, 26.2006], zoom: 7 },
  { label: "Bihar",             center: [85.3131, 25.0961], zoom: 7 },
  { label: "Chhattisgarh",      center: [81.8661, 21.2787], zoom: 7 },
  { label: "Goa",               center: [74.1240, 15.2993], zoom: 9 },
  { label: "Gujarat",           center: [71.1924, 22.2587], zoom: 7 },
  { label: "Haryana",           center: [76.0856, 29.0588], zoom: 8 },
  { label: "Himachal Pradesh",  center: [77.1734, 31.1048], zoom: 8 },
  { label: "Jharkhand",         center: [85.2799, 23.6102], zoom: 7 },
  { label: "Karnataka",         center: [75.7139, 15.3173], zoom: 7 },
  { label: "Kerala",            center: [76.2711, 10.8505], zoom: 7 },
  { label: "Madhya Pradesh",    center: [78.6569, 22.9734], zoom: 6 },
  { label: "Maharashtra",       center: [75.7139, 19.7515], zoom: 6 },
  { label: "Manipur",           center: [93.9063, 24.6637], zoom: 8 },
  { label: "Meghalaya",         center: [91.3662, 25.4670], zoom: 8 },
  { label: "Mizoram",           center: [92.9376, 23.1645], zoom: 8 },
  { label: "Nagaland",          center: [94.5624, 26.1584], zoom: 8 },
  { label: "Odisha",            center: [85.0985, 20.9517], zoom: 7 },
  { label: "Punjab",            center: [75.3412, 31.1471], zoom: 8 },
  { label: "Rajasthan",         center: [74.2179, 27.0238], zoom: 6 },
  { label: "Sikkim",            center: [88.5122, 27.5330], zoom: 9 },
  { label: "Tamil Nadu",        center: [78.6569, 11.1271], zoom: 7 },
  { label: "Telangana",         center: [79.0193, 18.1124], zoom: 7 },
  { label: "Tripura",           center: [91.9882, 23.9408], zoom: 8 },
  { label: "Uttar Pradesh",     center: [80.9462, 26.8467], zoom: 6 },
  { label: "Uttarakhand",       center: [79.0193, 30.0668], zoom: 8 },
  { label: "West Bengal",       center: [87.8550, 22.9868], zoom: 7 },
  { label: "Delhi",             center: [77.1025, 28.7041], zoom: 10 },
];

/* ─────────────────────────────────────────────
   Analytics SVG choropleth
───────────────────────────────────────────── */
const TIER_COLOR = {
  high:   "#166534",
  medium: "#d97706",
  low:    "#dc2626",
  none:   "#9ca3af",
} as const;
type TierKey = keyof typeof TIER_COLOR;

function getTier(pct: number | undefined): TierKey {
  if (pct == null) return "none";
  if (pct >= 75) return "high";
  if (pct >= 40) return "medium";
  if (pct > 0)   return "low";
  return "none";
}

const TIER_LEGEND = [
  { tier: "high"   as TierKey, label: "High  ≥ 75%" },
  { tier: "medium" as TierKey, label: "Medium  ≥ 40%" },
  { tier: "low"    as TierKey, label: "Low  > 0%" },
  { tier: "none"   as TierKey, label: "No data" },
];

/* SVG canvas */
const W = 1600;
const H = 1000;
const GUTTER = 270;
const PAD_Y = 16;
const LABEL_H = 38;
const LABEL_W = 245;
const FONT_NAME = 18;
const FONT_VAL  = 18;

interface Placement {
  name: string;
  cx: number; cy: number;
  lx: number; ly: number;
  isLeft: boolean;
}

/* Abbreviations for long state names so they fit in label slots */
const SHORT_NAME: Record<string, string> = {
  "Arunachal Pradesh": "Arunachal Pr.",
  "Himachal Pradesh": "Himachal Pr.",
  "Madhya Pradesh": "Madhya Pr.",
  "Andhra Pradesh": "Andhra Pr.",
  "Uttar Pradesh": "Uttar Pradesh",
  "Dadra & Nagar Haveli": "Dadra & N.H.",
  "Andaman & Nicobar": "A&N Islands",
  "Jammu & Kashmir": "J & K",
};
function displayName(name: string): string { return SHORT_NAME[name] ?? name; }



interface AnalyticsMapProps {
  items: ProgressItem[];
}

function IndiaAnalyticsMap({ items }: AnalyticsMapProps) {
  const [hover, setHover] = useState("");
  const [selected, setSelected] = useState("");

  const byName = useMemo(() => {
    const m = new Map<string, ProgressItem>();
    for (const r of items) m.set(r.name, r);
    return m;
  }, [items]);

  const projected = INDIA_STATE_SHAPES;

  /* Tiny island territories — omit from label columns, still visible on map */
  const OMIT = new Set(["Lakshadweep", "Andaman & Nicobar"]);

  /* Label placement — two side gutters, non-overlapping y */
  const placements = useMemo<Placement[]>(() => {
    if (!projected) return [];
    const midX = W / 2;
    const visible = projected.filter(s => !OMIT.has(s.name));
    const left  = visible.filter(s => s.cx < midX).sort((a, b) => a.cy - b.cy);
    const right = visible.filter(s => s.cx >= midX).sort((a, b) => a.cy - b.cy);

    const layout = (col: typeof left, lx: number): Placement[] => {
      const top = PAD_Y + LABEL_H / 2;
      const bottom = H - PAD_Y - LABEL_H / 2;
      const ys: number[] = [];
      let prev = -Infinity;
      for (const a of col) {
        const y = Math.max(a.cy, prev + LABEL_H, top);
        ys.push(y);
        prev = y;
      }
      for (let i = ys.length - 1; i >= 0; i--) {
        const limit = i === ys.length - 1 ? bottom : ys[i + 1] - LABEL_H;
        if (ys[i] > limit) ys[i] = limit;
      }
      return col.map((a, i) => ({ name: a.name, cx: a.cx, cy: a.cy, lx, ly: ys[i], isLeft: a.cx < W / 2 }));
    };

    return [
      ...layout(left,  GUTTER / 2 + 6),
      ...layout(right, W - GUTTER / 2 - 6),
    ];
  }, [projected]);

  const statesWithData = projected.filter(s => byName.has(s.name)).length;
  const totalStates = projected.length;
  const toggle = (name: string) => setSelected(prev => prev === name ? "" : name);

  return (
    <div style={{
      position: "relative", display: "flex", flexDirection: "column",
      background: "white", border: "1px solid #e2e8f0",
      borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      height: "calc(100vh - 13rem)", minHeight: 480, width: "100%", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 14px", borderBottom: "1px solid #e2e8f0",
        background: "#fafbfc", flexShrink: 0, gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <span style={{
            fontFamily: "JetBrains Mono, 'Courier New', monospace", fontWeight: 700,
            fontSize: 12, color: "#001f3f", textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            India State Digitization Progress
          </span>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            {`${totalStates} states · ${statesWithData} with digitization data`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#475569",
          }}>
            <span style={{ fontWeight: 700, color: "#001f3f" }}>DIGITIZATION</span>
            {TIER_LEGEND.map(({ tier, label }) => (
              <span key={tier} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: 3,
                  background: TIER_COLOR[tier],
                  border: `1px solid ${tier === "none" ? "#cbd5e1" : TIER_COLOR[tier]}`,
                  display: "inline-block",
                }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* SVG body */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", padding: 4,
        display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* State info card — always visible */}
        {(() => {
          const it = selected ? byName.get(selected) : undefined;
          const tier = getTier(it?.progress_pct);
          const tierLabel = tier === "high" ? "High" : tier === "medium" ? "Medium" : tier === "low" ? "Low" : "No data";
          return (
            <div style={{
              position: "absolute", top: 12, right: 12, zIndex: 30, width: 210,
              background: "white", border: "1px solid #e2e8f0",
              borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
              fontFamily: "Inter, sans-serif", overflow: "hidden",
            }}>
              {/* Card header */}
              <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f1f5f9", background: "#fafbfc" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "JetBrains Mono, monospace" }}>
                  State Dossier
                </div>
              </div>

              <div style={{ padding: "12px 14px" }}>
                {!selected ? (
                  <div style={{ textAlign: "center", padding: "16px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#001f3f", marginBottom: 4 }}>Select a state</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>Click any state on the map or a label to see its digitization details.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#001f3f", lineHeight: 1.3 }}>{selected}</div>
                        {it?.name_local && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{it.name_local}</div>}
                      </div>
                      <button onClick={() => setSelected("")}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
                    </div>

                    {it ? (
                      <>
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: "#64748b" }}>Digitization</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: TIER_COLOR[tier], fontFamily: "JetBrains Mono, monospace" }}>
                              {it.progress_pct.toFixed(1)}%
                            </span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(it.progress_pct, 100)}%`, background: TIER_COLOR[tier], borderRadius: 3 }} />
                          </div>
                          <div style={{ marginTop: 3, fontSize: 9, color: TIER_COLOR[tier], fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
                            {tierLabel}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {([
                            ["Total records", it.total.toLocaleString()],
                            ["Verified", it.verified.toLocaleString()],
                            ["Pending", it.pending.toLocaleString()],
                            ...(it.avg_confidence != null ? [["Avg confidence", `${(it.avg_confidence * 100).toFixed(1)}%`]] : []),
                            ["LGD code", it.lgd_code],
                          ] as [string, string][]).map(([label, value]) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#64748b" }}>{label}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#001f3f", fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>No digitization data for this state.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
        <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: "100%", display: "block" }}
            role="img"
            aria-label="India states shaded by land record digitization progress"
          >
            {/* State shapes — sorted so selected draws on top */}
            {[...projected]
              .sort((a, b) => {
                const ra = a.name === selected ? 2 : hover === a.name ? 1 : 0;
                const rb = b.name === selected ? 2 : hover === b.name ? 1 : 0;
                return ra - rb;
              })
              .map(shape => {
                const item = byName.get(shape.name);
                const tier = getTier(item?.progress_pct);
                const noData = !item;
                const isSel = shape.name === selected;
                const isHover = hover === shape.name && !isSel;
                const fill = noData ? "#dde4ed" : TIER_COLOR[tier];
                return (
                  <path
                    key={shape.name}
                    d={shape.d}
                    fill={fill}
                    stroke={isSel ? "#FF9933" : isHover ? "#475569" : "#ffffff"}
                    strokeWidth={isSel ? 3 : isHover ? 2 : 1.2}
                    strokeLinejoin="round"
                    strokeMiterlimit={2}
                    opacity={isHover ? 0.85 : 1}
                    style={{ cursor: "pointer", transition: "opacity .1s" }}
                    onMouseEnter={() => setHover(shape.name)}
                    onMouseLeave={() => setHover("")}
                    onClick={() => toggle(shape.name)}
                  >
                    <title>
                      {shape.name}
                      {item ? ` — ${item.progress_pct.toFixed(1)}% digitized` : " — no data"}
                    </title>
                  </path>
                );
              })}

            {/* Leader lines */}
            {placements.map(p => {
              const onLeft = p.isLeft;
              const stub = onLeft ? p.lx + LABEL_W / 2 - 6 : p.lx - LABEL_W / 2 + 6;
              const isSel = p.name === selected;
              const isActive = isSel || hover === p.name;
              const item = byName.get(p.name);
              const tier = getTier(item?.progress_pct);
              const dotColor = isSel ? "#FF9933" : item ? TIER_COLOR[tier] : "#94a3b8";
              return (
                <g key={`l-${p.name}`} style={{ pointerEvents: "none" }}>
                  <polyline
                    points={`${stub},${p.ly} ${(stub + p.cx) / 2},${p.ly} ${p.cx},${p.cy}`}
                    fill="none"
                    stroke={isSel ? "#FF9933" : isActive ? "#64748b" : "#c4cfd9"}
                    strokeWidth={isSel ? 2.5 : isActive ? 1.8 : 1.2}
                  />
                  <circle cx={p.cx} cy={p.cy} r={isSel ? 6 : isActive ? 5 : 3.5}
                    fill={dotColor} stroke="#fff" strokeWidth={1.5} />
                </g>
              );
            })}

            {/* Labels */}
            {placements.map(p => {
              const item = byName.get(p.name);
              const tier = getTier(item?.progress_pct);
              const noData = !item;
              const isSel = p.name === selected;
              const isActive = isSel || hover === p.name;
              const onLeft = p.isLeft;
              const valStr = item ? `${item.progress_pct.toFixed(0)}%` : "—";
              const swatchX = onLeft ? p.lx - LABEL_W / 2 + 10 : p.lx + LABEL_W / 2 - 26;
              const nameX  = onLeft ? p.lx - LABEL_W / 2 + 32 : p.lx + LABEL_W / 2 - 32;
              const valX   = onLeft ? p.lx + LABEL_W / 2 - 10 : p.lx - LABEL_W / 2 + 10;
              return (
                <g
                  key={`t-${p.name}`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(p.name)}
                  onMouseLeave={() => setHover("")}
                  onClick={() => toggle(p.name)}
                >
                  <rect
                    x={p.lx - LABEL_W / 2} y={p.ly - LABEL_H / 2 + 2}
                    width={LABEL_W} height={LABEL_H - 4} rx="5"
                    fill={isSel ? "rgba(255,153,51,0.12)" : isActive ? "rgba(226,232,240,0.6)" : "rgba(255,255,255,0.92)"}
                    stroke={isSel ? "#FF9933" : isActive ? "#94a3b8" : "#dbe3ec"}
                    strokeWidth={isSel ? 1.5 : 0.7}
                  />
                  {/* color swatch */}
                  <rect
                    x={swatchX} y={p.ly - 7}
                    width="16" height="16" rx="3"
                    fill={noData ? "#dde4ed" : TIER_COLOR[tier]}
                    stroke={noData ? "#c4cfd9" : TIER_COLOR[tier]}
                    strokeWidth="1"
                  />
                  {/* state name — abbreviated if needed */}
                  <text
                    x={nameX} y={p.ly + 6}
                    textAnchor={onLeft ? "start" : "end"}
                    style={{ fontSize: FONT_NAME, fontWeight: 600, fill: isSel ? "#7c3700" : "#001f3f", fontFamily: "Inter, sans-serif" }}
                  >
                    {displayName(p.name)}
                  </text>
                  {/* value */}
                  <text
                    x={valX} y={p.ly + 6}
                    textAnchor={onLeft ? "end" : "start"}
                    style={{
                      fontSize: FONT_VAL, fontWeight: 800,
                      fill: noData ? "#b0bccb" : isSel ? "#FF9933" : TIER_COLOR[tier],
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {valStr}
                  </text>
                </g>
              );
            })}
          </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
type MapMode = "cadastral" | "analytics";

export default function MapPage() {
  const mapRef     = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInst    = useRef<any>(null);

  const [ready,   setReady]   = useState(false);
  const [mode,    setMode]    = useState<MapMode>("cadastral");
  const [parcel,  setParcel]  = useState<Parcel | null>(null);
  const [showCad, setShowCad] = useState(true);
  const [zoom,    setZoom]    = useState(INDIA_ZOOM);

  const parcelQ = useQuery({ queryKey: ["parcels", "preview"], queryFn: () => mappingApi.parcels({ page_size: 200 }), staleTime: 60_000 });
  const progQ   = useQuery({
    queryKey: ["insights", "progress", "state"],
    queryFn:  () => insightsApi.progress("state"),
    staleTime: 300_000,
    enabled: mode === "analytics",
  });
  const items: ProgressItem[] = progQ.data?.items ?? [];

  /* Map init (once) */
  useEffect(() => {
    if (!mapRef.current) return;
    let dead = false;
    (async () => {
      const mgl = (await import("maplibre-gl")).default;
      if (dead || !mapRef.current) return;
      if (!document.querySelector("style[data-mgl]")) {
        try {
          const css = await fetch("https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css").then(r => r.ok ? r.text() : "");
          if (css) { const s = document.createElement("style"); s.dataset.mgl = "1"; s.textContent = css; document.head.append(s); }
        } catch {/**/}
      }
      const m = new mgl.Map({
        container: mapRef.current!,
        style: {
          version: 8, glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
          sources: { osm: { type: "raster", tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png","https://b.tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: INDIA_CENTER, zoom: INDIA_ZOOM, minZoom: 3, maxZoom: 20,
      });
      mapInst.current = m;
      m.on("load", () => {
        setReady(true); setZoom(m.getZoom());
        m.addSource("bhumi-parcels", { type: "vector", tiles: [mappingApi.tileUrl()], minzoom: CADASTRAL_MIN_ZOOM, maxzoom: 18 });
        m.addLayer({ id: "parcels-fill", type: "fill", source: "bhumi-parcels", "source-layer": "parcels", minzoom: CADASTRAL_MIN_ZOOM,
          paint: { "fill-color": ["case", ["boolean", ["get", "is_validated"], false], "rgba(21,128,61,0.18)", "rgba(11,79,143,0.14)"],
                   "fill-outline-color": ["case", ["boolean", ["get", "is_validated"], false], "rgba(21,128,61,0.75)", "rgba(11,79,143,0.6)"] } });
        m.addLayer({ id: "parcels-border", type: "line", source: "bhumi-parcels", "source-layer": "parcels", minzoom: CADASTRAL_MIN_ZOOM,
          paint: { "line-color": ["case", ["boolean", ["get", "is_validated"], false], "rgba(21,128,61,0.8)", "rgba(11,79,143,0.65)"], "line-width": 1 } });
        m.addLayer({ id: "parcels-label", type: "symbol", source: "bhumi-parcels", "source-layer": "parcels", minzoom: 15,
          layout: { "text-field": ["get", "survey_number"], "text-size": 11, "text-font": ["Noto Sans Regular"], "text-anchor": "center", "text-max-width": 8 },
          paint: { "text-color": "#0B4F8F", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5 } });
        m.on("click", "parcels-fill", e => { if (e.features?.length) setParcel(e.features[0].properties as Parcel); });
        m.on("click", e => { if (!m.queryRenderedFeatures(e.point, { layers: ["parcels-fill"] }).length) setParcel(null); });
        m.on("mouseenter", "parcels-fill", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "parcels-fill", () => { m.getCanvas().style.cursor = ""; });
        m.on("zoom", () => setZoom(m.getZoom()));
      });
    })();
    return () => { dead = true; mapInst.current?.remove(); mapInst.current = null; };
  }, []);

  /* Resize map on mode change */
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => mapInst.current?.resize(), 80);
    return () => clearTimeout(t);
  }, [mode, ready]);

  const toggleCad = useCallback(() => {
    setShowCad(prev => {
      const next = !prev;
      const m = mapInst.current;
      if (m && ready && mode === "cadastral") {
        ["parcels-fill", "parcels-border", "parcels-label"].forEach(id => {
          if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", next ? "visible" : "none");
        });
      }
      return next;
    });
  }, [ready, mode]);

  const flyToState = useCallback((label: string) => {
    const s = INDIA_STATES.find(x => x.label === label);
    if (s) mapInst.current?.flyTo({ center: s.center, zoom: s.zoom, duration: 800 });
  }, []);
  const resetView = useCallback(() => mapInst.current?.flyTo({ center: INDIA_CENTER, zoom: INDIA_ZOOM, duration: 1000 }), []);

  const cadVisible = showCad && zoom >= CADASTRAL_MIN_ZOOM && mode === "cadastral";
  const parseIssues = (raw: unknown): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return raw ? [raw] : []; } }
    return [];
  };

  return (
    <>
      <PageHeader
        title={mode === "analytics" ? "Analytics Map" : "Cadastral Map"}
        description={mode === "analytics" ? "State-wise digitization progress across India" : "India land parcel boundaries. Zoom into a district (zoom 13+) to see the cadastral overlay."}
        breadcrumbs={[{ label: "Map" }]}
        actions={
          <div className="flex items-center rounded-lg border border-line bg-surface p-0.5 gap-0.5">
            {([["cadastral", MapIcon, "Cadastral Map"], ["analytics", BarChart2, "Analytics Map"]] as const).map(([m, Icon, lbl]) => (
              <button key={m} type="button" onClick={() => setMode(m as MapMode)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === m ? "bg-primary text-primary-fg shadow-sm" : "text-muted hover:text-ink"}`}>
                <Icon size={13} />{lbl}
              </button>
            ))}
          </div>
        }
      />

      {/* Analytics mode: pure SVG choropleth */}
      {mode === "analytics" && (
        progQ.isLoading && !items.length ? (
          <div className="flex items-center justify-center rounded-card border border-line bg-surface" style={{ height: "calc(100vh - 13rem)", minHeight: 480 }}>
            <LoadingState label="Loading digitization data…" />
          </div>
        ) : (
          <IndiaAnalyticsMap items={items} />
        )
      )}

      {/* Cadastral mode: MapLibre map + right sidebar */}
      {mode === "cadastral" && (
        <div className="relative flex overflow-hidden rounded-card border border-line" style={{ height: "calc(100vh - 13rem)", minHeight: 480 }}>

          {/* Map */}
          <div className="relative flex-1 min-w-0">
            <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

            {/* Controls */}
            <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-10">
              {[{ lbl: "Zoom in", I: ZoomIn, fn: () => mapInst.current?.zoomIn() }, { lbl: "Zoom out", I: ZoomOut, fn: () => mapInst.current?.zoomOut() }, { lbl: "Reset", I: Home, fn: resetView }].map(({ lbl, I, fn }) => (
                <button key={lbl} type="button" aria-label={lbl} title={lbl} onClick={fn}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface shadow-sm hover:bg-surface-2 transition-colors">
                  <I size={13} />
                </button>
              ))}
            </div>

            {/* Cadastral toggle */}
            <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
              <button type="button" onClick={toggleCad}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs shadow-sm transition-colors ${showCad ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-muted hover:text-ink"}`}>
                <Layers size={13} />Cadastral layer {showCad ? "ON" : "OFF"}
              </button>
              {cadVisible && <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5 text-2xs text-success shadow-sm">Cadastral layer active</div>}
            </div>

            <div className="absolute bottom-2 left-14 z-10 rounded-md border border-line bg-surface/90 px-2 py-0.5 text-2xs text-muted shadow-sm">
              Zoom {Math.round(zoom * 10) / 10} · Scroll or pinch to zoom
            </div>

            {!ready && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/80">
                <LoadingState label="Loading map…" />
              </div>
            )}
          </div>

          {/* Cadastral right sidebar */}
          <div className="w-72 shrink-0 border-l border-line overflow-y-auto bg-surface z-20">
            <div className="p-3 space-y-3">
              <div className="rounded-card border border-line bg-surface px-3 py-2.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-muted block mb-1.5">Jump to state</label>
                <select className="input text-sm w-full" defaultValue=""
                  onChange={e => { flyToState(e.target.value); e.target.value = ""; }}>
                  <option value="" disabled>Select a state…</option>
                  {INDIA_STATES.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select>
              </div>

              {parcel ? (
                <Card title="Selected parcel" action={<button type="button" onClick={() => setParcel(null)} className="btn-ghost btn-sm text-xs">Clear</button>}>
                  <dl className="space-y-2.5 text-sm">
                    <PStat label="Survey #" value={parcel.survey_number ?? "—"} mono />
                    <PStat label="Area" value={formatArea(parcel.area_sqm)} />
                    <PStat label="Land class" value={parcel.land_classification ?? "—"} />
                    <PStat label="Validated" value={parcel.is_validated ? "Yes" : "No"} />
                    {(() => { const iss = parseIssues(parcel.topology_issues); return iss.length ? <div><dt className="text-2xs text-muted">Topology issues</dt><dd className="mt-0.5 text-danger text-xs">{iss.join(", ")}</dd></div> : null; })()}
                  </dl>
                </Card>
              ) : (
                <Card title="Parcel info">
                  <EmptyState title="Click a parcel" description="Zoom into a district, then click a boundary to see details." icon={MapIcon} />
                </Card>
              )}

              <Card title="Dataset summary">
                {parcelQ.isLoading ? <LoadingState /> : (
                  <dl className="space-y-2.5">
                    <PStat label="Total parcels" value={formatNumber(parcelQ.data?.length ?? 0)} />
                    <PStat label="Validated" value={formatNumber(parcelQ.data?.filter(p => p.is_validated).length ?? 0)} />
                    <PStat label="With topology issues" value={formatNumber(parcelQ.data?.filter(p => parseIssues(p.topology_issues).length > 0).length ?? 0)} />
                  </dl>
                )}
              </Card>

              <div className="flex items-start gap-2 rounded-card border border-info/30 bg-info/5 p-3 text-xs text-info">
                <Info size={14} className="mt-0.5 shrink-0" />
                <p>Cadastral boundaries appear at <strong>zoom 13+</strong>. Survey number labels appear at zoom 15+.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted shrink-0">{label}</dt>
      <dd className={`font-semibold text-sm text-ink text-right ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
