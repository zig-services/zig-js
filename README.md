# zig-js



## Build and release

You can build the library using `npm` run shortcuts.

 * `npm run release` Will build a new *stable* release. This will be automatically
 used by all game frontends that include the library.
 
 * `npm run beta` Will release a beta build and push that as `dev` version to npm.
 While you are on a beta release, you can upload new versions without doing a real release.
 
 * `npm run upload` Uploads a new version into the dev channel, but only if you are currently
 on a beta release.
