# SINEW

SINEW is a landscape-first Babylon.js duel inside Pocket Works. It is built around one interaction rule: **the camera does not play attacks; it moves the body target**.

The left thumb controls analog locomotion. The right thumb controls view direction and therefore head, spine, shoulders, hands, sword and shield. The actual rig follows those targets through spring/inertia dynamics, so a fast camera sweep creates weapon momentum while a slow camera movement allows precise guard placement.

## Combat model

- procedural articulated humanoid rig for player and AI;
- visible first-person chest, arms and legs;
- analog acceleration/deceleration and procedural gait;
- independent spring states for both hands, sword direction and shield normal;
- anatomical reach limits and two-bone IK for elbows/knees;
- swept multi-sample sword traces between frames;
- geometric shield-plane interception rather than `isBlocking`;
- sword-vs-sword segment collision with recoil impulses;
- velocity/tip-position/body-part based damage;
- procedural hit/block/clash reactions and stabilized camera kick;
- AI attacks expressed as pose targets through the same rig, with visible windup/strike/recovery and occasional feints.

## Mobile/runtime integration

SINEW is an Enhanced Pocket Works app. It consumes the shared mobile runtime, Workshop Mode and enhanced update manager, but changes no platform files. It owns its PWA manifest, service worker cache namespace, storage namespace and icon.

Primary target: modern iPhone Safari / installed PWA in landscape. Rendering uses adaptive Babylon hardware scaling and shadow quality. Expensive simulation stops when the page is hidden.

## Controls

- **Left half:** floating analog joystick; small deflection walks, full deflection runs.
- **Right half:** direct look/body drag. Slow motion positions the guard; fast motion creates weapon inertia.
- **Pause:** the only persistent gameplay button. Attack, block, parry, dodge and sprint have no buttons.
