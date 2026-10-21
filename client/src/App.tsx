import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ROUTE_REGISTRY, type RouteEntry } from "./lib/routeRegistry";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useAuth } from "./_core/hooks/useAuth";
import { Skeleton } from "./components/ui/skeleton";
import { ShieldAlert } from "lucide-react";

// ── Page components (H-C4: route-level code splitting) ─────────────────────
// Each page is a lazy chunk keyed by pageName; App.tsx wires it to the registry.
// Literal import() specifiers are required so Vite can emit one chunk per page.

const PAGE_COMPONENTS: Record<string, ComponentType<any>> = {
  Home: lazy(() => import("./pages/Home")),
  AgentHealth: lazy(() => import("./pages/AgentHealth")),
  AlertsTimeline: lazy(() => import("./pages/AlertsTimeline")),
  Vulnerabilities: lazy(() => import("./pages/Vulnerabilities")),
  MitreAttack: lazy(() => import("./pages/MitreAttack")),
  Compliance: lazy(() => import("./pages/Compliance")),
  FileIntegrity: lazy(() => import("./pages/FileIntegrity")),
  AnalystNotes: lazy(() => import("./pages/AnalystNotes")),
  Assistant: lazy(() => import("./pages/Assistant")),
  ITHygiene: lazy(() => import("./pages/ITHygiene")),
  ClusterHealth: lazy(() => import("./pages/ClusterHealth")),
  ThreatHunting: lazy(() => import("./pages/ThreatHunting")),
  SiemEvents: lazy(() => import("./pages/SiemEvents")),
  RulesetExplorer: lazy(() => import("./pages/RulesetExplorer")),
  ThreatIntel: lazy(() => import("./pages/ThreatIntel")),
  Login: lazy(() => import("./pages/Login")),
  Register: lazy(() => import("./pages/Register")),
  Status: lazy(() => import("./pages/Status")),
  AdminUsers: lazy(() => import("./pages/AdminUsers")),
  AnalystChat: lazy(() => import("./pages/AnalystChat")),
  KnowledgeGraph: lazy(() => import("./pages/KnowledgeGraph")),
  Investigations: lazy(() => import("./pages/Investigations")),
  DataPipeline: lazy(() => import("./pages/DataPipeline")),
  AdminSettings: lazy(() => import("./pages/AdminSettings")),
  TokenUsage: lazy(() => import("./pages/TokenUsage")),
  AlertQueue: lazy(() => import("./pages/AlertQueue")),
  AgentDetail: lazy(() => import("./pages/AgentDetail")),
  AgentCompare: lazy(() => import("./pages/AgentCompare")),
  AutoQueueRules: lazy(() => import("./pages/AutoQueueRules")),
  TriagePipeline: lazy(() => import("./pages/TriagePipeline")),
  LivingCaseView: lazy(() => import("./pages/LivingCaseView")),
  ResponseActions: lazy(() => import("./pages/ResponseActions")),
  PipelineInspector: lazy(() => import("./pages/PipelineInspector")),
  FeedbackAnalytics: lazy(() => import("./pages/FeedbackAnalytics")),
  DriftAnalytics: lazy(() => import("./pages/DriftAnalytics")),
  FleetInventory: lazy(() => import("./pages/FleetInventory")),
  SecurityExplorer: lazy(() => import("./pages/SecurityExplorer")),
  SensitiveAccessAudit: lazy(() => import("./pages/SensitiveAccessAudit")),
  GroupManagement: lazy(() => import("./pages/GroupManagement")),
  BrokerCoverage: lazy(() => import("./pages/BrokerCoverage")),
  DGXHealth: lazy(() => import("./pages/DGXHealth")),
  BrokerPlayground: lazy(() => import("./pages/BrokerPlayground")),
};

/** Suspense fallback while a page chunk downloads. */
function PageSkeleton() {
  return (
    <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/**
 * Single role guard for registry entries with `requiresRole`. The server
 * still enforces adminProcedure; this only avoids rendering admin chrome
 * (and firing doomed admin queries) for non-admins.
 */
function RoleGuard({ role, children }: { role: "admin"; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (user?.role !== role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4" role="alert">
        <ShieldAlert className="w-14 h-14 text-red-400/60" />
        <h2 className="text-xl font-semibold text-foreground/80 font-heading">Administrator access required</h2>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          This page requires the admin role. Contact your security team if you believe you need access.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

const guardedCache = new Map<string, ComponentType<any>>();
function withRoleGuard(pageName: string, Page: ComponentType<any>, role: "admin"): ComponentType<any> {
  const cached = guardedCache.get(pageName);
  if (cached) return cached;
  const Guarded = (props: any) => (
    <RoleGuard role={role}>
      <Page {...props} />
    </RoleGuard>
  );
  Guarded.displayName = `RoleGuard(${pageName})`;
  guardedCache.set(pageName, Guarded);
  return Guarded;
}

// Resolve each registry entry to its component
function resolveRoute(entry: RouteEntry): RouteEntry & { component: ComponentType<any> } {
  const component = PAGE_COMPONENTS[entry.pageName];
  if (!component) {
    console.warn(`[RouteRegistry] No component found for pageName "${entry.pageName}"`);
    return { ...entry, component: NotFound };
  }
  if (entry.requiresRole) {
    return { ...entry, component: withRoleGuard(entry.pageName, component, entry.requiresRole) };
  }
  return { ...entry, component };
}

const authRoutes = ROUTE_REGISTRY.filter(r => r.auth).map(resolveRoute);
const dashRoutes = ROUTE_REGISTRY.filter(r => !r.auth).map(resolveRoute);

/* ── Page transition variants ─────────────────────────────────────────────── */
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: [0.55, 0, 1, 0.45] as const } },
};

/** Wraps each page in a motion.div keyed by the current path */
function AnimatedDashboardContent() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ minHeight: "100%" }}
      >
        <ErrorBoundary inline label="Page">
          <Suspense fallback={<PageSkeleton />}>
            <Switch location={location}>
              {dashRoutes.map(r => (
                <Route key={r.path} path={r.path} component={r.component} />
              ))}
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

function Router() {
  return (
    <Switch>
      {/* Auth routes — outside DashboardLayout */}
      {authRoutes.map(r => (
        <Route key={r.path} path={r.path}>
          {(params) => (
            <Suspense fallback={<PageSkeleton />}>
              <r.component params={params} />
            </Suspense>
          )}
        </Route>
      ))}

      {/* Dashboard routes — inside DashboardLayout with page transitions */}
      <Route>
        <DashboardLayout>
          <AnimatedDashboardContent />
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
                background: "oklch(0.15 0.005 260)",
                border: "1px solid oklch(0.3 0.01 260 / 40%)",
                color: "oklch(0.95 0.005 85)",
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
