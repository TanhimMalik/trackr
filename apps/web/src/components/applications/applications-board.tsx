"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  APPLICATION_STATUS_LABELS,
  BOARD_COLUMNS,
  boardColumnForStatus,
  statusForBoardDrop,
  type ApplicationStatus,
  type BoardColumn,
  type BoardColumnId,
} from "@trackr/domain";
import { GripVertical } from "lucide-react";
import {
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { changeApplicationStatusAction } from "@/app/(app)/applications/actions";
import { cn } from "@/lib/utils";
import { ApplicationCard, type BoardItem } from "./application-card";
import { ApplicationRowActions } from "./application-row-actions";
import { StatusDot } from "./status-badge";
import { withUndo } from "./undo-event";

const columnLabel = (id: unknown) =>
  BOARD_COLUMNS.find((column) => column.id === id)?.label ?? "a column";

// Pointer first for mouse and touch. For keyboard moves, the column the
// card is horizontally inside; columns are full height, so the nearest
// centre can belong to a neighbour.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  const { collisionRect, droppableContainers, droppableRects } = args;
  const centerX = collisionRect.left + collisionRect.width / 2;
  const inside = droppableContainers.filter((container) => {
    const rect = droppableRects.get(container.id);
    return rect && centerX >= rect.left && centerX <= rect.right;
  });
  return inside.length > 0
    ? inside.map((container) => ({ id: container.id }))
    : closestCenter(args);
};

/** Left and right arrows jump to the neighbouring column. */
const columnCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { droppableContainers, droppableRects, collisionRect, over } },
) => {
  if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") return;
  event.preventDefault();
  if (!collisionRect) return;

  const columns = droppableContainers
    .getEnabled()
    .map((container) => ({
      id: container.id,
      rect: droppableRects.get(container.id),
    }))
    .filter((column) => column.rect)
    .sort((a, b) => a.rect!.left - b.rect!.left);
  const index = columns.findIndex((column) => column.id === over?.id);
  const target = columns[index + (event.code === "ArrowRight" ? 1 : -1)];
  if (!target?.rect) return;

  return {
    x: target.rect.left + (target.rect.width - collisionRect.width) / 2,
    y: target.rect.top + 48,
  };
};

