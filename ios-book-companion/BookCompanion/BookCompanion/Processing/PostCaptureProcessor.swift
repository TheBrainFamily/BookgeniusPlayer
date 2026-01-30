//
//  PostCaptureProcessor.swift
//  BookCompanion
//
//  Post-capture image processing.
//  Currently a pass-through since preview now matches capture exactly.
//

import UIKit

final class PostCaptureProcessor {

    func process(_ image: UIImage) -> UIImage? {
        // No processing needed - preview matches capture with .resizeAspect
        image
    }
}
