import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ROUTE_REGISTRY, type RouteEntry } from "./lib/routeRegistry";

// ── Page imports ─────────────────────────────────────────────────────────────
// Each import is wired to the registry entry by pageName.

import Home from "./pages/Home";
import AgentHealth from "./pages/AgentHealth";
import AlertsTimeline from "./pages/AlertsTimeline";
import Vulnerabilities from "./pages/Vulnerabilities";
import MitreAttack from "./pages/MitreAttack";
import Compliance from "./pages/Compliance";
import FileIntegrity from "./pages/FileIntegrity";
import AnalystNotes from "./pages/AnalystNotes";
import Assistant from "./pages/Assistant";
import ITHygiene from "./pages/ITHygiene";
import ClusterHealth from "./pages/ClusterHealth";
import ThreatHunting from "./pages/ThreatHunting";
import SiemEvents from "./pages/SiemEvents";
import RulesetExplorer from "./pages/RulesetExplorer";
import ThreatIntel from "./pages/ThreatIntel";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Status from "./pages/Status";
import AdminUsers from "./pages/AdminUsers";
import AnalystChat from "./pages/AnalystChat";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import Investigations from "./pages/Investigations";
import DataPipeline from "./pages/DataPipeline";
import AdminSettings from "./pages/AdminSettings";
import TokenUsage from "./pages/TokenUsage";
import AlertQueue from "./pages/AlertQueue";
import AgentDetail from "./pages/AgentDetail";
import AgentCompare from "./pages/AgentCompare";
import AutoQueueRules from "./pages/AutoQueueRules";
import TriagePipeline from "./pages/TriagePipeline";
import LivingCaseView from "./pages/LivingCaseView";
import ResponseActions from "./pages/ResponseActions";
import PipelineInspector from "./pages/PipelineInspector";
import FeedbackAnalytics from "./pages/FeedbackAnalytics";
import DriftAnalytics from "./pages/DriftAnalytics";
import FleetInventory from "./pages/FleetInventory";
import SecurityExplorer from "./pages/SecurityExplorer";
import SensitiveAccessAudit from "./pages/SensitiveAccessAudit";
import GroupManagement from "./pages/GroupManagement";
import BrokerCoverage from "./pages/BrokerCoverage";
import DGXHealth from "./pages/DGXHealth";
import BrokerPlayground from "./pages/BrokerPlayground";
import type { ComponentType } from "react";

// ── Component map — connects pageName strings to actual imports ─────────────
const PAGE_COMPONENTS: Record<string, ComponentType<any>> = {
  Home, AgentHealth, AgentDetail, AgentCompare, AlertsTimeline,
  Vulnerabilities, MitreAttack, Compliance, FileIntegrity,
  ITHygiene, ClusterHealth, SiemEvents, ThreatHunting,
  RulesetExplorer, ThreatIntel, AnalystNotes, Assistant, Status,
  AdminUsers, AdminSettings, TokenUsage, AnalystChat, KnowledgeGraph,
  Investigations, DataPipeline, AlertQueue, AutoQueueRules,
  TriagePipeline, LivingCaseView, ResponseActions, PipelineInspector,
  FeedbackAnalytics, DriftAnalytics, FleetInventory, SecurityExplorer,
  SensitiveAccessAudit, GroupManagement, BrokerCoverage, DGXHealth,
  BrokerPlayground, Login, Register,
};

// Resolve each registry entry to its component
function resolveRoute(entry: RouteEntry): RouteEntry & { component: ComponentType<any> } {
  const component = PAGE_COMPONENTS[entry.pageName];
  if (!component) {
    console.warn(`[RouteRegistry] No component found for pageName "${entry.pageName}"`);
    return { ...entry, component: NotFound };
  }
  return { ...entry, component };
}

const authRoutes = ROUTE_REGISTRY.filter(r => r.auth).map(resolveRoute);
const dashRoutes = ROUTE_REGISTRY.filter(r => !r.auth).map(resolveRoute);

function Router() {
  return (
    <Switch>
      {/* Auth routes — outside DashboardLayout */}
      {authRoutes.map(r => (
        <Route key={r.path} path={r.path} component={r.component} />
      ))}

      {/* Dashboard routes — inside DashboardLayout */}
      <Route>
        <DashboardLayout>
          <ErrorBoundary inline label="Page">
            <Switch>
              {dashRoutes.map(r => (
                <Route key={r.path} path={r.path} component={r.component} />
              ))}
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </ErrorBoundary>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            toastOptions={{
              style: {
                background: "oklch(0.17 0.025 286)",
                border: "1px solid oklch(0.3 0.04 286 / 40%)",
                color: "oklch(0.93 0.005 286)",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
