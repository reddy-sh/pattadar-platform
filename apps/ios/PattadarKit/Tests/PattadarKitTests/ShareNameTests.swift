import Foundation
import Testing

@testable import PattadarKit

/// What a document is called when it leaves the phone. The storage UUID is a
/// key, not a name, and it is the recipient who pays for the difference.

@Test("A shared document follows the pattadar-<kind>-<place>-<year> convention")
func shareNameFollowsTheConvention() {
    #expect(shareFileName(docType: "Sale Deed", village: "Nallapadu",
                          date: "04-01-2003", fallbackExtension: "pdf")
            == "pattadar-sale-deed-nallapadu-2003.pdf")
    // The founder's own example: an FMB leaves as pattadar-fmb-….
    #expect(shareFileName(docType: "FMB", village: "Mangalakunta",
                          date: "2024", fallbackExtension: "pdf")
            == "pattadar-fmb-mangalakunta-2024.pdf")
}

@Test("Missing pieces are left out, never rendered as blanks")
func absentPartsAreOmitted() {
    #expect(shareFileName(docType: "Sale Deed", village: "", date: "", fallbackExtension: "pdf")
            == "pattadar-sale-deed.pdf")
    #expect(shareFileName(docType: "", village: "Katragunta", date: "", fallbackExtension: "jpg")
            == "pattadar-document-katragunta.jpg")
    // Never "pattadar-sale-deed--.pdf".
    #expect(!shareFileName(docType: "Sale Deed", village: "", date: "", fallbackExtension: "pdf")
        .contains("--"))
}

@Test("A year is found in any shape a registration date arrives in")
func yearParsing() {
    #expect(year(from: "2003-01-04") == "2003")
    #expect(year(from: "04-01-2003") == "2003")
    #expect(year(from: "04/01/1998") == "1998")
    #expect(year(from: "2024-06-12T10:04:00") == "2024")
    #expect(year(from: "") == nil)
    // A survey number is not a year.
    #expect(year(from: "Sy 191") == nil)
}

@Test("A name that would break a filesystem is repaired, not passed on")
func illegalCharactersAreRemoved() {
    let n = shareFileName(docType: "Sale/Gift: Deed", village: "Nallapadu",
                          date: "2003", fallbackExtension: "pdf")
    #expect(!n.contains("/"), "a slash makes this a path, not a filename")
    #expect(!n.contains(":"))
    #expect(n.hasSuffix(".pdf"))
    #expect(n == "pattadar-sale-gift-deed-nallapadu-2003.pdf")
    #expect(fileSlug("FMB / survey map") == "fmb-survey-map")
    #expect(fileSlug("   ") == "")
    // A leading dot hides the file on every Unix system it lands on.
    #expect(!sanitizeFileName(".hidden").hasPrefix("."))
    #expect(sanitizeFileName("   ") == "Document")
    #expect(sanitizeFileName("a   b") == "a b", "runs of spaces collapse")
}

@Test("A long name is cut, and still ends in a usable extension")
func longNamesAreBounded() {
    let n = shareFileName(docType: String(repeating: "Sale Deed ", count: 40),
                          village: "Nallapadu", date: "2003", fallbackExtension: "pdf")
    #expect(n.count <= 84)
    #expect(n.hasSuffix(".pdf"))
}
