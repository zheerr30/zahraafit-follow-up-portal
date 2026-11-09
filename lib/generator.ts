// The coach's meal generator runs inside the platform, unchanged: its HTML file
// lives in generators/meal.html, is served to the coach only by
// /api/generators/meal, and is shown in a same-origin iframe so the platform
// can fill the form and read the finished plan. See CLAUDE.md before editing it.

import { normalizeAnswers, type IntakeAnswers } from "@/lib/intake";

/** Values for the generator's own form fields, from the subscriber's answers. */
export function mealGeneratorFields(raw: unknown, rated?: { liked: string[]; disliked: string[] }): Record<string, string> {
  const a: IntakeAnswers = normalizeAnswers(raw);
  const goal = a.goal === "lose" ? "تخسيس" : a.goal === "muscle" ? "تضخيم" : a.goal === "shape" ? "ريكومب" : "";
  const days = a.workout.days || 0;
  const act = days >= 6 ? "1.725" : days >= 4 ? "1.55" : "1.375";
  const occasions = a.nutrition.meals_per_day;
  const meals = occasions ? "3" : "";
  const snacks = occasions ? String(Math.max(0, Math.min(3, occasions - 3))) : "";
  const excluded = [...a.nutrition.excluded, ...(a.nutrition.dislikes ? [a.nutrition.dislikes] : [])].join("، ");
  const health = [...a.health, ...(a.health_notes ? [a.health_notes] : [])].join("، ");
  const story = [
    a.goal_details && `هدفها: ${a.goal_details}`,
    a.nutrition.dislikes && `ما تحب: ${a.nutrition.dislikes}`,
    a.nutrition.notes && `ملاحظات الأكل: ${a.nutrition.notes}`,
    health && `حالتها الصحية: ${health}`,
    a.comments && `تعليقات: ${a.comments}`,
    rated?.disliked.length && `وجبات ما عجبتها في خطتها السابقة (لا تكررها): ${rated.disliked.join("، ")}`,
    rated?.liked.length && `وجبات عجبتها في خطتها السابقة: ${rated.liked.join("، ")}`
  ]
    .filter(Boolean)
    .join("\n");
  const f: Record<string, string> = {
    "g-name": a.full_name,
    "g-phone": a.phone.replace(/[^\d+]/g, ""),
    "g-gender": a.gender || "female",
    "g-age": a.age ? String(a.age) : "",
    "g-weight": a.weight_kg ? String(a.weight_kg) : "",
    "g-height": a.height_cm ? String(a.height_cm) : "",
    "g-goal": goal,
    "g-act": act,
    "g-excl": excluded,
    "g-health": health,
    "g-notes": a.nutrition.notes,
    "g-aitext": story
  };
  if (meals) f["g-meals"] = meals;
  if (snacks) f["g-snacks"] = snacks;
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));
}

/** Runs inside the generator page: fills the fields and lets the generator recompute. */
export const FILL_SCRIPT = (fields: Record<string, string>) => `(function(F){
  try{ if(typeof sw==="function") sw("gen"); }catch(e){}
  Object.keys(F).forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    if(el.tagName==="SELECT" && ![].some.call(el.options,function(o){return o.value===F[id];})) return;
    el.value=F[id];
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  });
  try{ if(typeof updateMacros==="function") updateMacros(); }catch(e){}
  return true;
})(${JSON.stringify(fields)})`;

/** Runs inside the generator page: the designed plan document it is showing (its own "download" file). */
export const READ_DOC_SCRIPT = `(function(){try{var f=planFileHTML();return f&&f.html?f.html:"";}catch(e){return "";}})()`;

/**
 * Runs inside the generator page: returns the plans it holds, newest first,
 * converted to the platform's meal-plan format (same reading as the generator's
 * own screen: ingredients by gram, the alternatives it shows, extras).
 */
