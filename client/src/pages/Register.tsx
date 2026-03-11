import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Register() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const authMode = trpc.localAuth.authMode.useQuery();
  const registerMutation = trpc.localAuth.register.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.isFirstUser
          ? "Admin account created! You are the first user."
          : "Account created successfully!"
      );
      // Force a full page reload to refresh auth state
      window.location.href = "/";
    },
    onError: (err) => {
      toast.error(err.message || "Registration failed");
      setIsLoading(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      toast.error("Username and password are required");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    registerMutation.mutate({
      username: username.trim(),
      email: email.trim() || undefined,
      password,
    });
  };

  // Redirect if not in local auth mode
  if (authMode.data && authMode.data.mode !== "local") {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[oklch(0.13_0.02_286)] relative overflow-hidden">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(oklch(0.7 0.15 286) 1px, transparent 1px), linear-gradient(90deg, oklch(0.7 0.15 286) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Glow orbs */}
      <div className="absolute top-1/3 left-1/3 w-96 h-96 rounded-full bg-[oklch(0.4_0.15_286)] opacity-10 blur-[120px]" />
      <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full bg-[oklch(0.5_0.2_300)] opacity-8 blur-[100px]" />

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[oklch(0.6_0.2_286)] to-[oklch(0.5_0.25_300)] flex items-center justify-center shadow-lg shadow-[oklch(0.5_0.2_286/30%)]">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[oklch(0.95_0.01_286)] font-[Space_Grotesk]">
                Dang<span className="text-[oklch(0.7_0.2_286)]">!</span>
              </h1>
              <p className="text-xs text-[oklch(0.6_0.03_286)] tracking-wider uppercase">SIEM Platform</p>
            </div>
          </div>
        </div>

        {/* Register Card */}
        <div className="rounded-2xl border border-[oklch(0.3_0.04_286/40%)] bg-[oklch(0.17_0.025_286/80%)] backdrop-blur-xl shadow-2xl shadow-black/40 p-8">
          <h2 className="text-xl font-semibold text-[oklch(0.93_0.005_286)] mb-1 font-[Space_Grotesk]">
            Create Account
          </h2>
          <p className="text-sm text-[oklch(0.6_0.03_286)] mb-1">
            Register a new analyst account
          </p>
          {authMode.data?.isFirstUser && (
            <div className="flex items-center gap-2 mt-2 mb-4 px-3 py-2 rounded-lg bg-[oklch(0.25_0.1_300/20%)] border border-[oklch(0.5_0.15_300/30%)]">
              <svg className="w-4 h-4 text-[oklch(0.7_0.15_300)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              <span className="text-xs text-[oklch(0.75_0.1_300)]">
                You are the first user — this account will have <strong>admin</strong> privileges
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[oklch(0.75_0.03_286)] mb-1.5">
                Username <span className="text-[oklch(0.6_0.2_0)]">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="analyst"
                autoComplete="username"
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg bg-[oklch(0.14_0.02_286)] border border-[oklch(0.3_0.04_286/40%)] text-[oklch(0.93_0.005_286)] placeholder-[oklch(0.45_0.02_286)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.6_0.2_286/50%)] focus:border-[oklch(0.5_0.15_286)] transition-all font-mono text-sm"
              />
              <p className="text-xs text-[oklch(0.5_0.02_286)] mt-1">
                Letters, numbers, underscores, dots, and hyphens only
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[oklch(0.75_0.03_286)] mb-1.5">
                Email <span className="text-[oklch(0.5_0.02_286)]">(optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@soc.local"
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-lg bg-[oklch(0.14_0.02_286)] border border-[oklch(0.3_0.04_286/40%)] text-[oklch(0.93_0.005_286)] placeholder-[oklch(0.45_0.02_286)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.6_0.2_286/50%)] focus:border-[oklch(0.5_0.15_286)] transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[oklch(0.75_0.03_286)] mb-1.5">
                Password <span className="text-[oklch(0.6_0.2_0)]">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-lg bg-[oklch(0.14_0.02_286)] border border-[oklch(0.3_0.04_286/40%)] text-[oklch(0.93_0.005_286)] placeholder-[oklch(0.45_0.02_286)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.6_0.2_286/50%)] focus:border-[oklch(0.5_0.15_286)] transition-all text-sm"
              />
              <p className="text-xs text-[oklch(0.5_0.02_286)] mt-1">
                Minimum 8 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[oklch(0.75_0.03_286)] mb-1.5">
                Confirm Password <span className="text-[oklch(0.6_0.2_0)]">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-lg bg-[oklch(0.14_0.02_286)] border border-[oklch(0.3_0.04_286/40%)] text-[oklch(0.93_0.005_286)] placeholder-[oklch(0.45_0.02_286)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.6_0.2_286/50%)] focus:border-[oklch(0.5_0.15_286)] transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[oklch(0.5_0.2_286)] to-[oklch(0.45_0.22_300)] text-white font-medium text-sm hover:from-[oklch(0.55_0.22_286)] hover:to-[oklch(0.5_0.24_300)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.6_0.2_286/50%)] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[oklch(0.4_0.2_286/30%)]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </span>
              ) : authMode.data?.isFirstUser ? (
                "Create Admin Account"
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          {/* Login link */}
          <div className="mt-6 pt-5 border-t border-[oklch(0.3_0.04_286/30%)] text-center">
            <p className="text-sm text-[oklch(0.6_0.03_286)]">
              Already have an account?{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-[oklch(0.7_0.2_286)] hover:text-[oklch(0.8_0.2_286)] font-medium transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[oklch(0.45_0.02_286)] mt-6">
          Dang! SIEM — Security Operations Platform
        </p>
      </div>
    </div>
  );
}
