import type {
  GmManagedPlayerAccountStatus,
  GmPlayerRiskFactor,
  GmPlayerRiskFactorKey,
  GmPlayerRiskLevel,
  GmPlayerRiskReport,
} from '@mud/shared';
import type { Pool } from 'pg';

interface NativeGmRiskAccountLike {
  userId?: string | null;
  username?: string | null;
  createdAt?: string | null;
  registerIp?: string | null;
  lastLoginIp?: string | null;
  lastLoginAt?: string | null;
  registerDeviceId?: string | null;
  lastLoginDeviceId?: string | null;
  bannedAt?: string | null;
  isRiskAdmin?: boolean | null;
}

interface NativeGmRiskPlayerLike {
  id?: string | null;
  name?: string | null;
  autoBattle?: boolean | null;
  autoBattleStationary?: boolean | null;
  autoRetaliate?: boolean | null;
  meta?: {
    isBot?: boolean | null;
  } | null;
}

interface NativeGmRiskQueryContext {
  pool?: Pool | null;
}

interface MarketTradeRow {
  buyer_id?: unknown;
  seller_id?: unknown;
  created_at_ms?: unknown;
}

interface CounterpartyAccountRow {
  player_id?: unknown;
  username?: unknown;
  created_at?: unknown;
  banned_at?: unknown;
  user_id?: unknown;
}

interface CounterpartyTradeAggregate {
  playerId: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  lastCreatedAt: number;
}

export interface NativeGmPlayerRiskView {
  accountStatus: GmManagedPlayerAccountStatus;
  riskScore: number;
  riskLevel: GmPlayerRiskLevel;
  riskTags: string[];
  isRiskAdmin: boolean;
  riskReport: GmPlayerRiskReport;
}

const GM_PLAYER_RISK_MAX_SCORE = 133;
const GM_PLAYER_RISK_REVIEW_WINDOW_TRADE_LIMIT = 120;
const GM_GENERIC_SERIAL_ACCOUNT_PREFIXES = new Set(['user', 'player', 'account', 'role', 'guest', 'test', 'temp', 'demo', 'sample']);
const GM_CONTACT_STYLE_ACCOUNT_PREFIXES = new Set(['qq']);

export async function buildNativeGmPlayerRiskView(
  account: NativeGmRiskAccountLike | null | undefined,
  player: NativeGmRiskPlayerLike,
  context: NativeGmRiskQueryContext = {},
): Promise<NativeGmPlayerRiskView> {
  if (player.meta?.isBot === true) {
    const factors = buildZeroRiskFactors('机器人目标，不参与账号风险检测。');
    return buildRiskView(account, 0, 'low', factors, '当前目标是机器人，未参与账号风控评分。', [
      '机器人不纳入小号风险判定，若异常请按机器人管理链路处理。',
    ]);
  }

  const [
    similarAccountCluster,
    sharedIpCluster,
    sharedDeviceCluster,
    marketTransfer,
  ] = await Promise.all([
    buildSimilarAccountClusterRiskFactor(account, context.pool),
    buildSharedIpClusterRiskFactor(account, context.pool),
    buildSharedDeviceClusterRiskFactor(account, context.pool),
    buildMarketTransferRiskFactor(player, account, context.pool),
  ]);
  const factors = [
    buildAccountIntegrityRiskFactor(account),
    buildAccountNamePatternRiskFactor(account),
    similarAccountCluster,
    buildAccountAgeRiskFactor(account),
    sharedIpCluster,
    sharedDeviceCluster,
    marketTransfer,
  ];
  const score = factors.reduce((sum, factor) => sum + factor.score, 0);
  const level = resolvePlayerRiskLevel(score);
  return buildRiskView(account, score, level, factors, buildPlayerRiskOverview(level, score, factors), buildPlayerRiskRecommendations(factors, level));
}

