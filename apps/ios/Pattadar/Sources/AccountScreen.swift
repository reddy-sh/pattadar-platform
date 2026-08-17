import LocalAuthentication
import PattadarKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// Account (M20) — who you are to the app, and what the app is allowed to
/// keep about you.
///
/// Pushed from More. The profile head, sign-out and connection facts lived on
/// the You tab; the M-series comps move the tab over to being a hub (M24), so
/// the personal matter gets a room of its own instead of a landing.
struct AccountScreen: View {
    @Environment(AppModel.self) private var app
    @State private var name = ""
    @State private var email = ""
    @State private var avatar: UIImage?
    @State private var photoItem: PhotosPickerItem?
    @State private var editingProfile = false
    @State private var showSignIn = false
    @State private var confirmSignOut = false
    @State private var replayOnboarding = false
    @State private var confirmClearCache = false
    @State private var explainDeleteAccount = false
    @State private var justCopied = false
    /// "This isn't me" hides the identity block. Local, reversible only by a
    /// fresh reading — which is exactly what the button promises.
    @AppStorage("pattadar.identity.removed") private var identityRemoved = false

    var body: some View {
        List {
            profileHead

            if !identityRemoved {
                identitySection
            }

            Section("Land") {
                NavigationLink { AssistantTeaserScreen() } label: {
                    Label("Pattadar Assistant", systemImage: "sparkles")
                }
                // Selects the tab instead of PUSHING DocumentsScreen — that
                // screen owns a NavigationStack of its own, and nesting two
                // gave two bars and a back button to the wrong place.
                Button { app.selectedTab = .documents } label: {
                    HStack {
                        Label("Papers", systemImage: "doc.text.fill")
                            .foregroundStyle(Color.accentColor, Color(.label))
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .foregroundStyle(.primary)
                Link(destination: URL(string: "https://pattadar.com/app")!) {
                    HStack {
                        Label {
                            VStack(alignment: .leading, spacing: Space.hair) {
                                Text("Invitations")
                                Text("Shares & verification invites · Web only")
                                    .font(.note).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "envelope")
                        }
                        Spacer()
                        Image(systemName: "arrow.up.forward.square")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                }
                NavigationLink { ActivityScreen() } label: {
                    Label("Activity log", systemImage: "clock.arrow.circlepath")
                }
            }

            appSection
            dataSection
            helpSection

            Section {
                Button { replayOnboarding = true } label: {
                    Label("Show the introduction again", systemImage: "sparkles")
                }
                Button { showSignIn = true } label: {
                    Label("Switch account", systemImage: "person.2.arrow.trianglehead.counterclockwise")
                }
                Button(role: .destructive) { confirmSignOut = true } label: {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }

            Section {
                Fact(label: "Server", value: app.api.config.baseURL.host ?? "—")
                Fact(label: "Signed in as", value: CognitoAuth.shared.email ?? app.api.config.userID)
            } header: {
                Text("Connection")
            } footer: {
                // Which door was used, said plainly either way.
                Text(CognitoAuth.shared.isSignedIn
                     ? "Signed in with your Pattadar account. Requests carry a signed token; the dev header rides along only for the dev API."
                     : "Not really signed in: this session identifies you to the dev API with a header, not a password. Sign out and back in to use your Pattadar account.")
            }
        }
        .navigationTitle("Account")
        .sheet(isPresented: $showSignIn) { SignInScreen().onDisappear { Task { await load() } } }
        .fullScreenCover(isPresented: $replayOnboarding) { OnboardingScreen() }
        .sheet(isPresented: $editingProfile) {
            EditProfileScreen(name: name, email: email) { Task { await load() } }
        }
        .confirmationDialog("Sign out?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) {
                app.signOut()
                avatar = nil
                showSignIn = true
            }
            Button("Stay", role: .cancel) { }
        } message: {
            // Nothing is deleted: the records live on the server, and saying
            // so removes the fear that stops people signing out.
            Text("Your records stay on the server. Only this device forgets who you are.")
        }
        .confirmationDialog("Clear cached files?", isPresented: $confirmClearCache, titleVisibility: .visible) {
            Button("Clear the cache", role: .destructive) {
                ResponseCache.shared.clear()
                URLCache.shared.removeAllCachedResponses()
            }
            Button("Keep them", role: .cancel) { }
        } message: {
            // The one thing people fear from "clear": losing unsent work.
            // Filings waiting to go up are a queue, not a cache — untouched.
            Text("Frees space used by downloaded copies. Papers waiting to upload are not touched.")
        }
        .alert("Not yet, and honestly so", isPresented: $explainDeleteAccount) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Deleting an account permanently removes your records, and while the app is in development that needs a written request to support@pattadar.com — so a bug cannot destroy a family's papers.")
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    Identity.saveAvatar(data)
                    avatar = UIImage(data: data)
                }
            }
        }
        .refreshable { await load() }
        .task { avatar = Identity.avatar(); await load() }
    }

