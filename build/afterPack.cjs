'use strict';
const { execFileSync, execSync } = require('child_process');
const path = require('path');

// Signs one target (binary file or bundle directory).
// --timestamp=none avoids any network call to Apple's timestamp server.
function sign(target, entitlements) {
  execFileSync('codesign', [
    '--force',
    '--sign', '-',
    '--timestamp=none',
    '--entitlements', entitlements,
    target,
  ], { stdio: 'pipe' });
}

// Returns all regular (non-symlink) Mach-O files under root, sorted deepest first.
function findMachOBinaries(root) {
  const raw = execSync(`find "${root}" -type f`, { encoding: 'utf8' });
  return raw.split('\n').filter(Boolean).filter(f => {
    try {
      return execSync(`file "${f}"`, { encoding: 'utf8' }).includes('Mach-O');
    } catch { return false; }
  }).sort((a, b) => b.split('/').length - a.split('/').length);
}

// Returns all .framework and .app bundles nested inside root (excluding root itself), deepest first.
function findNestedBundles(root) {
  const raw = execSync(
    `find "${root}/Contents" \\( -name "*.framework" -o -name "*.app" \\)`,
    { encoding: 'utf8' }
  );
  return raw.split('\n').filter(Boolean)
    .sort((a, b) => b.split('/').length - a.split('/').length);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');

  console.log('\n[afterPack] ── inside-out ad-hoc signing ──');
  console.log(`[afterPack] bundle: ${appPath}`);

  // 1. Sign every Mach-O binary file, deepest path first.
  //    This covers bare executables (chrome_crashpad_handler etc.) and
  //    dylibs inside framework Libraries/ dirs before their parent is sealed.
  const binaries = findMachOBinaries(appPath);
  console.log(`[afterPack] step 1: signing ${binaries.length} Mach-O binaries`);
  for (const bin of binaries) {
    sign(bin, entitlements);
    console.log(`  ✓ ${path.relative(appPath, bin)}`);
  }

  // 2. Sign nested .framework and helper .app bundles, deepest first.
  //    Frameworks must be sealed after their own binaries are signed (step 1 above),
  //    and before the outer app bundle is sealed.
  const bundles = findNestedBundles(appPath);
  console.log(`[afterPack] step 2: signing ${bundles.length} nested bundles`);
  for (const bundle of bundles) {
    sign(bundle, entitlements);
    console.log(`  ✓ ${path.relative(appPath, bundle)}`);
  }

  // 3. Seal the outer .app last.  At this point every inner component carries
  //    the same ad-hoc identity (empty team ID), so dyld won't see a mismatch.
  console.log('[afterPack] step 3: sealing outer app bundle');
  sign(appPath, entitlements);
  console.log(`  ✓ ${appName}.app`);

  console.log('[afterPack] ── signing complete ──\n');
};
