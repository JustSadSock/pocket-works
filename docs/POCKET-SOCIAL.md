# Pocket Social — stage C

Pocket Social adds optional identity cards and social play to the existing PocketWorks launcher. Guests and offline games still run independently.

## Included

- Personal profile card with a drawn WebP avatar (160 × 160 source), 6 preset backgrounds, 4 frames, and a favorite game selected from the launcher registry.
- Public player cards, prefix nickname search and exact account UUID lookup. Account nicknames and preset fallbacks still originate in Pocket ID.
- Bidirectional friends, pending incoming/outgoing requests, mutual-request acceptance, removal, block/unblock, public discoverability and online-visibility switches.
- Account-aware presence with a 95-second expiry. Online state and the current game are descriptive; only PocketNet is authoritative about active room membership.
- Private in-app room invitations for Zamazka and Blind Pals, delivered to authenticated friends. The server validates sender membership and room phase before dispatch, and validates room availability again before accepting. Invitations expire in 30 minutes.
- A shared, mobile-friendly social overlay for the launcher and Zamazka; notifications and player cards refresh silently every 2 seconds while the dialog is open (only changes trigger a redraw); background notification polling remains at approximately 22 seconds.

## Architecture

Worker routing:
- /pocket-id/* → the existing PocketIdentity Durable Object
- /pocket-cloud/* → the existing account-isolated PocketCloud Durable Object
- /pocketnet/* → the existing PocketNetHub Durable Object
- /pocket-social/* → PocketSocial (a new, globally indexed SQLite Durable Object)

The Worker always removes client-provided x-pw-* headers. It authenticates the Pocket ID cookie and only then injects account attributes. Search candidates and target card names are read from Pocket ID, not treated as client statements. Room invitations are validated by internal-only PocketNet operations.

Storage:
- Profiles are public metadata only. They do not grant access to Pocket Cloud files.
- Relationship state uses one canonical row per unordered pair of account IDs. Blocks are directional and sever friendships and pending invitations.
- Presence uses timestamps; no dedicated always-on background socket is required.
- Invitations use immutable room IDs and retention cleanup. Offline users can receive invitations when they next reconnect.

Avatar drawings are restricted to a small raster data URL. Never accept SVG or freeform HTML in profile content.

## Using it

In the PocketWorks launcher, click the existing Pocket ID portrait. The unified profile contains Profile, Friends and Invitations tabs. In Profile, edit nickname, draw the canonical avatar, choose background/frame, favorite game and privacy preferences. Security/Google/recovery actions live behind Account and Security inside the profile. There is no separate Social button, avatar picker, or duplicate appearance editor. Standalone apps may expose their own entry while preserving their unrelated in-game art controls.

In Zamazka and Blind Pals, sign in with Pocket ID, create a multiplayer room and press **Позвать друзей Pocket ID**. The receiving friend finds the invitation in the social overlay and can join with one press. A game that has already started cannot be joined through an invitation.

## Test & release

- Node 22+: node scripts/test-pocket-social.mjs
- node --check pocket-social/hub.mjs
- node --check shared/pocket-social.js
- node --check pocketnet/hub.mjs
- npm run validate:all
- npm run deploy:site

No achievements, global statistics, public art uploads, profile mottos, group chat or free-position room editors are part of stage C.

## Unified account surface (PocketWorks 0.10.11)

Pocket ID remains the authoritative account UUID, nickname, recovery and Google sign-in service. Pocket Social owns public card art, visual presets, favorite game, visibility and friend/invite metadata. Their UI is **one** profile editor. The client saves a changed nickname to Pocket ID and appearance to Pocket Social, with retryable partial-failure feedback. It never attempts to duplicate or synchronize two different avatar choices.

Supported games render the small user-painted raster portrait from Pocket Social (with a preset fallback). Verified PocketNet badges hydrate a remote player portrait by confirmed `accountId`; they do not trust user-provided image URLs or client-provided verified flags. Old preset avatars are preserved as fallback assets and for backwards compatibility with rooms and LAN peers.

## Live social refresh / cards

- While the modal is open, a compact `/pocket-social/sync` revision is polled every 2 seconds. Changed social metadata triggers a full refresh, including an open friend's profile. The 22-second background notification check remains in place.
- Offline periods retain the last known cards and show a small warning. Searching removes stale results immediately, shows progress/errors, and ignores superseded responses.
- Pending new friend requests and invitations receive a badge per browser session. Friends are sorted online-first on entry, and remain in the same order during a visit to avoid mid-tap jumps.
- Friend cards can be opened from any free area and are keyboard accessible. Returning from a friend's profile restores the originating tab and scroll position. Invitations show game titles and expiry times.
- The game catalog is fetched without stale cache and checked periodically while the menu is open.
