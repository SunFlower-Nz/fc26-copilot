/**
 * Rough coin-value estimates for SBC rewards (for ranking only).
 */

const PACK_KEYWORDS = [
  { pattern: /prime gold|ouro prime/i, value: 12000 },
  { pattern: /jumbo gold|mega pack/i, value: 8000 },
  { pattern: /gold players|jogadores de ouro/i, value: 5000 },
  { pattern: /rare gold|ouro raro/i, value: 4500 },
  { pattern: /gold pack|pacote de ouro|ouro comum/i, value: 3500 },
  { pattern: /silver players|jogadores de prata/i, value: 1500 },
  { pattern: /silver pack|pacote de prata|prata/i, value: 1200 },
  { pattern: /bronze pack|pacote de bronze|bronze/i, value: 400 },
  { pattern: /token/i, value: 6000 },
  { pattern: /evolution/i, value: 3000 },
];

/**
 * @param {Object} challengeData
 * @returns {{ items: Array<{ label: string, estimatedValue: number }>, totalValue: number }}
 */
export function estimateRewards(challengeData) {
  const challenge = challengeData?.challenge || challengeData;
  const awards =
    challenge?.awards ||
    challengeData?.awards ||
    challenge?.rewards ||
    challengeData?.rewards ||
    challenge?.challengeAwards ||
    [];

  const items = [];
  let totalValue = 0;

  for (const award of awards) {
    const parsed = parseAward(award);
    if (parsed) {
      items.push(parsed);
      totalValue += parsed.estimatedValue;
    }
  }

  // Set-level reward hints
  const setName = (challenge?.name || challengeData?.name || '').toLowerCase();
  if (!items.length) {
    const fallback = fallbackFromName(setName);
    if (fallback) {
      items.push(fallback);
      totalValue += fallback.estimatedValue;
    }
  }

  return { items, totalValue };
}

function parseAward(award) {
  const type = (award.type || award.awardType || '').toLowerCase();
  const count = Number(award.count ?? award.amount ?? 1) || 1;
  const value = award.value ?? award.itemId ?? award.packId;
  const label =
    award.description ||
    award.name ||
    award.displayName ||
    (type === 'pack' ? `Pack #${value}` : type || 'Recompensa');

  let unitValue = 0;

  if (type === 'coins' || type === 'currency') {
    unitValue = Number(value) || 0;
  } else if (type === 'pack' || type === 'item') {
    unitValue = packValueFromLabel(String(label)) || packValueFromId(Number(value)) || 2000;
  } else if (type === 'player') {
    unitValue = (award.rating || 75) * 400;
  } else {
    unitValue = packValueFromLabel(String(label)) || 1500;
  }

  return {
    label: count > 1 ? `${label} x${count}` : String(label),
    estimatedValue: unitValue * count,
  };
}

function packValueFromLabel(label) {
  for (const { pattern, value } of PACK_KEYWORDS) {
    if (pattern.test(label)) return value;
  }
  return 0;
}

function packValueFromId(packId) {
  if (!packId) return 0;
  if (packId >= 500 && packId < 520) return 400;
  if (packId >= 520 && packId < 540) return 1200;
  if (packId >= 540) return 3500;
  return 0;
}

function fallbackFromName(name) {
  if (name.includes('bronze upgrade') || name.includes('melhoria de bronze')) {
    return { label: 'Pack prata (est.)', estimatedValue: 1200 };
  }
  if (name.includes('silver upgrade') || name.includes('melhoria de prata')) {
    return { label: 'Pack ouro (est.)', estimatedValue: 3500 };
  }
  if (name.includes('gold upgrade') || name.includes('melhoria de ouro')) {
    return { label: 'Pack ouro raro (est.)', estimatedValue: 5000 };
  }
  if (name.includes('upgrade')) {
    return { label: 'Pack upgrade (est.)', estimatedValue: 2500 };
  }
  return null;
}
