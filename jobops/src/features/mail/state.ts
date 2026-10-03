type MessageState = { attentionState: string; linkedApplicationId: string | null };
type EventState = {
  status: string;
  linkedApplicationId: string | null;
  details: Record<string, unknown>;
};

/** Both legacy attention and review state must permit a new decision. */
export function mailIsOpen(message: MessageState, events: EventState[]) {
  return (
    message.attentionState !== "DONE" &&
    !message.linkedApplicationId &&
    events.length > 0 &&
    events.every((event) => event.status === "NEEDS_REVIEW" && !event.linkedApplicationId)
  );
}

export function mailCanUndoDismiss(message: MessageState, events: EventState[], dismissal: string) {
  return (
    message.attentionState === "DONE" &&
    !message.linkedApplicationId &&
    events.length > 0 &&
    events.every(
      (event) =>
        event.status === "DISMISSED" &&
        !event.linkedApplicationId &&
        event.details.triageDismissal === dismissal,
    )
  );
}
