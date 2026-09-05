// ---------------------------------------------------------------------------
// A PASSWORD SOMEBODY HAS TO READ OUT AND SOMEBODY ELSE HAS TO TYPE.
//
// An administrator resets a forgotten password and then passes the new one on —
// over the phone, in a message, across a desk. So the alphabet leaves out every
// character that is ambiguous when spoken or read:
//
//   0 O o   1 l I   5 S s   2 Z z   8 B
//
// and it is grouped in fours, because "Kfhq - Rmxt - Qbwd" is repeatable and
// "Kfhqrmxtqbwd" is not. The dashes are part of the password.
//
// RANDOMNESS COMES FROM `crypto.getRandomValues`, not Math.random, and bytes
// that would skew the distribution are thrown away rather than folded in with a
// modulo. This is the one thing here that has to be right: the whole point is
// that the next password cannot be guessed from the last one.
//
// 12 characters from a 49-symbol alphabet is about 67 bits. The database
// refuses anything under 10 (0110), which this clears with room to spare.
// ---------------------------------------------------------------------------

// No 0/O/o, 1/l/I, 5/S/s, 2/Z/z, 8/B — see above.
const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXYacdefghjkmnpqrtuvwxy34679';

const GROUP = 4;
const GROUPS = 3;

/** A new random password: three groups of four, dash-separated. */
export function generatePassword(): string {
  const need = GROUP * GROUPS;
  const out: string[] = [];
  // Rejection sampling: 256 is not a multiple of the alphabet length, so the
  // last, partial run of values would make some letters likelier than others.
  // Those bytes are discarded instead.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (out.length < need) {
    const buf = new Uint8Array(need * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= limit) continue;
      out.push(ALPHABET[b % ALPHABET.length]);
      if (out.length === need) break;
    }
  }
  return [out.slice(0, 4).join(''), out.slice(4, 8).join(''), out.slice(8, 12).join('')].join('-');
}

/** The characters a generated password can contain — the check pins this. */
export const PASSWORD_ALPHABET = ALPHABET;
