# Maps: The Lantern at Greyford

The maps are by **Ross McConnell of 2-Minute Tabletop** under **CC BY-NC 4.0** (non-commercial; see
[images/CREDITS.md](images/CREDITS.md)). Every image is landscape so it fills a TV, at most
4096 px on the long edge, and carries its credit in a corner. `tools/make-maps.py <originals dir>
<out dir>` rebuilds them from the originals (not in the repo): 10.jpg gorge, 11.jpg gorge flooded,
12.jpg tavern dark, 13.jpg tavern light, 14.jpg village. `tools/make-handout.py` renders the
letter.

| File | Scene | What was done | Grid |
| --- | --- | --- | --- |
| `village.jpg` | Greyford (image) | Credit added. 3220×2240. | None |
| `inn-night.jpg`, `inn-day.jpg` | The Wayside Lamp (map, backgrounds Night and Day) | Rotated a quarter turn left, so the front door faces east. 1584×1152. | 72 px, offset 0 (22 × 16 squares) |
| `gorge.jpg`, `gorge-flood.jpg` | Grey Gorge (map, backgrounds Low water and Flood) | Resized from 14400×6600. 4096×1877. | 85.333 px, offset 0 (48 × 22 squares, as the product page gives it; the floor tiles are half-squares) |
| `handout-letter.jpg` | Hesper's letter (image) | Rendered parchment and Georgia Italic. 2560×1440. | None |

The grids were checked against the art (wall lines, floor tiles) and are stored in
`campaign.json`; the hidden tokens sit on those cells.

## Room keys

The notes refer to these.

**Village (Greyford).** The Wayside Lamp is the big inn just south of the crossroads; the
timber yard is north of the road; the toll house is the small stone house on the road at the east
end; the reeve's walled house with the pond is at the west end; the oak green is the ring of lane
around the great tree; the standing stones are in the trees to the north-west.

**Tavern** (front door east): I1 front door · I2 common room with the fire pit · I3 bar, with
stools on the east side · I4 pantry (north end of the bar block) · I5 back hall · I6 four guest
rooms along the west side.

**Grey Gorge** (the river runs west to east): G1 statue rock · G2 south bridge · G3 north
bridge and red gate · G4 bell house · G5 keepers' hall and gallery · G6 keepers' rooms (kitchen
and library, south bank) · G7 jar terrace · G8 storehouse · G9 wreck · G10 gate rock with the
spiral stair (the lantern's place) · G11 stepping bridges · G12 east bridge and promontory · G13
shrine hall · G14 garden and pools.
