/*
 * Encryption for the vault.
 *
 * Everything here runs in the browser and uses only the browser's own Web
 * Crypto — no library is loaded, which is also what the Content-Security-
 * Policy allows. The server never sees any of this: it stores the sealed
 * blob and nothing else.
 *
 *   key        PBKDF2-HMAC-SHA256 over the master password, 310,000 rounds,
 *              with a random 16-byte salt, giving a 256-bit AES key.
 *   contents   AES-GCM with a fresh random 12-byte IV on every save. GCM's
 *              authentication tag is what tells us a password was wrong, so
 *              no hash of the master password is stored anywhere — there is
 *              nothing to attack offline except the ciphertext itself.
 *
 * The master password is never written to disk, never sent anywhere, and
 * only ever exists as a derived key held in memory by core/vault.js.
 *
 * Because of that, a forgotten master password means the data is gone. That
 * is the point of the design, and the UI says so before anything is stored.
 */
(function (App) {
  'use strict';

  var ITERATIONS = 310000;     // OWASP's floor for PBKDF2-HMAC-SHA256
  var SALT_BYTES = 16;
  var IV_BYTES = 12;           // the size AES-GCM is defined for

  /**
   * Web Crypto is only exposed in a secure context: https, or localhost.
   * Over plain http, window.crypto.subtle is simply undefined — so the vault
   * page has to check this and say why rather than throwing.
   */
  function supported() {
    return !!(window.crypto && window.crypto.subtle &&
      window.crypto.subtle.deriveKey && window.TextEncoder && window.TextDecoder);
  }

  function randomBytes(n) {
    var out = new Uint8Array(n);
    window.crypto.getRandomValues(out);
    return out;
  }

  // ---- base64 -----------------------------------------------------------

  function toB64(bytes) {
    var chunk = 0x8000, parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return window.btoa(parts.join(''));
  }

  function fromB64(text) {
    var raw = window.atob(String(text || ''));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function utf8(text) { return new window.TextEncoder().encode(text); }
  function unUtf8(bytes) { return new window.TextDecoder().decode(bytes); }

  // ---- keys -------------------------------------------------------------

  /**
   * Turn a password into an AES-GCM key. Resolves to a CryptoKey that cannot
   * be exported, so even a script that got hold of it could not read the
   * password back out of it.
   */
  function deriveKey(password, salt, iterations) {
    var subtle = window.crypto.subtle;
    return subtle.importKey('raw', utf8(String(password)), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (base) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  /**
   * Derive the key for an existing blob (same salt and round count, so the
   * same password gives the same key), or for a brand-new one.
   * Resolves to { key, salt, iter }.
   */
  function keyFor(password, blob) {
    var salt = blob && blob.salt ? fromB64(blob.salt) : randomBytes(SALT_BYTES);
    var iter = blob && blob.iter ? Math.max(100000, Number(blob.iter)) : ITERATIONS;
    return deriveKey(password, salt, iter).then(function (key) {
      return { key: key, salt: salt, iter: iter };
    });
  }

  // ---- seal / open ------------------------------------------------------

  /**
   * Encrypt `value` (any JSON-serialisable thing) with an already-derived
   * key. `count` is stored in the clear so the dashboard can show how many
   * items are in there while it is still locked — a number, nothing else.
   */
  function seal(value, material, count) {
    var iv = randomBytes(IV_BYTES);
    var plain = utf8(JSON.stringify(value));
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, material.key, plain)
      .then(function (buf) {
        return {
          v: 1,
          kdf: 'PBKDF2-SHA256',
          iter: material.iter,
          salt: toB64(material.salt),
          iv: toB64(iv),
          ct: toB64(new Uint8Array(buf)),
          count: Number(count) || 0,
          updatedAt: new Date().toISOString()
        };
      });
  }

  /**
   * Decrypt a blob with an already-derived key. Rejects with a `wrong`
   * property when the password does not match or the blob was tampered with;
   * those two are indistinguishable, which is exactly what GCM guarantees.
   */
  function open(blob, material) {
    var iv, ct;
    try {
      iv = fromB64(blob.iv);
      ct = fromB64(blob.ct);
    } catch (e) {
      return Promise.reject(taggedError('گاوصندوق خوانده نشد — داده‌ی ذخیره‌شده خراب است.', false));
    }
    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, material.key, ct)
      .then(function (buf) {
        var text = unUtf8(new Uint8Array(buf));
        try {
          return JSON.parse(text);
        } catch (e) {
          throw taggedError('محتوای گاوصندوق باز شد ولی خوانده نشد.', false);
        }
      }, function () {
        throw taggedError('رمز اصلی درست نیست.', true);
      });
  }

  function taggedError(message, wrongPassword) {
    var e = new Error(message);
    e.wrong = !!wrongPassword;
    return e;
  }

  App.crypt = {
    ITERATIONS: ITERATIONS,
    supported: supported,
    keyFor: keyFor,
    seal: seal,
    open: open,
    randomBytes: randomBytes,
    toB64: toB64,
    fromB64: fromB64
  };
})(window.App = window.App || {});
