/** Shared by the server layout (which reads the cookie) and the client (which writes it). */

export const MODES = ['system', 'dark', 'light'] as const;
export type ModePref = (typeof MODES)[number];

/** Until someone chooses: dark. "system" is opt-in. */
export const DEFAULT_MODE: ModePref = 'dark';

/** Holds the mode so the server renders the right theme on the first byte. */
export const MODE_COOKIE = 'mode';

export const PAPER = { dark: '#0f1115', light: '#f2ede3' } as const;

/** A cookie or stored value as a mode; anything else is the default. */
export function parseModePref(value: string | null | undefined): ModePref {
  return MODES.includes(value as ModePref) ? (value as ModePref) : DEFAULT_MODE;
}
