# Painted fairy-tale Kathmandu assets

The three current sources were made with the built-in image generation tool and saved unchanged here.
`npm run assets:art` copies them to the runtime paths below. The browser extracts eight 512 px
mipmapped, mirrored-repeat material textures and one 512 px foliage cutout at boot. World light,
shadows, wind and glow remain live; the images are surface paint, not screenshots of the game.

| Source | Runtime output | Generation mode |
|---|---|---|
| `pipeline/art/source/storybook-materials.png` | `assets/textures/storybook-materials.png` | New image, opaque background, no image references |
| `pipeline/art/source/fairy-leaves.png` | `assets/textures/fairy-leaves.png` | Reference-guided generation, transparent background; supplied `art.png` and `art4.png` used as style references |
| `pipeline/art/source/exploration-materials.png` | `assets/textures/exploration-materials.png` | New image, opaque background, no image references |

The earlier `source/kathmandu-materials.png` and `source/peepal-spray.png` are retired experiments;
the current build and renderer do not use them. The new palette deliberately avoids their gritty
surface detail. Runtime texture selection and sizes live in `src/config/mythic.js`.

## Exact material prompt

Use case: stylized-concept. Asset type: 2-by-2 square material atlas for a warm whimsical hand-painted Kathmandu dog adventure game. Four equal square quadrants, filling the image completely with no borders or gaps. Each quadrant is a flat orthographic top-down seamless material swatch, without perspective or edge framing. TOP LEFT: softly rounded pale lavender-grey and warm cream sandstone paving, about 7 irregular stones across, shallow narrow muted mauve joints and small soft painted edge highlights. TOP RIGHT: gentle sage, mint and turquoise-green moss meadow, broad blended brush patches, a few subtle little clover-shaped leaves. BOTTOM LEFT: hand-laid old Nepali clay bricks, soft dusty terracotta/rose, little apricot variations, roughly 8 bricks across, shallow warm beige mortar. BOTTOM RIGHT: warm honey-brown carved timber grain, flowing curved brush bands with a few gentle knots. Style: a welcoming storybook gouache painting, big calm painterly shapes, luminous midtones, limited muted pastel palette. Match whimsical fairy-tree diorama art rather than real stone or photography. Keep low to medium contrast; illumination broad, even and neutral for a 3D game to add its own lighting. No photorealism, no dirt, no scratches, no deep cracks or crevices, no gritty noise, no black, no baked cast shadows, no scenery, no props, no text, no watermarks. Each tile must reach its quadrant edges without a border. Entire image is the four texture swatches.

## Exact foliage prompt

Use case: stylized-concept. Asset type: a transparent foliage cluster texture for an actual 3D fairy-tale Kathmandu game. The two images are STYLE REFERENCES for the rounded painted blue leaves and softly luminous color; do not include their screenshot UI, tree trunks, rocks, text, or backdrop. Create a single loosely rounded spray of about 28 overlapping, individually readable, broad rounded heart-shaped peepal leaves. A delicate branching stem is almost hidden in the leaves. Hand-painted gouache fantasy illustration, rich periwinkle, cornflower blue, turquoise-blue highlights and soft violet shadows, like the magical blue crown in the references. Big simple soft brush shapes and smooth painted volume; dreamy and welcoming. Organic scalloped silhouette with several small transparent gaps between leaf groups. Leaf tips gently droop. Lighting painted softly from upper left; medium luminous values, no pure-white glare. Entire spray centered with 10% transparent margin on every side, all leaves inside frame, no cast shadow or surrounding glow. True transparent alpha background. Avoid realism, photographic leaf veins, noisy microtexture, hard geometric facets, black outlines, neon gradients, UI, text and watermarks.

## Exact exploration material prompt

Use case: stylized-concept. Asset type: production 2-by-2 material texture atlas for a whimsical Himalayan dog adventure game. Exactly four equal square quadrants, flush without borders or gutters, each an orthographic flat seamless surface painting. TOP LEFT: soft warm brown earth and forest humus with small muted ochre leaf fragments and occasional smooth tiny pebbles, rich calm colour variation, no clovers or large plants. TOP RIGHT: many small rounded blue-grey river cobbles set in warm grey mortar, roughly 12 stones across, individual stones vary between muted blue, dusty mauve and warm cream, soft shallow seams. BOTTOM LEFT: warm ivory and pale peach lime plaster, gentle brushwork, faint broad hand-trowelled swirls, barely visible mottling, no cracks or bricks, no directional gradient. BOTTOM RIGHT: overlapping curved Nepali terracotta roof tiles in warm dusty apricot and rose clay, roughly 10 tiles across, individually soft curved lips and gently painted highlights, shallow muted seams. Hand-painted fantasy adventure art, welcoming soft gouache, expressive but quiet surfaces, colourful midtones and broad natural shapes. Albedo-only diffuse illumination, even from all directions. Suitable for live lighting in a 3D game. No realism, photographic noise, deep shadows, black outlines, highly contrasted cracks, giant leaf symbols, framing, objects, architecture scenes, text, watermark, or UI. Every quadrant completely filled; each independently tileable.
