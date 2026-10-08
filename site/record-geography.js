// The same geographic scope is used for summaries, map rows and downloads.
export function recordScope(geography, species, prefs, scope) {
  const fullPrefs = new Set(), regionIds = new Set(), unresolved = new Set();
  for (const pref of prefs) {
    const record = species.recordAreas?.[pref];
    if (!geography || scope !== 'recorded' || !record || record.unspecified) {
      fullPrefs.add(pref);
      continue;
    }
    const add = (id, label) => {
      if (id && geography.regions[id]?.pref === pref) regionIds.add(String(id));
      else unresolved.add(label);
    };
    if (record.mainland) add(geography.mainland[pref], '本土（県番号' + pref + '）');
    for (const island of record.islands) add(geography.islands[island], island);
  }
  return {mode: scope, fullPrefs, regionIds, unresolved: [...unresolved]};
}
export function includesRecordRow(scope, row) {
  return scope.fullPrefs.has(row[2]) || scope.regionIds.has(String(row[4]));
}
export function scopedSummaries(data, scope) {
  return [...scope.fullPrefs].map(p => data.summary[p]).concat(
    [...scope.regionIds].map(id => data.geography.regions[id]));
}
export function attachRegions(rows, runs) {
  if (!Array.isArray(runs) || !runs.length || runs[0][0] !== 0 ||
      runs.some((r,i) => r.length !== 2 || !Number.isSafeInteger(r[0]) || r[0] < 0 || r[0] >= rows.length ||
        !Number.isSafeInteger(r[1]) || r[1] < 0 || (i > 0 && r[0] <= runs[i-1][0]))) throw new Error('地域区分データが不正です');
  let current = 0;
  return rows.map((row, i) => {
    while (current + 1 < runs.length && runs[current + 1][0] <= i) current++;
    return [...row, runs[current][1]];
  });
}
export function geographicNote(geography, scope) {
  if (scope.mode !== 'recorded') return '選択した県全域を対象（分布記録による制限なし）';
  if (!geography) return '県全域を対象（島別の区分データなし）';
  const parts = ['記録のある本土・島を約250m区画で限定'];
  if (scope.fullPrefs.size) parts.push('詳細不明の記録は県全域');
  if (scope.unresolved.length) parts.push('範囲未対応のため除外：' + scope.unresolved.join('、'));
  return parts.join('。');
}
