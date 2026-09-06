import { US_STATE_CODES } from "./us-states";

export type AddressSnapshot = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

// Parse an optional address snapshot from untrusted input.
// Rules: all four fields provided together, or none at all; state must be a
// valid US code (normalized to uppercase). Returns { address: null } when
// the block was left entirely blank — that's valid, not an error.
export function parseAddressSnapshot(
  raw: { street: unknown; city: unknown; state: unknown; zip: unknown },
  label: string
): { address: AddressSnapshot | null; error: string | null } {
  const street = typeof raw.street === "string" ? raw.street.trim() : "";
  const city = typeof raw.city === "string" ? raw.city.trim() : "";
  const state =
    typeof raw.state === "string" ? raw.state.trim().toUpperCase() : "";
  const zip = typeof raw.zip === "string" ? raw.zip.trim() : "";

  const filled = [street, city, state, zip].filter(Boolean).length;
  if (filled === 0) {
    return { address: null, error: null };
  }
  if (filled < 4) {
    return {
      address: null,
      error: `${label} address must be complete (street, city, state, and zip) or left entirely blank`,
    };
  }
  if (!US_STATE_CODES.includes(state)) {
    return {
      address: null,
      error: `${label} state must be a valid US state code (e.g. MI)`,
    };
  }
  return {
    address: {
      street: street.slice(0, 200),
      city: city.slice(0, 100),
      state,
      zip: zip.slice(0, 20),
    },
    error: null,
  };
}
