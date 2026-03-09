import { useEffect, useRef, useCallback, useState } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** Escape HTML special characters to prevent XSS in tooltip content */
function escHtml(str: string | number | undefined | null): string {
  const s = String(str ?? "");
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Country centroid coordinates — used when GeoIP response lacks lat/lng */
const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  "United States": { lat: 39.8283, lng: -98.5795 },
  "China": { lat: 35.8617, lng: 104.1954 },
  "Russia": { lat: 61.524, lng: 105.3188 },
  "Germany": { lat: 51.1657, lng: 10.4515 },
  "Brazil": { lat: -14.235, lng: -51.9253 },
  "India": { lat: 20.5937, lng: 78.9629 },
  "Netherlands": { lat: 52.1326, lng: 5.2913 },
  "South Korea": { lat: 35.9078, lng: 127.7669 },
  "United Kingdom": { lat: 55.3781, lng: -3.436 },
  "France": { lat: 46.2276, lng: 2.2137 },
  "Japan": { lat: 36.2048, lng: 138.2529 },
  "Australia": { lat: -25.2744, lng: 133.7751 },
  "Canada": { lat: 56.1304, lng: -106.3468 },
  "Iran": { lat: 32.4279, lng: 53.688 },
  "North Korea": { lat: 40.3399, lng: 127.5101 },
  "Ukraine": { lat: 48.3794, lng: 31.1656 },
  "Turkey": { lat: 38.9637, lng: 35.2433 },
  "Israel": { lat: 31.0461, lng: 34.8516 },
  "Vietnam": { lat: 14.0583, lng: 108.2772 },
  "Indonesia": { lat: -0.7893, lng: 113.9213 },
  "Mexico": { lat: 23.6345, lng: -102.5528 },
  "Pakistan": { lat: 30.3753, lng: 69.3451 },
  "Nigeria": { lat: 9.082, lng: 8.6753 },
  "South Africa": { lat: -30.5595, lng: 22.9375 },
  "Egypt": { lat: 26.8206, lng: 30.8025 },
  "Romania": { lat: 45.9432, lng: 24.9668 },
  "Poland": { lat: 51.9194, lng: 19.1451 },
  "Italy": { lat: 41.8719, lng: 12.5674 },
  "Spain": { lat: 40.4637, lng: -3.7492 },
  "Sweden": { lat: 60.1282, lng: 18.6435 },
  "Argentina": { lat: -38.4161, lng: -63.6167 },
  "Colombia": { lat: 4.5709, lng: -74.2973 },
  "Thailand": { lat: 15.87, lng: 100.9925 },
  "Singapore": { lat: 1.3521, lng: 103.8198 },
  "Malaysia": { lat: 4.2105, lng: 101.9758 },
  "Philippines": { lat: 12.8797, lng: 121.774 },
  "Bangladesh": { lat: 23.685, lng: 90.3563 },
  "Saudi Arabia": { lat: 23.8859, lng: 45.0792 },
  "UAE": { lat: 23.4241, lng: 53.8478 },
  "Taiwan": { lat: 23.6978, lng: 120.9605 },
};

function getThreatColorHex(avgLevel: number): string {
  if (avgLevel >= 10) return "#ef4444";
  if (avgLevel >= 8)  return "#f97316";
  if (avgLevel >= 6)  return "#eab308";
  if (avgLevel >= 4)  return "#a855f7";
  return "#06b6d4";
}

function getThreatLabel(avgLevel: number): string {
  if (avgLevel >= 10) return "Critical";
  if (avgLevel >= 8)  return "High";
  if (avgLevel >= 6)  return "Medium";
  if (avgLevel >= 4)  return "Low";
  return "Info";
}

export interface ThreatGeoData {
  country: string;
  count: number;
  avgLevel: number;
  lat?: number;
  lng?: number;
  cities?: string[];
  topIps?: string[];
  source?: string;
}

interface ThreatMapProps {
  data: ThreatGeoData[];
  className?: string;
  enableClickFilter?: boolean;
}

/** Dark tile layer for Amethyst Nexus theme */
const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