    // MARK: - Sections

    private var profileHead: some View {
        Section {
            HStack(spacing: Space.lg) {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    ZStack(alignment: .bottomTrailing) {
                        if let avatar {
                            Image(uiImage: avatar)
                                .resizable().scaledToFill()
                                .frame(width: 64, height: 64)
                                .clipShape(Circle())
                        } else {
                            // Initials beat a grey silhouette: they say whose
                            // account this is.
                            Text(initials)
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(.white)
                                .frame(width: 64, height: 64)
                                .background(Circle().fill(.tint))
                        }
                        Image(systemName: "camera.circle.fill")
                            .font(.title3)
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, Color.accentColor)
                            .offset(x: 2, y: 2)
                    }
                }
                VStack(alignment: .leading, spacing: Space.xs) {
                    Text(name.isEmpty ? "You" : name)
                        .font(.title3.weight(.semibold))
                    Button("Edit name and email") { editingProfile = true }
                        .font(.caption)
                    if avatar != nil {
                        Button("Remove photo") {
                            Identity.removeAvatar()
                            avatar = nil
                        }
                        .font(.caption2)
                    }
                }
                Spacer()
            }
            .padding(.vertical, Space.xs)
        }
    }

    private var identitySection: some View {
        Section {
            HStack(alignment: .top, spacing: Space.md) {
                Image(systemName: "person.badge.shield.checkmark")
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text("Aadhaar")
                    Text(SampleData.identity.aadhaarMasked)
                        .font(.callout.monospaced()).foregroundStyle(.secondary)
                    Text("\(SampleData.identity.dateOfBirth) · \(SampleData.identity.gender)")
                        .font(.note).foregroundStyle(.secondary)
                    Text(SampleData.identity.address)
                        .font(.note).foregroundStyle(.secondary)
                }
                Spacer()
                Button(justCopied ? "Copied" : "Copy") { copyIdentity() }
                    .font(.callout.weight(.semibold))
                    .disabled(justCopied)
            }
            .padding(.vertical, Space.xs)
            Button(role: .destructive) { identityRemoved = true } label: {
                VStack(alignment: .leading, spacing: Space.hair) {
                    Label("This isn't me", systemImage: "person.crop.circle.badge.xmark")
                        .foregroundStyle(Palette.danger)
                    // A concrete colour: the destructive tint would otherwise
                    // bleed through `.secondary` and turn the subline pink.
                    Text("Remove this name, date of birth, address and Aadhaar")
                        .font(.note).foregroundStyle(Color(.secondaryLabel))
                }
            }
        } header: {
            Text("Your identity")
        } footer: {
            Text("Copying re-asks for Face ID every time, and the clipboard clears in a minute.")
        }
    }

    private var appSection: some View {
        Section("App") {
            Picker(selection: unitsBinding) {
                ForEach(UnitsPreference.allCases, id: \.self) { Text($0.rawValue) }
            } label: {
                Label("Units", systemImage: "ruler")
            }
            Picker(selection: languageBinding) {
                Text("English").tag("en")
                Text("తెలుగు").tag("te")
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Language")
                        Text("Telugu kept on record values")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "character.book.closed")
                }
            }
            Picker(selection: appearanceBinding) {
                ForEach(AppearanceChoice.allCases, id: \.self) { Text($0.label) }
            } label: {
                Label("Appearance", systemImage: "circle.lefthalf.filled")
            }
            HStack {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Your time zone")
                        Text("Dates show in this and IST")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "clock")
                }
                Spacer()
                Text(Self.utcOffsetLabel).foregroundStyle(.secondary)
            }
        }
    }

    private var dataSection: some View {
        Section {
            Button { app.selectedTab = .documents } label: {
                HStack {
                    Label {
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text("Export your records")
                            Text("Select papers in Papers, then Share — they leave as one zip")
                                .font(.note).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "square.and.arrow.down")
                    }
                    .foregroundStyle(Color.accentColor, Color(.label))
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption).foregroundStyle(.tertiary)
                }
            }
            .foregroundStyle(.primary)
            Button { confirmClearCache = true } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Clear cached files")
                        Text("Frees space used by downloaded copies")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "trash.slash")
                }
                .foregroundStyle(Color.accentColor, Color(.label))
            }
            .foregroundStyle(.primary)
            Button(role: .destructive) { explainDeleteAccount = true } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Delete account")
                        Text("Permanently removes your records")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "person.crop.circle.badge.minus")
                }
            }
        } header: {
            Text("Your data")
        }
    }

    private var helpSection: some View {
        Section("Help & legal") {
            Link(destination: URL(string: "mailto:support@pattadar.com")!) {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Help & support")
                        Text("support@pattadar.com")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "questionmark.circle")
                }
            }
            Link(destination: URL(string: "https://pattadar.com/privacy")!) {
                HStack {
                    Label("Privacy policy", systemImage: "lock.shield")
                    Spacer()
                    Image(systemName: "arrow.up.forward.square")
                        .font(.caption).foregroundStyle(.tertiary)
                }
            }
            Fact(label: "Version", value: Self.versionLabel)
        }
    }

    // MARK: - Preferences

    private var unitsBinding: Binding<UnitsPreference> {
        Binding(get: { UnitsPreference.current }, set: { $0.save() })
    }

    private var languageBinding: Binding<String> {
        Binding(get: { UserDefaults.standard.string(forKey: "pattadar.pref.language") ?? "en" },
                set: { UserDefaults.standard.set($0, forKey: "pattadar.pref.language") })
    }

    private var appearanceBinding: Binding<AppearanceChoice> {
        Binding(get: { AppearanceChoice.current }, set: { $0.save() })
    }

    // MARK: - Actions

    /// Face ID first, every time; the clipboard forgets in a minute. Both
    /// promises are printed under the section, so both must be true.
    private func copyIdentity() {
        let context = LAContext()
        var authError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
            copyToPasteboard()  // No lock on the device: nothing to re-ask.
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication,
                               localizedReason: "Copy your identity details") { ok, _ in
            guard ok else { return }
            Task { @MainActor in copyToPasteboard() }
        }
    }

    private func copyToPasteboard() {
        let text = "\(SampleData.identity.aadhaarMasked) · \(SampleData.identity.dateOfBirth) · \(SampleData.identity.address)"
        UIPasteboard.general.setItems(
            [[UTType.utf8PlainText.identifier: text]],
            options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(60)])
        justCopied = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            justCopied = false
        }
    }

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    private static var versionLabel: String {
        let short = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "Pattadar \(short) (build \(build))"
    }

    private static var utcOffsetLabel: String {
        let seconds = TimeZone.current.secondsFromGMT()
        let hours = seconds / 3600
        let minutes = abs(seconds / 60) % 60
        let sign = hours >= 0 ? "+" : "−"
        return minutes == 0 ? "UTC\(sign)\(abs(hours))"
                            : "UTC\(sign)\(abs(hours)):\(String(format: "%02d", minutes))"
    }

    private func load() async {
        if let d = await app.load(Queries.dashboard, as: DashboardResponse.self) {
            name = d.me?.name ?? ""
            email = d.me?.email ?? ""
        }
    }
}

