import { create } from 'zustand';
import { toErrorMessage } from '@/services/api';
import * as aiApi from '@/services/ai.service';
import { useCartStore } from '@/store/cart-store';
import type {
  AiAvailabilityState,
  AiChatRequestMessage,
  AiConversationState,
  AiMessage,
  AiStatus,
} from '@/types/ai';

/**
 * The assistant's conversation, for as long as the tab is open.
 *
 * Nothing here is persisted. That is a deliberate scope decision rather than an
 * omission: ZyCart stores no conversations server-side in this phase, so
 * persisting one in `localStorage` would create a transcript that outlives the
 * session it belongs to, sits in shared-browser storage, and has no counterpart
 * anywhere else in the system. Saved conversations are a later phase, with a
 * place to put them.
 *
 * There is also, by construction, nothing sensitive to persist — no key, no
 * token, no account data. The session lives in an HTTP-only cookie the browser
 * cannot read, exactly as it does everywhere else in ZyCart.
 */

interface AiState extends AiConversationState {
  openAssistant: (productId?: string | null) => void;
  setOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;
  /** Re-sends the conversation as it stands, after a failure. */
  retry: () => Promise<void>;
  stop: () => void;
  clear: () => void;
  ensureAvailability: () => Promise<void>;
}

/**
 * Kept outside the store because it is a handle on work in flight, not state
 * anything renders — putting it in the store would re-render the panel on every
 * request for no visible change.
 */
let inFlight: AbortController | null = null;

let availabilityCheck: Promise<AiAvailabilityState> | null = null;

const id = () => `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;

const userMessage = (content: string): AiMessage => ({
  id: id(),
  role: 'user',
  content,
  products: [],
  comparison: null,
  actions: [],
  productIds: [],
});

/**
 * The conversation as the server accepts it: text and product ids only.
 *
 * The products themselves are dropped here. They were rendered from data the
 * server sent on the turn they belong to, and the server re-reads them from the
 * catalogue next turn — so sending them back would achieve nothing except
 * giving a stale browser a way to quote an old price into the conversation.
 */
function toRequestMessages(messages: AiMessage[]): AiChatRequestMessage[] {
  return messages.map((message) =>
    message.role === 'assistant' && message.productIds.length > 0
      ? { role: message.role, content: message.content, productIds: message.productIds }
      : { role: message.role, content: message.content },
  );
}

type SetState = (partial: Partial<AiState> | ((state: AiState) => Partial<AiState>)) => void;

/**
 * One round trip: send the conversation as it stands, append the reply.
 *
 * Shared by `send` and `retry` so a retry cannot drift from a first attempt —
 * the only difference between them is whether a turn was appended first.
 */
async function exchange(set: SetState, get: () => AiState): Promise<void> {
  set({ status: 'sending', error: null });

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  try {
    const { messages, productId } = get();

    const response = await aiApi.sendChat(
      {
        messages: toRequestMessages(messages),
        ...(productId ? { productId } : {}),
      },
      controller.signal,
    );

    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: id(),
          role: 'assistant',
          content: response.message,
          products: response.products,
          comparison: response.comparison,
          actions: response.actions,
          productIds: response.productIds,
        },
      ],
      status: 'idle',
    }));

    /**
     * The assistant wrote to the cart, so the cart is re-read from the server
     * rather than adjusted here. The navbar badge, the cart page and the
     * assistant then agree because all three are showing one answer instead of
     * three guesses at it.
     */
    if (response.actions.some((action) => action.type === 'cart_updated')) {
      await useCartStore.getState().refresh();
    }
  } catch (error) {
    // An abort is the customer pressing Stop. That is not a failure, and it
    // does not get an error message.
    if (controller.signal.aborted) {
      set({ status: 'idle' });
      return;
    }

    set({ status: 'idle', error: toErrorMessage(error) });
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

export const useAiStore = create<AiState>()((set, get) => ({
  open: false,
  messages: [],
  status: 'idle' as AiStatus,
  error: null,
  availability: 'unknown',
  productId: null,

  /**
   * Opens the panel, optionally anchored to a product.
   *
   * Only the id travels — the server looks the product up, so the assistant
   * answers from today's price and stock rather than from whatever the page was
   * rendered with.
   */
  openAssistant: (productId) => {
    set({ open: true, productId: productId ?? null, error: null });
    void get().ensureAvailability();
  },

  setOpen: (open) => {
    if (!open) get().stop();
    set({ open });
  },

  /** Asked once per tab; the answer does not change while the page is loaded. */
  ensureAvailability: async () => {
    if (get().availability !== 'unknown') return;

    availabilityCheck ??= aiApi
      .getAiStatus()
      .then((enabled): AiAvailabilityState => (enabled ? 'available' : 'unavailable'));

    set({ availability: await availabilityCheck });
  },

  send: async (text) => {
    const trimmed = text.trim();
    // A second submission while one is in flight would spend another model call
    // on a question the customer has already asked.
    if (!trimmed || get().status === 'sending') return;

    set((state) => ({ messages: [...state.messages, userMessage(trimmed)] }));
    await exchange(set, get);
  },

  /**
   * After a failure the customer's question is still the last turn, so a retry
   * re-sends the conversation rather than appending the question again.
   */
  retry: async () => {
    if (get().status === 'sending') return;
    if (get().messages.at(-1)?.role !== 'user') return;

    await exchange(set, get);
  },

  stop: () => {
    inFlight?.abort();
    inFlight = null;
    set({ status: 'idle' });
  },

  clear: () => {
    get().stop();
    set({ messages: [], error: null });
  },
}));
