import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashToken, mintToken } from '../src/services/auth/account-tokens';
import { csvCell } from '../src/services/newsletter/newsletter.service';
import { NOTIFICATION_EVENTS } from '../src/models/notification-delivery.model';
import type { EmailBrand } from '../src/services/notifications/render';
import {
  buildAbandonedCartPayload,
  buildOrderPlacedPayload,
  type PayloadPlacedOrder,
} from '../src/services/notifications/payloads';
import {
  MissingSecretsError,
  renderNotification,
  SECRET_BEARING_EVENTS,
  templateFor,
} from '../src/services/notifications/templates';
import { parseRemindersArgs, RemindersUsageError } from '../src/services/reminders/reminders-cli';
import { MAX_IMAGE_BYTES, sniffImage } from '../src/services/uploads/image-sniff';
import { cloudinarySignature } from '../src/services/uploads/storage';
import { signLink, verifyLink } from '../src/utils/signed-links';

/**
 * Phase 18's accounts, messages, uploads and reminders — the parts that can be
 * checked without a database or a mail server.
 */

const BRAND: EmailBrand = {
  appOrigin: 'https://zycart.example',
  supportEmail: null,
  accountUrl: 'https://zycart.example/account/orders',
};

const SECRET = 'x'.repeat(48);

/* ---------------------------------------------------------------- */

describe('Single-use account links', () => {
  it('mints 256-bit, URL-safe tokens that do not repeat', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintToken()));

    assert.equal(tokens.size, 50);
    for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });

  it('stores a hash from which the token cannot be read back', () => {
    const token = mintToken();

    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), token);
    assert.equal(hashToken(token).includes(token), false);
    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  });
});

describe('Signed links', () => {
  const userId = '66f0c0ffee0000000000abcd';

  it('verifies a link it signed', () => {
    const signature = signLink(SECRET, 'cart-reminders-opt-out', userId);
    assert.equal(verifyLink(SECRET, 'cart-reminders-opt-out', userId, signature), true);
  });

  it('refuses a link for somebody else, or signed with another key', () => {
    const signature = signLink(SECRET, 'cart-reminders-opt-out', userId);

    assert.equal(
      verifyLink(SECRET, 'cart-reminders-opt-out', '66f0c0ffee0000000000abce', signature),
      false,
    );
    assert.equal(verifyLink('y'.repeat(48), 'cart-reminders-opt-out', userId, signature), false);
    assert.equal(verifyLink(SECRET, 'cart-reminders-opt-out', userId, 'short'), false);
  });

  it('cannot replay a signature minted for one purpose as another', () => {
    const optOut = signLink(SECRET, 'cart-reminders-opt-out', userId);
    assert.equal(verifyLink(SECRET, 'newsletter-unsubscribe', userId, optOut), false);
  });
});

/* ---------------------------------------------------------------- */

