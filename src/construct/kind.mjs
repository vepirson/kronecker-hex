// The one place that decides the kind of a construction: "blue" for colour 0, "sign" for green and red.

// kindOf(input) is "blue" when the colour of the input (of input.replay for a replay) is 0, else "sign". It also
// reads a PackedData or BlueData object, or a start event, by its colour field.
export function kindOf(input) {
  const src = input && typeof input === "object" && input.replay ? input.replay : input;
  return src && typeof src === "object" && src.colour === 0 ? "blue" : "sign";
}
