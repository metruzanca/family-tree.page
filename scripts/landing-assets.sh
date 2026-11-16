#!/usr/bin/env bash
# Regenerate the public landing page assets.
#
# Portraits come from DiceBear's Avataaars style, which is free for personal and
# commercial use. Photography comes from StockSnap.io under CC0. Both are
# downloaded once and committed, so the landing page never depends on a remote
# service at runtime.
#
# Requires curl and ffmpeg.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
people="$root/public/landing/people"
media="$root/public/landing/media"
ua="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

mkdir -p "$people" "$media/full" "$media/thumbs"

portrait() {
  local name="$1"
  shift
  curl -fsS "https://api.dicebear.com/9.x/avataaars/png?size=256&backgroundColor=efe8da&radius=0&topProbability=100&accessoriesProbability=0&$*" \
    -o "$people/$name.png"
}

portrait charles \
  "seed=charles-britannia&top=shortWaved&hairColor=e8e1e1&facialHair=beardMajestic&facialHairColor=e8e1e1&facialHairProbability=100&mouth=serious&eyebrows=angryNatural&eyes=squint&clothing=blazerAndShirt&clothesColor=262e33&skinColor=ffdbb4"
portrait marianne \
  "seed=marianne-britannia&top=bun&hairColor=2c1b18&facialHairProbability=0&mouth=serious&eyes=default&clothing=blazerAndSweater&clothesColor=25557c&skinColor=edb98a"
portrait gabrielle \
  "seed=gabrielle-britannia&top=straight01&hairColor=b58143&facialHairProbability=0&mouth=default&eyes=default&clothing=shirtVNeck&clothesColor=ffafb9&skinColor=edb98a"
portrait helena \
  "seed=helena-britannia&top=longButNotTooLong&hairColor=724133&facialHairProbability=0&mouth=serious&eyes=default&clothing=collarAndSweater&clothesColor=929598&skinColor=ffdbb4"
portrait elise \
  "seed=elise-britannia&top=straight01&hairColor=d6b370&facialHairProbability=0&mouth=default&eyes=default&clothing=blazerAndSweater&clothesColor=3c4f5c&skinColor=edb98a"
portrait lelouch \
  "seed=lelouch-britannia&top=shortFlat&hairColor=2c1b18&facialHairProbability=0&mouth=serious&eyebrows=defaultNatural&eyes=squint&clothing=blazerAndShirt&clothesColor=262e33&skinColor=ffdbb4"
portrait nunnally \
  "seed=nunnally-britannia&top=longButNotTooLong&hairColor=724133&facialHairProbability=0&mouth=smile&eyes=happy&clothing=shirtScoopNeck&clothesColor=ffffb1&skinColor=ffdbb4"
portrait schneizel \
  "seed=schneizel-britannia&top=shortRound&hairColor=d6b370&facialHairProbability=0&mouth=smile&eyes=default&clothing=blazerAndShirt&clothesColor=929598&skinColor=ffdbb4"
portrait cornelia \
  "seed=cornelia-britannia&top=longButNotTooLong&hairColor=8e6bbf&facialHairProbability=0&mouth=serious&eyebrows=angryNatural&eyes=squint&clothing=blazerAndShirt&clothesColor=25557c&skinColor=edb98a"
portrait euphemia \
  "seed=euphemia-britannia&top=bigHair&hairColor=f59797&facialHairProbability=0&mouth=smile&eyes=happy&clothing=shirtScoopNeck&clothesColor=ffafb9&skinColor=ffdbb4"
portrait clovis \
  "seed=clovis-britannia&top=shortRound&hairColor=d6b370&facialHairProbability=0&mouth=smile&eyes=happy&clothing=blazerAndShirt&clothesColor=ff5c5c&skinColor=ffdbb4"

photo() {
  local name="$1"
  local id="$2"
  curl -fsS -A "$ua" -e "https://stocksnap.io/" \
    "https://cdn.stocksnap.io/img-thumbs/960w/$id.jpg" -o "$media/full/$name.jpg"
  ffmpeg -y -loglevel error -i "$media/full/$name.jpg" \
    -vf "scale='min(1200,iw)':-2" -q:v 4 "$media/full/$name.jpg"
  ffmpeg -y -loglevel error -i "$media/full/$name.jpg" \
    -vf "scale='min(360,iw)':-2" -q:v 5 "$media/thumbs/$name.jpg"
}

photo palace landmark-palace_KW0QIAHMX6
photo villa architecture-building_6BABBXE2NS
photo letter invitation-envelope_RMT4LVPJYN
photo court-1 chandelier-lights_05BB381DFF
photo court-2 chandelier-lights_EUIHJKBD30
photo court-3 chandelier-light_SW2R0I0NZN

echo "Landing assets written to public/landing."
