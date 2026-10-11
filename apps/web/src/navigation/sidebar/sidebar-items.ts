import { Info, LayoutDashboard, type LucideIcon, Mail, Package, Settings, Sparkles } from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  /** Draws attention to the item with an animated shine — reserved for the feature to demo first. */
  highlight?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Main",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Products",
        url: "/dashboard/products",
        icon: Package,
      },
      {
        title: "AI Chat",
        url: "/dashboard/chat",
        icon: Sparkles,
        highlight: true,
      },
      {
        title: "Send Report to Emails",
        url: "/dashboard/send-report",
        icon: Mail,
      },
      {
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
      },
    ],
  },
  {
    id: 2,
    items: [
      {
        title: "About This App",
        url: "/dashboard/about",
        icon: Info,
      },
    ],
  },
];
