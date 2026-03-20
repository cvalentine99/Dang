import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const authMode = trpc.localAuth.authMode.useQuery();
  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      toast.success("Signed in successfully");
      navigate("/");
      // Force a full page reload to refresh auth state
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Login failed");
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Please enter both username and password");
      return;
    }
    setIsLoading(true);
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[oklch(0.08_0.005_260)] relative overflow-hidden">
      {/* Grid pattern background */}
      <div className="absolute inset-0 grid-pattern opacity-50" />

      {/* Glow orbs — gold and cyan */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[oklch(0.769_0.108_85.805)] opacity-[0.06] blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[oklch(0.75_0.15_195)] opacity-[0.04] blur-[100px]" />

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.769_0.108_85.805)] to-[oklch(0.705_0.213_47.604)] flex items-center justify-center shadow-lg shadow-[oklch(0.769_0.108_85.805/30%)]">
              <svg className="w-7 h-7 text-[oklch(0.08_0.005_260)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text font-[Inter]">
                Dang<span className="text-[oklch(0.769_0.108_85.805)]">!</span>
              </h1>
              <p className="text-xs text-[oklch(0.6_0.01_260)] tracking-wider uppercase">SIEM Platform</p>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <div className="glass-card gold-accent-top rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-[oklch(0.95_0.005_85)] mb-1 font-[Inter]">
            Sign In
          </h2>
          <p className="text-sm text-[oklch(0.6_0.01_260)] mb-6">
            Enter your credentials to access the SOC Console
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[oklch(0.75_0.01_260)] mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="analyst"
                autoComplete="username"
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg bg-[oklch(0.1_0.005_260)] border border-[oklch(1_0_0/8%)] text-[oklch(0.95_0.005_85)] placeholder-[oklch(0.4_0.01_260)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.769_0.108_85.805/40%)] focus:border-[oklch(0.769_0.108_85.805/50%)] transition-all font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[oklch(0.75_0.01_260)] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-lg bg-[oklch(0.1_0.005_260)] border border-[oklch(1_0_0/8%)] text-[oklch(0.95_0.005_85)] placeholder-[oklch(0.4_0.01_260)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.769_0.108_85.805/40%)] focus:border-[oklch(0.769_0.108_85.805/50%)] transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[oklch(0.769_0.108_85.805)] to-[oklch(0.705_0.213_47.604)] text-[oklch(0.08_0.005_260)] font-semibold text-sm hover:from-[oklch(0.8_0.12_85.805)] hover:to-[oklch(0.75_0.22_47.604)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.769_0.108_85.805/50%)] disabled:opacity-50 disabled:cursor-not-allowed transition-all gold-glow"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Register link */}
          {authMode.data?.registrationOpen && (
            <div className="mt-6 pt-5 border-t border-[oklch(1_0_0/8%)] text-center">
              <p className="text-sm text-[oklch(0.6_0.01_260)]">
                Don't have an account?{" "}
                <button
                  onClick={() => navigate("/register")}
                  className="text-[oklch(0.769_0.108_85.805)] hover:text-[oklch(0.85_0.12_85.805)] font-medium transition-colors"
                >
                  Create one
                </button>
              </p>
              {authMode.data?.isFirstUser && (
                <p className="text-xs text-[oklch(0.75_0.15_195)] mt-2">
                  First user registered will be granted admin privileges
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[oklch(0.4_0.01_260)] mt-6">
          Dang! SIEM — Security Operations Platform
        </p>
      </div>
    </div>
  );
}
