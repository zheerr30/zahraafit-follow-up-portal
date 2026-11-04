# ZahraaFit platform

Next.js app (Vercel) + Supabase. The coach (Zahraa) talks in Saudi Arabic and is not a developer: reply in plain Saudi Arabic, explain what changed in her terms, never ask her to run commands.

## Editing the meal generator (most common request)

The coach's meal generator is `generators/meal.html`: one self-contained HTML file (her own tool, ~1.7 MB). She asks for changes in plain words ("add a recipe", "make snacks under 200 kcal", "fix the PDF cover"). Edit that file directly, keeping her style and wording.

The platform drives this file from the outside (see `lib/generator.ts`, `components/GeneratorPanel.tsx`). Keep these working or the platform breaks:

- Global `const PLANS` (array of generated plans) and its `localStorage` key `zfv5_plans`.
- Plan shape: `plan.meta` (`name`, `phone`, `cal`, `prot`, `carb`, `fat`), `plan.daysData[].meals[]` with `name`, `slotLabel`, `scaledIng[]` (`n`, `a`, `sa`, `u`), `cal`, `p`, `c`, `f`, `prep`, `subs[]` (`i`, `o[]`), and `plan.extras.snacks/salads`.
- Global `ALT_INGREDIENTS` and `altAmountText(name, amount, unit, alt)`.
- Global `sw(page)` with page `"gen"`, and `updateMacros()`.
- Global `const DEFAULT_INGR=[...]` (objects with `name`, `cat`, `cal`, `prot`, `carb`, `fat`, `note`; values per 100 g, notes like `حبة≈50g`): the subscriber food diary reads it via `lib/food-list.ts`.
- Form field ids: `g-name g-phone g-gender g-age g-weight g-height g-goal g-act g-meals g-snacks g-excl g-health g-notes g-aitext`, and the option values of `g-goal` (`تخسيس`, `تضخيم`, `صيانة`, `ريكومب`) and `g-act`.

The subscriber calculator (`lib/macros.ts`) is a copy of `updateMacros()`. If she changes calorie or macro rules in the generator, make the same change in `lib/macros.ts`.

If a requested change needs one of these renamed or restructured, update `lib/generator.ts` (`FILL_SCRIPT`, `READ_PLANS_SCRIPT`, `mealGeneratorFields`) in the same change.

Before committing a generator edit, check the file still parses and generates:

```bash
node -e "const h=require('fs').readFileSync('generators/meal.html','utf8');const s=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);s.forEach((c,i)=>{try{new Function(c)}catch(e){console.error('script',i,e.message);process.exit(1)}});console.log('ok',s.length)"
```

Then commit to `main` and push: Vercel publishes it within minutes. Tell her in one line what changed and that it is live in a few minutes.

## Rest of the app

- Subscriber screens: `app/app/*` (home, intake, food, workout, progress, account). Coach screens: `app/coach/*`.
- Database changes go in a new `supabase/phaseN-*.sql` file (idempotent, RLS on every table). She runs it herself in the Supabase SQL Editor: tell her exactly which file and that it is safe to run twice.
- Build check: `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`.