function buildRiskView(
  account: NativeGmRiskAccountLike | null | undefined,
  score: number,
  level: GmPlayerRiskLevel,
  factors: GmPlayerRiskFactor[],
  overview: string,
  recommendations: string[],
): NativeGmPlayerRiskView {
  const accountStatus = resolveManagedPlayerAccountStatus(account);
  const riskReport: GmPlayerRiskReport = {
    score,
    maxScore: GM_PLAYER_RISK_MAX_SCORE,
    level,
    overview,
    generatedAt: new Date().toISOString(),
    factors,
    recommendations,
  };
  return {
    accountStatus,
    riskScore: score,
    riskLevel: level,
    riskTags: factors.filter((factor) => factor.score > 0).map((factor) => factor.label),
    isRiskAdmin: account?.isRiskAdmin === true,
    riskReport,
  };
}

function resolveManagedPlayerAccountStatus(account: NativeGmRiskAccountLike | null | undefined): GmManagedPlayerAccountStatus {
  if (!account || !normalizeString(account.userId) || !normalizeString(account.username)) {
    return 'abnormal';
  }
  return normalizeString(account.bannedAt) ? 'banned' : 'normal';
}

function buildAccountIntegrityRiskFactor(account: NativeGmRiskAccountLike | null | undefined): GmPlayerRiskFactor {
  if (account && normalizeString(account.userId) && normalizeString(account.username)) {
    return createPlayerRiskFactor('account-integrity', '账号完整性', 20, 0, '账号与角色关联完整。');
  }
  return createPlayerRiskFactor(
    'account-integrity',
    '账号完整性',
    20,
    20,
    '角色缺少有效账号关联。',
    ['当前角色没有对应账号记录，已属于异常状态样本。'],
  );
}

function buildAccountNamePatternRiskFactor(account: NativeGmRiskAccountLike | null | undefined): GmPlayerRiskFactor {
  const username = normalizeString(account?.username);
  if (!username) {
    return createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 0, '无账号信息，暂不参与命名规则判断。');
  }
  if (/^\d{5,}$/u.test(username)) {
    return createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 10, '账号名是长纯数字串。', [`账号名“${username}”符合纯序号模式。`]);
  }
  const serialPattern = parseSerialAccountPattern(username);
  if (serialPattern) {
    if (isContactStyleSerialAccountPattern(serialPattern)) {
      return createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 0, '账号名更像常见联系方式或个人标识，不按批量序号命名处理。');
    }
    const genericPrefix = GM_GENERIC_SERIAL_ACCOUNT_PREFIXES.has(serialPattern.prefix);
    return createPlayerRiskFactor(
      'account-name-pattern',
      '账号命名模式',
      10,
      genericPrefix ? 8 : 6,
      genericPrefix ? '账号名是通用前缀加纯数字尾号。' : '账号名带明显纯数字尾号。',
      [
        `账号名“${username}”可拆为前缀“${serialPattern.prefix}”和尾号“${serialPattern.digits}”。`,
        genericPrefix ? `前缀“${serialPattern.prefix}”属于常见批量起号命名。` : `尾号长度为 ${serialPattern.digits.length}，符合批量序号命名特征。`,
      ],
    );
  }
  const randomNoiseScore = buildRandomNoiseAccountNameScore(username);
  if (randomNoiseScore) {
    return createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, randomNoiseScore.score, randomNoiseScore.summary, randomNoiseScore.evidence);
  }
  const digitCount = [...username].filter((char) => char >= '0' && char <= '9').length;
  if (digitCount >= 4 && digitCount * 2 >= username.length) {
    return createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 4, '账号名数字占比偏高。', [`账号名“${username}”中数字占比达到 ${digitCount}/${username.length}。`]);
  }
  return createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 0, '账号名未命中明显的批量命名特征。');
}

