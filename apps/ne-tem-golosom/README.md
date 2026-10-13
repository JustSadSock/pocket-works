# НЕ ТЕМ ГОЛОСОМ

Cooperative blind-dubbing studio in PocketWorks. Each player receives a role, records **selected** pieces of one common 30–90 second video with a three-second preroll, and hears only their own voice until the joint premiere.

- Quick PWA, responsive portrait/desktop editor, scene library and local video import.
- PocketNet is used for rooms, assignments, readiness and WebRTC signaling. Video and audio are transferred as binary data over peer-to-peer WebRTC channels, **not** stored in PocketNet (16 KB wire limit). WebRTC connectivity varies by NAT; no TURN relay is provisioned.
- Solo studio is fully usable offline with an imported file. Sample movies are licensed CC BY and stream from Wikimedia Commons/Blender when online, with attribution in the scene chooser. Keep original audio muted to avoid dialogue collisions.
- Audio stays private on the player's device until reveal. A local IndexedDB draft keeps the recorded fragments after reload. No server-side MP4 encoding; the premiere plays synchronized tracks in-browser.
- Self-contained app files live here. The immutable PocketNet module release and lock entry are infrastructure-required artifacts under pocketnet/.

Media licenses are not extended to user-uploaded footage; users must have rights to redistribute media they choose to share.
