import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSystemPrompt } from '../src/services/ai/prompts';
import { limitToBudget, readBudget } from '../src/services/ai/search/budget';
import {
  browsesAfterNothing,
  nothingMatchedNote,
} from '../src/services/ai/tools/search-products.tool';

/**
 * "Find running shoes under ₹3,000", and nothing else.
 *
 * The assistant used to answer that request, when no running shoe cost under
 * ₹3,000, by searching again without the budget and then browsing everything
 * under ₹3,000 — and every search's products became cards, so the customer saw
 * shoes they could not afford beside T-shirts and a water bottle. These are
 * the rules that stop it, where they can be checked without a database or a
 * model: the budget read from the customer's words, the clamp every search is
 * held to, the refusal to browse after an empty search, and what the model is
 * told when nothing matches.
 */

describe('Reading a budget from what the customer wrote', () => {
  const cases: [string, ReturnType<typeof readBudget>][] = [
    ['Find running shoes under ₹3,000', { maxPrice: 3000 }],
    ['black running shoes under 3000', { maxPrice: 3000 }],
    ['shoes below 5k', { maxPrice: 5000 }],
    ['within 1.5k', { maxPrice: 1500 }],
    ['under rs. 2,499 please', { maxPrice: 2499 }],
    ['upto 999 rupees', { maxPrice: 999 }],
    ['₹3000 or less', { maxPrice: 3000 }],
    ['my budget is 3000', { maxPrice: 3000 }],
    ['a laptop under 2 lakh', { maxPrice: 200_000 }],
    ['shoes under 3000 in black', { maxPrice: 3000 }],
    ['something over ₹10,000', { minPrice: 10_000 }],
    ['between 2000 and 5000', { minPrice: 2000, maxPrice: 5000 }],
    ['from ₹2,000 to ₹4,500', { minPrice: 2000, maxPrice: 4500 }],
  ];

  for (const [text, expected] of cases) {
    it(`"${text}"`, () => {
      assert.deepEqual(readBudget(text), expected);
    });
  }

  it('finds no budget where there is none', () => {
    for (const text of [
      'cheap running shoes',
      'Under Armour shoes',
      'shoes for kids under 10',
      'a phone under 200 grams',
      'a bag under 3 kg',
      'a tv under 1080p',
      'fashion for over 50s',
      'thunder 3000 speaker',
    ]) {
      assert.deepEqual(readBudget(text), {}, text);
    }
  });

  it('keeps the ceiling when a floor contradicts it', () => {
    assert.deepEqual(readBudget('over 5000 but under 3000'), { maxPrice: 3000 });
  });
});

describe('Every search is held to that budget', () => {
  it('lowers a ceiling the model raised, or adds one it left out', () => {
    assert.deepEqual(limitToBudget({ maxPrice: 5000 }, { maxPrice: 3000 }), {
      maxPrice: 3000,
      clamped: true,
    });
    assert.deepEqual(limitToBudget({}, { maxPrice: 3000 }), { maxPrice: 3000, clamped: true });
  });

  it('keeps a tighter ceiling the model chose', () => {
    assert.deepEqual(limitToBudget({ maxPrice: 2000 }, { maxPrice: 3000 }), {
      maxPrice: 2000,
      clamped: false,
    });
  });

  it('drops a floor the model set above the customer’s ceiling', () => {
    assert.deepEqual(limitToBudget({ minPrice: 5000 }, { maxPrice: 3000 }), {
      maxPrice: 3000,
      clamped: true,
    });
  });

  it('changes nothing when the customer named no price', () => {
    assert.deepEqual(limitToBudget({ maxPrice: 8000 }, {}), { maxPrice: 8000, clamped: false });
  });
});

describe('After a search finds nothing', () => {
  const empty = { budget: { maxPrice: 3000 }, foundNothing: true };
  const fresh = { budget: { maxPrice: 3000 }, foundNothing: false };

  it('refuses a search that names no product — browsing the price range instead', () => {
    assert.equal(browsesAfterNothing({}, empty), true);
  });

  it('still allows other words for the same thing', () => {
    assert.equal(browsesAfterNothing({ query: 'sneakers' }, empty), false);
    assert.equal(browsesAfterNothing({ category: 'footwear' }, empty), false);
    assert.equal(browsesAfterNothing({ brand: 'Nike' }, empty), false);
  });

  it('allows browsing when nothing has come back empty', () => {
    assert.equal(browsesAfterNothing({}, fresh), false);
  });

  it('tells the model the closest match outside the budget, as the answer', () => {
    const note = nothingMatchedNote({ maxPrice: 3000 }, 4, {
      name: 'Street Runner 90',
      price: 4999,
    });

    assert.match(note, /Nothing matches at or under ₹3,000/);
    assert.match(note, /closest is "Street Runner 90" at ₹4,999/);
    assert.match(note, /ask whether they want to see them/);
    assert.match(note, /Do not show products outside their price unless they ask/);
  });

  it('tells the model not to widen when nothing matches at any price', () => {
    const note = nothingMatchedNote({ maxPrice: 3000 }, 0, null);

    assert.match(note, /No products matched at or under ₹3,000/);
    assert.match(note, /Do not search again with fewer requirements/);
  });

  it('writes a range the way a shopper would', () => {
    assert.match(
      nothingMatchedNote({ minPrice: 20_000, maxPrice: 150_000 }, 0, null),
      /between ₹20,000 and ₹1,50,000/,
    );
  });
});

describe('What the assistant is told', () => {
  it('treats a request as requirements and never widens on its own', () => {
    const prompt = buildSystemPrompt({ authenticated: false });

    assert.match(prompt, /## When nothing matches/);
    assert.match(prompt, /Do not widen it yourself/);
    assert.match(prompt, /never search again without their budget/);
  });
});
