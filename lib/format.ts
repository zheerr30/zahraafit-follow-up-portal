export function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

export function formatNumber(value?: number | null, suffix = "") {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("ar-SA")}${suffix}`;
}

export function commitmentLabel(value?: number | null) {
  if (!value) return "غير محدد";

  const labels: Record<number, string> = {
    1: "ضعيف",
    2: "مقبول",
    3: "جيد",
    4: "جيد جدًا",
    5: "ممتاز"
  };

  return labels[value] || "غير محدد";
}

export function photoTypeLabel(value: string) {
  const labels: Record<string, string> = {
    front: "أمامية",
    side: "جانبية",
    back: "خلفية",
    other: "أخرى"
  };

  return labels[value] || "أخرى";
}

export function safeFileName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()}` : "";
  return `${crypto.randomUUID()}${extension.toLowerCase()}`;
}
