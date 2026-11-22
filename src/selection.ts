export interface PickerState {
  pool: string[];
  index: number;
  accepted: string[];
  round: number;
  result: "picking" | "next" | "all" | "empty" | "winner";
}
export function startPicker(ids: string[], round = 1): PickerState {
  return {
    pool: ids,
    index: 0,
    accepted: [],
    round,
    result:
      ids.length === 0 ? "empty" : ids.length === 1 ? "winner" : "picking",
  };
}
export function vote(state: PickerState, yes: boolean): PickerState {
  if (state.result !== "picking") return state;
  const accepted = yes
    ? [...state.accepted, state.pool[state.index]]
    : state.accepted;
  const index = state.index + 1;
  const result =
    index < state.pool.length
      ? "picking"
      : accepted.length === 0
        ? "empty"
        : accepted.length === 1
          ? "winner"
          : accepted.length === state.pool.length
            ? "all"
            : "next";
  return { ...state, index, accepted, result };
}
export function winnerId(state: PickerState) {
  return state.accepted[0] ?? state.pool[0];
}
export function randomWinner(ids: string[], random = Math.random): PickerState {
  if (ids.length < 2) return startPicker(ids);
  return startPicker([ids[Math.floor(random() * ids.length)]]);
}