async function buildSimilarAccountClusterRiskFactor(account: NativeGmRiskAccountLike | null | undefined, pool: Pool | null | undefined): Promise<GmPlayerRiskFactor> {
  const userId = normalizeString(account?.userId);
  const username = normalizeString(account?.username);
  if (!userId || !username) {
    return createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, '无账号信息，暂不参与相似账号簇检测。');
  }
  const serialPattern = parseSerialAccountPattern(username);
  if (!serialPattern) {
    return createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, '当前账号不属于可聚类的纯序号前缀模式。');
  }
  if (isContactStyleSerialAccountPattern(serialPattern)) {
    return createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, '当前账号更像常见联系方式或个人标识，不按同前缀账号簇处理。');
  }
  if (!pool) {
    return createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, '当前数据库未启用，无法联查同前缀账号簇。');
  }
  const pattern = `^${escapeSqlRegex(serialPattern.prefix)}[0-9]{3,}$`;
  const aggregate = await queryOne<{ total_count?: unknown; banned_count?: unknown }>(pool, `
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(CASE WHEN banned_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS banned_count
    FROM server_player_auth
    WHERE user_id <> $1 AND username ~* $2
  `, [userId, pattern]);
  const totalCount = normalizeInteger(aggregate?.total_count, 0);
  if (totalCount <= 0) {
    return createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, '未发现同前缀纯数字尾号账号簇。');
  }
  const previewRows = await queryMany<{ username?: unknown }>(pool, `
    SELECT username
    FROM server_player_auth
    WHERE user_id <> $1 AND username ~* $2
    ORDER BY created_at DESC
    LIMIT 5
  `, [userId, pattern]);
  const bannedCount = normalizeInteger(aggregate?.banned_count, 0);
  let score = totalCount >= 10 ? 18 : totalCount >= 5 ? 12 : 8;
  if (bannedCount > 0) {
    score = Math.min(20, score + 4);
  }
  return createPlayerRiskFactor(
    'similar-account-cluster',
    '相似账号簇',
    20,
    score,
    '存在明显同前缀纯序号账号簇。',
    [
      `检测到 ${totalCount} 个同前缀“${serialPattern.prefix}”的纯序号账号。`,
      ...(previewRows.length > 0 ? [`最近样本：${previewRows.map((entry) => normalizeString(entry.username)).filter(Boolean).join('、')}`] : []),
      ...(bannedCount > 0 ? [`其中已有 ${bannedCount} 个同簇账号处于封禁状态。`] : []),
    ],
  );
}

function buildAccountAgeRiskFactor(account: NativeGmRiskAccountLike | null | undefined): GmPlayerRiskFactor {
  const createdAt = normalizeString(account?.createdAt);
  const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(createdAtMs)) {
    return createPlayerRiskFactor('account-age', '账号年龄', 10, 0, '无账号信息，暂不参与账号年龄判断。');
  }
  const ageHours = Math.max(0, (Date.now() - createdAtMs) / 3_600_000);
  if (ageHours < 24) {
    return createPlayerRiskFactor('account-age', '账号年龄', 10, 10, '账号注册时间不足 24 小时。', [`账号创建于 ${createdAt}。`]);
  }
  if (ageHours < 72) {
    return createPlayerRiskFactor('account-age', '账号年龄', 10, 7, '账号注册时间不足 3 天。', [`账号创建于 ${createdAt}。`]);
  }
  if (ageHours < 168) {
    return createPlayerRiskFactor('account-age', '账号年龄', 10, 4, '账号注册时间不足 7 天。', [`账号创建于 ${createdAt}。`]);
  }
  return createPlayerRiskFactor('account-age', '账号年龄', 10, 0, '账号年龄已超过 7 天。');
}

