import PattadarKit
import SwiftUI

/// Services (M09) — a storefront that knows your land.
///
/// Prices and the contextual bundle are `SampleData` until the marketplace
/// exists server-side. The ORDERING is real where it can be: a tapped service
/// opens the same `AddRequestSheet` that Get-it-done uses, so what you ask for
/// lands in the live work-request record rather than a demo cul-de-sac.
struct ServicesScreen: View {
    @Environment(AppModel.self) private var app
    @State private var category: SampleData.ServiceCategory? = nil
    @State private var showAll = false
    @State private var asking: RequestKind?
    @State private var quoteFor: SampleData.ServiceItem?
    /// The bundle survives being ignored, but not being answered.
    @AppStorage("pattadar.services.bundle") private var bundleState = "open"

    var body: some View {
        List {
            Section {
                Text("Priced for 3 parcels in Kakinada dist.")
                    .font(.note).foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if bundleState == "open" {
                bundleCard
            } else if bundleState == "ordered" {
                Section {
                    NavigationLink { GetItDoneScreen() } label: {
                        Label {
                            VStack(alignment: .leading, spacing: Space.hair) {
                                Text("EC and survey ordered")
                                Text("Both recorded — watch them move under Your requests")
                                    .font(.note).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Palette.success)
                        }
                    }
                }
            }

            Section {
                categoryChips
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }

            Section {
                ForEach(visibleServices) { item in
                    Button {
                        if let kind = item.requestKind { asking = kind } else { quoteFor = item }
                    } label: {
                        serviceRow(item)
                    }
                    .buttonStyle(.plain)
                }
                if !showAll, category == nil {
                    Button("All \(SampleData.services.count) services") {
                        withAnimation(Motion.standard()) { showAll = true }
                    }
                    .frame(maxWidth: .infinity)
                }
            }

            Section("In progress") {
                NavigationLink { OrderDetailScreen(order: SampleData.order) } label: {
                    HStack {
                        Image(systemName: "camera")
                            .foregroundStyle(Color.accentColor)
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(SampleData.order.title)
                            Text("\(SampleData.order.reference) · \(SampleData.order.provider)")
                                .font(.note).foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink { GetItDoneScreen() } label: {
                    Label("Your requests", systemImage: "list.bullet.rectangle")
                }
            }
        }
        .navigationTitle("Services")
        .sheet(item: $asking) { kind in
            AddRequestSheet(kind: kind) { }
        }
        .alert("A person prices this one", isPresented: quoteAlertShown) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("This work is priced for the land itself, not off a rate card. Write to support@pattadar.com with the survey number and a quote comes back within two days.")
        }
    }

    // MARK: - Pieces

    private var bundleCard: some View {
        Section {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack(alignment: .top, spacing: Space.md) {
                    Image(systemName: "bolt.fill")
                        .foregroundStyle(Color.accentColor)
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Because Sy 214/2 is for sale")
                            .font(.sectionHead)
                        Text("Buyers ask for a 13-year EC and a fresh survey. Both together, ₹4,800.")
                            .font(.bodyCopy).foregroundStyle(.secondary)
                    }
                }
                HStack(spacing: Space.sm) {
                    Button {
                        bundleState = "ordered"
                    } label: {
                        Text("Order both")
                            .font(.callout.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 40)
                    }
                    .buttonStyle(.borderedProminent)
                    Button {
                        bundleState = "dismissed"
                    } label: {
                        Text("Not now")
                            .font(.callout)
                            .padding(.horizontal, Space.lg)
                            .frame(minHeight: 40)
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(Space.lg)
            .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground)))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .strokeBorder(Color.accentColor.opacity(0.4)))
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: Space.xs, leading: Space.lg,
                                      bottom: Space.xs, trailing: Space.lg))
            .listRowSeparator(.hidden)
        }
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Space.sm) {
                chip(nil, "All")
                ForEach(SampleData.ServiceCategory.allCases, id: \.self) { c in
                    chip(c, c.rawValue)
                }
            }
            .padding(.vertical, Space.xs)
        }
    }

    private func chip(_ value: SampleData.ServiceCategory?, _ title: String) -> some View {
        let selected = category == value
        return Button {
            withAnimation(Motion.standard()) { category = value }
        } label: {
            Text(title)
                .font(.footnote.weight(selected ? .semibold : .regular))
                .padding(.horizontal, Space.md)
                .padding(.vertical, Space.sm)
                .background(Capsule().fill(selected ? Palette.accent : Color(.secondarySystemGroupedBackground)))
                .overlay(Capsule().strokeBorder(selected ? .clear : Palette.rule))
                .foregroundStyle(selected ? Palette.accentInk : Palette.ink)
        }
        .buttonStyle(.plain)
        .minimumTouchTarget()
    }

    private func serviceRow(_ item: SampleData.ServiceItem) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: item.symbol)
                .font(.scaled(15, weight: .medium))
                .foregroundStyle(Color.accentColor)
                .frame(width: 38, height: 38)
                .background(Palette.accentWash,
                            in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            VStack(alignment: .leading, spacing: Space.hair) {
                Text(item.name)
                Text(item.detail)
                    .font(.note).foregroundStyle(.secondary)
            }
            Spacer()
            Text(item.price)
                .font(.callout.monospacedDigit())
                .foregroundStyle(item.requestKind == nil ? Color.accentColor : Palette.ink)
        }
        .contentShape(Rectangle())
    }

    private var visibleServices: [SampleData.ServiceItem] {
        let all = SampleData.services.filter { category == nil || $0.category == category }
        if category != nil || showAll { return all }
        return Array(all.prefix(6))
    }

    private var quoteAlertShown: Binding<Bool> {
        Binding(get: { quoteFor != nil }, set: { if !$0 { quoteFor = nil } })
    }
}

