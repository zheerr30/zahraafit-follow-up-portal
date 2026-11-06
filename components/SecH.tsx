import type { ReactNode } from "react";
import { CalendarDays, Dumbbell, Flame, Flower2, MessageCircle, Ruler, Scale, Trophy } from "lucide-react";

const ICONS = { week: CalendarDays, coach: MessageCircle, weight: Scale, measure: Ruler, cal: Flame, trophy: Trophy, period: Flower2, workout: Dumbbell };

/** Section title in «تقدمي»: a line icon and the title, same style everywhere. */
export function SecH({ icon, title, aside, id }: { icon: keyof typeof ICONS; title: string; aside?: ReactNode; id?: string }) {
  const I = ICONS[icon];
  return (
    <div className="sec-h" id={id} style={id ? { scrollMarginTop: 80 } : undefined}>
      <h2 className="sec-h-ic"><I size={19} strokeWidth={1.9} aria-hidden="true" />{title}</h2>
      {aside}
    </div>
  );
}
