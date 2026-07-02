import {
  buildPopupItems,
  canCompleteFromAnalysis,
  formatRequirementsSummary,
  shouldStopBatchOnError,
} from '../shared/sbc-popup-model.js';

describe('popup-sbc', () => {
  test('canCompleteFromAnalysis requires solver solution', () => {
    expect(
      canCompleteFromAnalysis({
        completed: false,
        feasibility: { solutionFound: true, quickCheck: true },
        recommendation: 'recomendado',
      })
    ).toBe(true);

    expect(
      canCompleteFromAnalysis({
        completed: false,
        feasibility: { solutionFound: false, quickCheck: true },
        recommendation: 'viável',
      })
    ).toBe(false);

    expect(
      canCompleteFromAnalysis({
        completed: true,
        feasibility: { solutionFound: true, quickCheck: true },
        recommendation: 'recomendado',
      })
    ).toBe(false);
  });

  test('formatRequirementsSummary joins arrays', () => {
    expect(formatRequirementsSummary(['1 prata', 'OVR 65+'])).toBe('1 prata · OVR 65+');
    expect(formatRequirementsSummary('1 ouro')).toBe('1 ouro');
  });

  test('shouldStopBatchOnError detects blocking errors', () => {
    expect(shouldStopBatchOnError('Hourly limit reached for sbc_read')).toBe(true);
    expect(shouldStopBatchOnError('Não foi possível abrir o DME no Web App')).toBe(true);
    expect(shouldStopBatchOnError('Solver failed')).toBe(false);
  });

  test('buildPopupItems deduplicates and maps fields', () => {
    const items = buildPopupItems({
      all: [
        {
          challengeId: '1',
          setId: 10,
          name: 'Daily Bronze Upgrade',
          recommendation: 'recomendado',
          score: 50,
          completed: false,
          feasibility: { solutionFound: true, quickCheck: true, issues: [] },
          requirementsSummary: ['1 prata', 'OVR 65+'],
        },
        {
          challengeId: '1',
          setId: 10,
          name: 'Daily Bronze Upgrade',
          recommendation: 'recomendado',
          score: 50,
          completed: false,
          feasibility: { solutionFound: true, quickCheck: true, issues: [] },
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0].canComplete).toBe(true);
    expect(items[0].requirementsSummary).toBe('1 prata · OVR 65+');
  });
});