async function buildSharedIpClusterRiskFactor(account: NativeGmRiskAccountLike | null | undefined, pool: Pool | null | undefined): Promise<GmPlayerRiskFactor> {
  const userId = normalizeString(account?.userId);
  if (!userId) {
    return createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '无账号信息，暂不参与重复 IP 判断。');
  }
  const ip = normalizeString(account?.lastLoginIp) || normalizeString(account?.registerIp);
  if (!ip) {
    return createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '当前账号尚无可用登录 IP 记录。');
  }
  if (!pool) {
    return createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '当前数据库未启用，无法联查重复 IP。');
  }
  const sameIpUsers = await queryMany<{ username?: unknown; banned_at?: unknown }>(pool, `
    SELECT username, banned_at
    FROM server_player_auth
    WHERE user_id <> $1 AND (last_login_ip = $2 OR register_ip = $2)
    LIMIT 8
  `, [userId, ip]);
  if (sameIpUsers.length <= 0) {
    return createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, '当前登录 IP 未与其他账号形成明显重叠。');
  }
  const bannedCount = sameIpUsers.filter((entry) => normalizeString(entry.banned_at)).length;
  let score = sameIpUsers.length >= 6 ? 14 : sameIpUsers.length >= 3 ? 9 : 5;
  if (bannedCount > 0) {
    score += 4;
  }
  return createPlayerRiskFactor(
    'shared-ip-cluster',
    '重复 IP',
    18,
    score,
    '当前账号与其他账号存在重复登录 IP。',
    [
      `最近登录或注册 IP：${ip}`,
      `检测到 ${sameIpUsers.length} 个账号与该 IP 重叠。`,
      `样本账号：${sameIpUsers.slice(0, 5).map((entry) => normalizeString(entry.username)).filter(Boolean).join('、')}`,
      ...(bannedCount > 0 ? [`其中 ${bannedCount} 个重叠账号已有封禁记录。`] : []),
    ],
  );
}

async function buildSharedDeviceClusterRiskFactor(account: NativeGmRiskAccountLike | null | undefined, pool: Pool | null | undefined): Promise<GmPlayerRiskFactor> {
  const userId = normalizeString(account?.userId);
  if (!userId) {
    return createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '无账号信息，暂不参与重复设备判断。');
  }
  const deviceId = normalizeString(account?.lastLoginDeviceId) || normalizeString(account?.registerDeviceId);
  if (!deviceId) {
    return createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '当前账号尚无可用 deviceId 记录。');
  }
  if (!pool) {
    return createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '当前数据库未启用，无法联查重复设备。');
  }
  const sameDeviceUsers = await queryMany<{ username?: unknown; banned_at?: unknown }>(pool, `
    SELECT username, banned_at
    FROM server_player_auth
    WHERE user_id <> $1 AND (last_login_device_id = $2 OR register_device_id = $2)
    LIMIT 8
  `, [userId, deviceId]);
  if (sameDeviceUsers.length <= 0) {
    return createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, '当前设备未与其他账号形成明显重叠。');
  }
  const bannedCount = sameDeviceUsers.filter((entry) => normalizeString(entry.banned_at)).length;
  let score = sameDeviceUsers.length >= 5 ? 18 : sameDeviceUsers.length >= 2 ? 12 : 8;
  if (bannedCount > 0) {
    score += 5;
  }
  return createPlayerRiskFactor(
    'shared-device-cluster',
    '重复设备',
    25,
    score,
    '当前账号与其他账号存在重复 deviceId。',
    [
      `当前 deviceId：${deviceId}`,
      `检测到 ${sameDeviceUsers.length} 个账号与该设备重叠。`,
      `样本账号：${sameDeviceUsers.slice(0, 5).map((entry) => normalizeString(entry.username)).filter(Boolean).join('、')}`,
      ...(bannedCount > 0 ? [`其中 ${bannedCount} 个重叠账号已有封禁记录。`] : []),
    ],
  );
}

