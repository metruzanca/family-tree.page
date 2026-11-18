import { For, Show, createMemo } from "solid-js";
import type { PresencePeer, PresenceStatus } from "~/lib/presence-protocol";
import { presenceColor } from "~/lib/presence-color";
import { useI18n } from "~/i18n/LocaleProvider";
import { Avatar } from "~/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

type PresenceUser = {
  userId: string;
  displayName: string;
  nodeId: string | null;
  self: boolean;
  tabs: number;
};

type PresenceBarProps = {
  status: PresenceStatus;
  peers: PresencePeer[];
  selfPeerId: string | null;
  resolveNode: (nodeId: string | null) => string | null;
};

export function PresenceBar(props: PresenceBarProps) {
  const { t } = useI18n();
  const users = createMemo<PresenceUser[]>(() => {
    const map = new Map<string, PresenceUser>();
    for (const peer of props.peers) {
      const existing = map.get(peer.userId);
      if (!existing) {
        map.set(peer.userId, {
          userId: peer.userId,
          displayName: peer.displayName,
          nodeId: peer.nodeId,
          self: peer.peerId === props.selfPeerId,
          tabs: 1,
        });
        continue;
      }
      existing.tabs += 1;
      existing.self = existing.self || peer.peerId === props.selfPeerId;
      if (!existing.nodeId) existing.nodeId = peer.nodeId;
    }
    return [...map.values()].sort(
      (a, b) => Number(b.self) - Number(a.self) || a.displayName.localeCompare(b.displayName),
    );
  });

  const otherUsers = createMemo(() => users().filter(user => !user.self));
  const visible = () => props.status !== "online" || otherUsers().length > 0;

  return (
    <Show when={visible()}>
      <DropdownMenu placement="bottom-start">
        <DropdownMenuTrigger
          class="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-2 text-white/75 backdrop-blur-md transition hover:bg-black/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label={t("presence.peopleViewing")}
          data-testid="presence-bar"
        >
          <span class="flex -space-x-1.5">
            <For each={users().slice(0, 3)}>
              {user => (
                <span
                  class="inline-flex rounded-full"
                  style={{ "box-shadow": `0 0 0 2px ${presenceColor(user.userId)}` }}
                >
                  <Avatar name={user.displayName} size={24} />
                </span>
              )}
            </For>
          </span>
          <span class="hidden text-xs font-medium sm:inline">
            {props.status === "online"
              ? t("presence.viewing", { count: users().length })
              : t("presence.reconnecting")}
          </span>
          <span
            class={`h-1.5 w-1.5 rounded-full ${
              props.status === "online" ? "bg-[#8fa98f]" : "animate-pulse bg-gold"
            }`}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-64 rounded-2xl border-white/10 bg-[#161b14] p-1.5 text-white/80">
          <div class="px-3 py-1.5 text-[0.65rem] uppercase tracking-wide text-white/40">
            {otherUsers().length
              ? t("presence.viewingCount", { count: users().length })
              : t("presence.onlyYou")}
          </div>
          <For each={users()}>
            {user => (
              <div
                class="flex items-center gap-2 rounded-xl px-3 py-2"
                data-testid={`presence-user-${user.userId}`}
              >
                <span
                  class="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ "background-color": presenceColor(user.userId) }}
                />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-xs font-semibold text-white/85">
                    {user.displayName}
                    <Show when={user.self}>
                      <span class="font-normal text-white/40"> {t("presence.you")}</span>
                    </Show>
                  </div>
                  <div class="truncate text-[0.65rem] text-white/45">
                    {props.resolveNode(user.nodeId) ?? t("presence.viewingTree")}
                  </div>
                </div>
                <Show when={user.tabs > 1}>
                  <span class="shrink-0 text-[0.6rem] text-white/35">
                    {t("presence.tabs", { count: user.tabs })}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  );
}
