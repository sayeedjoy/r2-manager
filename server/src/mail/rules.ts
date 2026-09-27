export interface MailRules {
  senderAllowlist: string[] | null; // null = allow any sender
  recipientAllowlist: string[] | null;
  maxMessageSizeBytes: number;
  maxAttachmentSizeBytes: number;
  allowedAttachmentTypes: string[] | null; // MIME types; null = no restriction
}

export const DEFAULT_MAIL_RULES: MailRules = {
  senderAllowlist: null,
  recipientAllowlist: null,
  maxMessageSizeBytes: 25 * 1024 * 1024,
  maxAttachmentSizeBytes: 20 * 1024 * 1024,
  allowedAttachmentTypes: null,
};

export type MailRejectionReason =
  | "sender_not_allowed"
  | "recipient_not_allowed"
  | "message_too_large"
  | "duplicate_message";

/** MAIL-05: sender/recipient allowlists and size caps, applied before parsing MIME. */
export function checkMessageAllowed(
  rules: MailRules,
  input: { sender: string; recipient: string; sizeBytes: number },
): MailRejectionReason | null {
  if (rules.senderAllowlist && !rules.senderAllowlist.includes(input.sender.toLowerCase())) {
    return "sender_not_allowed";
  }
  if (rules.recipientAllowlist && !rules.recipientAllowlist.includes(input.recipient.toLowerCase())) {
    return "recipient_not_allowed";
  }
  if (input.sizeBytes > rules.maxMessageSizeBytes) {
    return "message_too_large";
  }
  return null;
}

export function isAttachmentAllowed(rules: MailRules, mimeType: string | undefined, sizeBytes: number): boolean {
  if (sizeBytes > rules.maxAttachmentSizeBytes) return false;
  if (rules.allowedAttachmentTypes && (!mimeType || !rules.allowedAttachmentTypes.includes(mimeType))) return false;
  return true;
}