function DraggableCard({
  item,
  column,
  hidden,
}: {
  item: BoardItem;
  column: BoardColumn;
  hidden: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } =
    useDraggable({
      id: item.id,
      attributes: { roleDescription: "draggable application" },
    });
  // Mouse and touch drag the whole card; the keyboard drags with a handle of
  // its own, so the card's link and menu aren't nested inside a control.
  const { onKeyDown, ...pointerListeners } = listeners ?? {};

  return (
    <div
      ref={setNodeRef}
      {...pointerListeners}
      className={cn(
        "relative cursor-grab rounded-lg select-none active:cursor-grabbing",
        hidden && "opacity-40",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        onKeyDown={onKeyDown as React.KeyboardEventHandler | undefined}
        aria-label={`Move ${item.companyName}, ${item.jobTitle}, ${APPLICATION_STATUS_LABELS[item.status]}`}
        className="absolute right-2 bottom-2 z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:bg-accent focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <ApplicationCard
        item={item}
        href={`/applications/${item.id}`}
        showStatus={item.status !== column.dropStatus}
        className="hover:border-foreground/20"
        actions={
          <ApplicationRowActions
            applicationId={item.id}
            status={item.status}
            defaults={item.defaults}
            className="lg:opacity-0 lg:group-focus-within/card:opacity-100 lg:group-hover/card:opacity-100"
          />
        }
      />
    </div>
  );
}

function Column({
  column,
  items,
  activeId,
}: {
  column: BoardColumn;
  items: BoardItem[];
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const label = `${column.label}, ${items.length} applications`;

  // An empty stage shrinks to a slim, full-height rail, leaving room for the
  // full ones. It stays a rail while dragging, so the board doesn't shift
  // under the pointer, and lights up when a card is over it.
  if (items.length === 0) {
    return (
      <section
        ref={setNodeRef}
        aria-label={label}
        title={`${column.label}: no applications`}
        className={cn(
          "flex w-11 shrink-0 snap-start flex-col items-center gap-2 self-stretch rounded-xl bg-column py-3 transition-colors motion-reduce:transition-none",
          activeId && "ring-1 ring-border",
          isOver && "bg-primary/10 ring-2 ring-primary/40",
        )}
      >
        <StatusDot status={column.dropStatus} />
        <span className="text-xs text-muted-foreground tabular-nums">0</span>
        <h2 className="font-medium text-muted-foreground [writing-mode:vertical-rl]">
          {column.label}
        </h2>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        // Full stages share the width and scroll on their own, so a long
        // column never pushes the others out of reach.
        "flex min-w-[17rem] flex-1 basis-0 snap-start flex-col gap-2 self-stretch rounded-xl bg-column p-2 transition-shadow md:min-w-[15.5rem]",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <header className="flex items-center gap-2 px-1.5 pt-0.5">
        <StatusDot status={column.dropStatus} />
        <h2 className="font-medium">{column.label}</h2>
        <span className="rounded-md bg-background px-1.5 text-xs leading-5 text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </header>
      <div className="-mx-1 flex min-h-0 scrollbar-quiet flex-col gap-2 overflow-y-auto px-1 pb-0.5">
        {items.map((item) => (
          <DraggableCard
            key={item.id}
            item={item}
            column={column}
            hidden={item.id === activeId}
          />
        ))}
      </div>
    </section>
  );
}

// Below this, the board grows with its content and the page scrolls instead.
const MIN_BOARD_HEIGHT = 384;
const BOTTOM_GAP = 16;

/**
 * The height that takes the board to the bottom of the window, wherever it
 * starts (the demo banner and filters move it), kept up to date on resize.
 */
function useHeightToViewportBottom() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(
        Math.max(MIN_BOARD_HEIGHT, window.innerHeight - top - BOTTOM_GAP),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return [ref, height] as const;
}

/**
 * The pipeline as columns. Dragging a card records a manual status change;
 * the card moves immediately and settles when the server confirms.
 */
export function ApplicationsBoard({
  items,
  columnIds,
}: {
  items: BoardItem[];
  columnIds: readonly BoardColumnId[];
}) {
  const [optimisticItems, moveItem] = useOptimistic(
    items,
    (state, move: { id: string; status: ApplicationStatus }) =>
      state.map((item) =>
        item.id === move.id ? { ...item, status: move.status } : item,
      ),
  );
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  // A stable id keeps dnd-kit's accessibility ids equal on server and client.
  const boardId = useId();
  const [boardRef, height] = useHeightToViewportBottom();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold on touch screens, so swiping still scrolls the board.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  const nameOf = (id: unknown) =>
    optimisticItems.find((item) => item.id === id)?.companyName ??
    "Application";

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}. Use the left and right arrow keys to choose a column, then press space to drop it.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is over ${columnLabel(over.id)}.`
        : `${nameOf(active.id)} is not over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped in ${columnLabel(over.id)}.`
        : `${nameOf(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const item = optimisticItems.find(
      (candidate) => candidate.id === active.id,
    );
    if (!item || !over) return;

    const status = statusForBoardDrop(item.status, over.id as BoardColumnId);
    if (!status) return;

    startTransition(async () => {
      moveItem({ id: item.id, status });
      const result = await changeApplicationStatusAction(item.id, status);
      if (result?.ok) {
        toast.success(
          `${item.companyName} moved to ${APPLICATION_STATUS_LABELS[status]}.`,
          withUndo(result.eventId),
        );
      } else {
        toast.error(result?.error ?? `Couldn't move ${item.companyName}.`);
      }
    });
  }

  const columns = BOARD_COLUMNS.filter((column) =>
    columnIds.includes(column.id),
  );
  const activeItem = optimisticItems.find((item) => item.id === activeId);

  return (
    <DndContext
      id={boardId}
      sensors={sensors}
      // Scroll the board only when dragging near its very edge; the default
      // zone is so wide on large screens that the board slides under the cursor.
      autoScroll={{ threshold: { x: 0.08, y: 0.2 } }}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move an application, press space or enter. Use the left and right arrow keys to choose a column, then press space or enter to drop it, or escape to cancel.",
        },
      }}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={boardRef}
        style={height ? { height } : undefined}
        className="-mx-4 flex snap-x scroll-px-4 scrollbar-thin items-start gap-3 overflow-x-auto px-4 pb-2 md:-mx-6 md:scroll-px-6 md:px-6"
      >
        {columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            activeId={activeId}
            items={optimisticItems.filter(
              (item) => boardColumnForStatus(item.status) === column.id,
            )}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <ApplicationCard
            item={activeItem}
            showStatus={false}
            className="w-[16rem] cursor-grabbing shadow-lg ring-1 ring-primary/30"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
