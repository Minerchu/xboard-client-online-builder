const fs = require('fs');
const path = require('path');
const dictionary = path.join(__dirname, 'blocked-words.json');
let modified = -1;
let words = [];
function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\p{C}\p{M}]/gu, '');
}
function loadWords() {
  const current = fs.statSync(dictionary).mtimeMs;
  if (current === modified) return;
  const data = JSON.parse(fs.readFileSync(dictionary, 'utf8'));
  if (!Array.isArray(data.words) || data.words.some(word => typeof word !== 'string' || !normalize(word))) {
    throw new Error('Invalid blocked-words.json');
  }
  words = data.words.map(normalize);
  modified = current;
}
function blocked(value) {
  loadWords();
  const name = normalize(value);
  return words.some(word => name.includes(word));
}
function validateName(name) {
  if (/[\p{Cf}]/u.test(name)) throw new Error('软件名称不能包含隐藏字符');
  if (blocked(name)) throw new Error('软件名称包含不允许使用的词语，请更换名称');
}
function publicName(name) {
  try { return blocked(name) ? '名称已隐藏' : name; }
  catch (error) { console.error(`Name moderation unavailable: ${error.message}`); return '名称暂不可见'; }
}
loadWords();
module.exports = { blocked, validateName, publicName };
