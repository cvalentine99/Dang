/**
 * GeoIP Service — Server-side IP geolocation using MaxMind GeoLite2 via geoip-lite.
 * 
 * Provides IP-to-country/city/coordinates lookup for enriching Wazuh alert source IPs.
 * The geoip-lite package bundles a free MaxMind GeoLite2 database (~60MB in memory).
 * 
 * This module is read-only and does not make external API calls.
 */

import geoip from "geoip-lite";

export interface GeoIPResult {
  ip: string;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
}

/**
 * Look up geolocation data for a single IP address.
 * Returns null fields if the IP is private, invalid, or not in the database.
 */
export function lookupIP(ip: string): GeoIPResult {
  const result = geoip.lookup(ip);
  if (!result) {
    return {
      ip,
      country: null,
      countryCode: null,
      region: null,
      city: null,
      lat: null,
      lng: null,
      timezone: null,
    };
  }

  return {
    ip,
    country: COUNTRY_NAMES[result.country] ?? result.country,
    countryCode: result.country,
    region: result.region || null,
    city: result.city || null,
    lat: result.ll?.[0] ?? null,
    lng: result.ll?.[1] ?? null,
    timezone: result.timezone || null,
  };
}

/**
 * Batch lookup for multiple IPs. Deduplicates before lookup.
 * Returns a Map keyed by IP address.
 */
export function batchLookupIPs(ips: string[]): Map<string, GeoIPResult> {
  const unique = Array.from(new Set(ips));
  const results = new Map<string, GeoIPResult>();
  for (const ip of unique) {
    results.set(ip, lookupIP(ip));
  }
  return results;
}

/**
 * Aggregate GeoIP results by country, returning country-level threat data
 * with averaged coordinates (centroid of all IPs from that country).
 */
export interface CountryAggregation {
  country: string;
  countryCode: string;
  count: number;
  lat: number | null;
  lng: number | null;
  cities: string[];
  ips: string[];
}

export function aggregateByCountry(
  results: GeoIPResult[]
): CountryAggregation[] {
  const countryMap = new Map<
    string,
    {
      countryCode: string;
      count: number;
      latSum: number;
      lngSum: number;
      coordCount: number;
      cities: Set<string>;
      ips: Set<string>;
    }
  >();

  for (const r of results) {
    if (!r.country) continue;

    const existing = countryMap.get(r.country);
    if (existing) {
      existing.count++;
      if (r.lat !== null && r.lng !== null) {
        existing.latSum += r.lat;
        existing.lngSum += r.lng;
        existing.coordCount++;
      }
      if (r.city) existing.cities.add(r.city);
      existing.ips.add(r.ip);
    } else {
      countryMap.set(r.country, {
        countryCode: r.countryCode ?? "",
        count: 1,
        latSum: r.lat ?? 0,
        lngSum: r.lng ?? 0,
        coordCount: r.lat !== null && r.lng !== null ? 1 : 0,
        cities: r.city ? new Set([r.city]) : new Set(),
        ips: new Set([r.ip]),
      });
    }
  }

  return Array.from(countryMap.entries())
    .map(([country, data]) => ({
      country,
      countryCode: data.countryCode,
      count: data.count,
      lat: data.coordCount > 0 ? data.latSum / data.coordCount : null,
      lng: data.coordCount > 0 ? data.lngSum / data.coordCount : null,
      cities: Array.from(data.cities).slice(0, 10),
      ips: Array.from(data.ips).slice(0, 20),
    }))
    .sort((a, b) => b.count - a.count);
}

/** ISO 3166-1 alpha-2 to common country name mapping */
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CN: "China",
  RU: "Russia",
  DE: "Germany",
  BR: "Brazil",
  IN: "India",
  NL: "Netherlands",
  KR: "South Korea",
  GB: "United Kingdom",
  FR: "France",
  JP: "Japan",
  AU: "Australia",
  CA: "Canada",
  IR: "Iran",
  KP: "North Korea",
  UA: "Ukraine",
  TR: "Turkey",
  IL: "Israel",
  VN: "Vietnam",
  ID: "Indonesia",
  MX: "Mexico",
  PK: "Pakistan",
  NG: "Nigeria",
  ZA: "South Africa",
  EG: "Egypt",
  RO: "Romania",
  PL: "Poland",
  IT: "Italy",
  ES: "Spain",
  SE: "Sweden",
  AR: "Argentina",
  CO: "Colombia",
  TH: "Thailand",
  SG: "Singapore",
  MY: "Malaysia",
  PH: "Philippines",
  BD: "Bangladesh",
  SA: "Saudi Arabia",
  AE: "UAE",
  TW: "Taiwan",
  PT: "Portugal",
  CZ: "Czech Republic",
  AT: "Austria",
  CH: "Switzerland",
  BE: "Belgium",
  FI: "Finland",
  NO: "Norway",
  DK: "Denmark",
  IE: "Ireland",
  NZ: "New Zealand",
  CL: "Chile",
  PE: "Peru",
  HK: "Hong Kong",
};
