import { describe, expect, it } from "vitest";
import { buildGeoEnrichedCountries, UNKNOWN_GEO_COUNTRY } from "./indexerRouter";

describe("buildGeoEnrichedCountries", () => {
  it("prefers geo_centroid, falls back to avg lat/lon, null when neither", () => {
    const out = buildGeoEnrichedCountries({
      geo_countries: {
        buckets: [
          { key: "Germany", doc_count: 5, avg_level: { value: 7.26 }, centroid: { location: { lat: 51, lon: 10 }, count: 5 },
            avg_lat: { value: 1 }, avg_lon: { value: 2 }, cities: { buckets: [{ key: "Berlin", doc_count: 5 }] },
            top_ips: { buckets: [{ key: "1.2.3.4", doc_count: 5 }] } },
          { key: "France", doc_count: 9, avg_level: { value: 3 }, avg_lat: { value: 46 }, avg_lon: { value: 2 } },
          { key: "Chile", doc_count: 1, avg_level: { value: null }, avg_lat: { value: null }, avg_lon: { value: null } },
        ],
      },
    }, 30);
    expect(out.map((c) => c.country)).toEqual(["France", "Germany", "Chile"]);
    expect(out[1]).toEqual({ country: "Germany", count: 5, avgLevel: 7.3, lat: 51, lng: 10, cities: ["Berlin"], topIps: ["1.2.3.4"], source: "wazuh-geo" });
    expect(out[0]).toMatchObject({ lat: 46, lng: 2 });
    expect(out[2]).toMatchObject({ lat: null, lng: null, avgLevel: 0 });
  });

  it("appends an Unknown bucket for source IPs without GeoLocation (no guessing)", () => {
    const out = buildGeoEnrichedCountries({
      geo_countries: { buckets: [{ key: "Japan", doc_count: 2 }] },
      ungeolocated: { doc_count: 40, avg_level: { value: 5 }, top_ips: { buckets: [{ key: "8.8.8.8", doc_count: 40 }] } },
    }, 30);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ country: UNKNOWN_GEO_COUNTRY, count: 40, avgLevel: 5, lat: null, lng: null, cities: [], topIps: ["8.8.8.8"], source: "unknown" });
  });

  it("caps known countries at topN and omits an empty Unknown bucket", () => {
    const buckets = Array.from({ length: 5 }, (_, i) => ({ key: `C${i}`, doc_count: i }));
    const out = buildGeoEnrichedCountries({ geo_countries: { buckets }, ungeolocated: { doc_count: 0 } }, 3);
    expect(out.map((c) => c.country)).toEqual(["C4", "C3", "C2"]);
  });

  it("handles missing aggregations", () => {
    expect(buildGeoEnrichedCountries(undefined, 10)).toEqual([]);
  });
});
