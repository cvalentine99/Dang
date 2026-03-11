import { GlassPanel } from "@/components/shared/GlassPanel";
import { Network, Globe } from "lucide-react";
import type { TabDataProps } from "./types";

interface NetworkTabProps {
  netifaceData: TabDataProps;
  netaddrData: TabDataProps;
  netprotoData: TabDataProps;
}

export function NetworkTab({ netifaceData, netaddrData, netprotoData }: NetworkTabProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Network Interfaces */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" /> Network Interfaces
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  {["Name", "Type", "State", "MAC", "MTU", "TX Packets", "RX Packets"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {netifaceData.items.map((iface, i) => {
                  const tx = iface.tx as Record<string, unknown> | undefined;
                  const rx = iface.rx as Record<string, unknown> | undefined;
                  return (
                    <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                      <td className="py-2 px-3 text-foreground font-medium">{String(iface.name ?? "—")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(iface.type ?? "—")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(iface.state ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(iface.mac ?? "—")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(iface.mtu ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(tx?.packets ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(rx?.packets ?? "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassPanel>

        {/* Network Addresses */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Network Addresses
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  {["Interface", "Protocol", "Address", "Netmask", "Broadcast"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {netaddrData.items.map((addr, i) => (
                  <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                    <td className="py-2 px-3 text-foreground font-medium">{String(addr.iface ?? "—")}</td>
                    <td className="py-2 px-3 text-muted-foreground">{String(addr.proto ?? "—")}</td>
                    <td className="py-2 px-3 font-mono text-primary">{String(addr.address ?? "—")}</td>
                    <td className="py-2 px-3 font-mono text-muted-foreground">{String(addr.netmask ?? "—")}</td>
                    <td className="py-2 px-3 font-mono text-muted-foreground">{String(addr.broadcast ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>

      {/* Network Protocols */}
      <GlassPanel className="lg:col-span-2">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" /> Network Protocols
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/30">
                {["Interface", "Type", "Gateway", "DHCP"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {netprotoData.items.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground/50">No protocol data available</td></tr>
              ) : netprotoData.items.map((proto, i) => (
                <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                  <td className="py-2 px-3 text-foreground font-medium">{String(proto.iface ?? "—")}</td>
                  <td className="py-2 px-3 text-muted-foreground">{String(proto.type ?? "—")}</td>
                  <td className="py-2 px-3 font-mono text-primary">{String(proto.gateway ?? "—")}</td>
                  <td className="py-2 px-3 text-muted-foreground">{String(proto.dhcp ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </>
  );
}
