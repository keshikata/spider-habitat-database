// The largest genus in the loaded Japanese catalog sets the comparison capacity.
export function comparisonCapacity(species){
  const counts=new Map();
  for(const s of species)if(s.genus)counts.set(s.genus,(counts.get(s.genus)||0)+1);
  const [genus,count]=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||['',1];
  return {genus,count};
}
