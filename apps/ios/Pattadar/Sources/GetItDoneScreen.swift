import PattadarKit
import SwiftUI

/// Get it done — work somebody else has to do, and where it has got to.
///
/// Land work needs a person standing on the land or queueing at an office: a
/// surveyor with a chain, an advocate reading the link documents, somebody
/// collecting a certified pahani. What goes wrong is never the asking — it is
/// that a request sits at "papers sent" for two months and nobody notices until
/// a registration deadline has passed.
///
/// So the stages are drawn as a rail, named for the work rather than generically,
/// and anything waiting on YOU says so above whatever stage it reached.
///
/// It records; it does not dispatch. There is no panel of surveyors here and no
/// way to pay one. Prices are stated as guides, and the person doing the work is
/// somebody you already found.
struct GetItDoneScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    /// True when this is PRESENTED rather than pushed. A pushed screen already
    /// has a back button; a presented one had nothing at all, and the only way
    /// out was force-quitting.
    var showsClose = false

    @State private var requests: [WorkRequest] = []
    @State private var loaded = false
    @State private var asking: RequestKind?
    @State private var chosen: WorkRequest?

    private var open: [WorkRequest] { requests.filter { !$0.closed } }
    private var done: [WorkRequest] { requests.filter(\.closed) }

    private let columns = [GridItem(.flexible(), spacing: Space.md), GridItem(.flexible(), spacing: Space.md)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                Text("Land work needs someone standing on the land or queueing at an office. Ask, then watch it move.")
                    .font(.subheadline).foregroundStyle(.secondary)

                if !open.isEmpty {
                    section("In progress", open)
                }
                if loaded && requests.isEmpty {
                    emptyState
                }

                VStack(alignment: .leading, spacing: Space.md) {
                    Text("ASK FOR SOMETHING")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .kerning(1.1)
                    LazyVGrid(columns: columns, spacing: Space.md) {
                        ForEach(RequestKind.allCases) { kind in
                            Button { asking = kind } label: { kindTile(kind) }
                                .buttonStyle(.plain)
                        }
                    }
                }

                if !done.isEmpty {
                    section("Already done", done)
                }
            }
            .padding(Space.lg)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Get it done")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if showsClose {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .task { await load() }
        .sheet(item: $asking) { kind in
            AddRequestSheet(kind: kind) { Task { await load() } }
        }
        .sheet(item: $chosen) { r in
            RequestDetailSheet(request: r) { Task { await load() } }
        }
    }

    private func section(_ title: String, _ items: [WorkRequest]) -> some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary).kerning(1.1)
            ForEach(items) { r in
                Button { chosen = r } label: { card(r) }.buttonStyle(.plain)
            }
        }
    }

    private func card(_ r: WorkRequest) -> some View {
        let kind = RequestKind.of(r.kind)
        let p = requestProgress(kind: kind, stage: r.stage,
                                needsYou: r.needsYou, closed: r.closed)
        return VStack(alignment: .leading, spacing: Space.md) {
            HStack(alignment: .top, spacing: Space.md) {
                Image(systemName: kind.icon)
                    .font(.scaled(15, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 34, height: 34)
                    .background(Color.accentColor.opacity(0.13),
                                in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text(r.title.isEmpty ? kind.title : r.title)
                        .font(.headline).foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    Text([r.assignee, r.cost > 0 ? rupees(r.cost) : ""]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Text(p.status)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, Space.md).padding(.vertical, Space.xs)
                    .background(badgeTint(p, r).opacity(0.16), in: Capsule())
                    .foregroundStyle(badgeTint(p, r))
            }

            // The rail: which step it is on, named for this kind of work.
            HStack(spacing: Space.sm) {
                ForEach(Array(kind.stages.enumerated()), id: \.offset) { i, name in
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Capsule()
                            .fill(i <= p.stageIndex ? badgeTint(p, r) : Color(.quaternaryLabel))
                            .frame(height: 3)
                        Text(name)
                            .font(.caption2)
                            .foregroundStyle(i <= p.stageIndex ? .primary : .secondary)
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
            }

            if !r.note.isEmpty {
                Text(r.note).font(.subheadline).foregroundStyle(.primary.opacity(0.8))
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.lg)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .stroke(r.needsYou && !r.closed ? Palette.danger.opacity(0.35) : .clear, lineWidth: 1))
    }

    private func badgeTint(_ p: RequestProgress, _ r: WorkRequest) -> Color {
        if r.closed { return Palette.success }
        if r.needsYou { return Palette.danger }
        return Palette.caution
    }

    private func kindTile(_ kind: RequestKind) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Image(systemName: kind.icon)
                .font(.scaled(18, weight: .medium))
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: Space.xs) {
                Text(kind.title).font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(kind.hint).font(.caption2).foregroundStyle(.secondary)
                    .lineLimit(2)
                Text(kind.priceHint).font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
        .padding(Space.lg)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .contentShape(Rectangle())
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Text("Nothing asked for yet")
                .font(.subheadline.weight(.semibold))
            Text("Record the work you have asked somebody to do — a survey, a title opinion, an errand at the MRO — and it stops living in your head.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.lg)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }

    private func load() async {
        let r = await app.load(Queries.workRequests, as: WorkRequestsResponse.self)
        requests = r?.workRequests ?? []
        loaded = true
    }
}
