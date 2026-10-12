# Pocket Social — stage C

Pocket Social adds optional identity cards and social play to the existing PocketWorks launcher. Guests and offline games still run independently.

## Included

- Personal profile card with a drawn WebP avatar (160 × 160 source), 6 preset backgrounds, 4 frames, and a favorite game selected from the launcher registry.
- Public player cards, prefix nickname search and exact account UUID lookup. Account nicknames and preset fallbacks still originate in Pocket ID.
- Bidirectional friends, pending incoming/outgoing requests, mutual-request acceptance, removal, block/unblock, public discoverability and online-visibility switches.
- Account-aware presence with a 95-second expiry. Online state and the current game are descriptive; only PocketNet is authoritative about active room membership.
- Private in-app room invitations for Zamazka, delivered to authenticated friends. The server validates sender membership and room phase before dispatch, and validates room availability again before accepting. Invitations expire in 30 minutes.
- A shared, mobile-friendly social overlay for the launcher and Zamazka; badge notification refreshes approximately every 22 seconds while visible.

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

In the PocketWorks launcher, select the Friends icon next to Pocket ID. Open Profile to choose a background/frame, draw an avatar and select a favorite game. Open Friends to search by nickname or UUID, view profiles and send requests.

In Zamazka, sign in with Pocket ID, create a multiplayer room and press **Позвать друзей Pocket ID**. The receiving friend finds the invitation in the social overlay and can join with one press. A game that has already started cannot be joined through an invitation.

## Test & release

- Node 22+: node scripts/test-pocket-social.mjs
- node --check pocket-social/hub.mjs
- node --check shared/pocket-social.js
- node --check pocketnet/hub.mjs
- npm run validate:all
- npm run deploy:site

No achievements, global statistics, public art uploads, profile mottos, group chat or free-position room editors are part of stage C.
