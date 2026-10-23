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

**Behind You** is a first-person horror game at night, in a low-poly **PS1/PS2 retro style**. Level 1 (The Forest): you run through a dark forest with only a flashlight while something chases you. Level 2 (The Highway): you drive your truck down an empty highway while it chases you on all fours. **The main goal is the feeling of something right behind your neck: panic.** Every feature should serve that feeling. It is a plain web page (HTML + JavaScript + three.js), with no build step. Open `index.html` in a browser to play.

**The story continues from level to level** (the owner's decision): each level starts where the last one ended. Level 2 starts in the truck at the spot where Level 1 ended. Where the highway leads (the end of Level 2, and Level 3) is **not decided yet**; the owner will think about it. Plan any new level as part of that journey.

---

## 3. Style rules (keep these)

**Graphics**
- Low-poly models built from a few boxes, cylinders and cones, merged into one geometry each.
- Tiny procedural textures (32×32 or 64×64, drawn in code), no mipmaps, stretched and blurry.
- Low internal resolution (400 lines), scaled up with `image-rendering: pixelated`.
- Per-vertex (Gouraud) lighting with `MeshLambertMaterial`. Big flat surfaces need subdivided geometry, or the lighting looks wrong.
- Dark scene. Thick fog (3 to 21 m in the forest, 4 to 46 m on the highway so you can see ahead at speed), near-black sky, faint blue ambient light. The flashlight (Level 1) or the headlights (Level 2) are the main light.
- **Stop-motion animation.** The monster, the deer, the campfire, the engine smoke and the rear-view mirror update only 9-15 times a second, deliberately choppy. The monster has sudden head twitches.

**Menus and UI**
- Courier-style monospace font, bone/cream text (`#d8d2c0`), black backgrounds, hard pixel text shadows.
- Chunky square buttons with a 2px border and a hard 3px black shadow. Buttons press down when tapped. Never rounded "modern" UI.
- Icons and menu art are pixel art: a hand-drawn SVG with `shape-rendering: crispEdges`, or small canvases scaled up pixelated (see `js/art.js`).
- Blinking text uses `steps(2)` animation.

**Sound**
- Most sound is synthesized in code with Web Audio. The breathing is a real recording the owner supplied, embedded as base64 in `js/breathing-data.js`.
- The owner asked to keep sound sparse: one distant cricket now and then, the breathing, the heartbeat, and our own footsteps. They earlier removed chaser footsteps and random twig snaps during the run. Don't add constant ambient noise without asking.
- Level 2's sounds: the engine (revs with speed, coughs when choking or badly hurt), tyres on the road, screeching under hard braking, rain/radio/hazard ticks only on its menu (the owner chose the rain scene), plus hits, deer, splashes and wipers. No crickets on the highway.

**Fear design (what makes it work)**
- You almost never see it clearly. Glimpses, eyes in the dark, a figure that vanishes when the light flickers.
- Effects build as it gets closer: heartbeat, breathing, red screen edges, tunnel vision, trembling, a flickering flashlight, crickets falling silent.
- Looking back costs you, because it gains on you while you look.

---

## 4. How to play (current controls)

**Level 1 (The Forest), phone**
- **Joystick:** put a thumb anywhere and drag. Left/right steers, **push up to jump** (one jump per push, speed doesn't matter), pull down to slow down.
- **FASTER button** (bottom right): hold it with the other thumb to sprint. The ring around it is stamina.

**Level 1, computer:** arrows/WASD to steer, Space/Up/W to jump, S/Down to slow down, Shift to sprint.

**Level 2 (The Highway)**
- **Phone:** the joystick becomes a **steering wheel** (a pixel wheel graphic that turns; only left/right counts). No jumping. The FASTER button becomes **BRAKE** (pixel "(!)" brake-warning icon).
- **Computer:** arrows/A/D steer; Space, S, Down or Shift brake.
- The truck speeds up on its own (no gas pedal). **The longer you hold BRAKE, the harder it brakes** (0.3 → full strength in 0.9 s), the more it shakes, and the back slides out a little (drift).
- **Holding it too long** (2.6 s of brake "heat", the ring around the button fills and turns red) **chokes the engine**: 2.2 s of stuttering along at a crawl, lights flickering, then it catches and speeds up again.

**Stamina (Level 1):** sprinting until stamina falls below 15% makes you **out of breath**. You can't sprint, you run at 70% of normal speed until stamina is back to 50%, your breathing gets heavy, your head hangs, and the button dims with a blinking red ring.

History, so you don't repeat mistakes:
- It used to be one-handed with "drag up = sprint". A flick-to-jump caused accidental jumps, so sprint and jump were separated.
- The button was called RUN, then renamed **FASTER**.
- Holding the button on empty stamina used to keep sprinting. That exploit is fixed by the out-of-breath state.

---

## 5. Everything that exists now

### Start screen (the camp)
- You sit by a crackling campfire (choppy cone flames, embers, flickering firelight), with a tent and an empty log seat across the fire.
- The title "BEHIND YOU" is at the top. At the bottom: "Tap to look around." on phones, "Press any key to look around." on computers.
- A **pixel gear button** at the top left opens CONTROLS: phone controls, computer controls, how stamina works, "Headphones recommended". On Level 2's menu it shows the truck's controls instead (steering, brake, the brake ring, the truck's health).
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
  - **NEXT LEVEL:** goes to Level 2's menu (back in the truck, where you left it).
  - **ENDLESS**
  - **MAIN MENU**

### Endless mode
- Unlocked by escaping once.
- **Starting it:** you're back in the truck. It fails to start twice (the dials flicker). Something heavy lands in the truck bed and the truck rocks. You whip around, grab the flashlight, get out and run across the highway into the forest beyond.
- **The first time ever**, "You unlocked the endless mode." shows at the top for about 4.5 s.
- **Meters and best:** meters count from the truck, and endless has its own best distance. Run Again starts at the truck.

### Level 2: The Highway (9000 m)
Unlocked by escaping The Forest (NEXT LEVEL on the YOU ESCAPED screen, or its card under LEVELS). **Once you've played it, the game opens on its menu** instead of the campfire (`behindyou.lastLevel`).
- **Its menu (idle scene):** you sit in the parked truck at the exact spot Level 1 ended (under the orange streetlight), in the rain. Engine idling, hazard lights ticking and blinking orange, rain on the roof and glass, wipers every ~6 s, radio hissing on a dead station. The view is zoomed in on the **rear-view mirror**: "BEHIND YOU" is written with a finger in the fogged-up rear window, **from outside** (so from inside it's backwards and in the mirror it reads right), with water running down from the letters. The HTML title is hidden on this menu. Now and then two eyes show far back in the mirror, then vanish. Text: "Tap to drive."
- **Start (about 2 s):** the radio cuts out, the hazards stop, the view swings down from the mirror to the road, eyes appear far back in the mirror, then it starts coming; heartbeats, you rev and floor it. The rain and the window fog clear over the first seconds of driving.
- **Driving:** first-person in the cab, your hands on the wheel at 10 and 2 turning it as you steer (forearms follow), glowing gauges (speedometer, and a temperature needle that climbs while you hold the brake). The road bends left and right (gentler at first). Reflector posts, yellow DEER CROSSING signs, trees beyond the shoulder. Going off the road onto the verge is bumpy and slow; hitting the tree line scrapes and damages the truck.
- **The chaser:** the same creature, now **on all fours** (monster mode `crawl`). Mostly seen in the **rear-view mirror**, lit red by the tail lights, eyes glowing far back. It's a gap in meters like Level 1 (starts ~14, max 30), a little slower than the truck at full speed, so **every brake lets it gain**. At the tailgate it rears up (`reach`) and **rams** you: damage, a hard jolt, blur, and it drops back 7-10 m. **Surprise lunges** every 45-75 s (after 40 s): it surges from behind, or comes up alongside a door: you can't help glancing at the side window, its face is right there (the cab light flickers on), then it slams the truck sideways toward the trees.
- **The truck's health** is what decides win or lose (the owner's rule). A chunky pixel bar "TRUCK" under the meters (red when low, blinking when critical), but mainly the truck itself shows it: **windscreen cracks** at random spots (thin, never blocking the middle), **dents** in the bonnet (darker, crumpled front edge), the engine **smokes** below half and pours smoke near the end, and coughs when nearly dead. Health 0, or **3 crashes (trees/deer) within 8 s**, and the engine dies: the truck rolls to a stop, it's coming in the mirror... then its face is at your window, static, IT CAUGHT YOU ("You drove X of 9000 meters", DRIVE AGAIN / MAIN MENU).
  - Damage: rammed for braking 0.10, surprise lunge 0.05, side slam 0.08, tree line 0.06 (scraping along counts as one crash), deer 0.15.
- **Deer:** one stands frozen at the roadside, green eyes shining in your headlights, looking at you... then bolts across exactly when you'd reach it if you keep going. Brake to let it pass. Hitting it: thud, cracks, dent, it's thrown down the road. The first time ever, a "HOLD BRAKE" hint shows (remembered in `behindyou.braked`). Every ~20-38 s, more often later.
- **Puddles** (every 170-430 m): driving through one throws water over the windscreen: grey film and drops, and whatever is behind the glass is **blurred** (CSS backdrop-filter clipped to the windscreen above the dashboard, so the wheel and hands stay sharp). After 2 s the **wipers** sweep twice and clear the glass where the blades pass.
- **Headlights:** die for 1-2 s now and then (like the flashlight blackouts; never while a deer or a lunge is happening) and stutter when it's close. The dials go dark with them.
- **The end:** at 9000 m it falls back, everything fades to black, YOU ESCAPED "The Highway · 9000 m", NEXT LEVEL locked (COMING SOON), MAIN MENU. **This is a placeholder until the owner decides where the highway leads.** No endless mode for Level 2 yet.

### Levels screen
- **The Forest card:** a pixelated snapshot of the real campfire scene with the text "Level 1: **The Forest**". Tapping it starts the level (camp intro).
- **Its small ENDLESS button:** black, chained and padlocked until you escape once.
- **The Highway card:** a snapshot of the truck parked in the rain under the streetlight, hazards on, "Level 2: **The Highway**". Chained with "Reach 2000 m in The Forest to unlock" until you escape The Forest. Tapping it starts Level 2's start scene.
- Both snapshots are rendered once at startup.
- **Three locked cards:** black with two pixel chains crossing to a padlock. The first one says "Reach 9000 m on The Highway to unlock", which becomes "Coming soon" once you've reached the end.

---

## 6. Code map

| File | What it does |
|---|---|
| `index.html` | All screens and HUD elements, script order. |
| `css/style.css` | Menus, HUD, joystick, buttons, levels, effects (vignette, tunnel, danger, static, fade). |
| `js/textures.js` | Procedural textures. `ATLAS` (bark, leaves, dead wood, rock) and `PROPS` (planks, rust, canvas, soot) are 2×2 atlases sharing UV rects. Also ground, bush, hand, monster skin/face, glow, road, paint, deer hide, deer crossing sign, puddle. |
| `js/geo.js` | `Geo.part` (bake a primitive into an atlas rect), `merge`, `mat` (matrix), `prism`, `placeGlow` (draws far glows within the 40 m camera range). |
| `js/props.js` | Models: log, cabin, fence, car, tent. They stand on y=0 with their front facing +z. |
| `js/world.js` | Forest generation, difficulty, logs, places, collision. Exports `World.CAMP` (fire, eye spots), `World.FINISH` (truck, road, lamp positions and zones) and `World.geometry` (the tree models, reused by the highway). `setVisible` hides the whole forest. |
| `js/camp.js` | The campfire scene: flames, embers, light, tent, far glow, fire loudness. |
| `js/finish.js` | Highway, guardrail, streetlight (buzzes, far glow), the pickup with interior, hinged door, dome light, dials, headlights (`setPower`). The bonnet (`hood`, dentable) and steering wheel (`wheel`, turns) are separate meshes; the rear window is an opening. The truck's rotation order is `YXZ`. |
| `js/highway.js` | Level 2's world, in its own frame (`root`, see Coordinates): the road and ground as vertex strips that follow the bends (`centerAt(d)`), instanced trees/posts/signs/puddles, `puddlesBetween`, the **deer** model (`hw.deer`), the **rain** (`updateRain`). |
| `js/cab.js` | Inside the truck (children of the truck): hands and forearms on the wheel, gauges (`setGauges`), the **rear-view mirror** (a render target from a small camera looking back through the rear window, every other frame), windscreen cracks (`crack`), bonnet dents (`dent`), smoke (`setSmoke`), water and wipers (`splash`, `wipe`, `glassOnScreen`), the fogged rear window with the writing (`setFog`), tail and hazard lights. |
| `js/drive.js` | Level 2's game: truck physics (steer, brake, drift, stall), the chase (gap, rams, lunges, side slams, glances), health and crashes, deer, puddles, blackouts, the menu scene, the start scene, the caught scene, the end. Created by game.js with a `ctx` object of shared things. |
| `js/monster.js` | The creature. Modes: `run`, `still`, `reach`, `lunge`, `crawl` (on all fours, Level 2). Stop-motion posing; `place(..., eyeBoost)`; `setModeOnce`. |
| `js/audio.js` | `Sfx.*`: all sounds. Level 1: steps, heartbeat, breathing, crickets, fire, snap, click, jump/land, hit, caught, door, slam, drop, key, crank, engine, thump, passing truck. Level 2: `setEngine` (revs), `sputter`/`engineCatch` (choking), `setRoad`, `setScreech`, `crunch` (its hits), `scrape`, `deerHit`, `hooves`, `splash`, `wiper`, `setRain`, `setRadio`, `tick` (hazards), `rev`. |
| `js/art.js` | Pixel art for menus: `Art.lockedCard`, `Art.lockedMini` (chains and padlocks). The steering wheel and brake icons are pixel SVGs in `index.html`. |
| `js/game.js` | Everything else: renderer, input, states, player, chaser, effects, camp intro, truck scenes, menus, levels, saving. `useLevel(n)` switches between the two levels' worlds. |
| `lib/three.min.js` | three.js **r128** (an older version; the code uses its API, e.g. `outputEncoding`). Do not upgrade casually. |

**Coordinates**
- The player runs toward **-z**. Distance `d` = -z (so `z = -d`). x is sideways; the playable width is ±11.5.
- The camp is behind the start line (d < 0).
- The truck is at d ≈ 2001; the road runs along x between d 2003 and 2010.5.
- **Level 2** lives in `hw.root`, a group placed where the truck is parked and turned 90°, so inside it you drive towards **-z** again: x is sideways, `d = -z`. The truck starts at local (0, 0, 0); the road's middle starts at x = 5.75. During Level 2 the truck (`finish.car`) is moved into `hw.root`, and the camera's `body` into the truck (eye at truck point 0.42, 1.58, 0.1). `useLevel(1)` puts them back. The forest is hidden in Level 2 (`world.setVisible`).
- Level 2 sees further: fog 4-46 m and camera far 60 m (Level 1: 3-21 m and 40 m), and its own field of view (`baseFov2`: narrower on a tall phone so the windscreen fills the screen).

**Game states** (`state` in game.js):
- `menu`: sitting at the camp
- `intro`: the camp scene
- `play`
- `caught`
- `over`: the game over screen
- `escape`: the truck scene at the level's end
- `escaped`: the YOU ESCAPED screen
- `endlessIntro`: the failing-truck scene

`mode` is `'level'` or `'endless'`. `level` is 1 or 2. Level 2 reuses the same states (`menu`, `intro`, `play`, `caught`, `over`, `escape`, `escaped`); when `level === 2` the main loop hands the whole frame to `drive.update`.

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
| `behindyou.best2` | Level 2 best distance |
| `behindyou.escaped2` | Has reached the end of The Highway |
| `behindyou.braked` | Has braked for a deer (hides the HOLD BRAKE hint) |
| `behindyou.lastLevel` | `1` or `2`: which level's menu the game opens on |

**Key tuning numbers** (top of game.js and world.js):
- Start gap 22 m, max gap 32 m.
- Sprint is 1.4× speed and drains 0.3/s; stamina regenerates 0.14/s.
- Out of breath below 0.15, recovered at 0.5, 70% speed while out of breath.
- Jump speed 4.4 with gravity 14. You must be 0.3 m up to clear a log.
- Chaser speed is `base × (0.94 + min(diff,1) × 0.14)`.
- Difficulty curve: `world.difficulty(d)`, plus the extra +0.35 from 1750 m.
- **Level 2** (top of drive.js): truck cruise speed 17 → 26 m/s over the level (about 7-8 minutes for 9000 m), picks up speed at 4.2 m/s², steering 0.34 × speed sideways at full lock. The chaser runs at 0.95 × cruise. Start gap ~14 (after the start scene), max 30. Damage numbers are listed above. Road bends: `highway.js` `genRow`.

**Debug helpers:** `window.__game` in the browser console, e.g.:
- `setGap(v)` and `player.d = 1990` to teleport
- `escape()`, `endless()`, `state()`, `carT()`, `introT()`, `logAhead()`, `places()`, `jump()`
- Level 2: `level2()` (straight into driving), `freeze(true/false)` (pause on the current frame, for screenshots), `drive.truck`, `drive.debug.gap(v)`, `.lunge(side)` (0 behind, -1 your door, 1 the other), `.damage(v)`, `.deer()`, `.splash()`, `.blackout()`, `.end()` (jump to near 9000 m), `.now()`, `.deerState()`, `cab.crack(p)`, `cab.dent(p)`, `cab.wipe(n)`, `hw.centerAt(d)`

---

## 7. Gotchas learned the hard way

- **Camera far plane is 40 m** in the forest (60 m on the highway). Anything farther isn't drawn. Far glows must use `Geo.placeGlow`.
- **Function names clash in game.js** (one big closure). A `shake()` helper once broke the whole game because `shake` was already a variable. Check names before adding.
- **Eyes on the monster face** z-fought at distance. They sit slightly in front, with `polygonOffset`.
- Big flat meshes need subdivisions, or vertex lighting makes them black or wrong.
- **Lights:** adding or removing lights at runtime forces shader recompiles (stutter). Create all lights up front and change their `intensity` instead (truck dome, headlights).
- **Audio** only starts after the first tap (a browser rule). The first view of the start screen is silent; this is expected.
- **The path must always stay open.** Anything new placed in the forest must respect `free()`, `isReserved()` and the log row, and must not trap the player.
- **The jump trigger** is joystick-up crossing 0.6, re-armed below 0.3. Don't go back to speed-based flick detection.
- **Level 2 moves objects between parents** (`finish.car` into `hw.root`, `body` into the truck). Anything that needs a world position (the far glows, the fire's loudness) must use `getWorldPosition`, not `body.position`.
- **The mirror** renders into a texture; hide the mirror itself while rendering it, or WebGL complains about a feedback loop. The mirror's picture is flipped in its UVs.
- **Hands outside the truck:** hide them (`cab.showHands(false)`) when the truck is seen from outside (the level card picture).
- **Monster modes:** use `setModeOnce` when calling every frame (`setMode` restarts the stop-motion timer, so calling it every frame makes it move smoothly).
- **The wet-glass blur** is a CSS `backdrop-filter` on `#wet`, clipped to the windscreen's screen polygon above the dashboard. It blurs the canvas behind it, so keep the polygon off the wheel and hands.
- **Testing in headless Chromium is slow** (software WebGL): the game clock runs slower than real time, so wait for game conditions (`state()`, `drive.debug.now()`), then `freeze(true)` to take the screenshot on that exact frame. A small "test driver" that sets `__game.stick.x` towards `hw.centerAt(d + 12) + 1.8` keeps the truck on the road.

---

## 8. Open items and ideas

- **The last 250 m difficulty** (Level 1) was played by the owner: it feels fine, leave it.
- **Level 2 has not been played by the owner yet.** Ask how it feels: speed, how hard the brake/stall is, how often deer and lunges come, how much damage things do, how big the mirror is, whether the wet-glass blur is too much.
- **The end of The Highway is a placeholder** (fade to black). The owner will decide where the highway leads; that also decides Level 3. Ideas offered earlier: a collapsed bridge with a boat below (a new vehicle each level), running out of fuel at an abandoned gas station, a crash blocking a tunnel.
- **More obstacles and difficulties for Level 2** were requested "later, not now" by the owner.
- **No endless mode for Level 2** yet.
- **Level 3 doesn't exist.** Its card says "Reach 9000 m on The Highway to unlock" / "Coming soon". A new level needs: its own world and finish, a menu scene (continuing from where the last level ended), a card picture, unlock wiring, and the next card's unlock text.
- **Offered but not requested:**
  - a tap-to-toggle sprint for one-handed play
  - hiding the monster's faint body at the camp so only the eyes show
- **Putting it online:** GitHub Pages on the branch gives a phone link (see README).
- **Nothing else is left over:** the only branch is the working branch, and no play pages (Artifacts) are published right now. Earlier test copies (a branch "1800" that started runs at 1800 m, and its play page) were removed on request; the owner deletes the branch on GitHub themselves.

---

## 9. How to work on it (for the developer/Claude)

- **Branch:** `claude/endless-runner-single-hand-hnwafr`. Commit with clear messages describing what the player gets, then push.
- **Test copies:** the owner sometimes asks for a test branch (for example, starting a run at 1800 m). Make it from the working branch, push it, and switch back. The session **cannot delete branches on GitHub** (the push is cut off), so when they want it gone, delete it locally and tell them to delete it on GitHub.
- **No build step.** Edit the files and reload the browser.
- **Match the code style:**
  - plain ES5/ES6 inside IIFEs that export one global (`window.World`, `window.Sfx`, …)
  - 2-space indent, single quotes
  - short comments written in plain English from the player's point of view
- **Build big features in steps** (the owner liked this for Level 2): a short plan first, then build step by step, committing, pushing and sending screenshots after each step.
- **Test every change in headless Chromium** (Playwright is installed globally at `/opt/node22/lib/node_modules/playwright`; Chromium is at `/opt/pw-browsers`; open `file:///home/user/behind-you/index.html`):
  - Launch with `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` at a phone viewport (about 400×820, `hasTouch`).
  - Check for `pageerror` events, drive the game with `window.__game`, and take screenshots.
  - The screenshots are dark, so brighten them for viewing and combine them into one grid image to send to the owner.
  - Use the browser's multi-touch (CDP `Input.dispatchTouchEvent`) to test the joystick and FASTER button together.
  - Clear or set `localStorage` first to test as a new player (`behindyou.escaped` = `1` unlocks Level 2, `behindyou.lastLevel` = `2` opens on its menu).
  - Also check Level 1 after changing shared things (the truck in `finish.js`, the monster, `game.js`): the escape scene and the endless start use the same truck.
- **Showing a playable build in chat:** publish the page as an Artifact. The page file is a `<title>`, a `<link rel="stylesheet" href="css/style.css">`, and the `<body>` of index.html; pass every `css/`, `lib/` and `js/` file as supporting files at the same paths. Each play page keeps its own saved progress (separate from the owner's phone). The owner asks to delete old play pages when done.
- Keep `README.md` updated (how to play and the file list) when controls or files change.
