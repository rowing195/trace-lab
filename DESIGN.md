# Trace Lab UI direction

Built using `design-taste-frontend` (Taste Skill v2). Direction: **The split stage**, seed **234811027**.

## Brief and inventory

This is a working drawing tool for curious learners, rather than a marketing page. The user's constraints are no paper texture or print styling, no neon/nightclub aesthetic and no mechanical instrument styling. Keep all drawing, Fourier, error and export behaviour.

Specific material: the user's own single stroke; two separate real Fourier series; two perpendicular chains of rotating circles; their projected intersection; an adjustable integer N from 0 to 256; a live normalized RMS error; 1,024 equal-arc samples; forward/reverse treatment of an open curve; the formula's actual coefficient table; a replayable trace; local-only computation and local persistence.

Idea: **The user's stroke becomes a live mathematical picture on a persistent stage, while its recipe is edited alongside it.** The live thing is the actual drawing and Fourier reconstruction, never a static illustration.

## Claims and copy

- Your stroke can be reconstructed with circles: the live two-axis animation. Headline:「你的線條，圓來完成。」 Supporting copy:「畫下一筆，調整 N，看傅立葉級數描回你的形狀。」
- You control the source: a real drawing canvas and three working examples. Heading:「先畫一筆」.
- More terms resolve detail: N input and the error-versus-N curve. Heading:「調整細節」.
- The result is inspectable: two equations, actual coefficients and full-precision exports. Heading:「形狀背後的公式」.

## Adaptation log

Three slot redraws: Besley billboard type conflicted with the no-print brief; green-black palette risked an instrument aesthetic; the menu-card hero explicitly called for paper styling. The redraw retained split-stage and selected STIX Two Text, cobalt-on-sand and an inset image. The sand ground is mapped to cool blue/white to honor the user's explicit no-paper constraint, keeping cobalt as the existing brand accent. STIX is used for mathematical notation; Chinese and controls use the native sans stack because STIX has no Chinese coverage. The formula band uses a cool pale green.

The persistent image is the functioning Canvas, and the reading half is the drawing/control column. These app screens retain their mathematical axes, numeric labels, sliders and data-table conventions. Decorative photographs, marketing proof lists and a photographic crossfade would obstruct the requested tool, so they are not added. The real Fourier motion supplies the signature animation. Small entrances and press feedback complement it, with reduced-motion support.

Taste's direct-CDP inspector is not used because this environment requires the provided browser automation surface. Source lint plus the supported browser's screenshots and DOM measurements are used instead at 1440, 768 and 390 px. This is an adapted application of the skill, not a claim to pass its marketing-page image/motion quotas.

## Visual review and verification

ROUND 1
Seen in one second: a large blue field containing the user's reconstructed stroke and two real rotating-circle chains.
Idea: the live mathematical picture stays alongside the recipe being edited.
Live thing: mouse/touch drawing, N editing and reconstruction playback.
Layout words by section: studio=split / controls=stack / formula=full-width field.
Scores under the literal marketing rubric: design 6.5 · usability 7.5 · creativity 7 · content 8 → overall 7.1.
Caps applied: the four-photograph requirement is intentionally not satisfied by this working tool.
Top three problems and fixes:
1. The main error number is below the first desktop screen (taste-desktop-round1.jpg). Mirror the actual computed error beside the stage's N readout.
2. After drawing on a phone, returning to the animation requires scrolling back (taste-mobile-round1.jpg). Add a direct return link beside the N controls.
3. The epicycle strokes are too faint against blue (both screenshots). Increase stroke opacity and the reconstructed path width.

ROUND 2
Seen in one second: a live Fourier picture with its N and error, in a cool blue field.
Idea: the stroke, the circles and the numerical recipe stay connected.
Live thing: drawing and N changes update the same formulas, error and replay.
Layout words by section: studio=split / controls=stack / formula=full-width field.
Scores under the literal marketing rubric: design 6.5 · usability 8 · creativity 7 · content 8 → overall 7.2.
Caps applied: four real photographs would add irrelevant content to this app. This prevents a higher literal marketing-page design score, and is retained deliberately.
Remaining limitations: mobile uses in-page links instead of simultaneous input/output panes; the full coefficient table scrolls horizontally on narrow screens. No decorative imagery or invented sample claims are used.

