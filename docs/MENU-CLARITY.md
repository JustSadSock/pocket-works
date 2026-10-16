# Shell menus 0.13

Pocket Social keeps player appearance, profile data, and privacy/sign-in in separate
destinations inside the same social window. Identity controls are mounted from the
existing Pocket ID surface: API paths, credential handling and server permissions
do not change. Standalone identity remains available in apps without Social.

Friends and invitations use compact identity rows; full cards remain in profiles.
Destructive friendship actions live under More and still require confirmation.
Profile drafts survive social tab navigation. Closing a changed editor offers
Save / Discard / Cancel, including Escape and backdrop paths. Switching accounts
must discard the previous account's draft. Unsaved paint is captured into the
profile draft before navigation.

Settings groups actual display controls, local collection backups, updates and
support. Backups explicitly exclude game saves. Shared confirmation dialogs keep
dangerous operations separate and cancel on Escape. Global catalogue authority is
still enforced on the server; the administrator scope stays explicit.

Home layout sizes have three visible choices with a miniature of actual app art.
Changes stay local to the editor until Save. Close, Escape and backdrop all use
the same unsaved-change guard. Touch targets are at least 44 CSS pixels.
