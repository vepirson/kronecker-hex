// Helpers shared by every kind of construction for its stream of events: run a construction generator to its end,
// hand its events over in batches, copy an event without some fields, and write an event as JSON.

const now = () => globalThis.performance.now();

// collectEvents(gen) runs a construction generator to its end and returns { events, result } (result null after
// an error event).
export function collectEvents(gen) {
  const events = [];
  for (;;) {
    const r = gen.next();
    if (r.done) return { events, result: r.value };
    events.push(r.value);
  }
}

// drain(it) runs a generator to its end, ignoring what it yields, and returns its return value.
export function drain(it) {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

// postInBatches(gen, post, { maxEvents, maxMs, id }) runs a construction generator and hands its events to post in
// batches { id, events } (a batch is sent after maxEvents events, after maxMs milliseconds, and right after the
// rowTarget of a row with more than 20 sign cells, before its long solve starts), then { id, finished: true,
// result } (result null after an error event). Returns the result. An exception of the generator is thrown again
// after the events seen so far are sent.
export function postInBatches(gen, post, { maxEvents = 200, maxMs = 50, id = null } = {}) {
  let batch = [];
  let last = now();
  const flush = () => {
    if (batch.length) post({ id, events: batch });
    batch = [];
    last = now();
  };
  let r;
  try {
    for (;;) {
      r = gen.next();
      if (r.done) break;
      const ev = r.value;
      batch.push(ev);
      if (batch.length >= maxEvents || now() - last >= maxMs || (ev.type === "rowTarget" && ev.cells.length > 20)) flush();
    }
  } catch (e) {
    flush();
    throw e;
  }
  flush();
  post({ id, finished: true, result: r.value });
  return r.value;
}

// withoutFields(ev, fields) returns a shallow copy of the event without the keys in the Set fields.
export function withoutFields(ev, fields) {
  const copy = {};
  for (const key of Object.keys(ev)) if (!fields.has(key)) copy[key] = ev[key];
  return copy;
}

function toJSONValue(v) {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(toJSONValue);
  if (v !== null && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = toJSONValue(v[k]);
    return o;
  }
  return v;
}

// eventToJSON(e) returns a copy of an event (or any value) with every bigint written as a decimal string.
export function eventToJSON(e) {
  return toJSONValue(e);
}
