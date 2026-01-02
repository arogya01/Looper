# Looper

A Chrome extension that adds a floating speed control button to videos on any website.

## Features

- Floating button for each video element (top-right corner)
- Speed range: 1.0x to 3.0x in 0.25x increments
- Persists speed preference per website
- Keyboard shortcuts: `[` / `+` (increase), `]` / `-` (decrease), `0` (reset)
- Works on all websites including Instagram Reels, YouTube, etc.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select this folder
4. The extension will be active on all websites

## Usage

### Floating Button
- Click `<` to decrease speed
- Click `>` to increase speed
- Click the center speed value to reset to 1.0x

### Keyboard Shortcuts
- `[` or `+`: Increase video speed
- `]` or `-`: Decrease video speed
- `0`: Reset to 1.0x

The button appears only when videos are detected on the page and automatically follows video elements. Speed preferences are saved per website.