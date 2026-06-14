'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

// afterPack fires for each arch temp dir AND the final universal dir.
// We only need to sign once — the final universal assembly.
// electron-builder sets appOutDir to a "-temp" suffixed path for the
// arch slices and the plain "mac-universal" dir for the merged bundle.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  // Skip the per-arch temp dirs; sign only the final merged bundle.
  if (context.appOutDir.includes('-temp')) return;

  const appName = context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');

  // --force  : override the Electron binary's linker-applied signature
  // --deep   : sign inner frameworks/helpers bottom-up in one pass
  // --options runtime : binds Info.plist into the code directory so TCC
  //            sees Identifier=com.sonescape.visualizer, not Identifier=Electron
  // --entitlements : embeds audio-input + JIT allowances
  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign', '-',
    '--options', 'runtime',
    '--entitlements', entitlements,
    appPath,
  ], { stdio: 'inherit' });

  console.log(`[afterPack] Ad-hoc signed ${appPath}`);
};
