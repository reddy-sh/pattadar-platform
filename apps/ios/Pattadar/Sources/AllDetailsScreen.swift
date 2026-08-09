import PattadarKit
import SwiftUI

/// Page 2 of a document: every field, its page, its flags — then the file
/// map. Page 1 answers; this page proves. Identity numbers arrive masked and
/// reveal only on a deliberate tap (DocDetailsSection owns that rule).
struct DocumentAllDetailsScreen: View {
    let doc: RegisteredDocument
    let reading: DocReading
    let spine: DocSpine
    @State private var openAtPage: DocumentDetailScreen.PageSelection?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DocDetailsSection(groups: detailGroups, reading: reading) { page in
                    if LocalFiles.url(for: doc.id) != nil {
                        openAtPage = DocumentDetailScreen.PageSelection(id: page)
                    }
                }
                FileContentsSection(reading: reading) { page in
                    if LocalFiles.url(for: doc.id) != nil {
                        openAtPage = DocumentDetailScreen.PageSelection(id: page)
                    }
                }
            }
            .padding()
        }
        .contentMargins(.bottom, 28, for: .scrollContent)
        .navigationTitle(navTitle)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $openAtPage) { selection in
            if let url = LocalFiles.url(for: doc.id) {
                PDFFullScreen(url: url, title: navTitle, startPage: selection.id)
            }
        }
    }

    /// "Sale Deed · 6337 / 2024" — the registrar's own way of naming it.
    /// displayIdentity keeps an Aadhaar-shaped documentNo masked up here;
    /// the rows below are the one reveal surface.
    private var navTitle: String {
        let kind = doc.docType.isEmpty ? documentKind(doc.docType).label : doc.docType
        let number = [displayIdentity(doc.documentNo), doc.regYear]
            .filter { !$0.isEmpty }.joined(separator: " / ")
        if !number.isEmpty { return "\(kind) · \(number)" }
        return spine.identityLabel.isEmpty ? kind : "\(kind) · \(spine.identityLabel)"
    }

    /// One standard schema for every document: Who · Where · Boundaries ·
    /// What · Money · Registration. Each row carries the page it was read
    /// from; a row without provenance shows no caption, never "page 0".
    private var detailGroups: [(title: String, rows: [DocDetailRow])] {
        var who: [DocDetailRow] = []
        for party in reading.parties {
            who.append(DocDetailRow(label: party.role.capitalized
                                        + (party.isGPA ? " · via GPA holder" : ""),
                                    value: party.name, field: "parties"))
        }
        // The whereabouts chain, the way the schedule itself opens: the
        // string of places that make this land findable by any office.
        let whereItIs: [DocDetailRow] = [
            .init(label: "Village", value: doc.village, field: "village"),
            .init(label: "Mandal", value: doc.mandal, field: "mandal"),
            .init(label: "District", value: doc.district, field: "district"),
            .init(label: "Survey number", value: doc.surveyNo, field: "survey_no"),
            .init(label: "Plot number", value: doc.plotNo, field: "plot_no"),
        ].filter { !$0.value.isEmpty }
        // The four హద్దులు, deed order — తూర్పు first. These are the key
        // information on the paper: in a dispute, these four lines are the
        // argument.
        let boundaries: [DocDetailRow] = [
            .init(label: "East · తూర్పు", value: doc.boundaryEast, field: "boundaries"),
            .init(label: "South · దక్షిణం", value: doc.boundarySouth, field: "boundaries"),
            .init(label: "West · పడమర", value: doc.boundaryWest, field: "boundaries"),
            .init(label: "North · ఉత్తరం", value: doc.boundaryNorth, field: "boundaries"),
        ].filter { !$0.value.isEmpty }
        let what: [DocDetailRow] = [
            .init(label: "Extent", value: doc.extent, field: "extent"),
        ].filter { !$0.value.isEmpty }
        let money: [DocDetailRow] = [
            .init(label: "Consideration", value: doc.consideration > 0 ? rupees(doc.consideration) : "",
                  field: "consideration"),
        ].filter { !$0.value.isEmpty }
        let registration: [DocDetailRow] = [
            .init(label: "Document no.", value: doc.documentNo, field: "document_no"),
            .init(label: "Registered on", value: humanDate(doc.registrationDate), field: "registration_date"),
            .init(label: "Sub-registrar", value: doc.sro, field: "sro"),
        ].filter { !$0.value.isEmpty }
        return [("Who", who), ("Where it is", whereItIs), ("Boundaries · హద్దులు", boundaries),
                ("What", what), ("Money", money), ("Registration", registration)]
    }
}