export function ThreatMap({ data, className, enableClickFilter = true }: ThreatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [, navigate] = useLocation();

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [25, 10],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
      maxBounds: [[-90, -180], [90, 180]],
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer(DARK_TILE_URL, {
      attribution: DARK_TILE_ATTR,
      subdomains: "abcd",
      maxZoom: 18,
    }).addTo(map);

    // Style attribution to match dark theme
    const attrEl = map.getContainer().querySelector(".leaflet-control-attribution");
    if (attrEl instanceof HTMLElement) {
      attrEl.style.background = "rgba(15, 10, 26, 0.8)";
      attrEl.style.color = "#6b5b8a";
      attrEl.style.fontSize = "9px";
    }

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Draw threat circles when data changes
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;

    layerGroupRef.current.clearLayers();

    if (data.length === 0) return;

    const maxCount = Math.max(...data.map(d => d.count));

    data.forEach(d => {
      const coords = (d.lat != null && d.lng != null)
        ? { lat: d.lat, lng: d.lng }
        : COUNTRY_COORDS[d.country];
      if (!coords) return;

      const ratio = d.count / maxCount;
      const radius = 150000 + ratio * 650000;
      const colorHex = getThreatColorHex(d.avgLevel);
      const threatLabel = getThreatLabel(d.avgLevel);

      // Main circle
      const circle = L.circle([coords.lat, coords.lng], {
        radius,
        fillColor: colorHex,
        fillOpacity: 0.25 + ratio * 0.35,
        color: colorHex,
        opacity: 0.7,
        weight: 1.5,
        interactive: true,
      });

      // Tooltip content
      const citiesHtml = d.cities && d.cities.length > 0
        ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:11px;color:#9b8bb8;">Cities</span>
            <span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:#c4b5d8;">${d.cities.slice(0, 3).map(c => escHtml(c)).join(", ")}</span>
          </div>`
        : "";
      const ipsHtml = d.topIps && d.topIps.length > 0
        ? `<div style="margin-top:4px;border-top:1px solid ${colorHex}20;padding-top:4px;">
            <span style="font-size:9px;color:#6b5b8a;">Top IPs:</span>
            <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#c4b5d8;margin-top:2px;">${d.topIps.slice(0, 3).map(ip => escHtml(ip)).join(", ")}</div>
          </div>`
        : "";
      const sourceHtml = d.source
        ? `<div style="margin-top:4px;font-size:9px;color:#6b5b8a;">Source: ${escHtml(d.source)}</div>`
        : "";
      const clickHint = enableClickFilter
        ? `<div style="margin-top:6px;font-size:9px;color:#a855f7;text-align:center;">Click to filter alerts</div>`
        : "";

      const tooltipContent = `
        <div style="
          background:rgba(15,10,26,0.95);
          border:1px solid ${colorHex}40;
          border-radius:8px;
          padding:10px 14px;
          font-family:'Inter',sans-serif;
          color:#e2daf0;
          min-width:200px;
          max-width:280px;
        ">
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;color:#f0eaf8;">${escHtml(d.country)}</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:11px;color:#9b8bb8;">Threat Events</span>
            <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#f0eaf8;">${d.count.toLocaleString()}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:11px;color:#9b8bb8;">Avg Severity</span>
            <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:${colorHex};">${d.avgLevel.toFixed(1)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:11px;color:#9b8bb8;">Threat Level</span>
            <span style="
              font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;
              background:${colorHex}20;color:${colorHex};border:1px solid ${colorHex}40;
            ">${threatLabel}</span>
          </div>
          ${citiesHtml}
          ${ipsHtml}
          ${sourceHtml}
          ${clickHint}
        </div>
      `;

      circle.bindTooltip(tooltipContent, {
        sticky: true,
        direction: "top",
        offset: [0, -10],
        className: "threat-map-tooltip",
      });

      if (enableClickFilter) {
        circle.on("click", () => {
          const params = new URLSearchParams();
          params.set("country", d.country);
          if (d.topIps && d.topIps.length > 0) {
            params.set("srcip", d.topIps[0]);
          }
          navigate(`/alerts?${params.toString()}`);
        });
      }

      // Pulse animation for critical/high severity
      if (d.avgLevel >= 8) {
        const pulseCircle = L.circle([coords.lat, coords.lng], {
          radius: radius * 1.3,
          fillColor: colorHex,
          fillOpacity: 0,
          color: colorHex,
          opacity: 0.4,
          weight: 2,
          interactive: false,
          className: "threat-pulse-ring",
        });
        layerGroupRef.current!.addLayer(pulseCircle);
      }

      layerGroupRef.current!.addLayer(circle);
    });
  }, [data, enableClickFilter, navigate]);

  return (
    <>
      <style>{`
        .threat-map-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .threat-map-tooltip .leaflet-tooltip-content {
          margin: 0;
        }
        .threat-pulse-ring {
          animation: threatPulse 2s ease-out infinite;
        }
        @keyframes threatPulse {
          0% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.5); }
        }
        .leaflet-container {
          background: #0f0a1a !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className={className ?? "w-full h-full rounded-lg overflow-hidden"}
        style={{ minHeight: "300px" }}
      />
    </>
  );
}
