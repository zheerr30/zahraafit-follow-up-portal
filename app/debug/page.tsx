"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Wifi
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Client, Profile } from "@/lib/types";

type CheckStatus = "idle" | "running" | "pass" | "warn" | "fail";

type DebugCheck = {
  id: string;
  title: string;
  description: string;
  status: CheckStatus;
  detail: string;
};

const initialChecks: DebugCheck[] = [
  {
    id: "config",
    title: "إعداد Supabase",
    description: "يتأكد من وجود رابط Supabase والمفتاح العام.",
    status: "idle",
    detail: "لم يبدأ الفحص بعد."
  },
  {
    id: "connection",
    title: "اتصال Supabase",
    description: "يتحقق من أن التطبيق يستطيع الوصول إلى واجهة قاعدة البيانات.",
    status: "idle",
    detail: "لم يبدأ الفحص بعد."
  },
  {
    id: "auth",
    title: "تسجيل الدخول",
    description: "يتحقق من وجود جلسة مستخدمة حالية ودور الحساب.",
    status: "idle",
    detail: "لم يبدأ الفحص بعد."
  },
  {
    id: "database",
    title: "Database",
    description: "يتحقق من جداول profiles وclients حسب صلاحيات الحساب.",
    status: "idle",
    detail: "لم يبدأ الفحص بعد."
  },
  {
    id: "storage",
    title: "Storage",
    description: "يتحقق من إمكانية الوصول إلى followup-photos وclient-plans.",
    status: "idle",
    detail: "لم يبدأ الفحص بعد."
  }
];

const statusStyles: Record<CheckStatus, string> = {
  idle: "border-slate-200 bg-white text-slate-500",
  running: "border-blue-200 bg-blue-50 text-blue-700",
  pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  fail: "border-red-200 bg-red-50 text-red-700"
};

const statusLabels: Record<CheckStatus, string> = {
  idle: "بانتظار الفحص",
  running: "جاري الفحص",
  pass: "ناجح",
  warn: "تنبيه",
  fail: "فشل"
};

const icons = {
  config: ShieldCheck,
  connection: Wifi,
  auth: LogIn,
  database: Database,
  storage: HardDrive
};

