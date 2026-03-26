import type { FoodOption } from '../api'

/** Rotating stock images when the API has no `photoUrl` (manual entries or Places without photos). */
const FOOD_IMAGES = [
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
  'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=800&q=80',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800&q=80',
  'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80',
  'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=800&q=80',
  'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=800&q=80',
  'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=800&q=80',
]

export function foodImageForIndex(index: number): string {
  return FOOD_IMAGES[index % FOOD_IMAGES.length]
}

/**
 * Prefer a real place photo from the session (`photoUrl` from Google Places via backend proxy);
 * otherwise use a stable Unsplash placeholder from `index`.
 */
export function foodImageForOption(option: FoodOption | undefined | null, index: number): string {
  const raw = option?.photoUrl?.trim()
  if (raw) {
    return raw
  }
  return foodImageForIndex(index)
}
