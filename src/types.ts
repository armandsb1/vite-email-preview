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
  firstMessage: string | undefined;
  lastMessage: string | undefined;
  from: string | undefined;
  lastAgent: string | undefined;
  firstQueue: string | undefined;
  queue: string | undefined;
  externalTag: string | undefined;
  processingState: string | undefined;
  status: string | undefined;
  subject: string | undefined;
  to: string | undefined;
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
