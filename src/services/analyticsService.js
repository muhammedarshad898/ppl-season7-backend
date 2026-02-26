function toNum(value) {
  return Number(value || 0);
}

function computeAnalytics({ teams = [], players = [], config = {} }) {
  const soldPlayers = players.filter((player) => player.status === 'sold');
  const totalSoldValue = soldPlayers.reduce((sum, player) => sum + toNum(player.soldPrice), 0);

  const highestSpenderTeam = teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      spent: toNum(team.spent),
      budget: toNum(team.budget),
      playersCount: Array.isArray(team.players) ? team.players.length : 0,
    }))
    .sort((a, b) => b.spent - a.spent)[0] || null;

  const budgetEfficiency = teams.map((team) => {
    const budget = Math.max(1, toNum(team.budget));
    const spent = toNum(team.spent);
    const signed = Array.isArray(team.players) ? team.players.length : 0;
    return {
      id: team.id,
      team: team.name,
      spent,
      budget,
      spendRatePct: Number(((spent / budget) * 100).toFixed(2)),
      avgCostPerPlayer: signed ? Number((spent / signed).toFixed(2)) : 0,
      remaining: budget - spent,
    };
  }).sort((a, b) => b.spendRatePct - a.spendRatePct);

  const categoryTotalsMap = new Map();
  soldPlayers.forEach((player) => {
    const category = player.position || 'OTHER';
    categoryTotalsMap.set(category, (categoryTotalsMap.get(category) || 0) + toNum(player.soldPrice));
  });

  const categorySpending = Array.from(categoryTotalsMap.entries())
    .map(([category, total]) => ({
      category,
      total,
      sharePct: totalSoldValue ? Number(((total / totalSoldValue) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const soldPrices = soldPlayers.map((player) => toNum(player.soldPrice)).filter((value) => value > 0);
  soldPrices.sort((a, b) => a - b);

  const min = soldPrices[0] || 0;
  const max = soldPrices[soldPrices.length - 1] || 0;
  const avg = soldPrices.length
    ? Number((soldPrices.reduce((sum, value) => sum + value, 0) / soldPrices.length).toFixed(2))
    : 0;

  const buckets = [
    { label: '0-99', min: 0, max: 99, count: 0 },
    { label: '100-149', min: 100, max: 149, count: 0 },
    { label: '150-199', min: 150, max: 199, count: 0 },
    { label: '200+', min: 200, max: Number.POSITIVE_INFINITY, count: 0 },
  ];

  soldPrices.forEach((price) => {
    const bucket = buckets.find((item) => price >= item.min && price <= item.max);
    if (bucket) bucket.count += 1;
  });

  const teamAverageCost = teams.map((team) => {
    const signed = Array.isArray(team.players) ? team.players.length : 0;
    const spent = toNum(team.spent);
    return {
      id: team.id,
      team: team.name,
      signed,
      totalSpent: spent,
      avgCost: signed ? Number((spent / signed).toFixed(2)) : 0,
    };
  }).sort((a, b) => b.avgCost - a.avgCost);

  return {
    generatedAt: new Date().toISOString(),
    teamBudgetLimit: toNum(config.teamBudgetLimit || 1500),
    totals: {
      soldPlayers: soldPlayers.length,
      soldValue: totalSoldValue,
      unsoldPlayers: players.filter((player) => player.status === 'unsold').length,
      availablePlayers: players.filter((player) => player.status === 'available').length,
    },
    highestSpenderTeam,
    budgetEfficiency,
    categorySpending,
    priceDistribution: {
      min,
      max,
      avg,
      buckets,
    },
    teamAverageCost,
  };
}

module.exports = {
  computeAnalytics,
};