describe('Phase 18 messages', () => {
  it('has a template for every event, with the three link-carrying ones marked secret', () => {
    for (const event of NOTIFICATION_EVENTS) assert.ok(templateFor(event).name.length > 0);

    assert.deepEqual([...SECRET_BEARING_EVENTS].sort(), [
      'EMAIL_VERIFICATION',
      'NEWSLETTER_CONFIRMATION',
      'PASSWORD_RESET',
    ]);
  });

  it('refuses to render a reset email without its link, and never needs it stored', () => {
    const payload = { customerName: 'Priya', expiresInMinutes: 60 };

    assert.throws(() => renderNotification('PASSWORD_RESET', payload, BRAND), MissingSecretsError);

    const token = mintToken();
    const email = renderNotification('PASSWORD_RESET', payload, BRAND, { token });

    assert.ok(email.html.includes(`https://zycart.example/reset-password?token=${token}`));
    assert.ok(email.text.includes(token));
    // The stored payload is what was validated at queue time — and it has no
    // field for the token at all.
    assert.equal(JSON.stringify(payload).includes(token), false);
  });

  it('points a verification email at the verification page', () => {
    const token = mintToken();
    const email = renderNotification(
      'EMAIL_VERIFICATION',
      { customerName: 'Priya', expiresInHours: 24 },
      BRAND,
      { token },
    );

    assert.ok(email.html.includes(`https://zycart.example/verify-email?token=${token}`));
    assert.match(email.subject, /Confirm your email address/);
  });

  it('does not tell somebody who never ordered that they placed an order', () => {
    const email = renderNotification(
      'PASSWORD_RESET',
      { customerName: '', expiresInMinutes: 60 },
      BRAND,
      { token: mintToken() },
    );

    assert.equal(email.text.includes('you placed this order'), false);
    assert.equal(email.html.includes('you placed this order'), false);
    assert.ok(email.text.includes('password reset was requested'));
  });

  it('confirms an order with the figures it was charged', () => {
    const order: PayloadPlacedOrder = {
      orderNumber: 'ZY10482',
      status: 'CONFIRMED',
      deliveredAt: null,
      items: [
        { _id: 'a', productName: 'Air Max', quantity: 1, unitPrice: 12_995, returnedQuantity: 0 },
      ],
      pricing: { subtotal: 12_995, shipping: 0, discount: 500, tax: 1905.5, total: 12_495 },
      payment: { method: 'COD', status: 'PENDING' },
      shippingAddress: { city: 'Ahmedabad', state: 'Gujarat' },
      coupon: { code: 'WELCOME10' },
    };

    const email = renderNotification(
      'ORDER_PLACED',
      buildOrderPlacedPayload('Priya', order),
      BRAND,
    );

    assert.match(email.subject, /ZY10482 is confirmed/);
    assert.ok(email.text.includes('₹12,495'));
    assert.ok(email.text.includes('Coupon WELCOME10'));
    assert.ok(email.text.includes('Ahmedabad, Gujarat'));
    assert.equal(email.subject.includes('₹'), false, 'no money in the subject line');
  });

  it('offers a working way out of cart reminders, and only to this store', () => {
    const payload = buildAbandonedCartPayload(
      'Priya',
      [{ productName: 'Air Max', quantity: 1, selectedSize: '9', selectedColor: 'Black' }],
      'https://zycart.example/email-preferences/cart-reminders?u=abc&s=def',
    );

    const email = renderNotification('ABANDONED_CART', payload, BRAND);
    assert.ok(email.text.includes('Stop cart reminders: https://zycart.example/email-preferences'));

    const forged = renderNotification(
      'ABANDONED_CART',
      { ...payload, optOutUrl: 'https://evil.example/opt-out' },
      BRAND,
    );
    assert.equal(forged.html.includes('evil.example'), false);
  });
});

/* ---------------------------------------------------------------- */

describe('Image uploads', () => {
  const pad = (header: number[]): Buffer => Buffer.concat([Buffer.from(header), Buffer.alloc(32)]);

  it('recognises each accepted format from its first bytes', () => {
    assert.equal(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
    assert.equal(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
    assert.equal(sniffImage(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)])), 'gif');
    assert.equal(
      sniffImage(
        Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.alloc(4),
          Buffer.from('WEBP'),
          Buffer.alloc(20),
        ]),
      ),
      'webp',
    );
    assert.equal(
      sniffImage(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(20)])),
      'avif',
    );
  });

  it('refuses markup, whatever it claims to be', () => {
    assert.equal(
      sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
      null,
    );
    assert.equal(sniffImage(Buffer.from('<!doctype html><script>alert(1)</script>')), null);
    assert.equal(sniffImage(Buffer.alloc(4)), null);
  });

  it('keeps the size limit small enough to buffer', () => {
    assert.ok(MAX_IMAGE_BYTES <= 10 * 1024 * 1024);
  });

  it('signs Cloudinary uploads the way Cloudinary documents', () => {
    // The worked example from Cloudinary's signature documentation.
    assert.equal(
      cloudinarySignature(
        {
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
          public_id: 'sample_image',
          timestamp: '1315060510',
        },
        'abcd',
      ),
      'bfd09f95f331f558cbd1320e67aa8d488770583e',
    );
  });
});

/* ---------------------------------------------------------------- */

describe('The reminder command', () => {
  it('parses what it accepts and refuses what it does not', () => {
    assert.deepEqual(parseRemindersArgs([]), { limit: 100, dryRun: false, help: false });
    assert.deepEqual(parseRemindersArgs(['--dry-run', '--limit', '5']), {
      limit: 5,
      dryRun: true,
      help: false,
    });
    assert.throws(() => parseRemindersArgs(['--limit', '0']), RemindersUsageError);
    assert.throws(() => parseRemindersArgs(['--limit', '100000']), RemindersUsageError);
    assert.throws(() => parseRemindersArgs(['--everyone']), RemindersUsageError);
  });
});

describe('The subscriber export', () => {
  it('neutralises a cell a spreadsheet would run as a formula', () => {
    assert.equal(csvCell('=HYPERLINK("x")@evil.co'), `"'=HYPERLINK(""x"")@evil.co"`);
    assert.equal(csvCell('+1@x.co'), `"'+1@x.co"`);
    assert.equal(csvCell('priya@example.com'), '"priya@example.com"');
  });
});