async function buildMarketTransferRiskFactor(
  player: NativeGmRiskPlayerLike,
  account: NativeGmRiskAccountLike | null | undefined,
  pool: Pool | null | undefined,
): Promise<GmPlayerRiskFactor> {
  const playerId = normalizeString(player.id);
  if (!normalizeString(account?.userId)) {
    return createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, '无账号信息，暂不参与坊市关系检测。');
  }
  if (account?.isRiskAdmin === true) {
    return createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, '当前账号在管理员名单中，坊市关系不参与利益输送检测。');
  }
  if (!playerId || !pool) {
    return createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, '当前数据库未启用，无法联查坊市关系。');
  }
  const recentTrades = await queryMany<MarketTradeRow>(pool, `
    SELECT buyer_id, seller_id, created_at_ms
    FROM server_market_trade_history
    WHERE buyer_id = $1 OR seller_id = $1
    ORDER BY created_at_ms DESC
    LIMIT ${GM_PLAYER_RISK_REVIEW_WINDOW_TRADE_LIMIT}
  `, [playerId]);
  if (recentTrades.length < 3) {
    return createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, '近期待成交不足，未形成可判断的坊市关系。');
  }
  const counterpartyMap = new Map<string, CounterpartyTradeAggregate>();
  for (const trade of recentTrades) {
    const buyerId = normalizeString(trade.buyer_id);
    const sellerId = normalizeString(trade.seller_id);
    const counterpartyId = buyerId === playerId ? sellerId : buyerId;
    if (!counterpartyId || counterpartyId === playerId) {
      continue;
    }
    const entry = counterpartyMap.get(counterpartyId) ?? {
      playerId: counterpartyId,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      lastCreatedAt: 0,
    };
    entry.tradeCount += 1;
    if (buyerId === playerId) {
      entry.buyCount += 1;
    } else {
      entry.sellCount += 1;
    }
    entry.lastCreatedAt = Math.max(entry.lastCreatedAt, normalizeInteger(trade.created_at_ms, 0));
    counterpartyMap.set(counterpartyId, entry);
  }
  const effectiveCounterparties = [...counterpartyMap.values()];
  const topCounterparty = effectiveCounterparties.sort((left, right) => (
    right.tradeCount - left.tradeCount
    || right.lastCreatedAt - left.lastCreatedAt
    || left.playerId.localeCompare(right.playerId)
  ))[0];
  if (!topCounterparty) {
    return createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, '未发现明显坊市关系对象。');
  }
  const counterpartyAccounts = await queryMany<CounterpartyAccountRow>(pool, `
    SELECT player_id, user_id, username, created_at, banned_at
    FROM server_player_auth
    WHERE player_id = ANY($1::text[])
  `, [effectiveCounterparties.map((entry) => entry.playerId)]);
  const counterpartyAccountByPlayerId = new Map(counterpartyAccounts.map((entry) => [normalizeString(entry.player_id), entry]));
  const effectiveTradeCount = recentTrades.length;
  const concentration = topCounterparty.tradeCount / effectiveTradeCount;
  const dominantSideShare = Math.max(topCounterparty.buyCount, topCounterparty.sellCount) / topCounterparty.tradeCount;
  const topCounterpartyAccount = counterpartyAccountByPlayerId.get(topCounterparty.playerId);
  let score = 0;
  if (concentration >= 0.8 && topCounterparty.tradeCount >= 5) {
    score += 14;
  } else if (concentration >= 0.6 && topCounterparty.tradeCount >= 3) {
    score += 10;
  }
  if (dominantSideShare >= 0.8 && topCounterparty.tradeCount >= 4) {
    score += 8;
  }
  if (effectiveCounterparties.length === 1 && effectiveTradeCount >= 8) {
    score += 4;
  }
  const selfAgeDays = getAccountAgeDays(account);
  const counterpartAgeDays = getAccountAgeDays({
    createdAt: normalizeDateLike(topCounterpartyAccount?.created_at),
  });
  if (selfAgeDays <= 7 && counterpartAgeDays >= 14) {
    score += 4;
  }
  if (normalizeDateLike(topCounterpartyAccount?.banned_at)) {
    score += 6;
  }
  score = Math.min(30, score);
  const counterpartyLabel = normalizeString(topCounterpartyAccount?.username) || topCounterparty.playerId;
  return createPlayerRiskFactor(
    'market-transfer',
    '坊市关系',
    30,
    score,
    score > 0 ? '坊市成交对象集中度偏高，存在固定输血链风险。' : '坊市成交关系较分散，未见明显固定输血对象。',
    score > 0 ? [
      `近 ${effectiveTradeCount} 笔坊市成交中，${Math.round(concentration * 100)}% 集中在 ${counterpartyLabel}。`,
      `与该对象共成交 ${topCounterparty.tradeCount} 笔，其中买入 ${topCounterparty.buyCount} 笔，卖出 ${topCounterparty.sellCount} 笔。`,
      `近窗口内有效成交对象数为 ${effectiveCounterparties.length}。`,
      ...(selfAgeDays <= 7 && counterpartAgeDays >= 14 ? [`当前账号年龄 ${selfAgeDays} 天，对手账号年龄 ${counterpartAgeDays} 天。`] : []),
      ...(normalizeDateLike(topCounterpartyAccount?.banned_at) ? ['主成交对象当前或历史上存在封禁记录。'] : []),
    ] : [],
  );
}

