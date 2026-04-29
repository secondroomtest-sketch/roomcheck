"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/libsupabaseClient";
import { iconTone } from "@/lib/ui-accent";
import { BarChart3, BedDouble, Building2, ClipboardList, HandCoins, House } from "lucide-react";
import { SandboxModeProvider, useSandboxMode } from "@/components/sandbox-mode-provider";
import { AppFeedbackProvider } from "@/components/app-feedback-provider";
import { readDemoProfileSession, writeDemoProfileSession } from "@/lib/demo-auth";

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
  const [profileName, setProfileName] = useState("User");
  const [profileRole, setProfileRole] = useState("staff");
  const navItemsScoped = useMemo(() => {
    const role = String(profileRole ?? "").trim().toLowerCase();
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
    const loadProfile = async () => {
      if (localDemoMode) {
        const demo = readDemoProfileSession();
        if (demo) {
          setProfileName(demo.nama || demo.email || "User Demo");
          setProfileRole(demo.role || "staff");
        } else {
          setProfileName("User Demo");
          setProfileRole("staff");
        }
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { data } = await supabase
        .from("user_profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();

      const record = data as Record<string, unknown> | null;
      const fullName = String(record?.full_name ?? "").trim();
      const role = String(record?.role ?? "").trim();

      setProfileName(fullName || user.email || "User");
      setProfileRole(role || "staff");
    };

    void loadProfile();
  }, [localDemoMode]);

  const isDark = theme === "dark";

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
    return <div className="min-h-screen bg-[#f5f6ff] text-[#1f1b42]">{children}</div>;
  }

  return (
    <div className={`brand-theme min-h-screen ${wrapperThemeClass} ${isDark ? "dark" : ""}`}>
      <div className="flex min-h-screen">
        <aside
          className={`hidden w-72 border-r p-6 lg:flex lg:flex-col ${
            isDark
              ? "border-[#2d315a] bg-[#171a33]"
              : "border-[#d8defc] bg-[#f8f9ff]"
          }`}
        >
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
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header
            className={`sticky top-0 z-20 flex items-center justify-between border-b px-5 py-4 backdrop-blur sm:px-8 ${
              isDark
                ? "border-[#2d315a] bg-[#141831]/85"
                : "border-[#d8defc] bg-[#f5f6ff]/85"
            }`}
          >
            <div>
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
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] ${
                  isDark
                    ? "border-[#3e477c] bg-[#1f2546] text-[#b8c6ff]"
                    : "border-[#d3dbff] bg-[#f8f9ff] text-[#4a5ba4]"
                }`}
              >
                Cloud Mode: Supabase
              </span>
              <p className="bg-gradient-to-r from-[#4d6dff] via-[#6d32ff] to-[#15c57a] bg-clip-text text-[10px] font-extrabold uppercase tracking-[0.22em] text-transparent sm:text-[11px]">
                SECOND ROOM KOST MANAGEMENT
              </p>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className={`flex items-center gap-3 text-left ${
                    isDark ? "text-[#eef2ff]" : "text-[#1f1b42]"
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#4d6dff] to-[#6d32ff] text-[11px] font-bold text-[#eef3ff]">
                    {profileInitials}
                  </div>
                  <div className="leading-tight">
                    <p className="text-xs font-semibold">{profileName}</p>
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
                      className={`mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${
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

          <main className="flex-1 px-5 py-6 sm:px-8">{children}</main>
          <footer className="px-5 pb-4 sm:px-8">
            <p className="text-right text-[11px] font-medium tracking-[0.12em] text-[#5d6fc0] dark:text-[#aebcff]">
              Version {appVersion}
            </p>
          </footer>
        </div>
      </div>
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
        <DashboardShellInner>{children}</DashboardShellInner>
      </AppFeedbackProvider>
    </SandboxModeProvider>
  );
}
