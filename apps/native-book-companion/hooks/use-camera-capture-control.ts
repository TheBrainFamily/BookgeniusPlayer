import { useEffect, useRef } from "react";
import { NativeEventEmitter, NativeModules, Platform, findNodeHandle } from "react-native";

const { CameraCaptureControl } = NativeModules;

type CaptureEvent = { viewTag?: number };

export function useCameraCaptureControl(options: {
  cameraRef: React.RefObject<any>;
  enabled: boolean;
  onCapture: () => void;
}) {
  const { cameraRef, enabled, onCapture } = options;
  const onCaptureRef = useRef(onCapture);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  useEffect(() => {
    if (Platform.OS !== "ios") return undefined;
    if (!CameraCaptureControl) return undefined;
    if (!cameraRef.current) return undefined;

    const viewTag = findNodeHandle(cameraRef.current);
    if (!viewTag) return undefined;

    CameraCaptureControl.attach?.(viewTag);
    CameraCaptureControl.setEnabled?.(viewTag, enabled);

    const emitter = new NativeEventEmitter(CameraCaptureControl);
    const subscription = emitter.addListener("cameraCapture", (event: CaptureEvent) => {
      if (!enabled) return;
      if (event?.viewTag && event.viewTag !== viewTag) return;
      onCaptureRef.current?.();
    });

    return () => {
      subscription.remove();
      CameraCaptureControl.detach?.(viewTag);
    };
  }, [cameraRef, enabled]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (!CameraCaptureControl) return;
    if (!cameraRef.current) return;
    const viewTag = findNodeHandle(cameraRef.current);
    if (!viewTag) return;
    CameraCaptureControl.setEnabled?.(viewTag, enabled);
  }, [cameraRef, enabled]);
}
