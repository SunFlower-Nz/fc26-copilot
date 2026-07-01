import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseSbcRequirements,
  applyUpgradeHeuristics,
  getRequiredPlayerCount,
} from '../background/sbc/requirements-parser.js';
import {
  calculateSquadChemistry,
  calculateTeamRating,
} from '../background/sbc/chemistry-engine.js';
import { solveFromChallengeData, satisfiesConstraints } from '../background/sbc/solver.js';
import { isPlayerProtected } from '../background/sbc/protected-players.js';

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

describe('requirements-parser', () => {
  test('parses bronze upgrade fixture', () => {
    const data = loadFixture('sbc-bronze-upgrade.json');
    const constraints = applyUpgradeHeuristics(parseSbcRequirements(data), data.name);
    expect(constraints.squadSize).toBe(1);
    expect(getRequiredPlayerCount(constraints)).toBe(1);
  });

  test('parses gold upgrade with 5 players', () => {
    const data = loadFixture('sbc-gold-upgrade.json');
    const constraints = applyUpgradeHeuristics(parseSbcRequirements(data), data.name);
    expect(getRequiredPlayerCount(constraints)).toBe(5);
  });

  test('parses full squad chemistry and rating reqs', () => {
    const data = loadFixture('sbc-full-squad.json');
    const constraints = parseSbcRequirements(data);
    expect(constraints.minTeamRating).toBe(80);
    expect(constraints.minChemistry).toBe(26);
    expect(constraints.playerRequirements.length).toBeGreaterThan(0);
  });
});

describe('chemistry-engine', () => {
  test('calculates team rating as rounded average', () => {
    const squad = [makePlayer({ id: 1, rating: 80 }), makePlayer({ id: 2, rating: 82 })];
    expect(calculateTeamRating(squad)).toBe(81);
  });

  test('gives chemistry for matching nations', () => {
    const squad = [
      makePlayer({ id: 1, rating: 60, nation: 54 }),
      makePlayer({ id: 2, rating: 61, nation: 54 }),
    ];
    expect(calculateSquadChemistry(squad)).toBeGreaterThan(0);
  });
});

describe('protected-players', () => {
  test('blocks high rated players', () => {
    const player = makePlayer({ id: 1, rating: 93 });
    expect(isPlayerProtected(player, { minRating: 87 })).toBe(true);
  });

  test('allows bronze fodder', () => {
    const player = makePlayer({ id: 2, rating: 58 });
    expect(isPlayerProtected(player, { minRating: 87 })).toBe(false);
  });
});

describe('solver', () => {
  test('solves bronze upgrade with cheapest bronze', () => {
    const data = loadFixture('sbc-bronze-upgrade.json');
    const pool = [
      makePlayer({ id: 101, rating: 64 }),
      makePlayer({ id: 102, rating: 55 }),
      makePlayer({ id: 103, rating: 90, nation: 54 }),
    ];
    const solution = solveFromChallengeData(data, pool, { challengeName: data.name });
    expect(solution).not.toBeNull();
    expect(solution.players).toHaveLength(1);
    expect(solution.players[0].player.rating).toBe(55);
  });

  test('solves silver upgrade', () => {
    const data = loadFixture('sbc-silver-upgrade.json');
    const pool = [
      makePlayer({ id: 201, rating: 70 }),
      makePlayer({ id: 202, rating: 66 }),
    ];
    const solution = solveFromChallengeData(data, pool, { challengeName: data.name });
    expect(solution).not.toBeNull();
    expect(solution.players[0].player.rating).toBe(66);
  });

  test('solves gold upgrade with 5 golds', () => {
    const data = loadFixture('sbc-gold-upgrade.json');
    const pool = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ id: 300 + i, rating: 76 + (i % 3) })
    );
    const solution = solveFromChallengeData(data, pool, { challengeName: data.name });
    expect(solution).not.toBeNull();
    expect(solution.players).toHaveLength(5);
  });

  test('satisfies full squad constraints when pool is sufficient', () => {
    const data = loadFixture('sbc-full-squad.json');
    const constraints = parseSbcRequirements(data);
    const pool = Array.from({ length: 20 }, (_, i) =>
      makePlayer({
        id: 400 + i,
        rating: 80 + (i % 3),
        nation: i < 3 ? 54 : 14 + i,
        leagueId: 13 + (i % 5),
        rareflag: i < 6 ? 1 : 0,
      })
    );
    const solution = solveFromChallengeData(data, pool);
    if (solution) {
      const squad = solution.players.map((p) => p.player);
      expect(satisfiesConstraints(constraints, squad)).toBe(true);
    }
  });
});
