/**
 * Pure helpers for popup SBC list rendering (testable without Chrome APIs).
 */

/**
 * @param {string[]|string|null|undefined} summary
 */
export function formatRequirementsSummary(summary) {
  if (!summary) return 'Requisitos não carregados';
  if (Array.isArray(summary)) return summary.filter(Boolean).join(' · ');
  return String(summary);
}

/**
 * Popup só permite executar DMEs com solução confirmada pelo solver.
 * @param {Object} entry
 */
export function canCompleteFromAnalysis(entry) {
  if (entry.completed) return false;
  return Boolean(entry.feasibility?.solutionFound);
}

/**
 * @param {Object} analysisResult
 */
export function buildPopupItems(analysisResult) {
  const source = analysisResult.all?.length
    ? analysisResult.all
    : [
        ...(analysisResult.recommended || []),
        ...(analysisResult.bestValue || []),
      ];

  const seen = new Set();
  const items = [];

  for (const entry of source) {
    const key = `${entry.setId}:${entry.challengeId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      challengeId: String(entry.challengeId),
      setId: entry.setId,
      name: entry.name || entry.setName,
      setName: entry.setName,
      category: entry.category,
      completed: Boolean(entry.completed),
      recommendation: entry.recommendation,
      score: entry.score,
      requirementsSummary: formatRequirementsSummary(entry.requirementsSummary),
      estimatedCost: entry.estimatedCost,
      estimatedBenefit: entry.estimatedBenefit,
      canComplete: canCompleteFromAnalysis(entry),
      solveStatus: entry.feasibility?.solveStatus,
      solutionFound: Boolean(entry.feasibility?.solutionFound),
      issues: entry.feasibility?.issues || [],
    });
  }

  items.sort((a, b) => b.score - a.score);
  return items;
}

/**
 * Erros que tornam inútil continuar um batch de DMEs.
 * @param {string|null|undefined} error
 */
export function shouldStopBatchOnError(error) {
  const msg = String(error || '').toLowerCase();
  return (
    msg.includes('hourly limit')
    || msg.includes('rate limit')
    || msg.includes('monitor mode')
    || msg.includes('web app not ready')
    || msg.includes('não foi possível abrir o dme')
  );
}
