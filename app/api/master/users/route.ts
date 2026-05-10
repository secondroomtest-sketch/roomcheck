import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getInternalLoginEmailDomain,
  isLegacyEmailLogin,
  isValidLoginUsername,
  sanitizeLoginUsername,
  usernameToAuthEmail,
} from "@/lib/internal-auth-email";

const ALLOWED_ROLES = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);

type BodyCreate = {
  nama: string;
  /** Login unik; email di Supabase Auth = username@{INTERNAL_DOMAIN} */
  username: string;
  noHp: string;
  password: string;
  role: string;
  aksesLokasi: string[];
  aksesBlok: string[];
};

type BodyPatch = {
  id: string;
  nama: string;
  /** Login baru: tanpa @ = username internal; dengan @ = alamat Auth penuh (akun email lama). */
  username: string;
  noHp: string;
  password?: string;
  role: string;
  aksesLokasi: string[];
  aksesBlok: string[];
};

function parseBearer(request: Request): string | null {
  const raw = request.headers.get("authorization") ?? "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function requireSuperAdmin(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: NextResponse.json({ error: "Konfigurasi server Supabase tidak lengkap." }, { status: 500 }) };
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await userClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String((profile as { role?: string } | null)?.role ?? "");
  if (role !== "super_admin") {
    return {
      error: NextResponse.json(
        {
          error:
            "Hanya Super Admin yang dapat membuat, mengedit, menghapus akun pengguna, dan mengatur password dari Master.",
        },
        { status: 403 }
      ),
    };
  }

  return { user, role };
}

function normalizeRole(role: string): string {
  const r = String(role ?? "").toLowerCase().trim();
  return ALLOWED_ROLES.has(r) ? r : "manager";
}

async function loadAllMasterScopeIds(admin: SupabaseClient): Promise<{
  allLokasiIds: string[];
  allBlokIds: string[];
}> {
  const [lokRes, blokRes] = await Promise.all([
    admin.from("master_lokasi").select("id"),
    admin.from("master_blok").select("id"),
  ]);
  return {
    allLokasiIds: (lokRes.data ?? []).map((r) => String((r as { id: string }).id)),
    allBlokIds: (blokRes.data ?? []).map((r) => String((r as { id: string }).id)),
  };
}

async function insertPasswordChangeAudit(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string;
    actorUserId: string;
    actorLabel: string;
    isSelfSubject: boolean;
  }
): Promise<void> {
  const detail = opts.isSelfSubject
    ? "Password pengguna ini diperbarui sendiri oleh akun tersebut lewat halaman Master (Super Admin)."
    : `Password diperbarui lewat halaman Master oleh admin (${opts.actorLabel}). Nilai password tidak disimpan dalam log.`;
  const { error } = await admin.from("password_change_log").insert({
    subject_user_id: opts.subjectUserId,
    actor_user_id: opts.actorUserId,
    source: "admin_master",
    detail,
  });
  if (error) {
    console.warn("[password_change_log]", error.message);
  }
}

function resolveLoginForPatch(
  loginFieldRaw: string,
  existingUsername: string | null,
  existingEmail: string | null
): { authEmail: string; usernameOut: string | null } | { error: string } {
  const loginField = String(loginFieldRaw ?? "").trim();
  if (!loginField) {
    return { error: "Username atau email login wajib diisi." };
  }

  const domain = getInternalLoginEmailDomain();

  if (loginField.includes("@")) {
    const authEmail = loginField.toLowerCase();
    if (authEmail.endsWith(`@${domain}`)) {
      const local = sanitizeLoginUsername(authEmail.slice(0, -(domain.length + 1)));
      if (!isValidLoginUsername(local)) {
        return { error: `Bagian sebelum @ harus 3–64 karakter (domain: @${domain}).` };
      }
      return { authEmail, usernameOut: local };
    }
    if (!isLegacyEmailLogin(authEmail, existingUsername)) {
      return {
        error:
          "Untuk akun berbasis username, isi hanya username (tanpa @). Alamat email penuh hanya untuk akun lama ber-email asli.",
      };
    }
    return { authEmail, usernameOut: null };
  }

  const u = sanitizeLoginUsername(loginField);
  if (!isValidLoginUsername(loginField)) {
    return { error: "Username wajib 3–64 karakter (huruf, angka, . _ -)." };
  }
  return { authEmail: usernameToAuthEmail(u), usernameOut: u };
}

