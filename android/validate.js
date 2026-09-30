'use strict';
const fs = require('node:fs');
const path = require('node:path');
const blockedPath = path.join(__dirname, 'blocked-words.json');
function validate(input) {
  if (!input || typeof input !== 'object') throw Error('请输入构建配置');
  const name = input.name;
  if (typeof name !== 'string' || name !== name.trim() || !/^[\p{L}\p{N} _-]{2,24}$/u.test(name)) throw Error('软件名限 2-24 个字，只能使用文字、数字、空格、横线和下划线');
  const normalized = name.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\p{C}\p{M}]/gu, '');
  const blocked = JSON.parse(fs.readFileSync(blockedPath, 'utf8')).words;
  if (blocked.some(word => normalized.includes(word.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\p{C}\p{M}]/gu, '')))) throw Error('软件名包含不允许使用的词语');
  if (typeof input.url !== 'string' || input.url.length > 300) throw Error('请输入 HTTPS Xboard 根地址');
  let url;
  try { url = new URL(input.url); } catch { throw Error('Xboard 地址格式不正确'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw Error('请填写 HTTPS 根地址，不要带 /api、路径、参数或账号密码');
  if (typeof input.icon !== 'string' || input.icon.length > 1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.icon)) throw Error('请上传不超过 1 MB 的 PNG 图片');
  const icon = Buffer.from(input.icon, 'base64');
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  if (icon.length > 1024 * 1024 || icon.length < 33 || !icon.subarray(0, 8).equals(signature) || icon.toString('ascii', 12, 16) !== 'IHDR') throw Error('图标必须是 PNG 图片');
  const w = icon.readUInt32BE(16), h = icon.readUInt32BE(20);
  if (w !== h || w < 128 || w > 1024) throw Error('图标需要 128-1024 像素的方形 PNG');
  return { name, url: url.origin + '/', icon };
}
module.exports = { validate };
