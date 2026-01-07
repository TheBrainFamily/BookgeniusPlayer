# Player Native - Implementation Status

## Working

- [x] WebView loads web player with `nativeShell=true`
- [x] Background video transitions (native BackgroundLayer with A/B crossfade)
- [x] Music playback (native expo-av)
- [x] postMessage communication: BACKGROUND_UPDATE, MUSIC_UPDATE, CHARACTER_STATE_UPDATE
- [x] Web player detects native shell mode and skips background/music rendering

## Known Issues

### Critical

- [ ] **BottomInput immediately unfocuses** - TextInput gets focus then loses it instantly (tried blurWebView on focus, needs testing)
- [ ] **Music transitions are abrupt** - Web player has smooth crossfade, native just stops/starts (fade code exists but may not be working)

### Music Player

- [ ] No music playlist UI / now playing indicator
- [ ] Volume control not connected
- [ ] No popup modal for new song info
- [ ] Crossfade between tracks (web has smooth transitions)

### Background

- [ ] Video loading can be slow on first load
- [ ] No preloading of upcoming backgrounds

### WebView

- [ ] Excessive "WebView loaded" log spam (handleLoadEnd called repeatedly)
- [ ] "Script error" warnings (cross-origin errors, harmless but noisy)

### UI/UX

- [ ] No menu/navigation
- [ ] No audiobook controls
- [ ] Search is not connected to web player
- [ ] Ask/Research streaming not implemented
- [ ] Character sidebar for play format not implemented

### Performance

- [ ] Character state updates are very frequent (every paragraph change)
- [ ] Consider debouncing character state updates

## Architecture Notes

### Communication Flow

```
Web Player (localhost:5173)
  └── NativeShellBridge.tsx
        ├── BACKGROUND_UPDATE → BackgroundLayer.tsx (native video)
        ├── MUSIC_UPDATE → NativeMusicPlayer.tsx (expo-av)
        ├── CHARACTER_STATE_UPDATE → (not used yet)
        └── MODAL_OPEN/CLOSE → (for hiding native BottomInput)
```

### Key Files

- `apps/player/src/context/NativeShellContext.tsx` - Web player native shell detection
- `apps/player/src/components/NativeShellBridge.tsx` - Sends state to native
- `apps/player-native/src/components/BookWebView.tsx` - Receives postMessage
- `apps/player-native/src/contexts/NativeShellContext.tsx` - Distributes state to native components
