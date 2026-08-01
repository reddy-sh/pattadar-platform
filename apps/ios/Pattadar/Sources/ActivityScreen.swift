import PattadarKit
import SwiftUI

/// The full audit trail, grouped by day.
struct ActivityScreen: View {
    @Environment(AppModel.self) private var app
    @State private var events: [AuditEvent] = []
    @State private var filter = "all"

    private let filters = [("all", "All"), ("added", "Added"), ("changed", "Changed"), ("deleted", "Deleted")]

    var body: some View {
        List {
            Picker("Show", selection: $filter) {
                ForEach(filters, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.segmented)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            ForEach(days, id: \.0) { day, rows in
                Section(day) { ForEach(rows) { ActivityRow(event: $0) } }
            }
            if shown.isEmpty {
                ContentUnavailableView("Nothing matches that filter", systemImage: "clock")
            }
        }
        .navigationTitle("Activity")
        .refreshable { await load() }
        .task { await load() }
    }

    private var shown: [AuditEvent] {
        events.filter { e in
            switch filter {
            case "added": e.action.hasPrefix("create_") || e.action.hasPrefix("add_") || e.action.hasPrefix("upload_")
            case "changed": e.action.hasPrefix("update_") || e.action.hasPrefix("set_") || e.action.hasPrefix("link_")
            case "deleted": isDestructive(e.action)
            default: true
            }
        }
    }

    /// Grouped on local CALENDAR days, not elapsed hours, so an event at 23:50
    /// does not sit under "Today" at 00:10 the next morning.
    private var days: [(String, [AuditEvent])] {
        var out: [(String, [AuditEvent])] = []
        for e in shown {
            let heading = dayHeading(e.timestamp)
            if out.last?.0 == heading { out[out.count - 1].1.append(e) }
            else { out.append((heading, [e])) }
        }
        return out
    }

    private func dayHeading(_ iso: String) -> String {
        guard let d = parseAuditTime(iso) else { return "Earlier" }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "Today" }
        if cal.isDateInYesterday(d) { return "Yesterday" }
        let f = DateFormatter()
        f.dateFormat = cal.isDate(d, equalTo: Date(), toGranularity: .year) ? "d MMM" : "d MMM yyyy"
        return f.string(from: d)
    }

    private func load() async {
        if let d = await app.load(Queries.dashboard, as: DashboardResponse.self) {
            events = d.recentAuditEvents
        }
    }
}

struct AccountScreen: View {
    @Environment(AppModel.self) private var app
    @State private var stats: DashboardStats?
    @State private var name = ""

    var body: some View {
        List {
            Section("You") {
                LabeledContent("Name", value: name.isEmpty ? "—" : name)
                LabeledContent("Signed in as", value: app.api.config.userID)
            }
            if let s = stats {
                Section("Your records") {
                    LabeledContent("Passbooks", value: "\(s.totalPassbooks)")
                    LabeledContent("Parcels", value: "\(s.totalParcels)")
                    LabeledContent("Documents", value: "\(s.totalDocuments)")
                    LabeledContent("Groups", value: "\(s.totalGroups)")
                }
            }
            Section("Connection") {
                LabeledContent("Server", value: app.api.config.baseURL.host ?? "—")
                // Said plainly rather than hidden: this build trusts a header,
                // and anyone who knows a user id can read that user's records.
                Label("This build identifies you with a header, not a password. Sign-in arrives with the Cognito client.",
                      systemImage: "exclamationmark.shield")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section {
                NavigationLink { ActivityScreen() } label: {
                    Label("Activity log", systemImage: "clock.arrow.circlepath")
                }
            }
        }
        .navigationTitle("Account")
        .task {
            if let d = await app.load(Queries.dashboard, as: DashboardResponse.self) {
                stats = d.dashboardStats
                name = d.me?.name ?? ""
            }
        }
    }
}
