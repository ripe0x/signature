// Debug RNG sequence
function seededRandom(seed) {
  let state = Math.abs(seed) || 1;
  let callCount = 0;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    callCount++;
    console.log(`  Call ${callCount}: state=${state}, roll=${state / 0x7fffffff}`);
    return state / 0x7fffffff;
  };
}

console.log("=== Palette for seed 0x7fffffff ===");
const rng1 = seededRandom(0x7fffffff);
let roll = rng1();
console.log(`First roll (mono check): ${roll} < 0.12? ${roll < 0.12}`);
if (roll >= 0.12) {
  roll = rng1();
  console.log(`Second roll (contrast type): ${roll}`);
  if (roll < 0.40) console.log("  -> value");
  else if (roll < 0.68) console.log("  -> temperature");
  else if (roll < 0.90) console.log("  -> complement");
  else console.log("  -> clash");
}

console.log("\n=== Paper Grain for seed 0xdc59ca46 ===");
const rng2 = seededRandom(0xdc59ca46 + 5555);
rng2(); // absorbency
rng2(); // intersectionThreshold (disabled)
const grainRoll = rng2(); // hasAngleAffinity
console.log(`Grain roll: ${grainRoll} < 0.40? ${grainRoll < 0.40}`);
