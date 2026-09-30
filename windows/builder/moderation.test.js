const assert = require('node:assert/strict');
const { blocked, validateName, publicName } = require('./moderation');
for (const name of ['fuck', 'ＦＵＣＫ', 'f.u c-k', '傻 逼', '裸\u200b聊']) assert.equal(blocked(name), true);
for (const name of ['我的客户端', 'Xboard Windows', '好臭啊']) assert.equal(blocked(name), false);
assert.throws(() => validateName('fuck'), /不允许/);
assert.throws(() => validateName('客户\u200b端'), /隐藏字符/);
assert.equal(publicName('傻逼'), '名称已隐藏');
assert.equal(publicName('我的客户端'), '我的客户端');
console.log('Moderation checks passed');
