import type {
  FoodOption,
  PlaceSuggestion,
  RankedResult,
  SessionResponse,
} from "../api";

export const PARTICIPANT_YOU = "p-you";
export const PARTICIPANT_OTHER = "p-other";

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80`;

export const mockOptions: FoodOption[] = [
  {
    id: "opt-pizza",
    name: "Pizza Express",
    addedBy: PARTICIPANT_YOU,
    address: "42 Main St, Downtown",
    googlePlaceId: "ChIJmockPizza",
    rating: 4.6,
    userRatingCount: 1200,
    priceLevel: "$$",
    websiteUri: "https://example.com/pizza",
    googleMapsUri: "https://www.google.com/maps/search/?api=1&query=Pizza",
    photoUrl: photo("photo-1513104890138-7c749659a591"),
  },
  {
    id: "opt-burger",
    name: "The Burger Joint",
    addedBy: PARTICIPANT_OTHER,
    address: "9 River Rd",
    googlePlaceId: "ChIJmockBurger",
    rating: 4.4,
    userRatingCount: 890,
    priceLevel: "$$$",
    websiteUri: null,
    googleMapsUri: "https://www.google.com/maps/search/?api=1&query=Burger",
    photoUrl: photo("photo-1568901346375-23c9450c58cd"),
  },
  {
    id: "opt-sushi",
    name: "Sakura Sushi",
    addedBy: PARTICIPANT_OTHER,
    address: "100 Ocean Ave",
    rating: 4.8,
    userRatingCount: 340,
    priceLevel: "$$",
    googleMapsUri: "https://www.google.com/maps/search/?api=1&query=Sushi",
    photoUrl: photo("photo-1579584425555-c3ce17fd4351"),
  },
];

export function sessionCollecting(
  overrides: Partial<SessionResponse> = {},
): SessionResponse {
  return {
    sessionId: "ladle-session",
    joinCode: "BINGE1",
    status: "collecting",
    participants: [
      { id: PARTICIPANT_YOU, label: "Alex" },
      { id: PARTICIPANT_OTHER, label: "Jordan" },
    ],
    options: mockOptions,
    ratings: {},
    selectionDone: { [PARTICIPANT_YOU]: false, [PARTICIPANT_OTHER]: false },
    maxParticipants: 8,
    isReadyForResults: false,
    usedGooglePlaceIds: ["ChIJmockPizza", "ChIJmockBurger"],
    title: "Friday Night Feast",
    maxPicksPerParticipant: 5,
    ...overrides,
  };
}

export function sessionRating(
  overrides: Partial<SessionResponse> = {},
): SessionResponse {
  return sessionCollecting({
    status: "rating",
    selectionDone: { [PARTICIPANT_YOU]: true, [PARTICIPANT_OTHER]: true },
    ratings: {
      [PARTICIPANT_YOU]: {
        "opt-pizza": 9,
        "opt-burger": 7,
        "opt-sushi": 8,
      },
      [PARTICIPANT_OTHER]: {
        "opt-pizza": 8,
        "opt-burger": 9,
        "opt-sushi": 6,
      },
    },
    ...overrides,
  });
}

export function sessionResults(
  overrides: Partial<SessionResponse> = {},
): SessionResponse {
  return sessionRating({
    status: "results",
    isReadyForResults: true,
    ...overrides,
  });
}

export const mockSuggestions: PlaceSuggestion[] = [
  {
    placeId: "ChIJnew1",
    name: "Taco Fiesta",
    address: "22 Market St",
    types: ["restaurant", "food"],
    foodType: "Mexican",
    rating: 4.5,
    userRatingCount: 210,
  },
  {
    placeId: "ChIJnew2",
    name: "The Green Leaf",
    address: "5 Park Ln",
    types: ["restaurant"],
    foodType: "Salad",
    rating: 4.2,
    userRatingCount: 88,
  },
];

export const mockResultsSingleWinner: RankedResult[] = [
  {
    optionId: "opt-pizza",
    name: "Pizza Express",
    averageScore: 8.5,
    disagreementPenalty: 0.4,
    finalScore: 8.1,
    rank: 1,
  },
  {
    optionId: "opt-burger",
    name: "The Burger Joint",
    averageScore: 8.0,
    disagreementPenalty: 0.5,
    finalScore: 7.5,
    rank: 2,
  },
  {
    optionId: "opt-sushi",
    name: "Sakura Sushi",
    averageScore: 7.0,
    disagreementPenalty: 0.6,
    finalScore: 6.4,
    rank: 3,
  },
];

export const mockResultsTie: RankedResult[] = [
  {
    optionId: "opt-pizza",
    name: "Pizza Express",
    averageScore: 8.5,
    disagreementPenalty: 0.3,
    finalScore: 8.2,
    rank: 1,
  },
  {
    optionId: "opt-burger",
    name: "The Burger Joint",
    averageScore: 8.3,
    disagreementPenalty: 0.1,
    finalScore: 8.2,
    rank: 1,
  },
  {
    optionId: "opt-sushi",
    name: "Sakura Sushi",
    averageScore: 6.5,
    disagreementPenalty: 0.2,
    finalScore: 6.3,
    rank: 2,
  },
];

export const mockResultsEveryoneTied: RankedResult[] = mockOptions.map((o) => ({
  optionId: o.id,
  name: o.name,
  averageScore: 8,
  disagreementPenalty: 0,
  finalScore: 8,
  rank: 1,
}));
