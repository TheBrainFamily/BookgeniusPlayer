//
//  MotionTracker.swift
//  BookCompanion
//
//  Tracks device motion using CoreMotion to detect hand stability.
//  When the user is flipping pages, the phone moves more than when reading.
//

import CoreMotion
import Combine

/// Tracks device motion to detect when the phone is being held steady.
/// Provides an additional signal for the capture gate beyond rectangle stability.
@MainActor
final class MotionTracker: ObservableObject {

    // MARK: - Published State

    /// Whether the device is currently stable (low rotation rate)
    @Published private(set) var isStable: Bool = false

    /// Current rotation magnitude (for debugging/UI)
    @Published private(set) var rotationMagnitude: Double = 0

    /// Current acceleration magnitude (for debugging/UI)
    @Published private(set) var accelerationMagnitude: Double = 0

    // MARK: - Configuration

    /// Maximum rotation rate (rad/s) to consider stable
    /// Tuned for "held while reading" - some natural hand movement is OK
    private let rotationThreshold: Double = 0.08

    /// Maximum user acceleration to consider stable
    /// Filters out quick movements during page flips
    private let accelerationThreshold: Double = 0.15

    /// Update interval (seconds)
    private let updateInterval: TimeInterval = 1.0 / 30.0 // 30 Hz

    // MARK: - Core Motion

    private let motionManager = CMMotionManager()
    private var isRunning = false

    // MARK: - Smoothing

    /// Rolling average for smoother stability detection
    private var rotationHistory: [Double] = []
    private var accelerationHistory: [Double] = []
    private let historySize = 5

    // MARK: - Initialization

    init() {}

    deinit {
        // Stop motion updates directly (not through MainActor method)
        motionManager.stopDeviceMotionUpdates()
    }

    // MARK: - Public Methods

    /// Start tracking device motion
    func start() {
        guard !isRunning, motionManager.isDeviceMotionAvailable else {
            return
        }

        motionManager.deviceMotionUpdateInterval = updateInterval

        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, error in
            guard let self = self, let motion = motion, error == nil else {
                return
            }

            Task { @MainActor in
                self.processMotion(motion)
            }
        }

        isRunning = true
    }

    /// Stop tracking device motion
    func stop() {
        guard isRunning else { return }

        motionManager.stopDeviceMotionUpdates()
        isRunning = false

        rotationHistory.removeAll()
        accelerationHistory.removeAll()
    }

    // MARK: - Private Methods

    private func processMotion(_ motion: CMDeviceMotion) {
        // Calculate rotation magnitude (combined x, y, z)
        let rotationRate = motion.rotationRate
        let rotation = sqrt(
            rotationRate.x * rotationRate.x +
            rotationRate.y * rotationRate.y +
            rotationRate.z * rotationRate.z
        )

        // Calculate user acceleration magnitude (excludes gravity)
        let userAccel = motion.userAcceleration
        let acceleration = sqrt(
            userAccel.x * userAccel.x +
            userAccel.y * userAccel.y +
            userAccel.z * userAccel.z
        )

        // Add to rolling history
        rotationHistory.append(rotation)
        if rotationHistory.count > historySize {
            rotationHistory.removeFirst()
        }

        accelerationHistory.append(acceleration)
        if accelerationHistory.count > historySize {
            accelerationHistory.removeFirst()
        }

        // Calculate smoothed values
        let smoothedRotation = rotationHistory.reduce(0, +) / Double(rotationHistory.count)
        let smoothedAcceleration = accelerationHistory.reduce(0, +) / Double(accelerationHistory.count)

        // Update published values
        rotationMagnitude = smoothedRotation
        accelerationMagnitude = smoothedAcceleration

        // Determine stability
        // Both rotation AND acceleration must be below thresholds
        isStable = smoothedRotation < rotationThreshold &&
                   smoothedAcceleration < accelerationThreshold
    }
}
