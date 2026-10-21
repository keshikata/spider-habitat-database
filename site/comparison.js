// The largest genus in the loaded Japanese catalog sets the comparison capacity.
export function comparisonCapacity(species){
  const counts=new Map();
  for(const s of species)if(s.genus)counts.set(s.genus,(counts.get(s.genus)||0)+1);
  const [genus,count]=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||['',1];
  return {genus,count};
}
export function restoreComparison(raw,species,limit){
  const known=new Set(species.map(s=>s.id));
  // Unknown environment information is a displayed result, not a missing species.
  return [...new Set((raw??'').split(',').filter(id=>known.has(id)))].slice(0,limit);
}
