# krbn pencil render

A web app for [Krbn](https://github.com/vpalos/Krbn), Valeriu Paloș's engine for pencil-style line drawings. The app is a single HTML file: load an STL or OBJ model, adjust lines, hatching and camera, and save the result as SVG or as a raster image. The SVG output can go straight to a pen plotter.

![Trefoil knot with cross-hatching in the app](screenshot.png)

## Usage

Open `index.html` in a browser, by double-click or as `file://`. No server is needed; the engine and the demo model are embedded in the file.

There are seven demo models: `mushroom.obj` from the Krbn repository and six shapes that Krbn generates itself. Load your own model with «load stl / obj» or by dropping the file onto the drawing area. Rendering runs in a web worker, so the interface stays responsive with large models.

Drag on the drawing to rotate the camera, use the mouse wheel to zoom, double-click to reset the camera. The panel exposes every setting of the engine:

- model: up axis, spin, decimation, crease angle, suggestive contours
- camera and light: projection, angles, zoom, image size
- lines and hatching: color, weight, wobble, hidden lines, hatch mode, angle, spacing
- output: background, plotter centerlines, paper sizes from A0 to Half Letter, raster export as PNG or WebP

With a paper size selected, the drawing is placed on the page with a 10 mm margin, and the stroke width is 0.3 mm per unit of line weight. The background is transparent by default; for a plotter, also switch on «plotter centerlines».

## Building

`app.html` is the template without the engine and only shows a notice when opened. The working `index.html` is built with:

```
./build.sh
```

On the first run the script clones Krbn into `Krbn/`, bundles `worker.ts` with esbuild and inserts the result into the template. The Krbn commit the build came from is written into a comment at the top of `index.html`. To update the engine:

```
git -C Krbn pull && ./build.sh
```

Requires Git and Node.js; `npx` fetches esbuild during the build.

## Files

| File | Content |
|---|---|
| `index.html` | the built app |
| `app.html` | interface, template for the build |
| `worker.ts` | builds the scene and calls Krbn |
| `build.sh` | build script |

## License

MIT, see [LICENSE](LICENSE). `index.html` contains Krbn, which is MIT-licensed as well (Copyright 2026 Krbn contributors); its license text is at the top of `app.html` and `index.html`.