export const READ_PLANS_SCRIPT = `(function(){
  function num(x){x=Number(x);return isFinite(x)?Math.round(x*10)/10:0;}
  function ings(m){return (m.scaledIng||m.ing||[]).map(function(i){var a=(i.sa!==undefined?i.sa:i.a);return {n:String(i.n||""),a:(typeof a==="number"?num(a):a),u:String(i.u||"")};});}
  function subs(m,L){
    var s=(m.subs&&m.subs.length)?m.subs:null;
    if(s){var present=L.filter(function(i){return (i.a>0)||i.u==="حسب الذوق";}).map(function(i){return i.n.toLowerCase();});
      s=s.filter(function(x){var sn=String(x.i||"").toLowerCase();return present.some(function(n){return n===sn||n.indexOf(sn.split(" ")[0])>-1||sn.indexOf(n.split(" ")[0])>-1;});});
      if(!s.length)s=null;}
    if(!s){try{s=L.filter(function(i){return ALT_INGREDIENTS[i.n]&&i.a>0;}).map(function(i){return {i:i.n,o:ALT_INGREDIENTS[i.n].map(function(alt){var t="";try{t=altAmountText(i.n,i.a,i.u,alt);}catch(e){}return (alt+" "+t).trim();})};});}catch(e){s=[];}}
    return (s||[]).map(function(x){return {for:String(x.i||""),options:(x.o||[]).map(String)};});
  }
  function meal(m){var L=ings(m);return {slot:String(m.slotLabel||m.slot||""),name:String(m.name||""),cal:Math.round(m.cal||0),p:num(m.p),c:num(m.c),f:num(m.f),ingredients:L,prep:String(m.prep||""),subs:subs(m,L),note:String(m.splitNote||m.prepnote||"")};}
  function exp(p){var M=p.meta||{};var ex=p.extras||{};
    return {format:"zahraafit-meal-plan",v:1,exportedAt:new Date().toISOString(),planId:String(p.id||""),date:String(p.date||""),name:String(M.name||""),phone:String(M.phone||""),
      target:{cal:Math.round(M.cal||0),p:num(M.prot),c:num(M.carb),f:num(M.fat)},
      days:(p.daysData||[]).map(function(d,i){return {n:i+1,meals:(d.meals||[]).map(meal)};}),
      extras:{snacks:(ex.snacks||[]).map(meal),salads:(ex.salads||[]).map(meal)}};}
  var list;try{list=PLANS;}catch(e){list=null;}
  if(!list||!list.length){try{list=JSON.parse(localStorage.getItem("zfv5_plans")||"[]");}catch(e){list=[];}}
  return JSON.stringify(list.slice(-8).reverse().map(exp));
})()`;

// ── Workout generator (generators/workout.html) ──────────────────────────────
// Her own tool, unchanged. The platform drives it from the outside:
//   global `S` (client, env, level, days, goal, conditions, plan), `go(step)`,
//   `render()`, `generate()`, `altFor(ex)`, and EX entries' `group`/`muscle`.
//   CONTRIB_OVERRIDE / CONTRIB_BY_GROUP give the helper muscles for the share card.

const INJURY_TO_CONDITION: [RegExp, string][] = [
  [/ركب/, "knee"], [/ظهر|قطن|ديسك|فقرات/, "lowerback"], [/كتف|أكتاف/, "shoulder"],
  [/رسغ|معصم/, "wrist"], [/رقب/, "neck"], [/انفصال|ديستاسس|بعد الولادة/, "diastasis"]
];

/** The generator's settings from the subscriber's answers (S fields). */
export function workoutGeneratorState(raw: unknown) {
  const a: IntakeAnswers = normalizeAnswers(raw);
  const env = a.workout.place === "gym" ? "gym" : a.workout.place === "home_weights" ? "home" : a.workout.place === "bodyweight" ? "bodyweight" : null;
  const level = a.workout.level === "advanced" ? 3 : a.workout.level === "intermediate" ? 2 : a.workout.level === "beginner" ? 1 : null;
  const goal = a.goal === "muscle" ? "hypertrophy" : a.goal === "lose" ? "cutting" : a.goal === "shape" ? "hypertrophy" : null;
  const injuries = [...a.workout.injuries, a.workout.notes, ...a.health].join(" ");
  const conditions = INJURY_TO_CONDITION.filter(([re]) => re.test(injuries)).map(([, c]) => c);
  return {
    client: { name: a.full_name, age: a.age ? String(a.age) : "", height: a.height_cm ? String(a.height_cm) : "", weight: a.weight_kg ? String(a.weight_kg) : "", phone: a.phone.replace(/[^\d+]/g, ""), gender: a.gender || "female" },
    env, level, days: a.workout.days && a.workout.days >= 2 && a.workout.days <= 6 ? a.workout.days : null, goal, conditions,
    notes: [a.workout.notes, a.goal_details].filter(Boolean).join("\n")
  };
}

