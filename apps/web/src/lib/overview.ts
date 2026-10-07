import {
  OVERVIEW_PERIOD_DAYS,
  type CountMetric,
  type RateMetric,
} from "@trackr/domain";

export type Change = {
  direction: "up" | "down" | "flat";
  /** Short text beside the arrow: "71%", "+1", "6 pts". */
  label: string;
  /** The full comparison, for tooltips and screen readers. */
  description: string;
};

const DAYS = OVERVIEW_PERIOD_DAYS;
const direction = (n: number): Change["direction"] =>
  n > 0 ? "up" : n < 0 ? "down" : "flat";

/** The last 30 days compared with the 30 before, in percent. */
export function countChange({ recent, previous, change }: CountMetric): Change {
  if (change === null) {
    return recent === 0
      ? {
          direction: "flat",
          label: "—",
          description: `None in the last ${DAYS} days or the ${DAYS} before`,
        }
      : {
          direction: "up",
          label: `+${recent}`,
          description: `${recent} in the last ${DAYS} days, none in the ${DAYS} before`,
        };
  }
  const percent = Math.round(change * 100);
  if (percent === 0) {
    return {
      direction: "flat",
      label: "0%",
      description: `Same as the previous ${DAYS} days`,
    };
  }
  return {
    direction: direction(percent),
    label: `${Math.abs(percent)}%`,
    description: `${percent > 0 ? "Up" : "Down"} ${Math.abs(percent)}% from ${previous} in the previous ${DAYS} days`,
  };
}

/** The rate now compared with 30 days ago, in percentage points. */
export function rateChange({ change }: RateMetric): Change {
  if (change === null) {
    return {
      direction: "flat",
      label: "—",
      description: `No applications ${DAYS} days ago to compare with`,
    };
  }
  const points = Math.round(change);
  if (points === 0) {
    return {
      direction: "flat",
      label: "0 pts",
      description: `Unchanged from ${DAYS} days ago`,
    };
  }
  const size = Math.abs(points);
  return {
    direction: direction(points),
    label: `${size} ${size === 1 ? "pt" : "pts"}`,
    description: `${points > 0 ? "Up" : "Down"} ${size} percentage ${size === 1 ? "point" : "points"} from ${DAYS} days ago`,
  };
}

/** "24%", or a dash when there is nothing to divide by. */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * An SVG path through the values, scaled from zero to the largest value.
 * Missing values (before there was any data) are skipped.
 */
export function sparklinePath(
  values: readonly (number | null)[],
  {
    width,
    height,
    inset = 1,
  }: { width: number; height: number; inset?: number },
): string | null {
  const points = values.flatMap((value, index) =>
    value === null ? [] : [{ index, value }],
  );
  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => point.value));
  const step =
    values.length > 1 ? (width - inset * 2) / (values.length - 1) : 0;
  const usable = height - inset * 2;
  const round = (n: number) => Math.round(n * 100) / 100;

  const coordinates = points.map(({ index, value }) => {
    const x = inset + index * step;
    const y = inset + usable - (max === 0 ? 0 : (value / max) * usable);
    return `${round(x)} ${round(y)}`;
  });
  // A lone point becomes a dot with round line caps.
  if (coordinates.length === 1) coordinates.push(coordinates[0]!);

  return `M${coordinates.join(" L")}`;
}

/** "Good morning" before noon, "Good afternoon" until 6 pm, then "Good evening". */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}
