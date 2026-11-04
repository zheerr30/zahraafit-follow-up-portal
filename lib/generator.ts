// The coach's meal generator runs inside the platform, unchanged: its HTML file
// is stored in the private "generators" bucket and shown in a same-origin
// iframe, so the platform can fill the form and read the finished plan.

import { normalizeAnswers, type IntakeAnswers } from "@/lib/intake";

export const MEAL_GENERATOR_PATH = "meal.html";

/** Values for the generator's own form fields, from the subscriber's answers. */
export function mealGeneratorFields(raw: unknown): Record<string, string> {
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
    a.comments && `تعليقات: ${a.comments}`
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
