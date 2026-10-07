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
import { exitDemo } from "@/server/auth/demo";
import { themeOptions } from "./theme-options";

export function UserMenu({
  user,
}: {
  user: { name: string | null; email: string | null; isDemo: boolean };
}) {
  const { theme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();
  const displayName = user.name ?? user.email ?? "Demo account";

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
            {displayName}
          </span>
          <span className="sr-only">Open account menu</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          {user.isDemo ? (
            <>
              <p className="font-medium">Demo workspace</p>
              <p className="text-muted-foreground">
                Sample data, private to you
              </p>
            </>
          ) : (
            <>
              {user.name && <p className="truncate font-medium">{user.name}</p>}
              <p className="truncate text-muted-foreground">{user.email}</p>
            </>
          )}
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
          onSelect={() =>
            startSignOut(() => (user.isDemo ? exitDemo() : signOut()))
          }
        >
          <LogOut />
          {signingOut
            ? user.isDemo
              ? "Ending demo…"
              : "Signing out…"
            : user.isDemo
              ? "End demo"
              : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
