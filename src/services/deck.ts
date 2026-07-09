// Lightweight spaced-repetition deck stored in localStorage.
// Scheduling is an SM-2-lite scheme: each card carries an ease factor and an
// interval in days; the four ratings adjust them the way Anki-style apps do.

import { Concept } from './geminiService';

export interface Card {
  id: string;
  term: string;
  definition: string;
  ease: number;        // ~1.3 (hard) .. 2.8 (easy)
  intervalDays: number;
  dueTs: number;       // epoch ms when the card is next due
  reps: number;
  createdTs: number;
}

export type Rating = 'again' | 'hard' | 'good' | 'easy';

const KEY = 'cognicard_deck';
const DAY = 86400000;

export function loadDeck(): Card[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveDeck(cards: Card[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(cards)); } catch {}
}

// Add concepts as new cards, skipping any term already in the deck. Returns count added.
export function addConcepts(concepts: Concept[]): number {
  const deck = loadDeck();
  const have = new Set(deck.map((c) => c.term.trim().toLowerCase()));
  let added = 0;
  const now = Date.now();
  for (const c of concepts) {
    const key = c.term.trim().toLowerCase();
    if (!key || have.has(key)) continue;
    have.add(key);
    deck.push({
      id: 'c_' + now + '_' + Math.round(Math.random() * 1e6) + '_' + added,
      term: c.term,
      definition: c.definition,
      ease: 2.3,
      intervalDays: 0,
      dueTs: now, // due immediately (new card)
      reps: 0,
      createdTs: now,
    });
    added++;
  }
  saveDeck(deck);
  return added;
}

export function dueCount(deck: Card[] = loadDeck(), now = Date.now()): number {
  return deck.filter((c) => c.dueTs <= now).length;
}

// Return the updated card after a rating (does not persist).
export function schedule(card: Card, rating: Rating, now = Date.now()): Card {
  let { ease, intervalDays, reps } = card;
  switch (rating) {
    case 'again':
      ease = Math.max(1.3, ease - 0.2);
      intervalDays = 0;
      reps = 0;
      break;
    case 'hard':
      ease = Math.max(1.3, ease - 0.15);
      intervalDays = intervalDays < 1 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
      reps += 1;
      break;
    case 'good':
      intervalDays = intervalDays < 1 ? 1 : Math.round(intervalDays * ease);
      reps += 1;
      break;
    case 'easy':
      ease = Math.min(2.8, ease + 0.15);
      intervalDays = intervalDays < 1 ? 2 : Math.round(intervalDays * ease * 1.3);
      reps += 1;
      break;
  }
  // "again" stays due now so it reappears in this session and next open.
  const dueTs = rating === 'again' ? now : now + intervalDays * DAY;
  return { ...card, ease, intervalDays, reps, dueTs };
}

export function upsertCard(updated: Card): void {
  const deck = loadDeck();
  const i = deck.findIndex((c) => c.id === updated.id);
  if (i >= 0) { deck[i] = updated; saveDeck(deck); }
}
