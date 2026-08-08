"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/libsupabaseClient";
import { iconTone } from "@/lib/ui-accent";
import {
  BarChart3,
  BedDouble,
  Building2,
  ClipboardList,
  HandCoins,
  House,
  Menu,
  RefreshCw,
  X,
} from "lucide-react";
import { SandboxModeProvider, useSandboxMode } from "@/components/sandbox-mode-provider";
import { AppFeedbackProvider, useAppFeedback } from "@/components/app-feedback-provider";
import BrandLoader from "@/components/ui/brand-loader";
import { readDemoProfileSession, writeDemoProfileSession } from "@/lib/demo-auth";
import { normalizeUserProfileRole } from "@/lib/user-profile-role";
import { SupabaseSessionHydratedProvider, useSupabaseSessionHydrated } from "@/components/supabase-session-ready";
import { emitCloudDataResync } from "@/lib/cloud-resync";
import { getSupabaseUserSafe, refreshSupabaseSessionSafe } from "@/lib/supabase-auth-api";
import { checkSupabaseReachable } from "@/lib/supabase-connectivity";

type ThemeMode = "light" | "dark";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: House },
  { label: "Penghuni", href: "/penghuni", icon: BedDouble },
  { label: "Kamar", href: "/kamar", icon: Building2 },
  { label: "Finance", href: "/finance", icon: HandCoins },
  { label: "Laporan", href: "/laporan", icon: BarChart3 },
  { label: "Master", href: "/master", icon: ClipboardList },
];

