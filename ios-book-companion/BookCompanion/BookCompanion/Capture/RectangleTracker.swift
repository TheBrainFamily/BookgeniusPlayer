//
//  RectangleTracker.swift
//  BookCompanion
//
//  Tracks rectangle stability over time to determine when to capture.
//  Uses a ring buffer of recent observations to detect "locked" state.
//

import Foundation
import Combine

/// Tracks the stability of detected rectangles over time.
/// A rectangle is "stable" when corners haven't moved significantly for N frames.
@MainActor
final class RectangleTracker: ObservableObject {

    // MARK: - Published State

    /// Whether we have a stable rectangle lock
    @Published private(set) var isStable: Bool = false

    /// The currently locked rectangle (if stable)
    @Published private(set) var lockedRectangle: DetectedRectangle?

    /// How long the current lock has been held (for UI feedback)
    @Published private(set) var lockDuration: TimeInterval = 0

    // MARK: - Configuration

    /// Maximum corner movement (normalized) to consider stable
    /// 8% of screen = 0.08 (relaxed for Vision frame-to-frame variance)
    private let stabilityThreshold: CGFloat = 0.08

    /// Number of consecutive stable frames required
    private let requiredStableFrames: Int = 8 // ~200ms at 15fps analysis rate

    /// Cooldown after page flip before accepting new captures
    private let cooldownDuration: TimeInterval = 0.3

    // MARK: - Internal State

    private var recentRectangles: [DetectedRectangle] = []
    private var stableFrameCount: Int = 0
    private var lockStartTime: Date?
    private var lastBigMovementTime: Date?
    private var isInCooldown: Bool = false

    // MARK: - Subscriptions

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {}

    /// Subscribe to rectangle detector updates
    func subscribe(to detector: RectangleDetector) {
        detector.$detectedRectangles
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rectangles in
                self?.processRectangles(rectangles)
            }
            .store(in: &cancellables)

        print("[RectangleTracker] Subscribed to detector")
    }

    /// Force unlock (e.g., when user initiates capture)
    func unlock() {
        isStable = false
        lockedRectangle = nil
        lockDuration = 0
        stableFrameCount = 0
        lockStartTime = nil
    }

    /// Enter cooldown mode (e.g., after capture or detected page flip)
    func enterCooldown() {
        isInCooldown = true
        lastBigMovementTime = Date()
        unlock()

        // Exit cooldown after duration
        DispatchQueue.main.asyncAfter(deadline: .now() + cooldownDuration) { [weak self] in
            self?.isInCooldown = false
        }
    }

    // MARK: - Processing

    private var processCount = 0

    private func processRectangles(_ rectangles: [DetectedRectangle]) {
        processCount += 1

        // Debug: log every 30 calls (~2 seconds)
        if processCount % 30 == 0 {
            print("[RectangleTracker] Processing \(rectangles.count) rects, buffer: \(recentRectangles.count), stableFrames: \(stableFrameCount), isStable: \(isStable)")
        }

        // Skip processing during cooldown
        guard !isInCooldown else { return }

        // No rectangles detected
        guard let primary = rectangles.first else {
            resetTracking()
            return
        }

        // Check for large movement (page flip detection)
        if let lastRect = recentRectangles.last {
            let areaChange = abs(primary.area - lastRect.area)
            let centerMovement = sqrt(
                pow(primary.center.x - lastRect.center.x, 2) +
                pow(primary.center.y - lastRect.center.y, 2)
            )

            // Big area change or center jump = page flip
            if areaChange > 0.1 || centerMovement > 0.15 {
                print("[RectangleTracker] Page flip detected! area: \(areaChange), center: \(centerMovement)")
                enterCooldown()
                return
            }
        }

        // Add to ring buffer
        recentRectangles.append(primary)
        if recentRectangles.count > requiredStableFrames {
            recentRectangles.removeFirst()
        }

        // Check stability
        let stable = checkStability()

        if stable {
            stableFrameCount += 1

            if stableFrameCount >= requiredStableFrames && !isStable {
                // Just achieved lock
                print("[RectangleTracker] LOCK ACHIEVED! stableFrameCount: \(stableFrameCount)")
                isStable = true
                lockedRectangle = primary
                lockStartTime = Date()
            }

            // Update lock duration
            if isStable, let startTime = lockStartTime {
                lockDuration = Date().timeIntervalSince(startTime)
            }
        } else {
            // Lost stability
            if stableFrameCount > 0 {
                stableFrameCount -= 2 // Decay faster than we build up
                stableFrameCount = max(0, stableFrameCount)
            }

            if stableFrameCount == 0 {
                isStable = false
                lockedRectangle = nil
                lockDuration = 0
                lockStartTime = nil
            }
        }
    }

    private func checkStability() -> Bool {
        guard recentRectangles.count >= 3 else {
            return false
        }

        // Compare recent rectangles - all should be close to each other
        guard let reference = recentRectangles.last else { return false }

        // Check last several frames
        let checkCount = min(recentRectangles.count, 6)
        let recentSlice = recentRectangles.suffix(checkCount)

        var maxDistance: CGFloat = 0
        for rect in recentSlice {
            let d1 = hypot(rect.topLeft.x - reference.topLeft.x, rect.topLeft.y - reference.topLeft.y)
            let d2 = hypot(rect.topRight.x - reference.topRight.x, rect.topRight.y - reference.topRight.y)
            let d3 = hypot(rect.bottomLeft.x - reference.bottomLeft.x, rect.bottomLeft.y - reference.bottomLeft.y)
            let d4 = hypot(rect.bottomRight.x - reference.bottomRight.x, rect.bottomRight.y - reference.bottomRight.y)
            maxDistance = max(maxDistance, d1, d2, d3, d4)
        }

        // Debug: log max movement every 30 checks
        if processCount % 30 == 0 {
            print("[RectangleTracker] Stability check: maxDistance=\(String(format: "%.4f", maxDistance)), threshold=\(stabilityThreshold), pass=\(maxDistance < stabilityThreshold)")
        }

        return maxDistance < stabilityThreshold
    }

    private func resetTracking() {
        stableFrameCount = 0
        isStable = false
        lockedRectangle = nil
        lockDuration = 0
        lockStartTime = nil
        recentRectangles.removeAll()
    }
}
