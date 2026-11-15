const palette = [
  ["#2f4a3a", "#e7efe2"],
  ["#8c5a3c", "#f7e9dd"],
  ["#54627a", "#e6ebf3"],
  ["#7b4b63", "#f4e5ed"],
  ["#6d6535", "#f3efd8"],
  ["#3f6360", "#e0f0ec"],
] as const;

function hash(name: string) {
  let value = 0;
  for (let index = 0; index < name.length; index += 1) {
    value = (value * 31 + name.charCodeAt(index)) >>> 0;
  }
  return value;
}

/** Foreground and background colors for a person's initials avatar. */
export function avatarColors(name: string): readonly [string, string] {
  return palette[hash(name) % palette.length];
}
