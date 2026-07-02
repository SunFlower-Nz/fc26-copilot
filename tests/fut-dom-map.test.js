import {
  futLabelIncludes,
  isSbcHubView,
  isSbcSquadView,
  normalizeFutLabel,
} from '../shared/fut-dom-map.js';

describe('fut-dom-map', () => {
  test('normalizeFutLabel strips accents and punctuation', () => {
    expect(normalizeFutLabel('Daily Bronze Upgrade')).toBe('daily bronze upgrade');
    expect(normalizeFutLabel('Desafíos de Elenco')).toBe('desafios de elenco');
  });

  test('futLabelIncludes matches partial names', () => {
    expect(futLabelIncludes('Daily Bronze Upgrade', 'bronze upgrade')).toBe(true);
    expect(futLabelIncludes('Daily Silver Upgrade', 'bronze')).toBe(false);
  });

  test('controller view helpers', () => {
    expect(isSbcHubView('UTSBCHubViewController')).toBe(true);
    expect(isSbcHubView('UTHomeHubViewController')).toBe(false);
    expect(isSbcSquadView('UTSBCSquadSplitViewController')).toBe(true);
    expect(isSbcSquadView('UTSBCSquadDetailPanelViewController')).toBe(true);
  });
});
