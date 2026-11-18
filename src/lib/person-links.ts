import { translate, type Locale } from "../i18n";
import {
  SIMPLE_ICONS,
  type SimpleIcon,
} from "./simple-icons.generated";

export const MAX_PERSON_LINKS = 12;
export const MAX_PERSON_LINK_URL_LENGTH = 2048;

/** A link a person chose to share on their profile. */
export type PersonLink = {
  url: string;
  /** The one personal website that gets a house instead of a globe. */
  isHome: boolean;
};

export type ResolvedPersonLink =
  | { kind: "home"; label: string }
  | { kind: "brand"; label: string; slug: string; icon: SimpleIcon }
  | { kind: "globe"; label: string };

type BrandRule = {
  label: string;
  /** Missing for brands that Simple Icons no longer ships. */
  slug?: string;
  domains?: string[];
  matches?: (host: string, pathname: string) => boolean;
};

const BRAND_RULES: BrandRule[] = [
  { label: "Instagram", slug: "instagram", domains: ["instagram.com", "instagr.am"] },
  { label: "Facebook", slug: "facebook", domains: ["facebook.com", "fb.com", "fb.me"] },
  { label: "X", slug: "x", domains: ["x.com", "twitter.com"] },
  { label: "LinkedIn", domains: ["linkedin.com", "lnkd.in"] },
  { label: "TikTok", slug: "tiktok", domains: ["tiktok.com"] },
  { label: "Snapchat", slug: "snapchat", domains: ["snapchat.com"] },
  {
    label: "Pinterest",
    slug: "pinterest",
    domains: ["pinterest.com"],
    matches: host => host.split(".")[0] === "pinterest",
  },
  { label: "Reddit", slug: "reddit", domains: ["reddit.com", "redd.it"] },
  { label: "Tumblr", slug: "tumblr", domains: ["tumblr.com"] },
  { label: "Threads", slug: "threads", domains: ["threads.net", "threads.com"] },
  { label: "Bluesky", slug: "bluesky", domains: ["bsky.app", "bsky.social"] },
  {
    label: "Mastodon",
    slug: "mastodon",
    domains: [
      "mastodon.social",
      "mastodon.online",
      "mstdn.social",
      "fosstodon.org",
      "hachyderm.io",
      "social.coop",
    ],
    matches: host => host.includes("mastodon") || host.startsWith("mstdn."),
  },
  { label: "YouTube", slug: "youtube", domains: ["youtube.com", "youtu.be"] },
  { label: "Vimeo", slug: "vimeo", domains: ["vimeo.com"] },
  { label: "Twitch", slug: "twitch", domains: ["twitch.tv"] },
  { label: "Spotify", slug: "spotify", domains: ["spotify.com", "spotify.link"] },
  { label: "SoundCloud", slug: "soundcloud", domains: ["soundcloud.com"] },
  { label: "Bandcamp", slug: "bandcamp", domains: ["bandcamp.com"] },
  { label: "Substack", slug: "substack", domains: ["substack.com"] },
  { label: "Medium", slug: "medium", domains: ["medium.com"] },
  { label: "Blogger", slug: "blogger", domains: ["blogger.com", "blogspot.com"] },
  { label: "WordPress", slug: "wordpress", domains: ["wordpress.com", "wordpress.org"] },
  { label: "Notion", slug: "notion", domains: ["notion.so", "notion.site"] },
  { label: "Linktree", slug: "linktree", domains: ["linktr.ee"] },
  { label: "About.me", slug: "aboutdotme", domains: ["about.me"] },
  { label: "Ko-fi", slug: "kofi", domains: ["ko-fi.com"] },
  { label: "Buy Me a Coffee", slug: "buymeacoffee", domains: ["buymeacoffee.com"] },
  { label: "Patreon", slug: "patreon", domains: ["patreon.com"] },
  { label: "Etsy", slug: "etsy", domains: ["etsy.com"] },
  { label: "eBay", slug: "ebay", matches: host => host.split(".")[0] === "ebay" },
  { label: "Vinted", slug: "vinted", matches: host => host.split(".")[0] === "vinted" },
  { label: "Depop", domains: ["depop.com"] },
  { label: "Poshmark", domains: ["poshmark.com"] },
  { label: "Goodreads", slug: "goodreads", domains: ["goodreads.com"] },
  { label: "Letterboxd", slug: "letterboxd", domains: ["letterboxd.com"] },
  { label: "Trakt", slug: "trakt", domains: ["trakt.tv"] },
  { label: "Last.fm", slug: "lastdotfm", domains: ["last.fm", "lastfm.com"] },
  { label: "Strava", slug: "strava", domains: ["strava.com"] },
  { label: "AllTrails", slug: "alltrails", domains: ["alltrails.com"] },
  { label: "Garmin", slug: "garmin", domains: ["garmin.com"] },
  { label: "Untappd", slug: "untappd", domains: ["untappd.com"] },
  { label: "Steam", slug: "steam", domains: ["steamcommunity.com", "steampowered.com"] },
  { label: "PlayStation", slug: "playstation", domains: ["playstation.com"] },
  { label: "Xbox", domains: ["xbox.com"] },
  { label: "Nintendo", domains: ["nintendo.com"] },
  { label: "Roblox", slug: "roblox", domains: ["roblox.com"] },
  { label: "Epic Games", slug: "epicgames", domains: ["epicgames.com"] },
  { label: "GitHub", slug: "github", domains: ["github.com", "github.io"] },
  { label: "GitLab", slug: "gitlab", domains: ["gitlab.com"] },
  { label: "Codeberg", slug: "codeberg", domains: ["codeberg.org"] },
  { label: "Stack Overflow", slug: "stackoverflow", domains: ["stackoverflow.com"] },
  { label: "CodePen", domains: ["codepen.io"] },
  { label: "Kaggle", slug: "kaggle", domains: ["kaggle.com"] },
  { label: "Figma", slug: "figma", domains: ["figma.com"] },
  { label: "Behance", slug: "behance", domains: ["behance.net"] },
  { label: "Dribbble", slug: "dribbble", domains: ["dribbble.com"] },
  { label: "ArtStation", slug: "artstation", domains: ["artstation.com"] },
  { label: "DeviantArt", slug: "deviantart", domains: ["deviantart.com"] },
  { label: "500px", slug: "500px", domains: ["500px.com"] },
  { label: "VSCO", slug: "vsco", domains: ["vsco.co"] },
  { label: "Flickr", slug: "flickr", domains: ["flickr.com"] },
  { label: "BeReal", slug: "bereal", domains: ["bere.al", "bereal.com"] },
  { label: "Clubhouse", slug: "clubhouse", domains: ["clubhouse.com", "joinclubhouse.com"] },
  { label: "Signal", slug: "signal", domains: ["signal.me", "signal.org", "signal.group"] },
  { label: "Telegram", slug: "telegram", domains: ["t.me", "telegram.me", "telegram.org"] },
  { label: "WhatsApp", slug: "whatsapp", domains: ["wa.me", "whatsapp.com"] },
  { label: "Discord", slug: "discord", domains: ["discord.com", "discord.gg", "discordapp.com"] },
  { label: "Matrix", slug: "matrix", domains: ["matrix.to", "matrix.org"] },
  { label: "Venmo", slug: "venmo", domains: ["venmo.com"] },
  { label: "Cash App", slug: "cashapp", domains: ["cash.app", "cashapp.com"] },
  { label: "PayPal", slug: "paypal", domains: ["paypal.com", "paypal.me"] },
  { label: "Meetup", slug: "meetup", domains: ["meetup.com"] },
  { label: "Nextdoor", slug: "nextdoor", domains: ["nextdoor.com"] },
  { label: "Duolingo", slug: "duolingo", domains: ["duolingo.com"] },
  { label: "MyAnimeList", slug: "myanimelist", domains: ["myanimelist.net"] },
  { label: "AniList", slug: "anilist", domains: ["anilist.co"] },
  { label: "ResearchGate", slug: "researchgate", domains: ["researchgate.net"] },
  { label: "ORCID", slug: "orcid", domains: ["orcid.org"] },
  { label: "Google Scholar", slug: "googlescholar", domains: ["scholar.google.com"] },
  { label: "Academia.edu", slug: "academia", domains: ["academia.edu"] },
  { label: "QQ", slug: "qq", domains: ["qq.com"] },
  { label: "VK", slug: "vk", domains: ["vk.com", "vk.ru"] },
  { label: "LINE", slug: "line", domains: ["line.me", "line.naver.jp"] },
  { label: "Naver", slug: "naver", domains: ["naver.com", "naver.me"] },
  { label: "KakaoTalk", slug: "kakaotalk", domains: ["kakao.com"] },
  { label: "WeChat", slug: "wechat", domains: ["wechat.com", "weixin.qq.com"] },
  { label: "Weibo", domains: ["weibo.com"] },
  { label: "XING", slug: "xing", domains: ["xing.com"] },
  {
    label: "PeerTube",
    slug: "peertube",
    domains: ["joinpeertube.org"],
    matches: host => host.includes("peertube"),
  },
  {
    label: "Lemmy",
    slug: "lemmy",
    domains: ["join-lemmy.org"],
    matches: host => host.includes("lemmy"),
  },
  {
    label: "Pixelfed",
    slug: "pixelfed",
    domains: ["pixelfed.org"],
    matches: host => host.includes("pixelfed"),
  },
];

function safeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_PERSON_LINK_URL_LENGTH) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  if (url.username || url.password) return null;
  return url;
}

/** Adds https:// to bare domains and rejects anything that is not a web URL. */
export function normalizePersonLinkUrl(raw: string): string | null {
  return safeUrl(raw)?.toString() ?? null;
}

function hostOf(url: URL) {
  return url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function matchesDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function findBrandRule(url: URL): BrandRule | undefined {
  const host = hostOf(url);
  const pathname = url.pathname.toLowerCase();
  return BRAND_RULES.find(rule => {
    if (rule.domains?.some(domain => matchesDomain(host, domain))) return true;
    return rule.matches?.(host, pathname) ?? false;
  });
}

/** True only for a personal site that would otherwise show a globe. */
export function canBeHomeLink(raw: string): boolean {
  const url = safeUrl(raw);
  if (!url) return false;
  return !findBrandRule(url);
}

export function personLinkHostname(raw: string): string | null {
  const url = safeUrl(raw);
  return url ? hostOf(url) : null;
}

export function resolvePersonLink(
  raw: string,
  isHome: boolean,
  locale: Locale = "en",
): ResolvedPersonLink {
  const url = safeUrl(raw);
  if (!url) {
    return { kind: "globe", label: translate(locale, "person.links.website") };
  }

  const rule = findBrandRule(url);
  if (isHome && !rule) {
    return {
      kind: "home",
      label: translate(locale, "person.links.personalWebsite"),
    };
  }
  if (rule?.slug) {
    const icon = SIMPLE_ICONS[rule.slug];
    if (icon) {
      return { kind: "brand", label: rule.label, slug: rule.slug, icon };
    }
  }
  return { kind: "globe", label: rule?.label ?? hostOf(url) };
}

export function personLinkLabel(raw: string, isHome: boolean, locale: Locale = "en"): string {
  return resolvePersonLink(raw, isHome, locale).label;
}