export default function DebugPage() {
  const [checks, setChecks] = useState<DebugCheck[]>(initialChecks);
  const [running, setRunning] = useState(false);

  function updateCheck(id: string, status: CheckStatus, detail: string) {
    setChecks((current) =>
      current.map((check) => (check.id === id ? { ...check, status, detail } : check))
    );
  }

  function resetChecks() {
    setChecks(initialChecks.map((check) => ({ ...check })));
  }

  async function runChecks() {
    setRunning(true);
    resetChecks();

    updateCheck("config", "running", "جاري قراءة متغيرات البيئة...");
    if (!isSupabaseConfigured) {
      updateCheck(
        "config",
        "fail",
        "أضيفي NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في .env.local أو Vercel."
      );
      updateCheck("connection", "warn", "تم تخطي الفحص لأن إعداد Supabase غير مكتمل.");
      updateCheck("auth", "warn", "تم تخطي الفحص لأن إعداد Supabase غير مكتمل.");
      updateCheck("database", "warn", "تم تخطي الفحص لأن إعداد Supabase غير مكتمل.");
      updateCheck("storage", "warn", "تم تخطي الفحص لأن إعداد Supabase غير مكتمل.");
      setRunning(false);
      return;
    }
    updateCheck("config", "pass", "تم العثور على رابط Supabase والمفتاح العام.");

    updateCheck("connection", "running", "جاري فحص واجهة قاعدة البيانات...");
    const connectionResult = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (connectionResult.error) {
      const expectedProtection =
        connectionResult.error.code === "42501" ||
        connectionResult.status === 401 ||
        connectionResult.status === 403 ||
        connectionResult.error.message.toLowerCase().includes("permission");

      if (expectedProtection) {
        updateCheck(
          "connection",
          "pass",
          "تم الوصول إلى Supabase، والجدول محمي للمستخدمين المسجلين فقط كما هو متوقع."
        );
      } else {
        updateCheck(
          "connection",
          "fail",
          `تعذر الوصول إلى جدول profiles: ${connectionResult.error.message}`
        );
        updateCheck("auth", "warn", "أصلحي الاتصال أو schema أولًا، ثم أعيدي الفحص.");
        updateCheck("database", "warn", "أصلحي الاتصال أو schema أولًا، ثم أعيدي الفحص.");
        updateCheck("storage", "warn", "أصلحي الاتصال أو schema أولًا، ثم أعيدي الفحص.");
        setRunning(false);
        return;
      }
    } else {
      updateCheck(
        "connection",
        "pass",
        "الاتصال بقاعدة البيانات يعمل وجدول profiles متاح."
      );
    }

    updateCheck("auth", "running", "جاري فحص الجلسة الحالية...");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      updateCheck("auth", "warn", "لا توجد جلسة دخول حاليًا. سجلي الدخول ثم افتحي /debug مرة أخرى.");
      updateCheck("database", "warn", "فحص الصلاحيات التفصيلي يحتاج حسابًا مسجلًا.");
      updateCheck("storage", "warn", "فحص التخزين التفصيلي يحتاج حسابًا مسجلًا.");
      setRunning(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle<Profile>();

    if (profileError || !profile) {
      updateCheck(
        "auth",
        "fail",
        profileError?.message || "تم تسجيل الدخول، لكن لا يوجد سجل profile لهذا الحساب."
      );
      updateCheck("database", "fail", "تأكدي من تشغيل trigger إنشاء profiles في schema.sql.");
      updateCheck("storage", "warn", "تم تخطي التخزين حتى يتم إصلاح profile.");
      setRunning(false);
      return;
    }

    updateCheck("auth", "pass", `تم تسجيل الدخول كـ ${profile.full_name} والدور: ${profile.role}.`);

    updateCheck("database", "running", "جاري فحص جداول التطبيق حسب الدور...");
    let client: Client | null = null;

    if (profile.role === "admin") {
      const { count, error } = await supabase
        .from("clients")
        .select("id", { count: "exact", head: true });

      if (error) {
        updateCheck("database", "fail", `حساب Admin لا يستطيع قراءة clients: ${error.message}`);
        setRunning(false);
        return;
      }

      updateCheck("database", "pass", `حساب Admin يستطيع قراءة clients. العدد الحالي: ${count || 0}.`);
    } else {
      const { data: clientData, error } = await supabase
        .from("clients")
        .select("*")
        .eq("profile_id", profile.id)
        .maybeSingle<Client>();

      if (error || !clientData) {
        updateCheck(
          "database",
          "fail",
          error?.message || "حساب العميلة لا يملك سجلًا في جدول clients."
        );
        updateCheck("storage", "warn", "اربط حساب العميلة بسجل clients ثم أعيدي الفحص.");
        setRunning(false);
        return;
      }

      client = clientData;
      updateCheck("database", "pass", `حساب العميلة مربوط بسجل clients: ${client.id}.`);
    }

    updateCheck("storage", "running", "جاري فحص buckets المطلوبة...");

    const photoPath = profile.role === "admin" ? "" : `${client?.id || ""}`;
    const planPath = profile.role === "admin" ? "" : `${client?.id || ""}`;

    const [photosResult, plansResult] = await Promise.all([
      supabase.storage.from("followup-photos").list(photoPath, { limit: 1 }),
      supabase.storage.from("client-plans").list(planPath, { limit: 1 })
    ]);

    if (photosResult.error || plansResult.error) {
      const messages = [photosResult.error?.message, plansResult.error?.message]
        .filter(Boolean)
        .join(" | ");
      updateCheck("storage", "fail", `تعذر الوصول إلى واحد من buckets: ${messages}`);
      setRunning(false);
      return;
    }

    updateCheck("storage", "pass", "تم الوصول إلى followup-photos و client-plans بنجاح.");
    setRunning(false);
  }

  return (
    <main className="page-shell">
      <div className="page-container max-w-5xl">
        <header className="mb-6 rounded-lg bg-zahraa-navy px-5 py-6 text-white shadow-soft">
          <p className="text-sm font-bold text-zahraa-coral">ZahraaFit</p>
          <h1 className="mt-2 text-3xl font-black">صفحة الفحص Debug</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
            استخدمي هذه الصفحة بعد إعداد Supabase وقبل الإطلاق للتأكد من الاتصال، تسجيل الدخول،
            قاعدة البيانات، والتخزين.
          </p>
        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <button className="primary-button" type="button" onClick={runChecks} disabled={running}>
            {running ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            {running ? "جاري الفحص..." : "تشغيل الفحص"}
          </button>
          <Link className="secondary-button" href="/login">
            <LogIn size={18} />
            صفحة تسجيل الدخول
          </Link>
        </div>

        <section className="grid gap-4">
          {checks.map((check) => {
            const Icon = icons[check.id as keyof typeof icons] || AlertCircle;
            return (
              <article key={check.id} className={`rounded-lg border p-4 ${statusStyles[check.status]}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="mt-0.5">
                      {check.status === "running" ? (
                        <Loader2 className="animate-spin" size={22} />
                      ) : check.status === "pass" ? (
                        <CheckCircle2 size={22} />
                      ) : (
                        <Icon size={22} />
                      )}
                    </div>
                    <div>
                      <h2 className="font-black">{check.title}</h2>
                      <p className="mt-1 text-sm leading-6 opacity-80">{check.description}</p>
                    </div>
                  </div>
                  <span className="rounded-md bg-white/70 px-3 py-1 text-xs font-black">
                    {statusLabels[check.status]}
                  </span>
                </div>
                <p className="mt-4 rounded-md bg-white/70 px-3 py-3 text-sm leading-7">{check.detail}</p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
