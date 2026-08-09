import Foundation

/// The name a document travels under when it leaves the app.
///
/// Files are stored as `doc-<uuid>.pdf` because storage needs a key that cannot
/// collide. That key is not a NAME: sending "doc-26deb553-6a8f-4c11.pdf" to a
/// lawyer or a brother hands them something they must open to identify and
/// cannot find again by searching. What leaves the app follows the founder's
/// convention — "pattadar-fmb-mangalakunta-2024.pdf": the app's own name
/// first, so every file the platform ever produced sorts and searches
/// together, then what it is, where, and when, in a slug every filesystem
/// and messaging app treats kindly.
///
/// Only the outgoing copy is renamed. The stored file keeps its UUID, because
/// that is what every row in the database points at.
public func shareFileName(docType: String, village: String, date: String,
                          fallbackExtension: String) -> String {
    let kind = docType.trimmingCharacters(in: .whitespaces).isEmpty
        ? documentKind(docType).label
        : docType.trimmingCharacters(in: .whitespaces)

    var parts = ["pattadar", fileSlug(kind)]
    let place = fileSlug(village)
    if !place.isEmpty { parts.append(place) }
    if let year = year(from: date) { parts.append(year) }

    let ext = fallbackExtension.isEmpty ? "pdf" : fallbackExtension
    let name = parts.filter { !$0.isEmpty }.joined(separator: "-")
    return String(name.prefix(80)) + "." + ext
}

/// "FMB / survey map" → "fmb-survey-map": lowercase, alphanumerics only,
/// single hyphens — nothing a filesystem, a URL or WhatsApp can mangle.
public func fileSlug(_ raw: String) -> String {
    raw.lowercased()
        .components(separatedBy: CharacterSet.alphanumerics.inverted)
        .filter { !$0.isEmpty }
        .joined(separator: "-")
}

/// The year, from any of the shapes a registration date arrives in:
/// "2003-01-04", "04-01-2003", "04/01/2003", or an ISO timestamp.
public func year(from date: String) -> String? {
    let s = date.trimmingCharacters(in: .whitespaces)
    guard !s.isEmpty else { return nil }
    // A four-digit run that looks like a year, wherever it sits in the string.
    guard let re = try? NSRegularExpression(pattern: #"(1[89]\d{2}|20\d{2})"#),
          let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
          let r = Range(m.range(at: 1), in: s)
    else { return nil }
    return String(s[r])
}

/// Safe on every filesystem and in every messaging app, without mangling the
/// name into something unreadable.
///
/// `/` and `:` are separators on the platforms these files land on, and a
/// leading dot hides the file — each of which turns a share into a support
/// question rather than a delivered document.
public func sanitizeFileName(_ raw: String) -> String {
    let illegal = CharacterSet(charactersIn: "/\\:*?\"<>|\n\r\t")
    let cleaned = String(String.UnicodeScalarView(
        raw.unicodeScalars.map { illegal.contains($0) ? " " : $0 }))
    let collapsed = cleaned
        .components(separatedBy: .whitespaces)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
    guard !collapsed.isEmpty else { return "Document" }
    // Filenames have limits, and a name nobody can read to the end is no more
    // useful than the UUID it replaced.
    return String(collapsed.prefix(80))
}