function formatDate(date: Date) {
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function DashboardShellInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionHydrated = useSupabaseSessionHydrated();
  const { toast } = useAppFeedback();
  const { localDemoMode } = useSandboxMode();
  const router = useRouter();
  const pathname = usePathname();
  const [theme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const savedTheme = localStorage.getItem("second-room-theme");
    return savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : "light";
  });
  /** null until mount — avoids SSR/client hydration mismatch on clock text */
  const [now, setNow] = useState<Date | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hardRefreshLoading, setHardRefreshLoading] = useState(false);
  const [profileName, setProfileName] = useState("User");
  const [profileRole, setProfileRole] = useState("staff");
  const navItemsScoped = useMemo(() => {
    const role = normalizeUserProfileRole(profileRole);
    if (role === "owner") return navItems.filter((n) => n.href === "/dashboard");
    if (role !== "super_admin" && role !== "manager") return navItems.filter((n) => n.href !== "/master");
    return navItems;
  }, [profileRole]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (localDemoMode) return;
    let cancelled = false;
    void checkSupabaseReachable().then((result) => {
      if (!cancelled && !result.ok) {
        toast(result.message, "error", "top");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, toast]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!sessionHydrated) return;
      if (localDemoMode) {
        const demo = readDemoProfileSession();
        if (demo) {
          setProfileName(demo.nama || demo.email || "User");
          setProfileRole(normalizeUserProfileRole(demo.role));
        } else {
          setProfileName("User");
          setProfileRole("staff");
        }
        return;
      }
      const user = await getSupabaseUserSafe();

      if (!user) {
        return;
      }

      let data: Record<string, unknown> | null = null;
      try {
        const profileRes = await supabase
          .from("user_profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .maybeSingle();
        data = profileRes.data as Record<string, unknown> | null;
      } catch {
        return;
      }

      const record = data as Record<string, unknown> | null;
      const fullName = String(record?.full_name ?? "").trim();
      setProfileName(fullName || user.email || "User");
      setProfileRole(normalizeUserProfileRole(record?.role));
    };

    void loadProfile();
  }, [localDemoMode, sessionHydrated]);

  const isDark = theme === "dark";

  const isOwnerDashboard =
    pathname === "/dashboard" &&
    normalizeUserProfileRole(profileRole) === "owner";

  const wrapperThemeClass = useMemo(
    () =>
      isDark
        ? "bg-[#121327] text-[#ecebff]"
        : "bg-[#f5f6ff] text-[#1f1b42]",
    [isDark]
  );

  const profileInitials = useMemo(() => {
    const words = profileName
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) {
      return "U";
    }
    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }, [profileName]);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

  const handleLogout = async () => {
    writeDemoProfileSession(null);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  /** Setelah semua hook: tab laporan cetak tanpa chrome (print). */
  if (pathname === "/laporan/cetak") {
    return <div className="safe-cetak-wrap bg-[#f5f6ff] text-[#1f1b42]">{children}</div>;
  }

  return (
    <div className={`brand-theme min-h-screen ${wrapperThemeClass} ${isDark ? "dark" : ""}`}>
      <div className="flex min-h-screen">
        <aside
          className={`relative hidden w-72 border-r safe-aside-lg lg:flex lg:flex-col ${
            isDark
              ? "border-[#2d315a] bg-[#16183a]"
              : "border-[#d8defc] bg-[#eef2ff]"
          }`}
        >
          <div
            className={`pointer-events-none absolute inset-0 ${
              isDark
                ? "bg-[radial-gradient(circle_at_10%_16%,rgba(167,139,250,0.2),transparent_42%),radial-gradient(circle_at_85%_14%,rgba(59,130,246,0.15),transparent_45%),radial-gradient(circle_at_70%_82%,rgba(109,40,217,0.15),transparent_40%)]"
                : "bg-[radial-gradient(circle_at_10%_16%,rgba(167,139,250,0.3),transparent_42%),radial-gradient(circle_at_85%_14%,rgba(59,130,246,0.23),transparent_45%),radial-gradient(circle_at_70%_82%,rgba(109,40,217,0.23),transparent_40%)]"
            }`}
          />
          <div
            className={`pointer-events-none absolute inset-0 ${
              isDark
                ? "opacity-90 [background:linear-gradient(145deg,rgba(11,10,29,0.66)_0%,rgba(36,20,74,0.48)_38%,rgba(16,32,88,0.42)_100%)]"
                : "opacity-70 [background:linear-gradient(145deg,rgba(30,27,75,0.24)_0%,rgba(76,29,149,0.16)_38%,rgba(30,64,175,0.12)_100%)]"
            }`}
          />
          <div className="relative z-10">
          <div className="mb-10 rounded-3xl border border-[#c8d3ff] bg-gradient-to-br from-[#ffffff] to-[#eef2ff] p-4 text-[#33407d] shadow-[0_12px_30px_-18px_rgba(77,109,255,0.45)]">
            <div className="flex items-center justify-center px-2 py-2">
              <Image
                src="/roomcheck-logo-transparent.png"
                alt="RoomCheck logo"
                width={210}
                height={84}
                className="h-auto w-[185px] object-contain"
                priority
              />
            </div>
            <h2 className="mt-3 text-center text-lg font-semibold text-[#3f4f9d]">Your Application Control</h2>
            <p className="mt-2 text-center text-sm text-[#5f72c2]">
              Kelola Cerdas Kos Berkelas
            </p>
          </div>

          <nav className="space-y-2">
            {navItemsScoped.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const iconClass = active
                ? "text-[#eef3ff]"
                : isDark
                ? "text-[#cbd6ff]"
                : iconTone.brand;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] text-[#eef3ff]"
                      : isDark
                      ? "text-[#cbd6ff] hover:bg-[#23294f]"
                      : "text-[#3f4f9d] hover:bg-[#e9eeff]"
                  }`}
                >
                  <Icon size={16} className={iconClass} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          </div>
        </aside>
        {mobileNavOpen ? (
          <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              className="btn-flat absolute inset-0 bg-black/55"
              aria-label="Tutup menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside
              className={`relative z-10 h-full w-[18rem] border-r safe-drawer-panel ${
                isDark ? "border-[#2d315a] bg-[#16183a]" : "border-[#d8defc] bg-[#eef2ff]"
              }`}
            >
              <div
                className={`pointer-events-none absolute inset-0 ${
                  isDark
                    ? "bg-[radial-gradient(circle_at_10%_16%,rgba(167,139,250,0.2),transparent_42%),radial-gradient(circle_at_85%_14%,rgba(59,130,246,0.15),transparent_45%),radial-gradient(circle_at_70%_82%,rgba(109,40,217,0.15),transparent_40%)]"
                    : "bg-[radial-gradient(circle_at_10%_16%,rgba(167,139,250,0.3),transparent_42%),radial-gradient(circle_at_85%_14%,rgba(59,130,246,0.23),transparent_45%),radial-gradient(circle_at_70%_82%,rgba(109,40,217,0.23),transparent_40%)]"
                }`}
              />
              <div
                className={`pointer-events-none absolute inset-0 ${
                  isDark
                    ? "opacity-90 [background:linear-gradient(145deg,rgba(11,10,29,0.66)_0%,rgba(36,20,74,0.48)_38%,rgba(16,32,88,0.42)_100%)]"
                    : "opacity-70 [background:linear-gradient(145deg,rgba(30,27,75,0.24)_0%,rgba(76,29,149,0.16)_38%,rgba(30,64,175,0.12)_100%)]"
                }`}
              />
              <div className="relative z-10">
              <div className="mb-6 flex items-center justify-between">
                <p className={`text-sm font-semibold ${isDark ? "text-[#dbe3ff]" : "text-[#3f4f9d]"}`}>Menu</p>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className={`btn-tactile btn-tactile-soft rounded-full p-1.5 ${isDark ? "text-[#cbd6ff] hover:bg-[#23294f]" : "text-[#3f4f9d] hover:bg-[#e9eeff]"}`}
                  aria-label="Tutup menu navigasi"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="space-y-2">
                {navItemsScoped.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  const iconClass = active
                    ? "text-[#eef3ff]"
                    : isDark
                    ? "text-[#cbd6ff]"
                    : iconTone.brand;
                  return (
                    <Link
                      key={`mobile-${item.label}`}
                      href={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                        active
                          ? "bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] text-[#eef3ff]"
                          : isDark
                          ? "text-[#cbd6ff] hover:bg-[#23294f]"
                          : "text-[#3f4f9d] hover:bg-[#e9eeff]"
                      }`}
                    >
                      <Icon size={16} className={iconClass} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              </div>
            </aside>
          </div>
        ) : null}

        <div
          className={`flex min-h-screen flex-1 flex-col ${
            isOwnerDashboard ? "relative isolate overflow-hidden" : ""
          }`}
        >
          {isOwnerDashboard ? (
            <>
              <div
                className={`pointer-events-none absolute inset-0 -z-10 ${
                  isDark ? "bg-[#14182e]" : "bg-gradient-to-br from-[#e8ebff] via-[#ebe4ff] to-[#dfe8ff]"
                }`}
                aria-hidden
              />
              <div
                className={`pointer-events-none absolute inset-0 -z-10 ${
                  isDark
                    ? "bg-[radial-gradient(circle_at_18%_0%,rgba(109,50,255,0.32),transparent_46%),radial-gradient(circle_at_92%_18%,rgba(77,109,255,0.28),transparent_52%),radial-gradient(circle_at_72%_88%,rgba(124,58,237,0.22),transparent_46%)]"
                    : "bg-[radial-gradient(circle_at_12%_0%,rgba(109,50,255,0.22),transparent_44%),radial-gradient(circle_at_90%_10%,rgba(77,109,255,0.2),transparent_50%),radial-gradient(circle_at_70%_92%,rgba(109,40,217,0.16),transparent_42%)]"
                }`}
                aria-hidden
              />
              <div
                className={`pointer-events-none absolute inset-0 -z-10 opacity-90 [background:linear-gradient(155deg,${
                  isDark
                    ? "rgba(22,26,52,0.85)_0%,rgba(109,50,255,0.22)_42%,rgba(77,109,255,0.2)_100%"
                    : "rgba(255,255,255,0.5)_0%,rgba(237,229,255,0.72)_42%,rgba(222,235,255,0.82)_100%"
                })]`}
                aria-hidden
              />
            </>
          ) : null}
          {!mobileNavOpen ? (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className={`btn-tactile btn-tactile-soft safe-fab-bl fixed z-[85] inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] lg:hidden ${
                isDark
                  ? "border-[#4b5894] bg-[#202a52] text-[#d6e0ff]"
                  : "border-[#c6d2ff] bg-white text-[#4457a8]"
              }`}
              aria-label="Buka menu navigasi"
            >
              <Menu size={14} />
              Menu
            </button>
          ) : null}
          <header
            className={`safe-pt-header safe-x-md sticky top-0 z-20 flex items-center justify-between border-b backdrop-blur pb-4 ${
              isOwnerDashboard
                ? isDark
                  ? "border-[#3f3b72]/55 bg-[#181c36]/72"
                  : "border-[#c9c2ff]/45 bg-[#f7f6ff]/55"
                : isDark
                  ? "border-[#2d315a] bg-[#141831]/85"
                  : "border-[#d8defc] bg-[#f5f6ff]/85"
            }`}
          >
            <div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className={`btn-tactile btn-tactile-soft mb-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] lg:hidden ${
                  isDark
                    ? "border-[#3e477c] bg-[#1f2546] text-[#b8c6ff]"
                    : "border-[#d3dbff] bg-[#f8f9ff] text-[#4a5ba4]"
                }`}
              >
                <Menu size={12} />
                Menu
              </button>
              <p
                className={`text-sm font-medium ${
                  isDark ? "text-[#d6ddff]" : "text-[#5161a8]"
                }`}
              >
                {now ? formatDate(now) : "\u00A0"}
              </p>
              <p className={isDark ? "text-xs text-[#a9b6ee]" : "text-xs text-[#7382c3]"}>
                {now ? now.toLocaleTimeString("id-ID") : "\u00A0"}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {!localDemoMode ? (
                <button
                  type="button"
                  disabled={hardRefreshLoading}
                  title="Hard refresh — muat ulang sesi dan data dari server"
                  onClick={() => {
                    void (async () => {
                      setHardRefreshLoading(true);
                      try {
                        await refreshSupabaseSessionSafe();
                        emitCloudDataResync();
                        await new Promise((resolve) => {
                          window.setTimeout(resolve, 700);
                        });
                        toast("Refresh sukses", "success", "top");
                      } finally {
                        setHardRefreshLoading(false);
                      }
                    })();
                  }}
                  className={`btn-tactile btn-tactile-soft inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition sm:text-[11px] disabled:pointer-events-none disabled:opacity-60 ${
                    isDark
                      ? "border-[#5560a8] bg-[#232c58] text-[#d8e0ff] hover:bg-[#2c3770]"
                      : "border-[#b8c4ff] bg-white text-[#4a54a8] hover:bg-[#eef1ff]"
                  }`}
                >
                  <RefreshCw
                    size={13}
                    strokeWidth={2.25}
                    className={`shrink-0 opacity-95 ${hardRefreshLoading ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                  HARD REFRESH
                </button>
              ) : null}
              <p className="hidden bg-gradient-to-r from-[#4d6dff] via-[#6d32ff] to-[#15c57a] bg-clip-text text-[10px] font-extrabold uppercase tracking-[0.22em] text-transparent md:block md:text-[11px]">
                SECOND ROOM KOST MANAGEMENT
              </p>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className={`btn-tactile btn-tactile-soft flex items-center gap-2.5 rounded-2xl border px-2.5 py-1.5 text-left shadow-sm transition ${
                    isDark
                      ? "border-[#5560a8] bg-[#1f2546]/90 text-[#eef2ff] hover:bg-[#232c58]"
                      : "border-[#c6d2ff] bg-white/95 text-[#1f1b42] hover:bg-[#eef1ff]"
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4d6dff] to-[#6d32ff] text-[11px] font-bold text-[#eef3ff]">
                    {profileInitials}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-xs font-semibold">{profileName}</p>
                    <p className={isDark ? "text-[11px] text-[#b5c4ff]" : "text-[11px] text-[#6f7fc2]"}>
                      {profileRole}
                    </p>
                  </div>
                </button>

                {profileMenuOpen ? (
                  <div
                    className={`absolute right-0 mt-2 w-44 rounded-2xl border p-2 shadow-lg ${
                      isDark
                        ? "border-[#3b4270] bg-[#1a1f3a]"
                        : "border-[#d8defc] bg-white"
                    }`}
                  >
                    <Link
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className={`block rounded-xl px-3 py-2 text-sm ${
                        isDark
                          ? "text-[#e6ecff] hover:bg-[#262d52]"
                          : "text-[#3f4f9d] hover:bg-[#eff3ff]"
                      }`}
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={`btn-tactile mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${
                        isDark
                          ? "text-[#f2c9ff] hover:bg-[#262d52]"
                          : "text-[#7d3cff] hover:bg-[#eff3ff]"
                      }`}
                    >
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="safe-x-md min-w-0 flex-1 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:py-6 sm:pb-6">
            {children}
          </main>
          <footer className={`safe-x-md safe-pb-footer ${isOwnerDashboard ? "relative" : ""}`}>
            <p className="text-right text-[11px] font-medium tracking-[0.12em] text-[#5d6fc0] dark:text-[#aebcff]">
              Version {appVersion}
            </p>
          </footer>
        </div>
      </div>

      {hardRefreshLoading ? <BrandLoader variant="overlay" size="lg" label="Memuat ulang…" /> : null}
    </div>
  );
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SandboxModeProvider>
      <AppFeedbackProvider>
        <SupabaseSessionHydratedProvider>
          <DashboardShellInner>{children}</DashboardShellInner>
        </SupabaseSessionHydratedProvider>
      </AppFeedbackProvider>
    </SandboxModeProvider>
  );
}
