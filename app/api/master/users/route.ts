import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_ROLES = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);

type BodyCreate = {
  nama: string;
  email: string;
  noHp: string;
  password: string;
  role: string;
  aksesLokasi: string[];
  aksesBlok: string[];
};

type BodyPatch = BodyCreate & {
  id: string;
  password?: string;
};

function parseBearer(request: Request): string | null {
  const raw = request.headers.get("authorization") ?? "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function requirePrivilegedUser(accessToken: string) {
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
  if (role !== "super_admin" && role !== "manager") {
    return {
      error: NextResponse.json(
        { error: "Hanya super_admin atau manager yang dapat mengelola user." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

function normalizeRole(role: string): string {
  const r = String(role ?? "").toLowerCase().trim();
  return ALLOWED_ROLES.has(r) ? r : "manager";
}

export async function POST(request: Request) {
  const token = parseBearer(request);
  if (!token) {
    return NextResponse.json({ error: "Token tidak ada." }, { status: 401 });
  }

  const gate = await requirePrivilegedUser(token);
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
  const email = String(body.email ?? "").trim().toLowerCase();
  const noHp = String(body.noHp ?? "").trim();
  const password = String(body.password ?? "");
  const role = normalizeRole(body.role);

  if (!nama || !email || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Nama, email, dan password wajib. Password minimal 6 karakter." },
      { status: 400 }
    );
  }

  if (role === "super_admin") {
    return NextResponse.json({ error: "Tidak dapat membuat super_admin lewat form ini." }, { status: 400 });
  }

  const { data: lokasiRows } = await admin.from("master_lokasi").select("id");
  const allLokasiIds = (lokasiRows ?? []).map((r) => String((r as { id: string }).id));

  let aksesLokasi: string[];
  if (role === "supervisor" || role === "manager") {
    aksesLokasi = allLokasiIds;
  } else {
    aksesLokasi = Array.isArray(body.aksesLokasi) ? body.aksesLokasi.map(String) : [];
  }

  const aksesBlok = Array.isArray(body.aksesBlok) ? body.aksesBlok.map(String) : [];

  if (aksesBlok.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu blok/unit." }, { status: 400 });
  }

  if ((role === "owner" || role === "staff") && aksesLokasi.length === 0) {
    return NextResponse.json({ error: "Owner / Staff wajib memilih minimal satu lokasi." }, { status: 400 });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
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
    email,
    full_name: nama,
    no_hp: noHp || null,
    role,
    akses_lokasi: aksesLokasi,
    akses_blok: aksesBlok,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: profileErr.message ?? "Gagal menyimpan profil user." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, id: userId });
}

export async function PATCH(request: Request) {
  const token = parseBearer(request);
  if (!token) {
    return NextResponse.json({ error: "Token tidak ada." }, { status: 401 });
  }

  const gate = await requirePrivilegedUser(token);
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

  const { data: existing, error: exErr } = await admin.from("user_profiles").select("role").eq("id", id).maybeSingle();

  if (exErr || !existing) {
    return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
  }

  const existingRole = String((existing as { role?: string }).role ?? "");
  if (existingRole === "super_admin" && gate.user.id !== id) {
    return NextResponse.json({ error: "Profil super_admin lain hanya bisa diubah manual di Supabase." }, { status: 400 });
  }

  const nama = String(body.nama ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const noHp = String(body.noHp ?? "").trim();
  const password = body.password != null ? String(body.password) : "";
  const passwordUpdate = password.length > 0 ? password : undefined;
  if (passwordUpdate !== undefined && passwordUpdate.length < 6) {
    return NextResponse.json({ error: "Password baru minimal 6 karakter." }, { status: 400 });
  }

  if (existingRole === "super_admin" && gate.user.id === id) {
    if (!nama || !email) {
      return NextResponse.json({ error: "Nama dan email wajib." }, { status: 400 });
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
    return NextResponse.json({ ok: true });
  }

  let role = normalizeRole(body.role);
  if (role === "super_admin" && existingRole !== "super_admin") {
    return NextResponse.json({ error: "Tidak dapat mengangkat user menjadi super_admin lewat form." }, { status: 400 });
  }

  const { data: lokasiRows } = await admin.from("master_lokasi").select("id");
  const allLokasiIds = (lokasiRows ?? []).map((r) => String((r as { id: string }).id));

  let aksesLokasi: string[];
  if (role === "supervisor" || role === "manager") {
    aksesLokasi = allLokasiIds;
  } else {
    aksesLokasi = Array.isArray(body.aksesLokasi) ? body.aksesLokasi.map(String) : [];
  }

  const aksesBlok = Array.isArray(body.aksesBlok) ? body.aksesBlok.map(String) : [];

  if (aksesBlok.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu blok/unit." }, { status: 400 });
  }

  if ((role === "owner" || role === "staff") && aksesLokasi.length === 0) {
    return NextResponse.json({ error: "Owner / Staff wajib memilih minimal satu lokasi." }, { status: 400 });
  }

  const authUpdate: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {
    email,
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
      email,
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

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const token = parseBearer(request);
  if (!token) {
    return NextResponse.json({ error: "Token tidak ada." }, { status: 401 });
  }

  const gate = await requirePrivilegedUser(token);
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