Verified with the supported browser at 1440, 768 and 390 px: no document-level horizontal overflow, visible main headings at most two lines, legible wrapped formulas, functioning empty state, mouse drawing, sample shapes, open-path mode, N=0/12/50/256, range clamping, error-chart selection, playback/restart/speed/progress, visibility toggles, coefficient rows, formula clipboard and JSON download. A downloaded N=50 file contains 50 coefficient records and 1,024 samples. Browser console reports no errors.

`npm test`: six mathematical tests pass. `npm run check` passes. Taste source lint: zero failures; its one warning counts the em-dash placeholders used for unavailable numeric data, not decorative prose. Native browser QA is used in place of the bundled inspector. Reduced-motion styles and the existing reduced-motion pause behaviour are preserved; an OS preference switch was not exercised during this run.

## Image tracing, smoothing and detailed examples

Motivation: mouse strokes rarely look good, which weakens the page as a demonstration. Three additions keep the existing split stage and only extend the drawing column:

- **Smoothing** (`平滑手繪筆跡`, on by default) runs before sampling. The analysed stroke replaces the jittery one on the canvas; unticking the box shows the raw stroke again. Strength 0.05 was chosen by comparing 0.035/0.05/0.07 on a tremor-like star and a saw-tooth stroke: 0.05 removes most tremor while star tips stay visibly sharp.
- **Image tracing** uses a full-width tinted button under the canvas. An image can also be dropped anywhere on the page (the canvas shows a dashed cobalt drop state) or pasted. Controls appear only while an image is the source, in a ground-coloured block: a segmented outline/all-lines switch (all-lines carries an 實驗 badge because jumps between contours are inherent to a single Fourier stroke), a threshold slider, an invert box and an automatic-threshold link. The picture is shown at 22% opacity behind its contour and is never stored.
- **Examples** become a 4 × 2 grid. The five new icons are the shapes' own outlines at 24 px, so the button previews what will be drawn. On phones the icon stacks above the label.

Verified in Chromium at 1440, 768 and 390 px: no horizontal overflow; file picker, synthetic drag-and-drop (drop highlight shown) and clipboard paste; photo, emoji-style clip art, transparent PNG with a white subject, letter with holes in all-lines mode; threshold, invert, auto threshold and mode switching; non-image and corrupt-image errors; reload restores the traced outline without image controls; Space shortcut unaffected. On a 1600 × 1200 JPEG, decode + trace + fit takes roughly 0.1 s. Browser console reports no errors. `npm test`: 16 tests pass; `npm run check` passes.

## Copy revision: plain, specific wording

The first round's slogans (「你的線條，圓來完成。」, 「形狀背後的公式」, 「從一筆線條，走進傅立葉的世界。」) and reassuring second-person lines (「隨意畫，不用完美。」, 「等你畫下第一筆」) read as generic AI copy: they carry no information and would fit any product. They are replaced, and the "Claims and copy" headings above are superseded.

Rules now applied to all interface text:

- Headings are nouns that name the section's content: 路徑, 階數 N, 誤差, 公式, 運作方式.
- Numbers instead of adjectives. The error panel no longer says 「與原始線條非常接近」; it states the smallest N that brings the current shape under 1% and 0.1% NRMSE (e.g. heart: N ≥ 6 and N ≥ 27), computed from the error curve.
- Each fact is said once. The draw/adjust/watch instruction appeared four times; it now appears once, beside the canvas.
- One term per concept: 誤差 (never 錯誤率), and the help text uses the checkbox's real name 「連接起點與終點」.
- No sentence that would still be true of a different product. The footer slogan is removed; 「怎麼運作 ↗」 became 「說明」 because the arrow implied an external link.

The page title is just "Trace Lab". The header logo is now the page's only h1, so the large stage headline is gone; the stage opens with one factual line (x(t)、y(t) 各是一個傅立葉級數，第 k 項是一個以 k 倍速旋轉的圓。) and the animation gains that height (clamp(380px, 40vw, 600px)), keeping playback above the fold at 1440 × 900.
