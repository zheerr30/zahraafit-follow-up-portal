import { AlertCircle, Inbox, Loader2 } from "lucide-react";

export function LoadingState({ label = "جاري التحميل..." }: { label?: string }) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="panel flex items-center gap-3 px-6 py-5 text-zahraa-navy">
        <Loader2 className="animate-spin" size={20} />
        <span className="text-sm font-bold">{label}</span>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[26px] border border-dashed border-slate-200 bg-gradient-to-b from-white to-zahraa-mist px-5 py-9 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-zahraa-coral shadow-sm">
        <Inbox size={20} />
      </div>
      <p className="font-black text-zahraa-navy">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="panel flex items-start gap-3 border-red-200 bg-red-50 px-4 py-4 text-red-800">
      <AlertCircle className="mt-0.5 shrink-0" size={20} />
      <p className="text-sm font-semibold leading-6">{message}</p>
    </div>
  );
}
