const PREFIX = "secondroom_sb_v1";

export const SB_KEY = {
  penghuni: `${PREFIX}_penghuni`,
  /** Calon penghuni survey (form terpisah dari penghuni Booking/Stay). */
  surveyCalon: `${PREFIX}_survey_calon`,
  penghuniRooms: `${PREFIX}_penghuni_rooms`,
  kamar: `${PREFIX}_kamar`,
  finance: `${PREFIX}_finance`,
  master: `${PREFIX}_master`,
  profile: `${PREFIX}_profile`,
} as const;

export function readSandboxJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSandboxJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("secondroom-sandbox-updated", { detail: { key } }));
  } catch {
    /* ignore quota */
  }
}

export function newSandboxId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `sb-${crypto.randomUUID()}`;
  }
  return `sb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
