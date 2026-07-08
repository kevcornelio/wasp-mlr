// Food-themed contribution levels. Score = approved blogs ×5 + food spots ×3
// + photos ×1 (mirrors the admin dashboard's ranking weights).

export type FoodLevel = { name: string; emoji: string; min: number };

export const FOOD_LEVELS: FoodLevel[] = [
  { name: 'New Foodie', emoji: '🍽️', min: 0 },
  { name: 'Taster', emoji: '🥢', min: 1 },
  { name: 'Food Explorer', emoji: '🍜', min: 10 },
  { name: 'Local Expert', emoji: '🍱', min: 25 },
  { name: 'Connoisseur', emoji: '⭐', min: 50 },
  { name: 'Food Legend', emoji: '👑', min: 100 },
];

export const contributionScore = (blogs: number, spots: number, photos: number): number =>
  blogs * 5 + spots * 3 + photos;

export const getLevel = (score: number): FoodLevel =>
  [...FOOD_LEVELS].reverse().find(l => score >= l.min) ?? FOOD_LEVELS[0];

// The next level up, or null when already at the top.
export const getNextLevel = (score: number): FoodLevel | null =>
  FOOD_LEVELS.find(l => l.min > score) ?? null;
