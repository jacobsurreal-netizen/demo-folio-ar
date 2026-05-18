# AR Demo Testing Notes

## Marker Test 01
Source: marker-source.png
Compiled: card-photo.mind
Device:
Browser:
Result:
Notes:

## Marker Test 01 — Localhost / Mobile LAN

Device: Samsung Galaxy A36 5G
Browser: Chrome
Source: marker-source.png
Compiled: card-photo.mind

Result:
- Marker lock works.
- Artifact appears.
- Artifact scale too large for viewport.
- Heavy model jitter observed.
- IR mode toggle does not switch mode.
- Gateway CTA works and redirects correctly.
- Camera feed not visible because black background covers viewport.

Next fixes:
1. Fix AR camera/canvas visibility behind HUD.
2. Fix IR toggle wiring.
3. Reduce artifact scale.
4. Re-test jitter with physical printed marker.