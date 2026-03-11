import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Users,
  Shield,
  ShieldOff,
  UserCog,
  KeyRound,
  Ban,
  CheckCircle2,
  MoreVertical,
  Search,
  UserPlus,
  Crown,
  Clock,
  AlertTriangle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  isDisabled: number;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AdminUsers(): React.JSX.Element {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Dialogs
  const [roleDialog, setRoleDialog] = useState<{ user: UserRow; newRole: "admin" | "user" } | null>(null);
  const [passwordDialog, setPasswordDialog] = useState<UserRow | null>(null);
  const [disableDialog, setDisableDialog] = useState<{ user: UserRow; disable: boolean } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Stabilize search input for query
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeout = useMemo(() => {
    return (value: string) => {
      const id = setTimeout(() => {
        setDebouncedSearch(value);
        setPage(1);
      }, 300);
      return () => clearTimeout(id);
    };
  }, []);

  // Data fetching
  const usersQuery = trpc.adminUsers.list.useQuery(
    { page, pageSize: 50, search: debouncedSearch || undefined },
    { refetchOnWindowFocus: false }
  );

  // Mutations
  const updateRole = trpc.adminUsers.updateRole.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.userName}'s role changed to ${data.newRole}`);
      utils.adminUsers.list.invalidate();
      setRoleDialog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPassword = trpc.adminUsers.resetPassword.useMutation({
    onSuccess: (data) => {
      toast.success(`Password reset for ${data.userName}`);
      setPasswordDialog(null);
      setNewPassword("");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleDisabled = trpc.adminUsers.toggleDisabled.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.userName} ${data.isDisabled ? "disabled" : "enabled"}`);
      utils.adminUsers.list.invalidate();
      setDisableDialog(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Access check
  if (currentUser?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <GlassPanel className="p-8 max-w-md text-center">
          <Shield className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-muted-foreground">
            You need administrator privileges to access user management.
          </p>
        </GlassPanel>
      </div>
    );
  }

  const usersList = (usersQuery.data?.users ?? []) as UserRow[];
  const totalPages = usersQuery.data?.totalPages ?? 1;
  const total = usersQuery.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        subtitle={`${total} registered account${total !== 1 ? "s" : ""} — manage roles, passwords, and access`}
        onRefresh={() => usersQuery.refetch()}
        isLoading={usersQuery.isFetching}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchTimeout(e.target.value);
            }}
            className="pl-9 w-64 bg-secondary/50 border-border/50 text-sm"
          />
        </div>
      </PageHeader>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={total}
          color="oklch(0.789 0.154 211.53)"
        />
        <StatCard
          icon={Crown}
          label="Admins"
          value={usersList.filter((u) => u.role === "admin").length}
          color="oklch(0.541 0.281 293.009)"
        />
        <StatCard
          icon={CheckCircle2}
          label="Active"
          value={usersList.filter((u) => !u.isDisabled).length}
          color="oklch(0.765 0.177 163.223)"
        />
        <StatCard
          icon={Ban}
          label="Disabled"
          value={usersList.filter((u) => u.isDisabled).length}
          color="oklch(0.637 0.237 25.331)"
        />
      </div>

      {/* Users Table */}
      <GlassPanel className="p-0 overflow-hidden">
        {usersQuery.isLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground mt-3">Loading users...</p>
          </div>
        ) : usersList.length === 0 ? (
          <div className="p-8 text-center">
            <UserPlus className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {debouncedSearch ? "No users match your search" : "No users registered yet"}
            </p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto_auto] gap-4 px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground/70 border-b border-border/30 font-medium">
              <div className="w-10" />
              <div>User</div>
              <div>Email</div>
              <div className="text-center">Role</div>
              <div className="text-center">Status</div>
              <div className="text-center">Last Active</div>
              <div className="w-10" />
            </div>

            {/* Table Rows */}
            {usersList.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto_auto] gap-4 px-5 py-3 items-center border-b border-border/10 data-row transition-colors"
                >
                  {/* Avatar */}
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-xs font-medium shrink-0"
                    style={{
                      background: u.role === "admin"
                        ? "oklch(0.541 0.281 293.009 / 20%)"
                        : "oklch(0.25 0.03 286 / 60%)",
                      color: u.role === "admin"
                        ? "oklch(0.7 0.2 293)"
                        : "oklch(0.7 0.02 286)",
                    }}
                  >
                    {getInitials(u.name)}
                  </div>

                  {/* Name + OpenID */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {u.name || "Unnamed"}
                      </span>
                      {isSelf && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                          You
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground/60 font-mono truncate mt-0.5">
                      {u.openId}
                    </p>
                  </div>

                  {/* Email */}
                  <div className="text-sm text-muted-foreground truncate">
                    {u.email || "—"}
                  </div>

                  {/* Role Badge */}
                  <div className="text-center">
                    {u.role === "admin" ? (
                      <Badge
                        className="text-xs px-2 py-0.5"
                        style={{
                          background: "oklch(0.541 0.281 293.009 / 15%)",
                          borderColor: "oklch(0.541 0.281 293.009 / 30%)",
                          color: "oklch(0.7 0.2 293)",
                        }}
                      >
                        <Crown className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs px-2 py-0.5 border-border/50 text-muted-foreground"
                      >
                        User
                      </Badge>
                    )}
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    {u.isDisabled ? (
                      <Badge
                        className="text-xs px-2 py-0.5"
                        style={{
                          background: "oklch(0.637 0.237 25.331 / 15%)",
                          borderColor: "oklch(0.637 0.237 25.331 / 30%)",
                          color: "oklch(0.637 0.237 25.331)",
                        }}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    ) : (
                      <Badge
                        className="text-xs px-2 py-0.5"
                        style={{
                          background: "oklch(0.765 0.177 163.223 / 15%)",
                          borderColor: "oklch(0.765 0.177 163.223 / 30%)",
                          color: "oklch(0.765 0.177 163.223)",
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                  </div>

                  {/* Last Active */}
                  <div className="text-xs text-muted-foreground text-center whitespace-nowrap">
                    <Clock className="h-3 w-3 inline mr-1 opacity-50" />
                    {formatDate(u.lastSignedIn)}
                  </div>

                  {/* Actions */}
                  <div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52 bg-popover border-border"
                      >
                        {/* Role toggle */}
                        {u.role === "admin" ? (
                          <DropdownMenuItem
                            onClick={() => setRoleDialog({ user: u, newRole: "user" })}
                            disabled={isSelf}
                            className="text-sm"
                          >
                            <ShieldOff className="h-4 w-4 mr-2 text-muted-foreground" />
                            Demote to User
                            {isSelf && <span className="ml-auto text-xs text-muted-foreground">(self)</span>}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => setRoleDialog({ user: u, newRole: "admin" })}
                            className="text-sm"
                          >
                            <Shield className="h-4 w-4 mr-2 text-primary" />
                            Promote to Admin
                          </DropdownMenuItem>
                        )}

                        {/* Password reset — only for local auth users */}
                        {u.loginMethod === "local" && (
                          <DropdownMenuItem
                            onClick={() => setPasswordDialog(u)}
                            className="text-sm"
                          >
                            <KeyRound className="h-4 w-4 mr-2 text-muted-foreground" />
                            Reset Password
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        {/* Disable/Enable */}
                        {u.isDisabled ? (
                          <DropdownMenuItem
                            onClick={() => setDisableDialog({ user: u, disable: false })}
                            className="text-sm"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" style={{ color: "oklch(0.765 0.177 163.223)" }} />
                            Enable Account
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => setDisableDialog({ user: u, disable: true })}
                            disabled={isSelf}
                            className="text-sm text-destructive focus:text-destructive"
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Disable Account
                            {isSelf && <span className="ml-auto text-xs text-muted-foreground">(self)</span>}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/20">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-xs"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </GlassPanel>

      {/* ── Role Change Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!roleDialog} onOpenChange={() => setRoleDialog(null)}>
        <DialogContent className="glass-panel border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Change Role
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {roleDialog?.newRole === "admin" ? (
                <>
                  Promote <strong className="text-foreground">{roleDialog?.user.name}</strong> to{" "}
                  <strong className="text-primary">Admin</strong>? They will gain full management access.
                </>
              ) : (
                <>
                  Demote <strong className="text-foreground">{roleDialog?.user.name}</strong> to{" "}
                  <strong className="text-muted-foreground">User</strong>? They will lose admin privileges.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRoleDialog(null)} className="border-border/50">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (roleDialog) {
                  updateRole.mutate({ userId: roleDialog.user.id, role: roleDialog.newRole });
                }
              }}
              disabled={updateRole.isPending}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {updateRole.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Password Reset Dialog ──────────────────────────────────────────── */}
      <Dialog
        open={!!passwordDialog}
        onOpenChange={() => {
          setPasswordDialog(null);
          setNewPassword("");
        }}
      >
        <DialogContent className="glass-panel border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Set a new password for <strong className="text-foreground">{passwordDialog?.name}</strong>.
              They will need to use this password on their next login.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="password"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-secondary/50 border-border/50"
            />
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Password must be at least 8 characters
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPasswordDialog(null);
                setNewPassword("");
              }}
              className="border-border/50"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (passwordDialog) {
                  resetPassword.mutate({ userId: passwordDialog.id, newPassword });
                }
              }}
              disabled={resetPassword.isPending || newPassword.length < 8}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {resetPassword.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Disable/Enable Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!disableDialog} onOpenChange={() => setDisableDialog(null)}>
        <DialogContent className="glass-panel border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {disableDialog?.disable ? (
                <Ban className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle2 className="h-5 w-5" style={{ color: "oklch(0.765 0.177 163.223)" }} />
              )}
              {disableDialog?.disable ? "Disable Account" : "Enable Account"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {disableDialog?.disable ? (
                <>
                  Disable <strong className="text-foreground">{disableDialog?.user.name}</strong>?
                  They will be blocked from logging in until re-enabled.
                </>
              ) : (
                <>
                  Re-enable <strong className="text-foreground">{disableDialog?.user.name}</strong>?
                  They will be able to log in again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDisableDialog(null)} className="border-border/50">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (disableDialog) {
                  toggleDisabled.mutate({
                    userId: disableDialog.user.id,
                    isDisabled: disableDialog.disable,
                  });
                }
              }}
              disabled={toggleDisabled.isPending}
              variant={disableDialog?.disable ? "destructive" : "default"}
              className={disableDialog?.disable ? "" : "bg-primary hover:bg-primary/90 text-primary-foreground"}
            >
              {toggleDisabled.isPending
                ? "Processing..."
                : disableDialog?.disable
                  ? "Disable Account"
                  : "Enable Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
}): React.JSX.Element {
  return (
    <GlassPanel className="p-4">
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}20` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-display font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </GlassPanel>
  );
}
