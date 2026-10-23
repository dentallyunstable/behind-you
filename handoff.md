# Behind You: handoff

Everything a new developer (or a new Claude chat) needs to keep building this game the same way.
Read this whole file before changing anything.

---

## 1. Working with the owner

The owner designs the game but **does not code**. How to work with them:

- **Keep the conversation simple.** No code talk, no file names or jargon unless they ask. Describe what the player sees, hears and does.
- **Plan first.** Before building something non-trivial, give a short plan in plain words (what it will look and feel like).
- **Ask when unsure.** If a request can be read two ways and the answer changes what you build, ask. Offer 2-4 clear options with a recommended one. Don't ask about things you can decide sensibly yourself; decide and mention it.
- **End with a short summary** of what you did: what changed for the player, and what you tested and couldn't test.
- **Read their answers carefully.** They often type their own answer instead of picking an option, and it often adds new details. Follow exactly what they wrote.
- **Show, don't tell.** After visual changes, send screenshots (taken in a headless browser, see section 9).
- They play on a **phone**. Every feature must work with touch first, and keyboard second.
- Only make a pull request if they ask. Commit and push to the working branch after each finished change.

---

## 2. The game in one paragraph

**Behind You** is a first-person horror runner in a dark forest at night, in a low-poly **PS1/PS2 retro style**. You run with only a flashlight while something chases you. **The main goal is the feeling of something right behind your neck: panic.** Every feature should serve that feeling. It is a plain web page (HTML + JavaScript + three.js), with no build step. Open `index.html` in a browser to play.

---

## 3. Style rules (keep these)

**Graphics**
- Low-poly models built from a few boxes, cylinders and cones, merged into one geometry each.
- Tiny procedural textures (32×32 or 64×64, drawn in code), no mipmaps, stretched and blurry.
- Low internal resolution (400 lines), scaled up with `image-rendering: pixelated`.
- Per-vertex (Gouraud) lighting with `MeshLambertMaterial`. Big flat surfaces need subdivided geometry, or the lighting looks wrong.
- Dark scene. Thick fog (3 to 21 m), near-black sky, faint blue ambient light. The flashlight is the main light.
- **Stop-motion animation.** The monster and the campfire update only 9-12 times a second, deliberately choppy. The monster has sudden head twitches.

**Menus and UI**
- Courier-style monospace font, bone/cream text (`#d8d2c0`), black backgrounds, hard pixel text shadows.
- Chunky square buttons with a 2px border and a hard 3px black shadow. Buttons press down when tapped. Never rounded "modern" UI.
- Icons and menu art are pixel art: a hand-drawn SVG with `shape-rendering: crispEdges`, or small canvases scaled up pixelated (see `js/art.js`).
- Blinking text uses `steps(2)` animation.

**Sound**
- Most sound is synthesized in code with Web Audio. The breathing is a real recording the owner supplied, embedded as base64 in `js/breathing-data.js`.
- The owner asked to keep sound sparse: one distant cricket now and then, the breathing, the heartbeat, and our own footsteps. They earlier removed chaser footsteps and random twig snaps during the run. Don't add constant ambient noise without asking.

**Fear design (what makes it work)**
- You almost never see it clearly. Glimpses, eyes in the dark, a figure that vanishes when the light flickers.
- Effects build as it gets closer: heartbeat, breathing, red screen edges, tunnel vision, trembling, a flickering flashlight, crickets falling silent.
- Looking back costs you, because it gains on you while you look.

---

## 4. How to play (current controls)

