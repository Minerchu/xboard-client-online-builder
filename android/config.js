'use strict';
const path = require('node:path');
const root = __dirname;
module.exports = {
  root,
  template: process.env.APK_TEMPLATE || path.join(root, 'private', 'template.apk'),
  apktool: process.env.APKTOOL_JAR || path.join(root, 'private', 'apktool.jar'),
  store: process.env.BUILD_STORE || path.join(root, 'data'),
  keystore: process.env.SIGN_KEYSTORE || path.join(root, 'private', 'signing.jks'),
  alias: process.env.SIGN_ALIAS || 'xboard-builder',
  port: Number(process.env.PORT || 8788),
  ttl: 5 * 60 * 1000
};
