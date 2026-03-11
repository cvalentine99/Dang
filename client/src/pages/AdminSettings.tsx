/**
 * Connection Settings — Admin page for managing Wazuh Manager, Indexer, and LLM connections.
 * Allows admins to update credentials from the UI without restarting Docker.
 * Shows current source (database override vs environment variable vs default).
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Server,
  Database,
  TestTube,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  Shield,
  Brain,
  Zap,
  ToggleLeft,
  ToggleRight,
  Ticket,
} from "lucide-react";

type Category = "wazuh_manager" | "wazuh_indexer" | "llm" | "splunk";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "number";
  description?: string;
  fullWidth?: boolean;
}

interface ConnectionPanelProps {
  category: Category;
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  /** Optional toggle field key — renders an enable/disable toggle in the header */
  toggleField?: string;
  /** Optional accent color class override */
  accentClass?: string;
}

function SourceBadge({ source }: { source?: "database" | "env" | "default" }) {
  if (!source) return null;
  const styles = {
    database: "bg-primary/20 text-primary border-primary/30",
    env: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    default: "bg-muted text-muted-foreground border-border",
  };
  const labels = {
    database: "DB Override",
    env: "Env Var",
    default: "Default",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${styles[source]}`}>
      {labels[source]}
    </span>
  );
}

function ConnectionPanel({ category, title, description, icon, fields, toggleField, accentClass }: ConnectionPanelProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const settingsQuery = trpc.connectionSettings.getSettings.useQuery(
    { category },
    { staleTime: 30_000 }
  );

  const updateMutation = trpc.connectionSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(`${title} connection settings updated.`);
      settingsQuery.refetch();
      setTestResult(null);
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const testMutation = trpc.connectionSettings.testConnection.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      setIsTesting(false);
    },
    onError: (err) => {
      setTestResult({ success: false, message: err.message, latencyMs: 0 });
      setIsTesting(false);
    },
  });

  const resetMutation = trpc.connectionSettings.resetSettings.useMutation({
    onSuccess: () => {
      toast.success(`${title} settings reverted to environment variables.`);
      settingsQuery.refetch();
      setFormValues({});
      setTestResult(null);
    },
    onError: (err) => {
      toast.error(`Reset failed: ${err.message}`);
    },
  });

  // Initialize form values from query data
  useEffect(() => {
    if (settingsQuery.data) {
      const initial: Record<string, string> = {};
      for (const field of fields) {
        initial[field.key] = settingsQuery.data.values[field.key] ?? "";
      }
      // Also load toggle field value if present
      if (toggleField && settingsQuery.data.values[toggleField] !== undefined) {
        initial[toggleField] = settingsQuery.data.values[toggleField];
      }
      setFormValues(initial);
    }
  }, [settingsQuery.data, fields, toggleField]);

  const handleSave = () => {
    const toSave: Record<string, string> = {};
    for (const field of fields) {
      const val = formValues[field.key];
      if (field.type === "password" && (!val || val === "")) continue;
      if (val !== undefined && val !== "") toSave[field.key] = val;
    }
    // Include toggle field
    if (toggleField) {
      toSave[toggleField] = formValues[toggleField] ?? "false";
    }
    updateMutation.mutate({ category, settings: toSave });
  };

  const handleTest = () => {
    setIsTesting(true);
    setTestResult(null);
    const testSettings: Record<string, string> = {};
    for (const field of fields) {
      testSettings[field.key] = formValues[field.key] ?? "";
    }
    if (toggleField) {
      testSettings[toggleField] = formValues[toggleField] ?? "false";
    }
    testMutation.mutate({ category, settings: testSettings });
  };

  const handleReset = () => {
    if (confirm(`Reset ${title} settings to environment variables? This will remove all database overrides.`)) {
      resetMutation.mutate({ category });
    }
  };

  const handleToggle = () => {
    if (!toggleField) return;
    const current = formValues[toggleField] === "true";
    setFormValues((prev) => ({ ...prev, [toggleField]: current ? "false" : "true" }));
  };

  const hasDbOverrides = settingsQuery.data
    ? Object.values(settingsQuery.data.sources).some((s) => s === "database")
    : false;

  const isEnabled = toggleField ? formValues[toggleField] === "true" : true;

  // Filter out toggle field from rendered fields
  const renderFields = fields.filter(f => f.key !== toggleField);

  return (
    <div className={`glass-panel p-6 space-y-5 ${!isEnabled && toggleField ? "opacity-70" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accentClass ?? "bg-primary/15"}`}>
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
              {toggleField && (
                <button
                  onClick={handleToggle}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold transition-colors ${
                    isEnabled
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {isEnabled ? (
                    <>
                      <ToggleRight className="h-3 w-3" />
                      ENABLED
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-3 w-3" />
                      DISABLED
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {hasDbOverrides && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset to Env
          </Button>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderFields.map((field) => (
          <div key={field.key} className={`space-y-1.5 ${field.fullWidth ? "md:col-span-2" : ""}`}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {field.label}
              </label>
              <SourceBadge source={settingsQuery.data?.sources[field.key]} />
            </div>
            <div className="relative">
              <Input
                type={
                  field.type === "password" && !showPasswords[field.key]
                    ? "password"
                    : "text"
                }
                placeholder={
                  field.type === "password" && settingsQuery.data?.hasPassword?.[field.key]
                    ? "••••••••  (unchanged)"
                    : field.placeholder
                }
                value={formValues[field.key] ?? ""}
                onChange={(e) =>
                  setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="bg-background/50 border-border/50 font-mono text-sm h-9 pr-9"
              />
              {field.type === "password" && (
                <button
                  type="button"
                  onClick={() =>
                    setShowPasswords((prev) => ({
                      ...prev,
                      [field.key]: !prev[field.key],
                    }))
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPasswords[field.key] ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
            {field.description && (
              <p className="text-[10px] text-muted-foreground/70">{field.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-mono ${
            testResult.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">{testResult.message}</span>
          {testResult.latencyMs > 0 && (
            <span className="text-xs opacity-70">{testResult.latencyMs}ms</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/30">
        <Button
          onClick={handleTest}
          disabled={isTesting}
          variant="outline"
          size="sm"
          className="border-primary/30 text-primary hover:bg-primary/10"
        >
          {isTesting ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <TestTube className="h-3.5 w-3.5 mr-1.5" />
          )}
          Test Connection
        </Button>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Connection Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Wazuh Manager, Indexer, LLM, and Splunk ES connections. Settings saved here override environment variables without requiring a restart.
        </p>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">Priority order:</strong> Database overrides take precedence over environment variables, which take precedence over defaults.
          </p>
          <p>
            Passwords and API keys are <strong className="text-foreground">AES-256 encrypted</strong> at rest. Use <strong className="text-foreground">Test Connection</strong> to validate credentials before saving.
          </p>
        </div>
      </div>

      {/* Wazuh Manager */}
      <ConnectionPanel
        category="wazuh_manager"
        title="Wazuh Manager"
        description="REST API connection for agent management, alerts, and system data"
        icon={<Shield className="h-5 w-5 text-primary" />}
        fields={[
          { key: "host", label: "Host", placeholder: "localhost" },
          { key: "port", label: "Port", placeholder: "55000", type: "number" },
          { key: "user", label: "Username", placeholder: "wazuh-wui" },
          { key: "pass", label: "Password", placeholder: "Enter password", type: "password" },
        ]}
      />

      {/* Wazuh Indexer */}
      <ConnectionPanel
        category="wazuh_indexer"
        title="Wazuh Indexer"
        description="OpenSearch/Elasticsearch connection for alert search, aggregations, and analytics"
        icon={<Database className="h-5 w-5 text-primary" />}
        fields={[
          { key: "host", label: "Host", placeholder: "localhost" },
          { key: "port", label: "Port", placeholder: "9200", type: "number" },
          { key: "user", label: "Username", placeholder: "admin" },
          { key: "pass", label: "Password", placeholder: "Enter password", type: "password" },
          { key: "protocol", label: "Protocol", placeholder: "https" },
        ]}
      />

      {/* LLM / AI Engine */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-violet-400" />
          <h2 className="text-lg font-display font-semibold text-foreground">AI Engine</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 font-mono">
            LLM BACKEND
          </span>
        </div>
        <ConnectionPanel
          category="llm"
          title="Custom LLM Endpoint"
          description="Self-hosted OpenAI-compatible LLM (e.g., Nemotron3 Nano via llama.cpp / vLLM / Ollama). When enabled, Dang! routes queries here first with fallback to built-in."
          icon={<Brain className="h-5 w-5 text-violet-400" />}
          accentClass="bg-violet-500/15"
          toggleField="enabled"
          fields={[
            { key: "enabled", label: "Enabled", placeholder: "true", description: "Toggle managed by the header switch" },
            { key: "host", label: "Host", placeholder: "localhost", description: "Hostname of your LLM server (localhost if co-located)" },
            { key: "port", label: "Port", placeholder: "30000", type: "number", description: "Port the LLM server listens on" },
            { key: "model", label: "Model Name", placeholder: "unsloth/Nemotron-3-Nano-30B-A3B-GGUF", fullWidth: true, description: "Model identifier passed to the /v1/chat/completions endpoint" },
            { key: "protocol", label: "Protocol", placeholder: "http", description: "http or https — most local servers use http" },
            { key: "api_key", label: "API Key (optional)", placeholder: "sk-...", type: "password", description: "Bearer token if your LLM server requires authentication" },
          ]}
        />
      </div>

      {/* Splunk ES Mission Control */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-4">
          <Ticket className="h-4 w-4 text-emerald-400" />
          <h2 className="text-lg font-display font-semibold text-foreground">Incident Management</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
            SPLUNK ES
          </span>
        </div>
        <ConnectionPanel
          category="splunk"
          title="Splunk Enterprise Security"
          description="HTTP Event Collector (HEC) integration for pushing triage reports as notable events to Splunk ES Mission Control. Requires admin role to create tickets."
          icon={<Ticket className="h-5 w-5 text-emerald-400" />}
          accentClass="bg-emerald-500/15"
          toggleField="enabled"
          fields={[
            { key: "enabled", label: "Enabled", placeholder: "true", description: "Toggle managed by the header switch" },
            { key: "host", label: "Splunk Host", placeholder: "localhost", description: "Hostname of your Splunk ES instance (localhost if co-located)" },
            { key: "port", label: "Web UI Port", placeholder: "8000", type: "number", description: "Splunk web interface port" },
            { key: "hec_port", label: "HEC Port", placeholder: "8088", type: "number", description: "HTTP Event Collector listener port" },
            { key: "hec_token", label: "HEC Token", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", type: "password", description: "HEC authentication token (UUID format)" },
            { key: "protocol", label: "Protocol", placeholder: "https", description: "https (default) or http for non-TLS setups" },
          ]}
        />
      </div>
    </div>
  );
}
