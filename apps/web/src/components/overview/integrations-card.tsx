import { Mail, Puzzle } from "lucide-react";
import { SectionCard } from "./section-card";

const INTEGRATIONS = [
  {
    name: "Gmail",
    description:
      "Finds confirmations, interviews and rejections in your inbox.",
    icon: <Mail aria-hidden="true" />,
  },
  {
    name: "Chrome extension",
    description: "Captures applications as you submit them.",
    icon: <Puzzle aria-hidden="true" />,
  },
];

/** Where automatic updates come from, and whether each source is connected. */
export function IntegrationsCard() {
  return (
    <SectionCard id="integrations" title="Integrations">
      <ul className="flex flex-col divide-y">
        {INTEGRATIONS.map((integration) => (
          <li
            key={integration.name}
            className="flex items-start gap-3 py-2.5 first:pt-1 last:pb-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
              {integration.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{integration.name}</p>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-status-neutral"
                  />
                  Coming soon
                </span>
              </div>
              <p className="text-[0.8125rem] text-muted-foreground">
                {integration.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
