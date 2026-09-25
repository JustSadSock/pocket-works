export type Player = { id: string; name: string };
export type RoomInput<State = unknown> = { state: State; player: Player; players: Player[]; payload: unknown };
export type GameEvent = { type: string; payload?: unknown; to?: string };
export type RoomOutput<State = unknown> = { state: State; events?: GameEvent[]; finished?: boolean };
export type PocketModule<State = unknown> = {
  protocolVersion: 1;
  createRoom(input: Omit<RoomInput<State>, 'state'>): RoomOutput<State> | Promise<RoomOutput<State>>;
  onMessage(input: RoomInput<State>): RoomOutput<State> | Promise<RoomOutput<State>>;
  onJoin?(input: RoomInput<State>): RoomOutput<State> | Promise<RoomOutput<State>>;
  onLeave?(input: RoomInput<State>): RoomOutput<State> | Promise<RoomOutput<State>>;
};
