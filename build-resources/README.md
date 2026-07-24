# build-resources

Build-time resources for electron-builder (`directories.buildResources` in
[`electron-builder.yml`](../electron-builder.yml)). These are used to *build* the
package; they are not bundled into the app at runtime.

This lives here rather than electron-builder's default `build/` because the repo's
`.gitignore` treats `build/` as an output directory.

## `sublime/` — app icon set

The application icon, filed under the default theme name **`sublime`**: the
**lemon-lime faceted-coal** mark on a black tile, as an electron-builder icon set
(`16x16.png` … `1024x1024.png`). A sized set is used (rather than a single unsized
PNG) because app-builder-lib expects each icon filename to carry its pixel size.

Source: the artist's icon export (`lime/electron/icons/`).
