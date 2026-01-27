# Piano Simulator + Tuner Test Bench

This website is a **simulated piano and calibration test bench** designed to help develop and validate a **piano tuner app**, especially one that supports **stretch tuning**.

It does **not** replace a real acoustic piano.  
Instead, it provides a **controlled, repeatable signal source** so you can test your app’s math, workflow, and UX *before* touching a real instrument.

---

## Why this exists

Building a serious piano tuner without daily access to a grand piano is normal.

This simulator lets you:
- Test **pitch detection accuracy**
- Verify **cents ↔ Hz math**
- Validate **stretch calculation workflows**
- Exercise **ET → stretch tuning transitions**
- Debug UI behavior with **known ground truth**

Think of it as a **calibration bench**, not a piano model.

---

## What this simulator *is*

- A playable **simulated piano** (88 keys, polyphonic)
- A **known‑truth frequency source**
- A **stretch‑tuning test harness**
- A way to simulate:
  - “record some notes”
  - “tune to ET”
  - “tune to calculated stretch”

---

## What this simulator is *not*

- ❌ A physical model of a real piano
- ❌ A replacement for acoustic tuning
- ❌ A perfect representation of inharmonic string behavior

Those are **later‑stage validation problems**.

---

## Project structure

```
piano-sim/
├── index.html        # Website entry point
├── styles.css        # Styling
└── js/
    ├── main.js       # App bootstrap
    ├── state.js      # Shared app state
    ├── tuning.js     # ET + stretch math
    ├── audio.js      # WebAudio engine
    ├── keyboard.js   # Piano keyboard + input
    ├── capture.js    # Capture / measurement sequences
    └── ui.js         # UI logic + debug readouts
```

The structure mirrors a real tuner app:
**state → math → engine → UI**.

---

## Running the site

### Local development
Because ES modules are used, run a local server:

```bash
cd piano-sim
python3 -m http.server 8080
```

Then open:
```
http://localhost:8080
```

### GitHub Pages
This project works directly on **GitHub Pages** (no build step required):

1. Push the repo to GitHub
2. Go to **Settings → Pages**
3. Select `main` branch and `/ (root)` folder
4. Open the generated Pages URL
5. Click **Enable Audio** (required by browser autoplay rules)

---

## Core concepts

### Equal Temperament (ET)
- All tuning starts from ET
- ET is the **zero reference**
- Stretch is always applied **relative to ET**

### Stretch curve
- Represented as **cents per key (88 values)**
- Bass keys are typically flat
- Treble keys are typically sharp
- The simulator can:
  - generate a **hidden truth curve**
  - accept an **imported curve** from your tuner app

---

## Using this to test your tuner app

### 1. Measurement / capture phase
Use the **Capture Sequence** mode.

- Select a preset (e.g. *A’s by octave*)
- Each note is sustained for a fixed duration
- Your app listens and records pitch
- The simulator applies a **hidden stretch curve** as ground truth

You are testing:
- pitch stability
- curve fitting logic
- workflow correctness

---

### 2. Tune to standard pitch (ET)
Switch to **Tune Bench** mode.

- Set **Target = ET**
- Randomly detune a note
- Use your app to guide tuning back to `0¢`

You are testing:
- cents math
- needle behavior
- stability near zero
- octave locking

---

### 3. Tune to calculated stretch
Still in **Tune Bench**:

- Import your app’s `curveCents88` JSON (optional)
- Set **Target = Stretch**
- Detune the note
- Tune to your app’s stretch target

You are testing:
- ET → stretch transitions
- correct application of stretch
- user workflow clarity

---

## Recommended setup

Best results:
- Simulator on a **laptop speaker**
- Tuner app on a **phone**
- Quiet room

Avoid:
- Running both on the same phone
- Heavy reverb or effects
- Excessive volume (AGC can interfere)

---

## Limitations (intentional)

This simulator:
- Uses synthetic waveforms
- Does not model real string stiffness
- Does not generate true inharmonic partials (yet)

If your app fails here, it will fail on a real piano.
If it passes here, you are ready for real‑world refinement.

---

## When to move beyond this

After this simulator:
1. Test on a **digital piano**
2. Test on an **upright piano**
3. Test on a **grand piano**

Each stage exposes different failure modes.

---

## Summary

This project helps answer:
> “Is my tuner app **correct**, **stable**, and **usable**?”

It does not answer:
> “Does this perfectly model a concert grand?”

That distinction is intentional.

---

Use this as a confidence‑building tool before acoustic testing.
