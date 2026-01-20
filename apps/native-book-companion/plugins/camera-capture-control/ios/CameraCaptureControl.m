#import "CameraCaptureControl.h"
#import <AVKit/AVKit.h>
#import <React/RCTUIManager.h>

@interface CameraCaptureControl ()
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, AVCaptureEventInteraction *> *interactions;
@end

@implementation CameraCaptureControl

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if ((self = [super init])) {
    _interactions = [NSMutableDictionary new];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @["cameraCapture"];
}

RCT_EXPORT_METHOD(attach:(nonnull NSNumber *)viewTag)
{
  if (@available(iOS 17.2, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (self.interactions[viewTag] != nil) {
        return;
      }

      UIView *view = [self.bridge.uiManager viewForReactTag:viewTag];
      if (!view) {
        return;
      }

      __weak typeof(self) weakSelf = self;
      AVCaptureEventInteraction *interaction = [[AVCaptureEventInteraction alloc] initWithHandler:^(AVCaptureEvent *event) {
        if (event.phase == AVCaptureEventPhaseEnded) {
          [weakSelf sendEventWithName:@"cameraCapture" body:@{ @"viewTag": viewTag }];
        }
      }];

      [view addInteraction:interaction];
      self.interactions[viewTag] = interaction;
    });
  }
}

RCT_EXPORT_METHOD(detach:(nonnull NSNumber *)viewTag)
{
  if (@available(iOS 17.2, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      AVCaptureEventInteraction *interaction = self.interactions[viewTag];
      if (!interaction) {
        return;
      }

      UIView *view = [self.bridge.uiManager viewForReactTag:viewTag];
      if (view) {
        [view removeInteraction:interaction];
      }

      [self.interactions removeObjectForKey:viewTag];
    });
  }
}

RCT_EXPORT_METHOD(setEnabled:(nonnull NSNumber *)viewTag enabled:(BOOL)enabled)
{
  if (@available(iOS 17.2, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      AVCaptureEventInteraction *interaction = self.interactions[viewTag];
      if (!interaction) {
        return;
      }
      interaction.enabled = enabled;
    });
  }
}

@end