/// Order detail (M10) — every step stamped in IST and your own time.
///
/// Entirely `SampleData` furniture: there is no dispatch server yet. The two
/// live exits are real, though — a re-survey opens the work-request sheet, and
/// the photos filed to the parcel are the photos feature that already ships.
struct OrderDetailScreen: View {
    let order: SampleData.Order
    @State private var asking: RequestKind?
    @State private var explainCall = false
    @State private var explainInvoice = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text(order.kicker.uppercased())
                        .font(.label).foregroundStyle(.secondary).kerning(1.1)
                    Text(order.title)
                        .font(.recordTitle)
                    Text(order.provider)
                        .font(.bodyCopy).foregroundStyle(.secondary)
                }
                .padding(.vertical, Space.xs)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            Section {
                ForEach(Array(order.steps.enumerated()), id: \.offset) { index, step in
                    timelineRow(step, isLast: index == order.steps.count - 1)
                }
            }

            Section {
                Fact(label: "Paid", value: rupees(Double(order.paid)))
                Fact(label: "Method", value: order.method)
                Fact(label: "Next visit", value: order.nextVisit)
            }

            Section {
                Button { explainInvoice = true } label: {
                    Label("Invoice", systemImage: "doc.plaintext")
                }
                Button { explainCall = true } label: {
                    Label("Chat with \(order.providerShort)", systemImage: "bubble.left")
                }
            }
        }
        .navigationTitle(order.reference)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $asking) { kind in
            AddRequestSheet(kind: kind) { }
        }
        .alert("Arrives with payments", isPresented: $explainInvoice) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Invoices are issued once real payments switch on. This order is demonstration furniture — the visit, the photos and the finding are what the real thing will look like.")
        }
        .alert("Chat arrives with dispatch", isPresented: $explainCall) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Messaging a caretaker switches on when caretakers are assigned through Pattadar. Until then, the person you already work with is a phone call you already have.")
        }
    }

    private func timelineRow(_ step: SampleData.OrderStep, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: Space.md) {
            Image(systemName: step.needsYou ? "exclamationmark.circle" : "checkmark.circle.fill")
                .foregroundStyle(step.needsYou ? Palette.caution : Palette.success)
                .padding(.top, Space.hair)
            VStack(alignment: .leading, spacing: Space.xs) {
                Text(step.title)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(step.needsYou ? Palette.caution : Palette.ink)
                Text(step.detail)
                    .font(.note).foregroundStyle(.secondary)
                if !step.photos.isEmpty {
                    HStack(spacing: Space.xs + 2) {
                        ForEach(Array(step.photos.enumerated()), id: \.offset) { _, symbol in
                            Image(systemName: symbol)
                                .font(.scaled(16))
                                .foregroundStyle(.secondary)
                                .frame(width: 52, height: 52)
                                .background(Palette.cardRaised,
                                            in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                        }
                        Text("+11")
                            .font(.note.monospacedDigit()).foregroundStyle(.secondary)
                            .frame(width: 52, height: 52)
                            .background(Palette.cardRaised,
                                        in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                    }
                    .padding(.top, Space.xs)
                }
                if step.needsYou {
                    HStack(spacing: Space.sm) {
                        Button {
                            asking = .survey
                        } label: {
                            Text("Order re-survey ₹2,900")
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, Space.md)
                                .frame(minHeight: 38)
                        }
                        .buttonStyle(.borderedProminent)
                        Button {
                            explainCall = true
                        } label: {
                            Text("Call him")
                                .font(.footnote)
                                .padding(.horizontal, Space.md)
                                .frame(minHeight: 38)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.top, Space.xs)
                }
            }
        }
        .padding(.vertical, Space.xs)
    }
}