export async function POST(request: Request) {
  const token = parseBearer(request);
  if (!token) {
    return NextResponse.json({ error: "Token tidak ada." }, { status: 401 });
  }

  const gate = await requireSuperAdmin(token);
  if ("error" in gate) return gate.error;

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role tidak tersedia.";
    return NextResponse.json(
      {
        error: `${msg} Tambahkan SUPABASE_SERVICE_ROLE_KEY di environment agar pembuatan akun dengan password berfungsi.`,
      },
      { status: 503 }
    );
  }

  let body: BodyCreate;
  try {
    body = (await request.json()) as BodyCreate;
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  const nama = String(body.nama ?? "").trim();
  const noHp = String(body.noHp ?? "").trim();
  const password = String(body.password ?? "");
  const role = normalizeRole(body.role);

  const username = sanitizeLoginUsername(String(body.username ?? ""));
  if (!nama || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Nama, username, dan password wajib. Password minimal 6 karakter." },
      { status: 400 }
    );
  }
  if (!isValidLoginUsername(String(body.username ?? ""))) {
    return NextResponse.json(
      { error: "Username wajib 3–64 karakter (huruf, angka, titik, garis bawah, tanda hubung)." },
      { status: 400 }
    );
  }

  if (role === "super_admin") {
    return NextResponse.json({ error: "Tidak dapat membuat super_admin lewat form ini." }, { status: 400 });
  }

  const { allLokasiIds, allBlokIds } = await loadAllMasterScopeIds(admin);

  let aksesLokasi: string[];
  let aksesBlok: string[];

  if (role === "supervisor" || role === "manager") {
    aksesLokasi = allLokasiIds;
    aksesBlok = allBlokIds;
  } else {
    aksesLokasi = Array.isArray(body.aksesLokasi) ? body.aksesLokasi.map(String) : [];
    aksesBlok = Array.isArray(body.aksesBlok) ? body.aksesBlok.map(String) : [];
  }

  if (aksesBlok.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu blok/unit." }, { status: 400 });
  }

  if ((role === "owner" || role === "staff") && aksesLokasi.length === 0) {
    return NextResponse.json({ error: "Owner / Staff wajib memilih minimal satu lokasi." }, { status: 400 });
  }

  const authEmail = usernameToAuthEmail(username);

  const { data: dupU } = await admin.from("user_profiles").select("id").eq("username", username).maybeSingle();
  if (dupU) {
    return NextResponse.json({ error: "Username sudah dipakai. Pilih nama lain." }, { status: 400 });
  }

  const { data: dupE } = await admin.from("user_profiles").select("id").eq("email", authEmail).maybeSingle();
  if (dupE) {
    return NextResponse.json({ error: "Kombinasi username/domain bentrok dengan email yang sudah ada." }, { status: 400 });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: nama },
  });

  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Gagal membuat pengguna di Authentication." },
      { status: 400 }
    );
  }

  const userId = created.user.id;

  const { error: profileErr } = await admin.from("user_profiles").insert({
    id: userId,
    email: authEmail,
    username,
    full_name: nama,
    no_hp: noHp || null,
    role,
    akses_lokasi: aksesLokasi,
    akses_blok: aksesBlok,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    const base = profileErr.message ?? "Gagal menyimpan profil user.";
    const suffix =
      /username|schema cache|42703/i.test(base) ?
        " — Jalankan SQL supabase/add_username_login.sql di Supabase (kolom username)."
      : "";
    return NextResponse.json({ error: `${base}${suffix}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: userId });
}

export async function PATCH(request: Request) {
  const token = parseBearer(request);
  if (!token) {
    return NextResponse.json({ error: "Token tidak ada." }, { status: 401 });
  }

  const gate = await requireSuperAdmin(token);
  if ("error" in gate) return gate.error;

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role tidak tersedia.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  let body: BodyPatch;
  try {
    body = (await request.json()) as BodyPatch;
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id user wajib." }, { status: 400 });
  }

  const { data: existing, error: exErr } = await admin
    .from("user_profiles")
    .select("role, username, email")
    .eq("id", id)
    .maybeSingle();

  if (exErr || !existing) {
    return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
  }

  const existingTyped = existing as { role?: string; username?: string | null; email?: string | null };
  const existingRole = String(existingTyped.role ?? "");
  const existingUsername = existingTyped.username ? String(existingTyped.username) : null;
  const existingEmail = existingTyped.email ? String(existingTyped.email) : null;

  if (existingRole === "super_admin" && gate.user.id !== id) {
    return NextResponse.json({ error: "Profil super_admin lain hanya bisa diubah manual di Supabase." }, { status: 400 });
  }

  const nama = String(body.nama ?? "").trim();
  const noHp = String(body.noHp ?? "").trim();
  const password = body.password != null ? String(body.password) : "";
  const passwordUpdate = password.length > 0 ? password : undefined;
  if (passwordUpdate !== undefined && passwordUpdate.length < 6) {
    return NextResponse.json({ error: "Password baru minimal 6 karakter." }, { status: 400 });
  }

  const gateRole = gate.role ?? "";
  if (passwordUpdate !== undefined && gateRole !== "super_admin") {
    return NextResponse.json(
      {
        error:
          "Mengubah password hanya dapat dilakukan oleh super_admin.",
      },
      { status: 403 }
    );
  }

  if (existingRole === "super_admin" && gate.user.id === id) {
    const email = String(body.username ?? "").trim().toLowerCase();
    if (!nama || !email || !email.includes("@")) {
      return NextResponse.json({ error: "Super Admin: isi Nama dan Email login lengkap." }, { status: 400 });
    }
    const authUpdateSelf: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
    } = {
      email,
      user_metadata: { full_name: nama },
    };
    if (passwordUpdate) {
      authUpdateSelf.password = passwordUpdate;
    }
    const { error: authErrSelf } = await admin.auth.admin.updateUserById(id, authUpdateSelf);
    if (authErrSelf) {
      return NextResponse.json({ error: authErrSelf.message }, { status: 400 });
    }
    const { error: profileErrSelf } = await admin
      .from("user_profiles")
      .update({
        email,
        full_name: nama,
        no_hp: noHp || null,
      })
      .eq("id", id);
    if (profileErrSelf) {
      return NextResponse.json({ error: profileErrSelf.message }, { status: 400 });
    }
    if (passwordUpdate) {
      await insertPasswordChangeAudit(admin, {
        subjectUserId: id,
        actorUserId: gate.user.id,
        actorLabel:
          typeof gate.user.email === "string" && gate.user.email.trim()
            ? gate.user.email.trim()
            : gate.user.id,
        isSelfSubject: true,
      });
    }
    return NextResponse.json({ ok: true });
  }

  const role = normalizeRole(body.role);
  if (role === "super_admin" && existingRole !== "super_admin") {
    return NextResponse.json({ error: "Tidak dapat mengangkat user menjadi super_admin lewat form." }, { status: 400 });
  }

  const { allLokasiIds, allBlokIds } = await loadAllMasterScopeIds(admin);

  let aksesLokasi: string[];
  let aksesBlok: string[];

  if (role === "supervisor" || role === "manager") {
    aksesLokasi = allLokasiIds;
    aksesBlok = allBlokIds;
  } else {
    aksesLokasi = Array.isArray(body.aksesLokasi) ? body.aksesLokasi.map(String) : [];
    aksesBlok = Array.isArray(body.aksesBlok) ? body.aksesBlok.map(String) : [];
  }

  if (aksesBlok.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu blok/unit." }, { status: 400 });
  }

  if ((role === "owner" || role === "staff") && aksesLokasi.length === 0) {
    return NextResponse.json({ error: "Owner / Staff wajib memilih minimal satu lokasi." }, { status: 400 });
  }

  const resolved = resolveLoginForPatch(body.username ?? "", existingUsername, existingEmail);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const { authEmail, usernameOut } = resolved;

  if (usernameOut) {
    const { data: dupU } = await admin
      .from("user_profiles")
      .select("id")
      .eq("username", usernameOut)
      .neq("id", id)
      .maybeSingle();
    if (dupU) {
      return NextResponse.json({ error: "Username sudah dipakai pengguna lain." }, { status: 400 });
    }
  }

  const { data: dupE } = await admin
    .from("user_profiles")
    .select("id")
    .eq("email", authEmail)
    .neq("id", id)
    .maybeSingle();
  if (dupE) {
    return NextResponse.json({ error: "Email login bentrok dengan pengguna lain." }, { status: 400 });
  }

  const authUpdate: {
    email?: string;
    password?: string;
    user_metadata?: Record<string, unknown>;
  } = {
    email: authEmail,
    user_metadata: { full_name: nama },
  };
  if (passwordUpdate) {
    authUpdate.password = passwordUpdate;
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(id, authUpdate);
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  const { error: profileErr } = await admin
    .from("user_profiles")
    .update({
      email: authEmail,
      username: usernameOut,
      full_name: nama,
      no_hp: noHp || null,
      role,
      akses_lokasi: aksesLokasi,
      akses_blok: aksesBlok,
    })
    .eq("id", id);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  if (passwordUpdate) {
    await insertPasswordChangeAudit(admin, {
      subjectUserId: id,
      actorUserId: gate.user.id,
      actorLabel:
        typeof gate.user.email === "string" && gate.user.email.trim()
          ? gate.user.email.trim()
          : gate.user.id,
      isSelfSubject: gate.user.id === id,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const token = parseBearer(request);
  if (!token) {
    return NextResponse.json({ error: "Token tidak ada." }, { status: 401 });
  }

  const gate = await requireSuperAdmin(token);
  if ("error" in gate) return gate.error;

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service role tidak tersedia.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Query id wajib." }, { status: 400 });
  }

  if (id === gate.user.id) {
    return NextResponse.json({ error: "Tidak dapat menghapus akun Anda sendiri." }, { status: 400 });
  }

  const { data: existing } = await admin.from("user_profiles").select("role").eq("id", id).maybeSingle();
  const existingRole = String((existing as { role?: string } | null)?.role ?? "");
  if (existingRole === "super_admin") {
    return NextResponse.json({ error: "Tidak dapat menghapus super_admin." }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
