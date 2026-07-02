import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  quickFeasibilityCheck,
  estimateCheapestCost,
  analyzeChallengeEntry,
} from '../background/sbc/sbc-analyzer.js';
import { parseSbcRequirements } from '../background/sbc/requirements-parser.js';
import { summarizeConstraints } from '../background/sbc/requirements-summary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function makePlayer(overrides) {
  return {
    id: overrides.id,
    assetId: overrides.assetId || overrides.id,
    rating: overrides.rating,
    nation: overrides.nation || 54,
    leagueId: overrides.leagueId || 13,
    teamid: overrides.teamid || 1,
    untradeable: overrides.untradeable ?? true,
    rareflag: overrides.rareflag ?? 0,
    ...overrides,
  };
}

describe('requirements-summary', () => {
  test('summarizes 11 silver from EA fixture', () => {
    const data = loadFixture('sbc-silver-upgrade.json');
    const constraints = parseSbcRequirements(data);
    const summary = summarizeConstraints(constraints);
    expect(summary.some((l) => l.includes('11') && l.includes('prata'))).toBe(true);
  });
});

describe('sbc-analyzer', () => {
  test('quick feasibility passes with enough silvers', () => {
    const data = loadFixture('sbc-silver-upgrade.json');
    const constraints = parseSbcRequirements(data);
    const pool = Array.from({ length: 20 }, (_, i) =>
      makePlayer({ id: 100 + i, rating: 66 + (i % 4) })
    );
    const quick = quickFeasibilityCheck(pool, constraints);
    expect(quick.feasible).toBe(true);
    expect(quick.requiredCount).toBe(11);
  });

  test('analyzeChallengeEntry marks silver upgrade as recommended when solvable', () => {
    const data = loadFixture('sbc-silver-upgrade.json');
    const pool = Array.from({ length: 20 }, (_, i) =>
      makePlayer({ id: 200 + i, rating: 66 + (i % 4) })
    );
    const entry = {
      challengeId: '17',
      setId: 6,
      name: 'Silver Upgrade',
      setName: 'Silver Upgrade',
      category: 'Upgrades',
      elgReq: data.elgReq,
      squadSize: 11,
      rawRequirements: data,
      requirementsSource: 'ea_challenge',
    };
    const result = analyzeChallengeEntry(entry, pool, { try_solve: true });
    expect(result.feasibility.solutionFound).toBe(true);
    expect(result.requirementsSummary.length).toBeGreaterThan(0);
    expect(['excelente', 'recomendado', 'viável']).toContain(result.recommendation);
  });

  test('estimateCheapestCost picks cheaper tradeable', () => {
    const constraints = parseSbcRequirements(loadFixture('sbc-bronze-upgrade.json'));
    const cheap = makePlayer({ id: 1, rating: 55, untradeable: false, marketAverage: 100 });
    const expensive = makePlayer({ id: 2, rating: 58, untradeable: false, marketAverage: 900 });
    const estCheap = estimateCheapestCost([cheap, expensive], constraints);
    const estExpensive = estimateCheapestCost([expensive], constraints);
    expect(estCheap.canEstimate).toBe(true);
    expect(estCheap.estimatedCost).toBeLessThan(estExpensive.estimatedCost);
  });
});
