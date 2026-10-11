"use client";

import { GitBranch, Github, House, Linkedin, type LucideIcon } from "lucide-react";

import { DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface UserMenuLink {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

export const USER_MENU_LINKS: ReadonlyArray<UserMenuLink> = [
  { label: "Eric Personal Homepage", href: "https://onlineeric.net/", icon: House },
  {
    label: "Speedy Git (VSCode)",
    href: "https://marketplace.visualstudio.com/items?itemName=onlineeric.speedy-git-ext",
    icon: GitBranch,
  },
  {
    label: "Speedy Git (Cursor & Other IDE)",
    href: "https://open-vsx.org/extension/onlineeric/speedy-git-ext",
    icon: GitBranch,
  },
  { label: "Eric Github", href: "https://github.com/onlineeric", icon: Github },
  { label: "Eric LinkedIn", href: "https://www.linkedin.com/in/onlineeric", icon: Linkedin },
];

/** External links shared by the sidebar user menu and the header account switcher; each opens in a new tab. */
export function UserMenuLinks() {
  return (
    <DropdownMenuGroup>
      {USER_MENU_LINKS.map(({ label, href, icon: Icon }) => (
        <DropdownMenuItem key={href} asChild>
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Icon />
            {label}
          </a>
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}
