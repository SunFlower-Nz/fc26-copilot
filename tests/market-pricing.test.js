import { isPremiumLowTierCard, listingPricesFromAverage, roundMarketPrice } from '../background/market/market-pricing.js';

describe('market-pricing', () => {
  test('detects premium bronze like Nilsen (high avg vs tier)', () => {
    const nilsen = { rating: 64, untradeable: false, marketAverage: 9500 };
    expect(isPremiumLowTierCard(nilsen)).toBe(true);
  });

  test('detects premium silver at 350 vs typical 200', () => {
    const silver = { rating: 72, untradeable: false, marketAverage: 350 };
    expect(isPremiumLowTierCard(silver)).toBe(true);
  });

  test('detects premium silver like Guendouzi', () => {
    const guendouzi = { rating: 72, untradeable: false, marketAverage: 1800 };
    expect(isPremiumLowTierCard(guendouzi)).toBe(true);
  });

  test('rejects common bronze fodder', () => {
    const common = { rating: 58, untradeable: false, marketAverage: 250 };
    expect(isPremiumLowTierCard(common)).toBe(false);
  });

  test('rejects untradeable silver', () => {
    const card = { rating: 70, untradeable: true, marketAverage: 2000 };
    expect(isPremiumLowTierCard(card)).toBe(false);
  });

  test('rounds listing prices to EA steps', () => {
    expect(roundMarketPrice(9500)).toBe(9500);
    expect(listingPricesFromAverage(9500).buyNow).toBe(9500);
  });
});
