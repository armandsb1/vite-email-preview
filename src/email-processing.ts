import platformClient from "purecloud-platform-client-v2";
import { capi } from "./api";
import { EmailListElement } from "./types";

export type WrapupEntry = {
  wrapupName: string;
  notes: string;
  agentName: string;
  endTime: string;
};

/**
 * Finds the participant with either the earliest or latest "interact" segment start time.
 * Replaces the former findLatestInteractParticipant / findFirstInteractParticipant pair.
 */
export function findInteractParticipant(
  data: platformClient.Models.AnalyticsParticipant[] | undefined,
  type: "name" | "id" = "name",
  order: "first" | "latest" = "latest",
): string | null {
  if (!data) return null;

  let result: string | null = null;
  let extreme: Date | null = null;

  for (const participant of data as any[]) {
    for (const session of participant.sessions ?? []) {
      for (const segment of session.segments ?? []) {
        if (segment.segmentType !== "interact") continue;

        const ts = new Date(segment.segmentStart);
        const isBetter =
          extreme === null ||
          (order === "latest" ? ts > extreme : ts < extreme);

        if (isBetter) {
          extreme = ts;
          result =
            type === "id" ? participant.participantId : participant.participantName;
        }
      }
    }
  }

  return result;
}

/** Returns conversations that have a participant with the given purpose(s) and an open segment of the given type. */
export function getEmailsByStatus(
  conversations: platformClient.Models.AnalyticsConversationQueryResponse,
  purpose: string,
  segmentType: string,
  purpose2?: string,
) {
  if (!conversations?.conversations) return [];

  return conversations.conversations.filter((conversation) => {
    if (!conversation.participants) return false;

    return conversation.participants.some((participant) => {
      if (
        participant.purpose !== purpose &&
        participant.purpose !== purpose2
      )
        return false;
      if (!participant.sessions) return false;

      return participant.sessions.some(
        (session) =>
          session.segments?.some(
            (segment) =>
              segment.segmentType === segmentType &&
              !Object.prototype.hasOwnProperty.call(segment, "segmentEnd"),
          ) ?? false,
      );
    });
  });
}

/** Transforms raw analytics conversations into the flat EmailListElement shape for the table. */
export function extractEmailData(
  emails: platformClient.Models.AnalyticsConversationWithoutAttributes[] | undefined,
  status: string,
): EmailListElement[] {
  if (!emails) return [];

  return emails.map((email) => {
    const customerParticipant = email.participants?.find(
      (p) => p.purpose === "customer" || p.purpose === "external",
    );
    const agentParticipants = email.participants?.filter(
      (p) => p.purpose === "agent" || p.purpose === "user",
    );
    const queueParticipants = email.participants?.filter(
      (p) => p.purpose === "acd",
    );

    let subject = "";
    if (email.originatingDirection === "inbound") {
      subject = customerParticipant?.sessions?.[0]?.segments?.[0]?.subject ?? "";
    } else if (
      agentParticipants &&
      agentParticipants.length > 0 &&
      (agentParticipants[0].sessions?.length ?? 0) > 0 &&
      (agentParticipants[0].sessions?.[0]?.segments?.length ?? 0) > 1
    ) {
      subject =
        agentParticipants[0].sessions![0].segments!.find(
          (s) => s.segmentType === "transmitting",
        )?.subject ?? "";
    }

    const isQueueStatus = status === "In Queue" || status === "Alerting";

    return {
      conversationId: email.conversationId,
      from: customerParticipant?.sessions?.[0]?.addressFrom,
      to: customerParticipant?.sessions?.[0]?.addressTo,
      subject,
      status,
      queue: findInteractParticipant(queueParticipants as any, "name", "latest") ?? "",
      firstQueue: findInteractParticipant(queueParticipants as any, "name", "first") ?? "",
      firstMessage: customerParticipant?.sessions?.[0]?.metrics?.find(
        (m) => m.name === "nConnected",
      )?.emitDate,
      lastMessage:
        customerParticipant?.sessions?.[
          (customerParticipant.sessions?.length ?? 1) - 1
        ]?.metrics?.find((m) => m.name === "nConnected")?.emitDate,
      lastAgent: findInteractParticipant(agentParticipants as any, "name", "latest") ?? "",
      externalTag: (email as any).externalTag ?? "",
      processingState: "",
      targetSla: "",
      finishedParkDuration: (agentParticipants ?? []).reduce((sum, p) =>
        sum + (p.sessions ?? []).reduce((s2, session) =>
          s2 + ((session as any).metrics ?? [])
            .filter((m: any) => m.name === "tPark")
            .reduce((s3: number, m: any) => s3 + (m.value ?? 0), 0),
        0), 0) || undefined,
      parkedSince: status === "Parked"
        ? (agentParticipants ?? []).flatMap((p) =>
            (p.sessions ?? []).flatMap((s) =>
              (s.segments ?? [])
                .filter((seg) => (seg as any).segmentType === "parked" && !(seg as any).segmentEnd)
                .map((seg) => (seg as any).segmentStart as string),
            ),
          )[0] ?? undefined
        : undefined,
      lastACDparticipant: isQueueStatus
        ? findInteractParticipant(queueParticipants as any, "id", "latest") ?? ""
        : findInteractParticipant(agentParticipants as any, "id", "latest") ?? "",
    };
  });
}

