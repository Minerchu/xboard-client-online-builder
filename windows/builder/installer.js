const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const [configFile, clientDir, setupFile, mode] = process.argv.slice(2);
if (!configFile || !clientDir || !setupFile) throw new Error('Usage: node installer.js config.json client-directory setup.exe');
const { name, icon } = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (typeof name !== 'string' || !name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) {
  throw new Error('Invalid Windows application name');
}
if (!fs.existsSync(path.join(clientDir, `${name}.exe`))) throw new Error('Client build is missing');
const escape = value => {
  if (value.includes('"') || /[\r\n]/.test(value)) throw new Error('Invalid installer value');
  return value.replace(/\$/g, '$$$$');
};
const label = escape(name);
const source = escape(path.resolve(clientDir));
const target = escape(path.resolve(setupFile));
const key = crypto.createHash('sha256').update(name).digest('hex').slice(0, 16);
const iconPath = icon ? path.resolve(path.dirname(configFile), icon) : null;
const iconLine = iconPath ? `Icon "${escape(iconPath)}"\nUninstallIcon "${escape(iconPath)}"` : '';
const nsi = `Unicode true
Name "${label}"
OutFile "${target}"
InstallDir "$LOCALAPPDATA\\Programs\\${label}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
${iconLine}
VIProductVersion "4.2.1.0"
VIAddVersionKey "ProductName" "${label}"
VIAddVersionKey "FileDescription" "${label} setup"
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r /x "unins000.exe" /x "unins000.dat" "${source}${path.sep}*"
  CreateDirectory "$SMPROGRAMS\\${label}"
  CreateShortCut "$SMPROGRAMS\\${label}\\${label}.lnk" "$INSTDIR\\${label}.exe"
  CreateShortCut "$DESKTOP\\${label}.lnk" "$INSTDIR\\${label}.exe"
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\XboardClient-${key}" "DisplayName" "${label}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\XboardClient-${key}" "UninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\"'
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\XboardClient-${key}" "InstallLocation" "$INSTDIR"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\\${label}.lnk"
  Delete "$SMPROGRAMS\\${label}\\${label}.lnk"
  RMDir "$SMPROGRAMS\\${label}"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\XboardClient-${key}"
  RMDir /r "$INSTDIR"
SectionEnd
`;
const script = path.join(path.dirname(setupFile), 'installer.nsi');
fs.writeFileSync(script, nsi, 'utf8');
if (mode === '--emit-script') {
  console.log(`Wrote ${script}`);
  process.exit(0);
}
try {
  execFileSync(process.env.MAKENSIS_PATH || 'makensis', ['-V2', '-INPUTCHARSET', 'UTF8', script], { stdio: 'pipe', timeout: 180000 });
  if (!fs.existsSync(setupFile) || fs.statSync(setupFile).size < 1000000) throw new Error('Installer output missing');
  console.log(`Built ${setupFile}`);
} finally {
  fs.unlinkSync(script);
}