// MARK: - Appearance preference

/// Match device / light / dark, applied at the root so every screen follows.
enum AppearanceChoice: String, CaseIterable {
    case system, light, dark

    static let key = "pattadar.pref.appearance"

    static var current: AppearanceChoice {
        AppearanceChoice(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .system
    }

    func save() { UserDefaults.standard.set(rawValue, forKey: AppearanceChoice.key) }

    var label: String {
        switch self {
        case .system: "Match device"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

/// How land is spoken of. Stored now, adopted screen by screen — the record
/// values themselves never convert (a passbook says what it says).
enum UnitsPreference: String, CaseIterable {
    case acresCents = "Acres + Cents"
    case acresGuntas = "Acres + Guntas"
    case hectares = "Hectares"

    static let key = "pattadar.pref.units"

    static var current: UnitsPreference {
        UnitsPreference(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .acresCents
    }

    func save() { UserDefaults.standard.set(rawValue, forKey: UnitsPreference.key) }
}

/// The Assistant's door, before the Assistant. A row that leads to an honest
/// sentence beats a row that leads nowhere.
struct AssistantTeaserScreen: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.sm) {
                    Image(systemName: "sparkles")
                        .font(.title2).foregroundStyle(Color.accentColor)
                    Text("Ask about your land")
                        .font(.recordTitle)
                    Text("Duty on a sale, what an EC actually proves, which paper a buyer will ask for next — the Assistant reads your own records and answers in plain words. It is being built now.")
                        .font(.bodyCopy).foregroundStyle(.secondary)
                }
                .padding(.vertical, Space.sm)
            }
            Section {
                Link(destination: URL(string: "mailto:support@pattadar.com")!) {
                    Label("Until then, ask a person", systemImage: "envelope")
                }
            } footer: {
                Text("support@pattadar.com answers within a day.")
            }
        }
        .navigationTitle("Pattadar Assistant")
        .navigationBarTitleDisplayMode(.inline)
    }
}
