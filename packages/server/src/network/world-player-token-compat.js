"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPlayerTokenPayloadDetailed = verifyPlayerTokenPayloadDetailed;
/** node_crypto_1：定义该变量以承载业务值。 */
const node_crypto_1 = require("node:crypto");
/** verifyPlayerTokenPayloadDetailed：执行对应的业务逻辑。 */
function verifyPlayerTokenPayloadDetailed(token, secret) {
/** segments：定义该变量以承载业务值。 */
    const segments = token.split('.');
    if (segments.length !== 3) {
        return { payload: null, reason: 'malformed_segments' };
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments;
/** header：定义该变量以承载业务值。 */
    const header = parseJwtSegment(encodedHeader);
/** payload：定义该变量以承载业务值。 */
    const payload = parseJwtSegment(encodedPayload);
    if (!header || !payload) {
        return { payload: null, reason: 'invalid_json_segment' };
    }
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        return { payload: null, reason: 'invalid_header' };
    }
/** expectedSignature：定义该变量以承载业务值。 */
    const expectedSignature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest());
/** left：定义该变量以承载业务值。 */
    const left = Buffer.from(encodedSignature);
/** right：定义该变量以承载业务值。 */
    const right = Buffer.from(expectedSignature);
    if (left.length !== right.length || !(0, node_crypto_1.timingSafeEqual)(left, right)) {
        return { payload: null, reason: 'invalid_signature' };
    }
/** now：定义该变量以承载业务值。 */
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp) && payload.exp < now) {
        return { payload: null, reason: 'expired' };
    }
    if (typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) && payload.nbf > now) {
        return { payload: null, reason: 'not_yet_valid' };
    }
    return { payload, reason: null };
}
/** parseJwtSegment：执行对应的业务逻辑。 */
function parseJwtSegment(segment) {
    try {
/** json：定义该变量以承载业务值。 */
        const json = Buffer.from(base64UrlDecode(segment), 'base64').toString('utf8');
/** value：定义该变量以承载业务值。 */
        const value = JSON.parse(json);
        return value && typeof value === 'object' ? value : null;
    }
    catch {
        return null;
    }
}
/** base64UrlDecode：执行对应的业务逻辑。 */
function base64UrlDecode(value) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
/** padding：定义该变量以承载业务值。 */
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
}
/** base64UrlEncode：执行对应的业务逻辑。 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
