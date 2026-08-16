import PattadarKit
import PhotosUI
import SwiftUI

/// You — identity, what you hold, how you are reachable, and the record of
/// everything done to your data.
///
/// A tab rather than a toolbar button because it is where personal information
/// lives, and personal information should be somewhere you can point at, not
/// behind a glyph in a corner.
struct YouScreen: View {
    @Environment(AppModel.self) private var app
    @State private var stats: DashboardStats?
    @State private var name = ""
    @State private var holdings: HoldingsResponse?
    @State private var groups: [FamilyGroup] = []
    @State private var avatar: UIImage?
    @State private var photoItem: PhotosPickerItem?
    @State private var showSignIn = false
    @State private var confirmSignOut = false
    @State private var editingProfile = false
    @State private var replayOnboarding = false
    @State private var showFamily = false

    var body: some View {
        NavigationStack {
            List {
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
                                    // Initials beat a grey silhouette: they
                                    // say whose account this is.
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
                            // The user id was here AND under Connection as
                            // "Signed in as". Once is enough, and it belongs
                            // with the other connection facts.
                            Button("Edit name and email") { editingProfile = true }
                                .font(.caption)
                            if avatar != nil {
                                Button("Remove photo") {
                                    Identity.removeAvatar()
                                    avatar = nil
                                    NotificationCenter.default.post(name: .avatarChanged, object: nil)
                                }
                                .font(.caption2)
                            }
                        }
                        Spacer()
                    }
                    .padding(.vertical, Space.xs)
                }

                // "What you hold" lived here — Land, Parcels, Plots, Passbooks,
                // Documents, Groups. Every one of those is on Home, one tab
                // away, in a different format. Two places showing the same
                // number is one place to be wrong, and neither gets trusted
                // once they disagree. Home owns the figures; this screen owns
                // you.

                if !groups.isEmpty {
                    Section("Your groups") {
                        ForEach(groups) { g in
                            NavigationLink { GroupDetailScreen(group: g) } label: {
                                HStack {
                                    Text(g.name)
                                    Spacer()
                                    Text("\(g.memberCount) member\(g.memberCount == 1 ? "" : "s")")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Succession") {
                    if let s = stats, s.totalBeneficiaries > 0 {
                        Fact(label: "Heirs recorded", value: "\(s.totalBeneficiaries)")
                        Fact(label: "Invitations pending", value: s.pendingInvitations > 0
                             ? "\(s.pendingInvitations)" : "")
                    } else {
                        // The single most consequential gap in the whole app,
                        // said plainly rather than left to be inferred.
                        Label("No heirs recorded. If nothing is set, your land has no stated succession.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.callout).foregroundStyle(Palette.danger)
                    }
                }

                Section {
                    NavigationLink { ActivityScreen() } label: {
                        Label("Activity log", systemImage: "clock.arrow.circlepath")
                    }
                    // Selects the tab instead of PUSHING DocumentsScreen.
                    //
                    // That screen owns a NavigationStack of its own, so pushing
                    // it inside this one nested two stacks: two navigation bars,
                    // and a back button that went to the wrong place. Documents
                    // already has a tab — this is a shortcut to it, not a second
                    // copy of it.
                    Button { app.selectedTab = .documents } label: {
                        HStack {
                            Label("Your documents", systemImage: "doc.text.fill")
                            Spacer()
                            Image(systemName: "arrow.up.right")
                                .font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                } footer: {
                    Text("Every change to your records — who made it and when — is recorded and cannot be edited.")
                }

                Section {
                    NavigationLink { GetItDoneScreen() } label: {
                        Label("Get it done", systemImage: "hammer.fill")
                    }
                    NavigationLink { SpendScreen() } label: {
                        Label("Spend", systemImage: "indianrupeesign.circle.fill")
                    }
                    NavigationLink { HoldersScreen(holdings: holdings) } label: {
                        Label("Who holds what", systemImage: "person.text.rectangle.fill")
                    }
                }

                Section {
                    // Family lives here now: these are the people in your
                    // records, which is what this screen is about.
                    Button { showFamily = true } label: {
                        HStack {
                            Label("Family and heirs", systemImage: "person.2.fill")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                }

                Section {
                    Button { replayOnboarding = true } label: {
                        Label("Show the introduction again", systemImage: "sparkles")
                    }
                }

                Section {
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
            .navigationTitle("You")
            .sheet(isPresented: $showSignIn) { SignInScreen().onDisappear { Task { await load() } } }
            .fullScreenCover(isPresented: $replayOnboarding) { OnboardingScreen() }
            .sheet(isPresented: $showFamily) { FamilyScreen() }
            .onAppear {
                if app.openFamily { app.openFamily = false; showFamily = true }
            }
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
                // Nothing is deleted: the records live on the server, and
                // saying so removes the fear that stops people signing out.
                Text("Your records stay on the server. Only this device forgets who you are.")
            }
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        Identity.saveAvatar(data)
                        avatar = UIImage(data: data)
                        NotificationCenter.default.post(name: .avatarChanged, object: nil)
                    }
                }
            }
            .refreshable { await load() }
            .task { avatar = Identity.avatar(); await load() }
        }
    }

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let letters = parts.compactMap { $0.first }.map(String.init).joined()
        return letters.isEmpty ? "?" : letters.uppercased()
    }

    private var propertyCount: Int { holdings?.properties.count ?? 0 }
    @State private var email = ""

    private func load() async {
        if let d = await app.load(Queries.dashboard, as: DashboardResponse.self) {
            stats = d.dashboardStats
            name = d.me?.name ?? ""
            email = d.me?.email ?? ""
        }
        holdings = await app.load(Queries.holdings, as: HoldingsResponse.self)
        if let g = await app.load(Queries.groups, as: GroupsResponse.self) { groups = g.groups }
    }
}