**Phone**
- **Joystick:** put a thumb anywhere and drag. Left/right steers, **push up to jump** (one jump per push, speed doesn't matter), pull down to slow down.
- **FASTER button** (bottom right): hold it with the other thumb to sprint. The ring around it is stamina.

**Computer:** arrows/WASD to steer, Space/Up/W to jump, S/Down to slow down, Shift to sprint.

**Stamina:** sprinting until stamina falls below 15% makes you **out of breath**. You can't sprint, you run at 70% of normal speed until stamina is back to 50%, your breathing gets heavy, your head hangs, and the button dims with a blinking red ring.

History, so you don't repeat mistakes:
- It used to be one-handed with "drag up = sprint". A flick-to-jump caused accidental jumps, so sprint and jump were separated.
- The button was called RUN, then renamed **FASTER**.
- Holding the button on empty stamina used to keep sprinting. That exploit is fixed by the out-of-breath state.

---

## 5. Everything that exists now

### Start screen (the camp)
- You sit by a crackling campfire (choppy cone flames, embers, flickering firelight), with a tent and an empty log seat across the fire.
- The title "BEHIND YOU" is at the top. At the bottom: "Tap to look around." on phones, "Press any key to look around." on computers.
- A **pixel gear button** at the top left opens CONTROLS: phone controls, computer controls, how stamina works, "Headphones recommended".
- A **LEVELS** button is at the top right.
- Tapping fades both texts and plays the **camp intro** (about 6 s):
  1. Sit for 2 s.
  2. A twig cracks from the side where it stands, and the crickets stop.
  3. Look toward the sound (too dark to see), then the other way, then turn back. Two eyes are now there, where you looked before.
  4. Heartbeats.
  5. Stand up, the flashlight clicks on, and you run.
- The eyes stand at one of two spots (`World.CAMP.eyes`). The trees keep a gap so branches never hide them. Its body is very faintly visible under the eyes; the owner was told and hasn't objected.

### The run
- **Endless forest generation, in rows every 2 m:**
  - An **always-open path** that wanders left and right. The guarantee: there is always a way through.
  - Tree walls at the sides; obstacles get denser with distance.
  - Bushes and rocks are decoration you run through.
- **Fallen logs:** from 100 m they lie across the path; you jump them. Hitting one trips you like hitting a tree. A hint ("PUSH UP TO JUMP" / "SPACE TO JUMP") shows until you clear your first log; this is remembered.
- **Abandoned places** beside the path, with collision, from 170 m:
  - a cabin with an open dark door and a boarded window
  - a rusted car with a flat tire and its door open
  - a broken fence
  - an empty tent with a cold fire pit
- **The chaser** is a "gap" in meters (starts at 22, max 32). It waits 2.5 s, then gains whenever you're slower than it.
- **Involuntary look-backs:** every 10-22 s you look back for about 2 s, the flashlight turning with your head. Sometimes it's there (more likely when it's close), sometimes nothing.
- **Close call:** hitting a tree when it's within 14 m forces a quick glance, and it's right there reaching for you.
- **Flashlight blackouts** for 1-2 s now and then.
- **Watcher fake-outs:** a figure stands between the trees ahead and vanishes when the light flickers.
- **Chase moods:** sometimes it falls back (a lull), then is suddenly much closer.
- **Caught:** you whip around and its face flashes for a split second, then static. The game over screen shows "IT CAUGHT YOU" with **RUN AGAIN** (straight back to running, no intro) and **MAIN MENU** (back to the campfire).
- **HUD:** meters at the top left.

### Level 1: The Forest (2000 m)
- **From about 1750 m it is much harder:**
  - denser trees and a narrower path
  - logs every 26-52 m
  - the chaser at its top speed
  - no lulls, blackouts or watchers near the end
- **Signs you're close:**
  - At about 1850 m a truck passes on the highway (sound only).
  - An orange streetlight glow shows through the trees from far off.
- **From 1940 m** the trees open, and the path leads to the **dark red pickup** parked on the roadside at 2000 m.
- **Escape scene** (about 6 s):
  1. Walk to the door; it creaks open and the dome light comes on.
  2. Get in, toss the flashlight onto the passenger seat (it keeps shining). The door slams.
  3. Key, crank, the engine catches. The dials and headlights turn on.
  4. Fade to black.
