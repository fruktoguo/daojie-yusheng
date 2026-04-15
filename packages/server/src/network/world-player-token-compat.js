"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPlayerTokenPayloadDetailed = verifyPlayerTokenPayloadDetailed;

const node_crypto_1 = require("node:crypto");
function verifyPlayerTokenPayloadDetailed(token, secret) {

    const segments = token.split('.');
    if (segments.length !== 3) {
        return { payload: null, reason: 'malformed_segments' };
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments;

    const header = parseJwtSegment(encodedHeader);

    const payload = parseJwtSegment(encodedPayload);
    if (!header || !payload) {
        return { payload: null, reason: 'invalid_json_segment' };
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return { payload: null, reason: 'invalid_header' };
    }

    const expectedSignature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());

    const left = Buffer.from(encodedSignature);

    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right)) {
        return { payload: null, reason: 'invalid_signature' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp < now) {
        return { payload: null, reason: 'expired' };
    }
    if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now) {
        return { payload: null, reason: 'not_yet_valid' };
    }
    return { payload, reason: null };
}
function parseJwtSegment(segment) {
    try {

        const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');

        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
}
function base64UrlDecode(value) {

    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');

    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}