function buildPlayerRiskOverview(level: GmPlayerRiskLevel, score: number, factors: GmPlayerRiskFactor[]): string {
  const hitCount = factors.filter((factor) => factor.score > 0).length;
  switch (level) {
    case 'critical':
      return `当前风险分 ${score}，已命中 ${hitCount} 个风险维度，形态接近批量小号或固定输血号。`;
    case 'high':
      return `当前风险分 ${score}，命中多项风险信号，建议 GM 重点复核账号簇和坊市关系。`;
    case 'medium':
      return `当前风险分 ${score}，存在可疑信号，建议持续观察并结合相似账号链路复核。`;
    case 'low':
    default:
      return score > 0 ? `当前风险分 ${score}，仅命中少量弱信号，暂不构成强风险样本。` : '当前未命中明显小号风险信号。';
  }
}

function buildPlayerRiskRecommendations(factors: GmPlayerRiskFactor[], level: GmPlayerRiskLevel): string[] {
  const recommendations: string[] = [];
  const integrityFactor = factors.find((factor) => factor.key === 'account-integrity');
  const namingFactor = factors.find((factor) => factor.key === 'account-name-pattern');
  const clusterFactor = factors.find((factor) => factor.key === 'similar-account-cluster');
  const sharedIpFactor = factors.find((factor) => factor.key === 'shared-ip-cluster');
  const sharedDeviceFactor = factors.find((factor) => factor.key === 'shared-device-cluster');
  const marketFactor = factors.find((factor) => factor.key === 'market-transfer');
  if ((integrityFactor?.score ?? 0) > 0) {
    recommendations.push('先核对该角色是否存在异常账号绑定或脏数据，再继续做小号判定。');
  }
  if ((marketFactor?.score ?? 0) >= 14) {
    recommendations.push('优先查看近 120 笔坊市成交对象、成交方向和是否存在单向输血链。');
  }
  if ((namingFactor?.score ?? 0) >= 6 || (clusterFactor?.score ?? 0) >= 8) {
    recommendations.push('建议联查同前缀纯序号账号簇，确认是否存在批量起号。');
  }
  if ((sharedIpFactor?.score ?? 0) >= 9 || (sharedDeviceFactor?.score ?? 0) >= 12) {
    recommendations.push('建议联查重复 IP / 设备重叠账号，确认是否存在同主体多号或共享环境误报。');
  }
  if (level === 'critical' || level === 'high') {
    recommendations.push('建议纳入 GM 高优先级复核队列，但当前系统不自动封号。');
  }
  if (recommendations.length <= 0) {
    recommendations.push('当前无需立即处置，继续观察后续行为变化即可。');
  }
  return recommendations;
}

