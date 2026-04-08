// Query body for the Genesys Analytics conversations detail endpoint
export type conversationDetailQuery = {
  segmentFilters: {
    type: string;
    predicates: {
      type: string;
      dimension: string;
      operator: string;
      value: string;
    }[];
  }[];
  interval: string;
  conversationFilters: {
    type: string;
    predicates: {
      type: string;
      dimension: string;
      operator: string;
      value?: string;
    }[];
  }[];
  paging: {
    pageSize: number;
    pageNumber: number;
  };
};

// Flat representation of an email conversation used to populate the active-emails table
export type EmailListElement = {
  conversationId: string | undefined;
  firstMessage: string | undefined;  // emitDate of the first nConnected metric on the customer session
  lastMessage: string | undefined;   // emitDate of the last nConnected metric on the customer session
  from: string | undefined;
  lastAgent: string | undefined;
  firstQueue: string | undefined;    // queue name from the earliest "interact" segment across ACD participants
  queue: string | undefined;         // queue name from the latest "interact" segment across ACD participants
  externalTag: string | undefined;
  processingState: string | undefined; // value of EMAIL_STATUS_ATTRIBUTE_NAME custom attribute; populated by background enrichment
  targetSla: string | undefined;     // ISO date string from EMAIL_TARGET_SLA_ATTRIBUTE_NAME custom attribute; populated by background enrichment
  parkedSince: string | undefined;   // segmentStart of the open "parked" segment (only set when status === "Parked")
  // Sum of tPark metric values (ms) from all agent sessions — covers park intervals that have already ended
  finishedParkDuration: number | undefined;
  // True if any agent session/segment has a wrapUpNote; shown as a status indicator badge on the agent name cell
  hasNotes: boolean | undefined;
  // segmentStart of the most-recently-opened segment across all participants; used to compute "time in status"
  statusSince: string | undefined;
  status: string | undefined;        // one of: "In Queue" | "Interacting" | "Parked" | "Alerting" | "On Hold"
  subject: string | undefined;
  to: string | undefined;
  // Participant ID of the latest ACD participant (for queue status) or agent participant (for other statuses);
  // passed to transfer/claim API calls
  lastACDparticipant: string | undefined;
};

// ─── Response types for the Analytics detail query ───────────────────────────

type Metric = {
  emitDate: string;
  name: string;
  value: number;
};

type Segment = {
  conference: boolean;
  segmentStart: string;
  segmentEnd?: string;
  segmentType: string;
  subject: string;
  disconnectType?: string;
  queueId?: string;
  requestedLanguageId?: string;
  wrapUpCode?: string;
  scoredAgents?: {
    agentScore: number;
    scoredAgentId: string;
  }[];
  properties?: {
    property: string;
    propertyType: string;
    value: string;
  }[];
};

type Flow = {
  endingLanguage: string;
  entryReason: string;
  entryType: string;
  exitReason: string;
  flowId: string;
  flowName: string;
  flowType: string;
  flowVersion: string;
  startingLanguage: string;
  transferTargetAddress: string;
  transferTargetName: string;
  transferType: string;
};

type Session = {
  addressFrom: string;
  addressOther: string;
  addressSelf: string;
  addressTo: string;
  direction: string;
  mediaType: string;
  provider: string;
  sessionId: string;
  metrics: Metric[];
  segments: Segment[];
  peerId?: string;
  remote?: string;
  flow?: Flow;
  requestedRoutings?: string[];
  selectedAgentId?: string;
  usedRouting?: string;
  routingRule?: string;
  routingRuleType?: string;
  flowInType?: string;
};

type Participant = {
  externalContactId?: string;
  externalOrganizationId?: string;
  participantId: string;
  participantName?: string;
  purpose: string;
  userId?: string;
  teamId?: string;
  sessions: Session[];
};

type Conversation = {
  conversationId: string;
  conversationStart: string;
  divisionIds: string[];
  externalTag: string;
  originatingDirection: string;
  participants: Participant[];
};

export type ConversationsResponse = {
  conversations: Conversation[];
  totalHits: number;
};
