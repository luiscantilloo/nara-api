"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_MAX_AGE_SEC = exports.SESSION_COOKIE = void 0;
exports.signSessionToken = signSessionToken;
exports.verifySessionToken = verifySessionToken;
const crypto_1 = require("crypto");
exports.SESSION_COOKIE = 'nara_sid';
exports.SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;
function secret() {
    const s = process.env.AUTH_SECRET || process.env.NARA_AUTH_SECRET;
    if (!s) {
        if (process.env.NODE_ENV === 'production')
            throw new Error('Falta AUTH_SECRET');
        return 'nara-dev-auth-secret-change-me';
    }
    return s;
}
function signSessionToken(accountId, maxAgeSec = exports.SESSION_MAX_AGE_SEC) {
    const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
    const payload = `${accountId}.${exp}`;
    const sig = (0, crypto_1.createHmac)('sha256', secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}
function verifySessionToken(token) {
    if (!token)
        return null;
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    const [accountId, expStr, sig] = parts;
    if (!accountId || !expStr || !sig)
        return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000))
        return null;
    const payload = `${accountId}.${expStr}`;
    const expected = (0, crypto_1.createHmac)('sha256', secret()).update(payload).digest('base64url');
    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b))
            return null;
    }
    catch {
        return null;
    }
    return accountId;
}
//# sourceMappingURL=session-token.js.map