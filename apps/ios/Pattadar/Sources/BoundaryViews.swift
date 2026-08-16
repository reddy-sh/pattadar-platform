import MapKit
import PattadarKit
import SwiftUI

// The boundary lives on the Maps screen now — the Sketch tab draws it, edits
// it and holds it against the recorded extent. The detail screens show the
// polygon on their map preview and nothing more; a second sketch there was
// the same drawing twice on one screen.

/// The outline itself: polygon, side lengths, north arrow. North is up —
/// that is not decoration, it is the convention every FMB reader expects.
struct BoundarySketch: View {
    let corners: [LatLng]

    var body: some View {
        Canvas { context, size in
            let pts = projectToMetres(corners)
            guard pts.count >= 3 else { return }

            // Fit the metres into the canvas, preserving aspect, north up.
            let xs = pts.map(\.x), ys = pts.map(\.y)
            let minX = xs.min()!, maxX = xs.max()!
            let minY = ys.min()!, maxY = ys.max()!
            let inset: CGFloat = 34
            let w = max(maxX - minX, 1), h = max(maxY - minY, 1)
            let scale = min((size.width - inset * 2) / w, (size.height - inset * 2) / h)
            func place(_ p: (x: Double, y: Double)) -> CGPoint {
                CGPoint(x: (size.width - w * scale) / 2 + (p.x - minX) * scale,
                        // Flipped: canvas y grows downward, north must be up.
                        y: (size.height + h * scale) / 2 - (p.y - minY) * scale)
            }

            var path = Path()
            path.move(to: place(pts[0]))
            for p in pts.dropFirst() { path.addLine(to: place(p)) }
            path.closeSubpath()

            context.fill(path, with: .color(Palette.success.opacity(0.14)))
            context.stroke(path, with: .color(Palette.success.opacity(0.85)),
                           style: StrokeStyle(lineWidth: 2, lineJoin: .round))

            // Corner dots, so a mis-typed corner is findable by eye.
            for p in pts {
                let dot = place(p)
                context.fill(Path(ellipseIn: CGRect(x: dot.x - 3, y: dot.y - 3, width: 6, height: 6)),
                             with: .color(Palette.success))
            }

            // Each side's length at its midpoint — the numbers written along
            // the edges of the sheet, recomputed.
            let lengths = boundarySideMetres(corners)
            for i in 0..<pts.count {
                let a = place(pts[i]), b = place(pts[(i + 1) % pts.count])
                let mid = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
                // Push the label outward from the shape's centre so it sits
                // beside its side rather than on it.
                let centre = CGPoint(x: size.width / 2, y: size.height / 2)
                let dx = mid.x - centre.x, dy = mid.y - centre.y
                let norm = max(sqrt(dx * dx + dy * dy), 1)
                let out = CGPoint(x: mid.x + dx / norm * 14, y: mid.y + dy / norm * 14)
                context.draw(
                    Text(sideLengthText(lengths[i]))
                        .font(.scaled(10, weight: .medium, design: .monospaced))
                        .foregroundStyle(.secondary),
                    at: out)
            }

            // North arrow, top-right.
            let n = CGPoint(x: size.width - 16, y: 24)
            var arrow = Path()
            arrow.move(to: CGPoint(x: n.x, y: n.y + 12))
            arrow.addLine(to: CGPoint(x: n.x, y: n.y - 4))
            context.stroke(arrow, with: .color(.secondary), lineWidth: 1.5)
            var head = Path()
            head.move(to: CGPoint(x: n.x - 4, y: n.y + 1))
            head.addLine(to: CGPoint(x: n.x, y: n.y - 6))
            head.addLine(to: CGPoint(x: n.x + 4, y: n.y + 1))
            context.stroke(head, with: .color(.secondary), lineWidth: 1.5)
            context.draw(Text("N").font(.scaled(10, weight: .semibold)).foregroundStyle(.secondary),
                         at: CGPoint(x: n.x, y: n.y + 20))
        }
        .background(RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground)))
    }
}

/// Paste the point table, see what it draws, save it.
struct BoundaryEditorSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let entityType: String
    let entityId: String
    let initial: String
    let onSaved: (String) -> Void

    @State private var text = ""
    @State private var saving = false
    @State private var problem = ""

    /// Newlines and semicolons both separate corners: a column pasted from a
    /// PDF arrives as lines, the wire format uses semicolons.
    private var corners: [LatLng] {
        parseBoundary(text.replacingOccurrences(of: "\n", with: ";"))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .font(.system(.footnote, design: .monospaced))
                        .frame(minHeight: 150)
                        .keyboardType(.numbersAndPunctuation)
                        .autocorrectionDisabled()
                } header: {
                    Text("Corners, in order")
                } footer: {
                    Text("One corner per line as latitude, longitude — the last two columns of the FMB point table, in the order the boundary is walked. Example:\n15.66026, 79.31919\n15.66072, 79.31944")
                }

                if !corners.isEmpty {
                    Section("What this draws") {
                        BoundarySketch(corners: corners)
                            .frame(height: 200)
                            .listRowInsets(EdgeInsets(top: Space.sm, leading: Space.md, bottom: Space.sm, trailing: Space.md))
                        HStack {
                            Text("\(corners.count) corners")
                            Spacer()
                            Text(String(format: "%.2f acres", boundaryAcres(corners)))
                                .monospacedDigit().foregroundStyle(.secondary)
                        }
                        .font(.subheadline)
                    }
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                }

                Section {
                    PrimaryButton(title: "Save boundary", busy: saving,
                                  disabled: corners.isEmpty) {
                        Task { await save(boundaryText(corners)) }
                    }
                    if !initial.isEmpty {
                        Button("Remove boundary", role: .destructive) {
                            Task { await save("") }
                        }
                    }
                }
            }
            .navigationTitle("Boundary corners")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                if text.isEmpty, !initial.isEmpty {
                    text = initial.replacingOccurrences(of: ";", with: "\n")
                }
            }
        }
    }

    private func save(_ value: String) async {
        saving = true
        problem = ""
        defer { saving = false }
        let document = entityType == "parcel" ? Queries.updateParcelBoundary
                                              : Queries.updatePropertyBoundary
        guard await app.load(document, variables: ["id": entityId, "boundary": value],
                             as: AnyMutationResult.self) != nil else {
            problem = app.lastFailure ?? "Could not save the boundary."
            return
        }
        onSaved(value)
        dismiss()
    }
}
