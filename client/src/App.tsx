import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
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

function Router() {
  return (
    <Switch>
      {/* Auth routes — outside DashboardLayout */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* Dashboard routes — inside DashboardLayout */}
      <Route>
        <DashboardLayout>
          <ErrorBoundary inline label="Page">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/agents" component={AgentHealth} />
              <Route path="/fleet/:agentId" component={AgentDetail} />
              <Route path="/fleet-compare" component={AgentCompare} />
              <Route path="/alerts" component={AlertsTimeline} />
              <Route path="/vulnerabilities" component={Vulnerabilities} />
              <Route path="/mitre" component={MitreAttack} />
              <Route path="/compliance" component={Compliance} />
              <Route path="/fim" component={FileIntegrity} />
              <Route path="/hygiene" component={ITHygiene} />
              <Route path="/cluster" component={ClusterHealth} />
              <Route path="/siem" component={SiemEvents} />
              <Route path="/hunting" component={ThreatHunting} />
              <Route path="/rules" component={RulesetExplorer} />
              <Route path="/threat-intel" component={ThreatIntel} />
              <Route path="/notes" component={AnalystNotes} />
              <Route path="/assistant" component={Assistant} />
              <Route path="/status" component={Status} />
              <Route path="/admin/users" component={AdminUsers} />
              <Route path="/admin/settings" component={AdminSettings} />
              <Route path="/admin/token-usage" component={TokenUsage} />
              <Route path="/analyst" component={AnalystChat} />
              <Route path="/graph" component={KnowledgeGraph} />
              <Route path="/investigations" component={Investigations} />
              <Route path="/pipeline" component={DataPipeline} />
              <Route path="/alert-queue" component={AlertQueue} />
              <Route path="/auto-queue-rules" component={AutoQueueRules} />
              <Route path="/triage" component={TriagePipeline} />
              <Route path="/living-cases" component={LivingCaseView} />
              <Route path="/living-cases/:id" component={LivingCaseView} />
              <Route path="/response-actions" component={ResponseActions} />
              <Route path="/pipeline-inspector" component={PipelineInspector} />
              <Route path="/feedback-analytics" component={FeedbackAnalytics} />
              <Route path="/drift-analytics" component={DriftAnalytics} />
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
