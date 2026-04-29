"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/libsupabaseClient";
import { Mail, Save, User, UserRound } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY } from "@/lib/sandbox-storage";

type ProfileForm = {
  fullName: string;
  email: string;
  noHp: string;
};

export default function ProfilePage() {
  const { localDemoMode } = useSandboxMode();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [sandboxRev, setSandboxRev] = useState(0);
  const [userId, setUserId] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [form, setForm] = useState<ProfileForm>({
    fullName: "",
    email: "",
    noHp: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const fn = () => setSandboxRev((n) => n + 1);
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-sandbox-updated", fn as EventListener);
    return () => window.removeEventListener("secondroom-sandbox-updated", fn as EventListener);
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      if (localDemoMode) {
        setIsLoading(true);
        setErrorMessage("");
        const localOnly = readSandboxJson<Partial<ProfileForm>>(SB_KEY.profile, {});
        setForm({
          fullName: localOnly.fullName ?? "",
          email: localOnly.email ?? "",
          noHp: localOnly.noHp ?? "",
        });
        setUserId("");
        setInitialEmail(localOnly.email ?? "");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push("/login");
        router.refresh();
        return;
      }

      setUserId(user.id);
      const userEmail = user.email ?? "";
      setInitialEmail(userEmail);

      const { data: profileRow, error: profileError } = await supabase
        .from("user_profiles")
        .select("full_name,email,no_hp")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setErrorMessage(profileError.message);
      }

      const baseForm = {
        fullName: String((profileRow as Record<string, unknown> | null)?.full_name ?? ""),
        email: String((profileRow as Record<string, unknown> | null)?.email ?? userEmail),
        noHp: String((profileRow as Record<string, unknown> | null)?.no_hp ?? ""),
      };
      const localOverlay = readSandboxJson<Partial<ProfileForm>>(SB_KEY.profile, {});
      setForm({
        fullName: localOverlay.fullName ?? baseForm.fullName,
        email: localOverlay.email ?? baseForm.email,
        noHp: localOverlay.noHp ?? baseForm.noHp,
      });

      setIsLoading(false);
    };

    void loadProfile();
  }, [router, localDemoMode, sandboxRev]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId && !localDemoMode) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (localDemoMode) {
      writeSandboxJson(SB_KEY.profile, {
        fullName: form.fullName,
        email: form.email,
        noHp: form.noHp,
      });
      setSuccessMessage("Profil disimpan di browser (demo lokal), tidak ke Supabase.");
      toast("Profil berhasil disimpan (demo lokal).", "success");
      setIsSubmitting(false);
      return;
    }

    if (!userId) return;

    if (form.email && form.email !== initialEmail) {
      const { error: updateEmailError } = await supabase.auth.updateUser({
        email: form.email,
      });

      if (updateEmailError) {
        setErrorMessage(updateEmailError.message);
        toast(updateEmailError.message, "error");
        setIsSubmitting(false);
        return;
      }
    }

    const { error: upsertError } = await supabase.from("user_profiles").upsert(
      {
        id: userId,
        full_name: form.fullName,
        email: form.email,
        no_hp: form.noHp,
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      setErrorMessage(upsertError.message);
      toast(upsertError.message, "error");
      setIsSubmitting(false);
      return;
    }

    setInitialEmail(form.email);
    setSuccessMessage("Profile berhasil diperbarui.");
    toast("Profil berhasil diperbarui.", "success");
    setIsSubmitting(false);
  };

  return (
    <section className="mx-auto w-full max-w-2xl">
      <article className="rounded-[2rem] border border-[#d6ddff] bg-white/90 p-6 shadow-[0_20px_55px_-35px_rgba(63,79,157,0.4)] dark:border-[#4f5b99] dark:bg-[#1a2144]/95">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.28em] text-[#8b6d48] dark:text-[#cfb089]">
            Profile
          </p>
          <SectionTitleWithIcon
            icon={UserRound}
            title="Pengaturan Akun"
            iconClassName={iconTone.info}
            className="mt-2 text-2xl text-[#2c2218] dark:text-[#f5e8d4]"
          />
          <p className="mt-2 text-sm text-[#7f6344] dark:text-[#b79a78]">
            Update data personal akun Anda.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-[#7f6344] dark:text-[#b79a78]">Memuat profile...</p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-[#8b6d48]">
                Nama
              </label>
              <div className="relative">
                <User size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconTone.brand}`} />
              <input
                required
                value={form.fullName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fullName: event.target.value }))
                }
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-9 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                placeholder="Nama lengkap"
              />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-[#8b6d48]">
                Email
              </label>
              <div className="relative">
                <Mail size={14} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${iconTone.brand}`} />
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-9 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                placeholder="email@domain.com"
              />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-[#8b6d48]">
                No HP
              </label>
              <input
                value={form.noHp}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, noHp: event.target.value }))
                }
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                placeholder="08xxxxxxxxxx"
              />
            </div>

            {errorMessage ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            ) : null}
            {successMessage ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {successMessage}
              </p>
            ) : null}

            <ActionButtonWithIcon
              icon={Save}
              type="submit"
              disabled={isSubmitting}
              iconClassName={iconTone.success}
              label={
                localDemoMode
                  ? isSubmitting
                    ? "Menyimpan..."
                    : "Simpan (demo lokal)"
                  : isSubmitting
                    ? "Updating..."
                    : "Update Profile"
              }
              className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-7 py-2.5 text-sm font-semibold tracking-[0.14em] text-[#eef3ff] disabled:opacity-70"
            />
          </form>
        )}
      </article>
    </section>
  );
}
