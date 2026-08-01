#!/usr/bin/env bash
# Every systemImage / systemName in the app must be a real SF Symbol.
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import re, pathlib
names = set()
for f in pathlib.Path("Pattadar/Sources").glob("*.swift"):
    t = f.read_text()
    names |= set(re.findall(r'systemImage: "([A-Za-z0-9._]+)"', t))
    names |= set(re.findall(r'systemName: "([A-Za-z0-9._]+)"', t))
open("/tmp/pattadar-symbols.txt", "w").write("\n".join(sorted(names)))
PY
cat > /tmp/pattadar-symcheck.swift <<'SWIFT'
import AppKit
import Foundation
let text = (try? String(contentsOf: URL(fileURLWithPath: "/tmp/pattadar-symbols.txt"), encoding: .utf8)) ?? ""
let names = text.split(separator: "\n").map(String.init)
let missing = names.filter { NSImage(systemSymbolName: $0, accessibilityDescription: nil) == nil }
if !missing.isEmpty {
    FileHandle.standardError.write(Data("error: unknown SF Symbols: \(missing.joined(separator: ", "))\n".utf8))
    exit(1)
}
SWIFT
xcrun swift /tmp/pattadar-symcheck.swift