/** Runs inside the workout generator: puts her settings in and opens the setup step. */
export const FILL_WORKOUT_SCRIPT = (st: ReturnType<typeof workoutGeneratorState>, token = "") => `(function(V,T){
  // Her «توليد بالذكاء الاصطناعي» calls /api/generate: send it with her session so only she can use it.
  try{
    if(T && !window.__zfFetch){
      window.__zfFetch = window.fetch;
      window.fetch = function(u,o){ o=o||{}; if(String(u).indexOf("/api/generate")===0){ o.headers=Object.assign({},o.headers||{},{Authorization:"Bearer "+T}); } return window.__zfFetch(u,o); };
    }
  }catch(e){}
  try{
    Object.assign(S.client, V.client);
    if(V.env) S.env=V.env;
    if(V.level) S.level=V.level;
    if(V.days) S.days=V.days;
    if(V.goal) S.goal=V.goal;
    if(V.conditions && V.conditions.length) S.conditions=V.conditions;
    if(V.notes && !S.aiRequest) S.aiRequest=V.notes;
    if(typeof go==="function") go(0); else if(typeof render==="function") render();
  }catch(e){}
  return true;
})(${JSON.stringify(st)}, ${JSON.stringify(token)})`;

/** Runs inside the workout generator: the plan it shows, in the platform's workout-plan format. */
export const READ_WORKOUT_SCRIPT = `(function(){
  var MAP={chest:["chest"],back:["upperback","midback","lats"],shoulders:["frontdelt","sidedelt","reardelt"],biceps:["biceps"],triceps:["triceps"],
    quads:["quads"],hams:["hamstrings"],glutes:["glutes"],adductors:["adductors"],calves:["calves"],abs:["absfront","absside"]};
  function helpers(e){
    var c=null;try{c=(CONTRIB_OVERRIDE&&CONTRIB_OVERRIDE[e.id])||(CONTRIB_BY_GROUP&&CONTRIB_BY_GROUP[e.group]);}catch(x){}
    var out=[];if(!c)return out;
    Object.keys(c).forEach(function(g){if(g===e.group||c[g]>=1)return;
      var ms=MAP[g]||[];
      // pressing works the front of the shoulder, pulling the back of it
      if(g==="shoulders") ms=e.pattern==="push"?["frontdelt"]:e.pattern==="pull"?["reardelt"]:ms;
      if(g==="back") ms=e.pattern==="pull"?["lats","midback"]:["midback"];
      ms.forEach(function(m){if(m!==e.muscle&&out.indexOf(m)<0)out.push(m);});});
    return out;
  }
  function vid(e){try{return (videoLinks&&videoLinks[e.id])||e.video||"";}catch(x){return e.video||"";}}
  function ex(e){var a=null;try{a=altFor(e);}catch(x){}
    return {id:String(e.id||""),name:String(e.name||""),en:String(e.en||""),muscle:String(e.muscle||""),sets:Number(e.sets)||3,reps:String(e.reps||""),rest:String(e.rest||""),tip:String(e.tip||""),
      video:vid(e),alt:a?{name:String(a.name||""),video:vid(a)}:null,primary:e.muscle?[String(e.muscle)]:[],secondary:helpers(e)};}
  if(!S||!S.plan||!S.plan.length) return "";
  return JSON.stringify({format:"zahraafit-workout-plan",v:1,exportedAt:new Date().toISOString(),name:String((S.client&&S.client.name)||""),env:String(S.env||""),
    days:S.plan.map(function(d,i){return {n:i+1,title:String(d.title||("اليوم "+(i+1))),exercises:(d.exercises||[]).map(ex)};})});
})()`;