/** Fetches and renders the full email thread as an HTML string. */
export async function getConversationThread(
  conversationId: string,
): Promise<{ html: string; wrapups: WrapupEntry[] }> {
  try {
    // Collect messageIds from workflow participants — these are auto-generated and should be excluded
    const conversation = await capi.getConversation(conversationId);
    const workflowMessageIds = new Set<string>();
    for (const participant of conversation.participants ?? []) {
      if (participant.purpose !== "workflow") continue;
      for (const email of (participant as any).emails ?? []) {
        if (email.messageId) workflowMessageIds.add(email.messageId);
      }
    }

    const listing = await capi.getConversationsEmailMessages(conversationId);
    const messages = (listing.entities ?? []).filter(
      (entity) => !workflowMessageIds.has(entity.id!),
    );

    // Collect wrapup entries from all email segments within agent participants
    const wrapups: WrapupEntry[] = [];
    for (const participant of conversation.participants ?? []) {
      if (participant.purpose !== "agent") continue;
      const agentName: string = (participant as any).name ?? "";
      for (const email of (participant as any).emails ?? []) {
        const wrapup = email.wrapup;
        if (!wrapup?.name && !wrapup?.notes) continue;
        wrapups.push({
          wrapupName: wrapup.name ?? "",
          notes: wrapup.notes ?? "",
          agentName,
          endTime: wrapup.endTime ?? "",
        });
      }
    }

    if (messages.length === 0) {
      return { html: "<p>No messages found in this conversation.</p>", wrapups };
    }

    const formatAddress = (a: platformClient.Models.EmailAddress) =>
      a.name
        ? `${a.name} &lt;<a href="mailto:${a.email}">${a.email}</a>&gt;`
        : `<a href="mailto:${a.email}">${a.email}</a>`;

    const formatAddressList = (list?: platformClient.Models.EmailAddress[]) =>
      list && list.length > 0 ? list.map(formatAddress).join(", ") : null;

    const parts: string[] = [];

    for (const preview of messages) {
      if (!preview.id) continue;

      const msg = await capi.getConversationsEmailMessage(
        conversationId,
        preview.id,
      );

      const from = msg.from?.email ? formatAddress(msg.from) : "—";
      const toStr = formatAddressList(msg.to);
      const ccStr = formatAddressList(msg.cc);
      const date = preview.time
        ? new Date(preview.time).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const subject = msg.subject ?? preview.subject ?? "(no subject)";
      const body =
        msg.htmlBody ||
        (msg.textBody
          ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${msg.textBody}</pre>`
          : "");

      parts.push(`
        <div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000">
          <p style="margin:0"><b>From:</b> ${from}</p>
          ${date ? `<p style="margin:0"><b>Sent:</b> ${date}</p>` : ""}
          ${toStr ? `<p style="margin:0"><b>To:</b> ${toStr}</p>` : ""}
          ${ccStr ? `<p style="margin:0"><b>CC:</b> ${ccStr}</p>` : ""}
          <p style="margin:0"><b>Subject:</b> ${subject}</p>
          <br>
          ${body}
        </div>`);
    }

    return {
      html: parts.join('<hr style="border:none;border-top:1px solid #d1d5db;margin:16px 0">'),
      wrapups,
    };
  } catch (error) {
    console.error("Failed to load conversation thread:", error);
    return { html: "<p>Failed to load conversation thread.</p>", wrapups: [] };
  }
}