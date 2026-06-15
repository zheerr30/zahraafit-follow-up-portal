"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Save } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorState, LoadingState } from "@/components/Feedback";
import { safeFileName } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useAuthGuard } from "@/lib/use-auth";
import type { Client, FollowupPhoto, WeeklyFollowup } from "@/lib/types";

type PhotoType = "front" | "side" | "back" | "other";

const photoFields: { key: PhotoType; label: string }[] = [
  { key: "front", label: "صورة أمامية" },
  { key: "side", label: "صورة جانبية" },
  { key: "back", label: "صورة خلفية" },
  { key: "other", label: "صور أخرى" }
];

function numberOrNull(value: string) {
  return value === "" ? null : Number(value);
}

export default function NewFollowUpPage() {
  const router = useRouter();
  const auth = useAuthGuard("client");
  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<PhotoType, File[]>>({
    front: [],
    side: [],
    back: [],
    other: []
  });

  const [form, setForm] = useState({
    week_date: new Date().toISOString().slice(0, 10),
    target_weight: "",
    weight_kg: "",
    waist_cm: "",
    hips_cm: "",
    nutrition_commitment: "",
    workout_commitment: "",
    steps_count: "",
    sleep_hours: "",
    menstrual_cycle: "",
    client_notes: ""
  });

  useEffect(() => {
    async function loadClient() {
      if (!auth.profile) return;

      const { data, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("profile_id", auth.profile.id)
        .maybeSingle();

      if (clientError || !data) {
        setError("لم يتم العثور على ملف العميلة المرتبط بحسابك.");
      } else {
        const typedClient = data as Client;
        setClient(typedClient);
        setForm((current) => ({
          ...current,
          target_weight: typedClient.target_weight === null ? "" : String(typedClient.target_weight)
        }));
      }

      setLoadingClient(false);
    }

    loadClient();
  }, [auth.profile]);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updatePhotos(type: PhotoType, fileList: FileList | null) {
    setPhotos((current) => ({
      ...current,
      [type]: fileList ? Array.from(fileList) : []
    }));
  }

  async function uploadPhotos(followup: WeeklyFollowup) {
    if (!client) return;

    const photoRows: Omit<FollowupPhoto, "id" | "created_at">[] = [];

    for (const field of photoFields) {
      for (const file of photos[field.key]) {
        const path = `${client.id}/${followup.id}/${safeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("followup-photos")
          .upload(path, file, { upsert: false });

        if (uploadError) {
          throw new Error(`تعذر رفع ${field.label}: ${uploadError.message}`);
        }

        photoRows.push({
          followup_id: followup.id,
          client_id: client.id,
          photo_type: field.key,
          file_path: path,
          photo_url: null
        });
      }
    }

    if (!photoRows.length) return;

    const { error: photosError } = await supabase.from("followup_photos").insert(photoRows);
    if (photosError) throw new Error(`تم رفع الصور لكن تعذر حفظ بياناتها: ${photosError.message}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;

    setSaving(true);
    setError(null);

    const targetWeight = numberOrNull(form.target_weight);
    if (targetWeight !== client.target_weight) {
      const { error: targetError } = await supabase.rpc("set_client_target_weight", {
        target_weight_value: targetWeight
      });

      if (targetError) {
        setSaving(false);
        setError(
          targetError.message.includes("set_client_target_weight")
            ? "تحتاج قاعدة البيانات إلى تحديث دالة حفظ الوزن المستهدف. شغّلي ملف SQL الأخير في Supabase ثم حاولي مرة أخرى."
            : targetError.message
        );
        return;
      }
    }

    const { data, error: insertError } = await supabase
      .from("weekly_followups")
      .insert({
        client_id: client.id,
        week_date: form.week_date,
        weight_kg: numberOrNull(form.weight_kg),
        waist_cm: numberOrNull(form.waist_cm),
        hips_cm: numberOrNull(form.hips_cm),
        nutrition_commitment: numberOrNull(form.nutrition_commitment),
        workout_commitment: numberOrNull(form.workout_commitment),
        steps_count: numberOrNull(form.steps_count),
        sleep_hours: numberOrNull(form.sleep_hours),
        menstrual_cycle: form.menstrual_cycle || null,
        client_notes: form.client_notes || null
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setSaving(false);
      setError(insertError?.message || "تعذر حفظ المتابعة.");
      return;
    }

    try {
      await uploadPhotos(data as WeeklyFollowup);
      router.push("/client/follow-ups");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "حدث خطأ أثناء رفع الصور.");
      setSaving(false);
    }
  }

  if (auth.loading || loadingClient) return <LoadingState />;

  if (auth.error) {
    return (
      <main className="page-shell">
        <div className="page-container">
          <ErrorState message={auth.error} />
        </div>
      </main>
    );
  }

  if (!auth.profile) return null;

  return (
    <main className="page-shell">
      <div className="page-container">
        <AppHeader profile={auth.profile} title="متابعة أسبوعية جديدة" />

        <form className="panel p-5" onSubmit={handleSubmit}>
          <div className="mb-6 flex flex-col gap-2">
            <h2 className="section-title">بيانات المتابعة</h2>
            <p className="muted-text">املئي القياسات والالتزام لهذا الأسبوع، ثم أرفقي الصور عند الحاجة.</p>
          </div>

          {error ? <div className="mb-5"><ErrorState message={error} /></div> : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="field-label">تاريخ المتابعة</span>
              <input
                className="field-input"
                type="date"
                value={form.week_date}
                onChange={(event) => updateField("week_date", event.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="field-label">الوزن</span>
              <input
                className="field-input"
                type="number"
                min="20"
                max="300"
                step="0.1"
                value={form.weight_kg}
                onChange={(event) => updateField("weight_kg", event.target.value)}
                placeholder="مثال: 68.5"
              />
            </label>

            <label className="block">
              <span className="field-label">الوزن المستهدف</span>
              <input
                className="field-input"
                type="number"
                min="20"
                max="300"
                step="0.1"
                value={form.target_weight}
                onChange={(event) => updateField("target_weight", event.target.value)}
                placeholder="مثال: 60"
              />
              <span className="mt-1 block text-xs font-semibold text-slate-400">
                تحدده العميلة ويمكن تغييره مع أي متابعة.
              </span>
            </label>

            <label className="block">
              <span className="field-label">محيط الخصر</span>
              <input
                className="field-input"
                type="number"
                min="20"
                max="250"
                step="0.1"
                value={form.waist_cm}
                onChange={(event) => updateField("waist_cm", event.target.value)}
                placeholder="سم"
              />
            </label>

            <label className="block">
              <span className="field-label">محيط الأرداف</span>
              <input
                className="field-input"
                type="number"
                min="20"
                max="250"
                step="0.1"
                value={form.hips_cm}
                onChange={(event) => updateField("hips_cm", event.target.value)}
                placeholder="سم"
              />
            </label>

            <label className="block">
              <span className="field-label">الالتزام الغذائي</span>
              <select
                className="field-input"
                value={form.nutrition_commitment}
                onChange={(event) => updateField("nutrition_commitment", event.target.value)}
              >
                <option value="">اختاري</option>
                <option value="1">1 - ضعيف</option>
                <option value="2">2 - مقبول</option>
                <option value="3">3 - جيد</option>
                <option value="4">4 - جيد جدًا</option>
                <option value="5">5 - ممتاز</option>
              </select>
            </label>

            <label className="block">
              <span className="field-label">الالتزام بالتمارين</span>
              <select
                className="field-input"
                value={form.workout_commitment}
                onChange={(event) => updateField("workout_commitment", event.target.value)}
              >
                <option value="">اختاري</option>
                <option value="1">1 - ضعيف</option>
                <option value="2">2 - مقبول</option>
                <option value="3">3 - جيد</option>
                <option value="4">4 - جيد جدًا</option>
                <option value="5">5 - ممتاز</option>
              </select>
            </label>

            <label className="block">
              <span className="field-label">عدد الخطوات</span>
              <input
                className="field-input"
                type="number"
                min="0"
                max="100000"
                value={form.steps_count}
                onChange={(event) => updateField("steps_count", event.target.value)}
                placeholder="مثال: 7500"
              />
            </label>

            <label className="block">
              <span className="field-label">ساعات النوم</span>
              <input
                className="field-input"
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={form.sleep_hours}
                onChange={(event) => updateField("sleep_hours", event.target.value)}
                placeholder="مثال: 7.5"
              />
            </label>

            <label className="block">
              <span className="field-label">الدورة الشهرية</span>
              <select
                className="field-input"
                value={form.menstrual_cycle}
                onChange={(event) => updateField("menstrual_cycle", event.target.value)}
              >
                <option value="">اختاري</option>
                <option value="لا يوجد">لا يوجد</option>
                <option value="قبل الدورة">قبل الدورة</option>
                <option value="أثناء الدورة">أثناء الدورة</option>
                <option value="بعد الدورة">بعد الدورة</option>
                <option value="غير منتظمة">غير منتظمة</option>
                <option value="أفضل عدم الإجابة">أفضل عدم الإجابة</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className="field-label">ملاحظات العميلة</span>
            <textarea
              className="field-input min-h-32 resize-y"
              value={form.client_notes}
              onChange={(event) => updateField("client_notes", event.target.value)}
              placeholder="أي تفاصيل مهمة عن الأسبوع، الالتزام، الطاقة، أو التحديات."
            />
          </label>

          <div className="mt-6 rounded-lg bg-zahraa-mist p-4">
            <div className="mb-4 flex items-center gap-2 text-zahraa-navy">
              <Camera size={20} />
              <h3 className="font-black">الصور</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {photoFields.map((field) => (
                <label key={field.key} className="block">
                  <span className="field-label">{field.label}</span>
                  <input
                    className="field-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={(event) => updatePhotos(field.key, event.target.files)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button className="primary-button" type="submit" disabled={saving || !client}>
              <Save size={18} />
              {saving ? "جاري الحفظ..." : "حفظ المتابعة"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
