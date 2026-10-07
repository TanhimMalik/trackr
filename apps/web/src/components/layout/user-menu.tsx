"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { signOut } from "@/server/auth/actions";
import { themeOptions } from "./theme-options";

export function UserMenu({
  user,
}: {
  user: { name: string | null; email: string };
}) {
  const { theme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();
  const displayName = user.name ?? user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5">
          <Avatar size="sm">
            <AvatarFallback className="text-xs font-medium">
              {initials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate font-medium sm:inline">
            {user.name ?? user.email}
          </span>
          <span className="sr-only">Open account menu</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          {user.name && <p className="truncate font-medium">{user.name}</p>}
          <p className="truncate text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={() => startSignOut(() => signOut())}
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
