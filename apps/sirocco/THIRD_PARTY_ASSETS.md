# Third-party assets

## Quaternius humanoid

SIROCCO uses the rigged `human.glb` source distributed by UMRAM-Bilkent's `supine-human-model` repository:

- Source repository: `https://github.com/UMRAM-Bilkent/supine-human-model`
- Upstream file: `assets/human.glb`
- Upstream size pinned by the build fetcher: `698560` bytes
- Original creator/source: Quaternius
- License: CC0 1.0 / public domain

The upstream repository explicitly identifies `assets/human.glb` as the original CC0 Quaternius source, rigged and skinned with eight walk/idle animations. SIROCCO downloads the pinned-size asset during the Enhanced build and bundles it into the app's own PWA output; runtime play does not depend on a third-party network request.

SIROCCO adds its own Bedouin-style garments, first-person placement, terrain adaptation, animation blending, sand-contact logic, lighting and mobile runtime around the source character.
