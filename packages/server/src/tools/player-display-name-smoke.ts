/**
 * 玩家外显名 smoke：防止 playerId 被误当作玩家名称显示。
 */

import assert from 'node:assert/strict';
import {
  isPlayerIdLikeDisplayText,
  resolvePlayerDisplayName,
  resolveSectMemberDisplayName,
} from '../runtime/player/player-display-name';

const playerId = 'p_249e7839-c38f-4672-8e8d-189f331acf1a_1775607823345';

assert.equal(isPlayerIdLikeDisplayText(playerId), true);
assert.equal(resolvePlayerDisplayName({ playerId, name: playerId, displayName: playerId }), '未知玩家');
assert.equal(resolvePlayerDisplayName({ playerId, name: '  云来散修  ', displayName: '云' }), '云来散修');
assert.equal(resolvePlayerDisplayName({ playerId, playerName: '道友甲', displayName: playerId }), '道友甲');
assert.equal(resolvePlayerDisplayName({ playerId, username: 'account-a' }, { fallback: '未知角色' }), 'account-a');
assert.equal(resolvePlayerDisplayName({ playerId }, { fallback: playerId }), '未知玩家');
assert.equal(resolveSectMemberDisplayName({ playerId, name: playerId }, playerId), '未知成员');

console.log('player-display-name smoke ok');
