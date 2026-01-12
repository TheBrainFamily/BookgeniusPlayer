/**
 * BookGenius Player - Public API
 *
 * This is the main entry point for the player library.
 * Consumers should import from this file:
 *
 *   import { LiveModeAppCore, PlayerDOMProvider } from '@bookgenius/player';
 *   import '@bookgenius/player/styles.css';
 *
 * The player is designed to be embedded in a host application.
 * It renders into a portal target (#root-player inside #player-scope)
 * to ensure complete isolation from the host app's DOM.
 */

// Import styles so they get bundled into dist-lib/styles.css
import "./styles.css";

// =============================================================================
// Core Components
// =============================================================================

/**
 * Main player component - use this when your app provides ConvexProvider.
 * Renders the full player experience without its own Convex context.
 */
export { LiveModeAppCore } from "../LiveModeApp";

/**
 * Standalone player with built-in ConvexProvider.
 * Use this for independent deployments or when no parent Convex context exists.
 */
export { LiveModeApp } from "../LiveModeApp";

// =============================================================================
// DOM Infrastructure
// =============================================================================

/**
 * Creates the player's DOM structure inside #player-scope.
 * Must wrap the player components. Creates:
 * - #legacy (main container)
 * - #content-container (text content)
 * - #root-player (React portal target)
 * - Background video elements
 */
export { PlayerDOMProvider } from "../context/PlayerDOMContext";

/**
 * Provides native shell detection for hybrid apps.
 * Wrap your player with this to enable native bridge communication.
 */
export { NativeShellProvider, useNativeShell } from "../context/NativeShellContext";

// =============================================================================
// State Management
// =============================================================================

/**
 * Set book identifier synchronously before React render.
 * Call this before mounting player components.
 */
export { setBookIdentifier, getBookSlug, getBookPath } from "../state/bookDataStore";

// =============================================================================
// CSS Import
// =============================================================================

/**
 * Import player styles. This should be imported once in your app:
 *
 *   import '@bookgenius/player/styles.css';
 *
 * The CSS file includes:
 * - Tailwind utility classes used by player components
 * - Custom CSS variables for theming
 * - Animation keyframes
 * - Component-specific styles
 */
// CSS is bundled separately and imported by consumers via:
// import '@bookgenius/player/styles.css';
