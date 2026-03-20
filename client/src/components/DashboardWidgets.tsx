/*
 * Design: Obsidian Instrument Panel — Shared dashboard widgets
 * Glass cards with gold accent lines, KPI displays with tabular nums,
 * severity badges, and API reference panels
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

// Stagger animation container
export function StaggerContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Stagger child item
export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Glass card with gold accent line
export function GlassCard({
  children,
  className = "",
  accent = true,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div className={`glass-card ${accent ? "gold-accent-top" : ""} p-5 ${className}`}>
      {children}
    </div>
  );
}

// KPI metric display
export function KPICard({
  label,
  value,
  change,
  changeType = "neutral",
  icon,
}: {
  label: string;
  value: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon?: ReactNode;
}) {
  const changeColor =
    changeType === "up"
      ? "oklch(0.628 0.258 29.234)"
      : changeType === "down"
      ? "oklch(0.723 0.219 149.579)"
      : "oklch(0.6 0.01 260)";

  return (
    <GlassCard>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "oklch(0.6 0.01 260)" }}>
            {label}
          </p>
          <p
            className="text-2xl font-bold mt-1 tabular-nums"
            style={{ fontFamily: "var(--font-mono)", color: "oklch(0.95 0.005 85)" }}
          >
            {value}
          </p>
          {change && (
            <p className="text-xs mt-1 font-medium" style={{ color: changeColor }}>
              {changeType === "up" ? "▲" : changeType === "down" ? "▼" : "●"} {change}
            </p>
          )}
        </div>
        {icon && (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "oklch(0.769 0.108 85.805 / 10%)" }}
          >
            {icon}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// Severity badge
export function SeverityBadge({ level }: { level: "critical" | "high" | "medium" | "low" }) {
  return (
    <span
      className={`severity-${level} inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider`}
    >
      {level}
    </span>
  );
}

// API reference panel
export function ApiReference({
  endpoint,
  method = "POST",
  body,
  description,
}: {
  endpoint: string;
  method?: string;
  body?: string;
  description: string;
}) {
  return (
    <div
      className="rounded-lg p-3 border"
      style={{
        background: "oklch(0.08 0.005 260)",
        borderColor: "oklch(1 0 0 / 6%)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{
            background: method === "POST" ? "oklch(0.769 0.108 85.805 / 20%)" : "oklch(0.723 0.219 149.579 / 20%)",
            color: method === "POST" ? "oklch(0.769 0.108 85.805)" : "oklch(0.723 0.219 149.579)",
          }}
        >
          {method}
        </span>
        <code className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "oklch(0.75 0.15 195)" }}>
          {endpoint}
        </code>
      </div>
      <p className="text-[11px] mb-1.5" style={{ color: "oklch(0.6 0.01 260)" }}>
        {description}
      </p>
      {body && (
        <pre
          className="text-[10px] p-2 rounded overflow-x-auto"
          style={{
            fontFamily: "var(--font-mono)",
            background: "oklch(0.05 0 0)",
            color: "oklch(0.769 0.108 85.805 / 80%)",
          }}
        >
          {body}
        </pre>
      )}
    </div>
  );
}

// Page header with hero image
export function PageHeader({
  title,
  subtitle,
  heroImage,
}: {
  title: string;
  subtitle: string;
  heroImage?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl mb-6" style={{ height: 180 }}>
      {heroImage && (
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, oklch(0.08 0.005 260 / 90%) 0%, oklch(0.05 0 0 / 70%) 100%)",
        }}
      />
      <div className="relative z-10 h-full flex flex-col justify-end p-6">
        <h1 className="text-3xl font-bold gradient-text">{title}</h1>
        <p className="text-sm mt-1" style={{ color: "oklch(0.6 0.01 260)" }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

// Data table component
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left py-2 px-3 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "oklch(0.6 0.01 260)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="transition-colors"
              style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(1 0 0 / 3%)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 px-3 text-[13px]" style={{ color: "oklch(0.85 0.005 85)" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Mini chart placeholder using CSS
export function MiniSparkline({ data, color = "oklch(0.769 0.108 85.805)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return (
    <div className="flex items-end gap-[2px] h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className="rounded-sm transition-all duration-300"
          style={{
            width: 4,
            height: `${((v - min) / range) * 100}%`,
            minHeight: 2,
            background: color,
            opacity: 0.4 + ((v - min) / range) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

// MITRE ATT&CK technique badge
export function MitreBadge({ technique, name }: { technique: string; name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
      style={{
        background: "oklch(0.705 0.213 47.604 / 12%)",
        color: "oklch(0.705 0.213 47.604)",
        border: "1px solid oklch(0.705 0.213 47.604 / 25%)",
      }}
    >
      {technique}
      <span style={{ color: "oklch(0.705 0.213 47.604 / 60%)" }}>|</span>
      {name}
    </span>
  );
}