- **YOU ESCAPED** screen:
  - **NEXT LEVEL:** padlocked. It shakes and shows "COMING SOON".
  - **ENDLESS**
  - **MAIN MENU**

### Endless mode
- Unlocked by escaping once.
- **Starting it:** you're back in the truck. It fails to start twice (the dials flicker). Something heavy lands in the truck bed and the truck rocks. You whip around, grab the flashlight, get out and run across the highway into the forest beyond.
- **The first time ever**, "You unlocked the endless mode." shows at the top for about 4.5 s.
- **Meters and best:** meters count from the truck, and endless has its own best distance. Run Again starts at the truck.

### Levels screen
- **The Forest card:** a pixelated snapshot of the real campfire scene, rendered once when the screen opens, with the text "Level 1: **The Forest**". Tapping it starts the level (camp intro).
- **Its small ENDLESS button:** black, chained and padlocked until you escape once.
- **Four locked cards:** black with two pixel chains crossing to a padlock. The first one has a strip saying "Reach 2000 m in The Forest to unlock", which becomes "Coming soon" once escaped.

---

## 6. Code map

| File | What it does |
|---|---|
| `index.html` | All screens and HUD elements, script order. |
| `css/style.css` | Menus, HUD, joystick, buttons, levels, effects (vignette, tunnel, danger, static, fade). |
| `js/textures.js` | Procedural textures. `ATLAS` (bark, leaves, dead wood, rock) and `PROPS` (planks, rust, canvas, soot) are 2×2 atlases sharing UV rects. Also ground, bush, hand, monster skin/face, glow, road, paint. |
| `js/geo.js` | `Geo.part` (bake a primitive into an atlas rect), `merge`, `mat` (matrix), `prism`, `placeGlow` (draws far glows within the 40 m camera range). |
| `js/props.js` | Models: log, cabin, fence, car, tent. They stand on y=0 with their front facing +z. |
| `js/world.js` | Forest generation, difficulty, logs, places, collision. Exports `World.CAMP` (fire, eye spots) and `World.FINISH` (truck, road, lamp positions and zones). |
| `js/camp.js` | The campfire scene: flames, embers, light, tent, far glow, fire loudness. |
| `js/finish.js` | Highway, guardrail, streetlight (buzzes, far glow), the pickup with interior, hinged door, dome light, dials, headlights (`setPower`). |
| `js/monster.js` | The creature. Modes: `run`, `still`, `reach`, `lunge`. Stop-motion posing; `place(..., eyeBoost)`. |
| `js/audio.js` | `Sfx.*`: all sounds (steps, heartbeat, breathing, crickets, fire, snap, click, jump/land, hit, caught, door, slam, drop, key, crank, engine, thump, passing truck). |
| `js/art.js` | Pixel art for menus: `Art.lockedCard`, `Art.lockedMini` (chains and padlocks). |
| `js/game.js` | Everything else: renderer, input, states, player, chaser, effects, camp intro, truck scenes, menus, levels, saving. |
| `lib/three.min.js` | three.js **r128** (an older version; the code uses its API, e.g. `outputEncoding`). Do not upgrade casually. |

**Coordinates**
- The player runs toward **-z**. Distance `d` = -z (so `z = -d`). x is sideways; the playable width is ±11.5.
- The camp is behind the start line (d < 0).
- The truck is at d ≈ 2001; the road runs along x between d 2003 and 2010.5.

**Game states** (`state` in game.js):
- `menu`: sitting at the camp
- `intro`: the camp scene
- `play`
- `caught`
- `over`: the game over screen
- `escape`: the truck scene at the level's end
- `escaped`: the YOU ESCAPED screen
- `endlessIntro`: the failing-truck scene

`mode` is `'level'` or `'endless'`.

**Scenes are keyframed:**
- The camp intro uses the `INTRO` timings plus `updateCampCamera`.
- The truck scenes use the `carScene` object (keys, door, events, fades) played by `updateCarScene`.
- Copy these patterns for new cutscenes.

**Saved in the browser** (localStorage, always wrapped in try/catch):

