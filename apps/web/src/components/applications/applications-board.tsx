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
import { useId, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { changeApplicationStatusAction } from "@/app/(app)/applications/actions";
import { cn } from "@/lib/utils";
import { ApplicationCard, type BoardItem } from "./application-card";
import { ApplicationRowActions } from "./application-row-actions";
import { StatusDot } from "./status-badge";
import { withUndo } from "./undo-event";

const columnLabel = (id: unknown) =>
  BOARD_COLUMNS.find((column) => column.id === id)?.label ?? "a column";

// Pointer first for mouse and touch; geometry for keyboard moves.
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
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
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: item.id,
    attributes: { roleDescription: "draggable application" },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${item.companyName}, ${item.jobTitle}, ${APPLICATION_STATUS_LABELS[item.status]}`}
      className={cn(
        "cursor-grab rounded-lg outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
        hidden && "opacity-40",
      )}
    >
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
            className="-mt-1 -mr-1 lg:opacity-0 lg:group-focus-within/card:opacity-100 lg:group-hover/card:opacity-100"
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

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.label}, ${items.length} applications`}
      className={cn(
        "flex w-[17rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/70 p-2 transition-shadow",
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
      {items.map((item) => (
        <DraggableCard
          key={item.id}
          item={item}
          column={column}
          hidden={item.id === activeId}
        />
      ))}
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          No applications
        </p>
      )}
    </section>
  );
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
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:-mx-6 md:scroll-px-6 md:px-6">
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