function buildZeroRiskFactors(summary: string): GmPlayerRiskFactor[] {
  return [
    createPlayerRiskFactor('account-integrity', '账号完整性', 20, 0, summary),
    createPlayerRiskFactor('account-name-pattern', '账号命名模式', 10, 0, summary),
    createPlayerRiskFactor('similar-account-cluster', '相似账号簇', 20, 0, summary),
    createPlayerRiskFactor('account-age', '账号年龄', 10, 0, summary),
    createPlayerRiskFactor('shared-ip-cluster', '重复 IP', 18, 0, summary),
    createPlayerRiskFactor('shared-device-cluster', '重复设备', 25, 0, summary),
    createPlayerRiskFactor('market-transfer', '坊市关系', 30, 0, summary),
  ];
}

function resolvePlayerRiskLevel(score: number): GmPlayerRiskLevel {
  if (score >= 80) {
    return 'critical';
  }
  if (score >= 55) {
    return 'high';
  }
  if (score >= 30) {
    return 'medium';
  }
  return 'low';
}

function createPlayerRiskFactor(
  key: GmPlayerRiskFactorKey,
  label: string,
  maxScore: number,
  score: number,
  summary: string,
  evidence: string[] = [],
): GmPlayerRiskFactor {
  return {
    key,
    label,
    maxScore,
    score: Math.max(0, Math.min(maxScore, Math.floor(score))),
    summary,
    evidence,
  };
}

function parseSerialAccountPattern(username: string): { prefix: string; digits: string } | null {
  const match = username.trim().match(/^([a-z_][a-z0-9_]{1,15}?)(\d{3,})$/iu);
  if (!match) {
    return null;
  }
  return {
    prefix: match[1].toLowerCase(),
    digits: match[2],
  };
}

function buildRandomNoiseAccountNameScore(username: string): { score: number; summary: string; evidence: string[] } | null {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{8,}$/u.test(normalized) || parseSerialAccountPattern(normalized)) {
    return null;
  }
  const letters = [...normalized].filter((char) => char >= 'a' && char <= 'z');
  if (letters.length < 6) {
    return null;
  }
  const vowelCount = letters.filter((char) => 'aeiou'.includes(char)).length;
  let maxConsonantRun = 0;
  let currentConsonantRun = 0;
  for (const char of normalized) {
    if (char >= 'a' && char <= 'z' && !'aeiou'.includes(char)) {
      currentConsonantRun += 1;
      maxConsonantRun = Math.max(maxConsonantRun, currentConsonantRun);
      continue;
    }
    currentConsonantRun = 0;
  }
  if (vowelCount === 0 || maxConsonantRun >= 5) {
    return {
      score: 5,
      summary: '账号名像随机生成的低可读性字符串。',
      evidence: [`账号名“${username}”元音数量 ${vowelCount}，最长连续辅音 ${maxConsonantRun}。`],
    };
  }
  return null;
}

function isContactStyleSerialAccountPattern(pattern: { prefix: string; digits: string }): boolean {
  return GM_CONTACT_STYLE_ACCOUNT_PREFIXES.has(pattern.prefix) && pattern.digits.length >= 5;
}

function escapeSqlRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function getAccountAgeDays(account: { createdAt?: string | null } | null | undefined): number {
  const createdAtMs = Date.parse(normalizeString(account?.createdAt));
  if (!Number.isFinite(createdAtMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - createdAtMs) / 86_400_000));
}

async function queryOne<TRow>(pool: Pool, sql: string, params: unknown[]): Promise<TRow | null> {
  try {
    const result = await pool.query<TRow>(sql, params);
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function queryMany<TRow>(pool: Pool, sql: string, params: unknown[]): Promise<TRow[]> {
  try {
    const result = await pool.query<TRow>(sql, params);
    return Array.isArray(result.rows) ? result.rows : [];
  } catch {
    return [];
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value instanceof Date ? value.toISOString() : '';
}

function normalizeDateLike(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function normalizeInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}
