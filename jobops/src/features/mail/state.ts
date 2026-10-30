/** `attention_state` is the single handled flag: OPEN needs attention, DONE is handled. */
export function mailIsOpen(message: { attentionState: string }) {
  return message.attentionState !== "DONE";
}
