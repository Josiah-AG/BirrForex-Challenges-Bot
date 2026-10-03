require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resendCredentialWarning } = require('../src/services/credentialWarningResend');
const base = { id: 42, challenge_id: 9, challenge_title: 'A < B', account_number: '123', pull_status: 'password_changed', credential_failure_detected_at: '2026-10-01', user_id: 123, source: 'telegram' };
test('hosted warning uses email, preserving registration and deadline', async () => {
 const reg = { ...base, host_id: 2, email: 'test@example.com' }; const before = JSON.stringify(reg); let calls = 0;
 assert.equal(await resendCredentialWarning(reg, { sendCredentialFailure: async (to, data) => { calls++; assert.equal(to, reg.email); assert.equal(data.challengeId, 9); return true; } }, null), 'email');
 assert.equal(calls, 1); assert.equal(JSON.stringify(reg), before);
});
test('admin warning uses escaped Telegram text and existing password link', async () => {
 let message;
 assert.equal(await resendCredentialWarning(base, null, { getMe: async () => ({ username: 'testbot' }), sendMessage: async (...args) => { message = args; } }), 'Telegram DM');
 assert.equal(message[0], 123); assert.match(message[1], /A &lt; B/); assert.doesNotMatch(message[1], /You have 24/);
 assert.match(message[2].reply_markup.inline_keyboard[0][0].url, /tc_update_password_42$/);
});
test('failed delivery and unavailable recipients are errors, fixed accounts cannot be warned', async () => {
 await assert.rejects(resendCredentialWarning({ ...base, host_id: 2, email: 'test@example.com' }, { sendCredentialFailure: async () => false }, null));
 await assert.rejects(resendCredentialWarning({ ...base, source: 'winnerpip' }, null, {}));
 await assert.rejects(resendCredentialWarning({ ...base, pull_status: 'success' }, null, {}));
 await assert.rejects(resendCredentialWarning(base, null, { getMe: async () => ({ username: 'x' }), sendMessage: async () => { throw Error('blocked'); } }));
});
