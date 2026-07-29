#!/usr/bin/env bash
# Re-apply Pattadar's hand-maintained iOS native fixes after any `expo prebuild`
# regenerates apps/mobile/ios. Idempotent — safe to run repeatedly.
#  1. SceneDelegate (UIScene adoption — Xcode 27 beta SDK requires it; Expo doesn't ship it yet)
#  2. Info.plist scene manifest pointing at it
#  3. ENABLE_USER_SCRIPT_SANDBOXING=NO (React Native build scripts need it)
#  4. Empty entitlements (free personal team cannot sign Associated Domains)
#  5. DEVELOPMENT_TEAM for Xcode GUI builds
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../apps/mobile/ios"
TEAM="${TEAM:-WME7N6KM67}"

# 1. SceneDelegate.swift
if [ ! -f Pattadar/SceneDelegate.swift ]; then
cat > Pattadar/SceneDelegate.swift <<'EOF'
import UIKit
import React

/// Minimal UIScene adoption — required by the iOS SDK in Xcode 27+.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let appWindow = appDelegate.window else { return }
    appWindow.windowScene = windowScene
    window = appWindow
    appWindow.makeKeyAndVisible()
    for context in connectionOptions.urlContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
EOF
echo "» SceneDelegate.swift written"
fi

# 2. pbxproj: register SceneDelegate + sandboxing + team
python3 - <<'PY'
import re, uuid
p = 'Pattadar.xcodeproj/project.pbxproj'
s = open(p).read()
changed = False
if 'SceneDelegate.swift' not in s:
    bf = re.search(r'^(\s*)([0-9A-F]{24}) /\* AppDelegate\.swift in Sources \*/ = \{isa = PBXBuildFile; fileRef = ([0-9A-F]{24}) /\* AppDelegate\.swift \*/; \};', s, re.M)
    fr = re.search(r'^(\s*)([0-9A-F]{24}) /\* AppDelegate\.swift \*/ = \{isa = PBXFileReference;.*?\};', s, re.M)
    nb, nf = uuid.uuid4().hex[:24].upper(), uuid.uuid4().hex[:24].upper()
    s = s.replace(bf.group(0), bf.group(0) + '\n' + bf.group(0).replace(bf.group(2), nb).replace(bf.group(3), nf).replace('AppDelegate.swift', 'SceneDelegate.swift'))
    s = s.replace(fr.group(0), fr.group(0) + '\n' + fr.group(0).replace(fr.group(2), nf).replace('AppDelegate.swift', 'SceneDelegate.swift'))
    s = re.sub(r'(%s /\* AppDelegate\.swift \*/,)' % fr.group(2), r'\1\n\t\t\t\t%s /* SceneDelegate.swift */,' % nf, s, count=1)
    s = re.sub(r'(%s /\* AppDelegate\.swift in Sources \*/,)' % bf.group(2), r'\1\n\t\t\t\t%s /* SceneDelegate.swift in Sources */,' % nb, s, count=1)
    changed = True
if 'ENABLE_USER_SCRIPT_SANDBOXING = YES;' in s:
    s = s.replace('ENABLE_USER_SCRIPT_SANDBOXING = YES;', 'ENABLE_USER_SCRIPT_SANDBOXING = NO;')
    changed = True
if 'DEVELOPMENT_TEAM' not in s:
    s = s.replace('CODE_SIGN_ENTITLEMENTS = Pattadar/Pattadar.entitlements;',
      'CODE_SIGN_ENTITLEMENTS = Pattadar/Pattadar.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = TEAMPLACEHOLDER;')
    changed = True
open(p, 'w').write(s)
print('» pbxproj:', 'updated' if changed else 'already good')
PY
sed -i '' "s/TEAMPLACEHOLDER/${TEAM}/" Pattadar.xcodeproj/project.pbxproj 2>/dev/null || true

# 3. Info.plist scene manifest
PB=/usr/libexec/PlistBuddy; PL=Pattadar/Info.plist
$PB -c "Delete :UIApplicationSceneManifest" $PL 2>/dev/null || true
$PB -c "Add :UIApplicationSceneManifest dict" \
   -c "Add :UIApplicationSceneManifest:UIApplicationSupportsMultipleScenes bool false" \
   -c "Add :UIApplicationSceneManifest:UISceneConfigurations dict" \
   -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication array" \
   -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0 dict" \
   -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneConfigurationName string Default" \
   -c "Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName string \$(PRODUCT_MODULE_NAME).SceneDelegate" $PL
echo "» Info.plist scene manifest set"

# 4. entitlements: empty (free team cannot sign Associated Domains)
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict/>\n</plist>\n' > Pattadar/Pattadar.entitlements
echo "» entitlements cleared"
echo "✅ iOS native fixes applied"

# 6. Xcode ▶ builds Release (embedded JS bundle) — Debug needs Metro over the
# network, which physical phones on isolated Wi-Fi can't reach.
SCHEME=$(ls Pattadar.xcodeproj/xcshareddata/xcschemes/*.xcscheme 2>/dev/null | head -1)
[ -n "$SCHEME" ] && python3 -c "
import re,sys
p='$SCHEME'; s=open(p).read()
s=re.sub(r'(<LaunchAction[^>]*buildConfiguration = \")Debug(\")', r'\g<1>Release\g<2>', s)
open(p,'w').write(s)" && echo "» scheme Run action = Release"

# 7. Allow plain-http dev servers (LAN bridge) — remove for store builds.
$PB -c "Delete :NSAppTransportSecurity" $PL 2>/dev/null || true
$PB -c "Add :NSAppTransportSecurity dict" -c "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true" $PL
echo "» ATS dev exception set"

# 8. Location permission (map pinning / current location)
$PB -c "Add :NSLocationWhenInUseUsageDescription string 'Pattadar uses your location to pin parcels and properties on the map.'" $PL 2>/dev/null || true