| Key | Meaning |
|---|---|
| `behindyou.best` | Level best distance |
| `behindyou.bestEndless` | Endless best distance |
| `behindyou.jumped` | Has cleared a log (hides the jump hint) |
| `behindyou.escaped` | Has escaped once (unlocks endless) |
| `behindyou.endlessSeen` | Has seen the unlock message |

**Key tuning numbers** (top of game.js and world.js):
- Start gap 22 m, max gap 32 m.
- Sprint is 1.4× speed and drains 0.3/s; stamina regenerates 0.14/s.
- Out of breath below 0.15, recovered at 0.5, 70% speed while out of breath.
- Jump speed 4.4 with gravity 14. You must be 0.3 m up to clear a log.
- Chaser speed is `base × (0.94 + min(diff,1) × 0.14)`.
- Difficulty curve: `world.difficulty(d)`, plus the extra +0.35 from 1750 m.

**Debug helpers:** `window.__game` in the browser console, e.g.:
- `setGap(v)` and `player.d = 1990` to teleport
- `escape()`, `endless()`, `state()`, `carT()`, `introT()`, `logAhead()`, `places()`, `jump()`

---

## 7. Gotchas learned the hard way

- **Camera far plane is 40 m.** Anything farther isn't drawn. Far glows must use `Geo.placeGlow`.
- **Function names clash in game.js** (one big closure). A `shake()` helper once broke the whole game because `shake` was already a variable. Check names before adding.
- **Eyes on the monster face** z-fought at distance. They sit slightly in front, with `polygonOffset`.
- Big flat meshes need subdivisions, or vertex lighting makes them black or wrong.
- **Lights:** adding or removing lights at runtime forces shader recompiles (stutter). Create all lights up front and change their `intensity` instead (truck dome, headlights).
- **Audio** only starts after the first tap (a browser rule). The first view of the start screen is silent; this is expected.
- **The path must always stay open.** Anything new placed in the forest must respect `free()`, `isReserved()` and the log row, and must not trap the player.
- **The jump trigger** is joystick-up crossing 0.6, re-armed below 0.3. Don't go back to speed-based flick detection.

---

## 8. Open items and ideas

- **The last 250 m difficulty** was played by the owner: it feels fine, leave it.
- **Level 2 doesn't exist yet.** NEXT LEVEL says COMING SOON. The four locked cards are placeholders. A new level needs:
  - its own world generation and finish
  - a card picture
  - unlock wiring (escape flag → next level)
  - an update to the "Reach 2000 m…" text
- **Offered but not requested:**
  - a tap-to-toggle sprint for one-handed play
  - hiding the monster's faint body at the camp so only the eyes show
- **Putting it online:** GitHub Pages on the branch gives a phone link (see README).

---

## 9. How to work on it (for the developer/Claude)

- **Branch:** `claude/endless-runner-single-hand-hnwafr`. Commit with clear messages describing what the player gets, then push.
- **No build step.** Edit the files and reload the browser.
- **Match the code style:**
  - plain ES5/ES6 inside IIFEs that export one global (`window.World`, `window.Sfx`, …)
  - 2-space indent, single quotes
  - short comments written in plain English from the player's point of view
- **Test every change in headless Chromium** (Playwright is installed globally; Chromium is at `/opt/pw-browsers`):
  - Launch with `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` at a phone viewport (about 400×820, `hasTouch`).
  - Check for `pageerror` events, drive the game with `window.__game`, and take screenshots.
  - The screenshots are dark, so brighten them for viewing and combine them into one grid image to send to the owner.
  - Use the browser's multi-touch (CDP `Input.dispatchTouchEvent`) to test the joystick and FASTER button together.
- **Showing a playable build in chat:** publish the page as an Artifact. The page content is the `<body>` of index.html plus a `<title>`, with all `css/`, `lib/` and `js/` files passed as supporting files.
- Keep `README.md` updated (how to play and the file list) when controls or files change.
