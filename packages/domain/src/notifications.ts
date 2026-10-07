import type {
  ApplicationEventType,
  ApplicationStatus,
  EventSourceType,
  NotificationType,
} from "./enums";
import { APPLICATION_STATUS_LABELS } from "./labels";

export type NotifiableEvent = {
  type: ApplicationEventType;
  sourceType: EventSourceType;
  statusBefore: ApplicationStatus | null;
  statusAfter: ApplicationStatus | null;
};

export type EventNotification = {
  type: NotificationType;
  title: string;
};

/**
 * The notification an event deserves, if any. Only events Trackr detected on
 * its own notify: changes the person made, or captured while applying, are
 * things they already know about.
 */
export function notificationForEvent(
  event: NotifiableEvent,
  companyName: string,
): EventNotification | null {
  if (event.sourceType !== "EMAIL") return null;

  switch (event.type) {
    case "ASSESSMENT_RECEIVED":
      return {
        type: "ASSESSMENT_RECEIVED",
        title: `${companyName} sent you an assessment`,
      };
    case "INTERVIEW_SCHEDULED":
      return {
        type: "INTERVIEW_SCHEDULED",
        title: `${companyName} scheduled an interview`,
      };
    case "INTERVIEW_RESCHEDULED":
      return {
        type: "INTERVIEW_SCHEDULED",
        title: `${companyName} rescheduled your interview`,
      };
  }

  const { statusBefore, statusAfter } = event;
  if (!statusAfter || statusAfter === statusBefore) return null;
  switch (statusAfter) {
    case "APPLIED":
      return {
        type: "STATUS_CHANGED",
        title: `${companyName} confirmed your application`,
      };
    case "OFFER":
      return {
        type: "STATUS_CHANGED",
        title: `${companyName} sent you an offer`,
      };
    case "REJECTED":
      return {
        type: "STATUS_CHANGED",
        title: `${companyName} application marked Rejected`,
      };
    default:
      return {
        type: "STATUS_CHANGED",
        title: `${companyName} moved to ${APPLICATION_STATUS_LABELS[statusAfter]}`,
      };
  }
}
