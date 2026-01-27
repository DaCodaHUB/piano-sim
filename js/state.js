export function initState() {
  return {
    a4Hz: 440,
    selectedMidi: 69,
    detuneMap: new Map(),
    importedCurve: null,
    pianoReality: "hidden", // et | hidden | import
    stretch: {
      low: -15,
      high: 35,
      shape: 1.6
    }
  };
}
