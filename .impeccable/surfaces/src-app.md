---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

Scope: whole app shell plus Home, auth, classroom, study, test-taking, admin. Visitor mode: Operate.

Audience/job: Bayview HOSA members on phones in spare moments and laptops at home; study, take tests, see where they rank. Trainers (senior students) manage classrooms; executives oversee.

Constraints: logo top left, fairly big; light (ice ground, navy ink) and dark (navy ground, ice ink) modes; square corners; must read as official Bayview HOSA, never as an AI template. Club-casual competitive voice. WCAG AA both modes.

## Direction contract

THESIS: One thing owns the screen. Each study item, question, and stat is a full-height panel you snap through, with actions stacked on a right rail; it refuses the dashboard card grid and sidebar every class tool ships.

OWN-WORLD: Flat Bayview navy (#1E3D62, deep #0F2440) and ice (#E8F2FA) fields, swapped per mode; HOSA maroon (#7A1F2B) reserved for you and the active item only. Barlow Condensed numerals at poster scale for ranks and counts, Barlow for everything else. Square line-icon rail glyphs that fill when engaged. Flat solid bottom band replaces the photo scrim; no gradients, shadows, or radii.

STORY: A member opens the app, sees their rank this week huge, snaps to the board, snaps to their classrooms, taps one, and flicks through cards or questions one per screen until done.

FIRST VIEWPORT: Logo top left at about 96px tall on phone, 120px desktop. Below it the STANDING panel: your slice of this week's board, two rows above you and two below in plain Barlow, your own row set at poster scale in condensed type on a maroon band ("3 Joseph 142 answered"), and one plain sentence anchored low-left naming the gap ("12 more answered passes Priya"). Right rail with join, theme, profile. Bottom tab bar on phone; on desktop the rail stays right and tabs move top right.

FORM: Vertical feed surface, dealt challenger (pop-culture-shelf-vertical-video-feed-surface), chosen by the user over my list's #5 assignment; seed 59dea833. Signature interaction: scroll-snap feed with the next item preloaded, rail glyph fills and its count steps up on tap. Motion grammar: hard snaps and two-frame steps, no easing.

Raises carried from the round: state reads in rule form as well as colour (solid live, dashed pending, struck done); every artifact carries a small form number (T-014, D-007); one reserved accent for you.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
