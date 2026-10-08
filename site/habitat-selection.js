// A shared habitat choice applies the same environment definitions to every species.
export function habitatSelection(rulesBySpecies, ids) {
  if (ids === null) return {};
  const chosen = new Set(ids);
  return Object.fromEntries(Object.entries(rulesBySpecies).map(([id, rules]) =>
    [id, rules.filter(rule => chosen.has(rule.id)).map(rule => rule.id)]));
}
export function evaluableRules(rules, model) {
  return rules.filter(rule => rule.supported!==false && (model === 'cover' ? (rule.baseClasses ?? rule.classes) : rule.classes).length);
}
