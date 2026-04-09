import platformClient from "purecloud-platform-client-v2";
import {
  registerSparkComponents,
  registerSparkChartComponents,
} from "genesys-spark";
import ClientApp from "purecloud-client-app-sdk";

import { client, capi, uapi, rapi, papi, aapi } from "./api";
import {
  DEFAULT_REGION,
  PAGE_SIZE,
  USERS_PAGE_SIZE,
  QUEUES_PAGE_SIZE,
  ACTIVE_EMAIL_LOOKBACK_WINDOWS,
  AUTO_EXPAND_EMAIL_THRESHOLD,
  SLA_THRESHOLD_KEY,
  EMAIL_STATUS_ATTRIBUTE_NAME,
  EMAIL_TARGET_SLA_ATTRIBUTE_NAME,
  EMAIL_FILTER_CHECKBOX_ORGS,
} from "./config";
import {
  delay,
  getSessionParam,
  getUTCOffset,
  formatDateRange,
  getColumnIndex,
  formatRemainingTime,
} from "./utils";
import {
  extractEmailData,
  getEmailsByStatus,
  getConversationThread,
  type WrapupEntry,
} from "./email-processing";
import {
  populateTableData,
  filterTable,
  applyPagination,
  getSelectedTransferableRows,
  getSelectedRowIds,
  getActiveFilterValues,
} from "./table";
import {
  populateQueueStats,
  refreshQueueFilterLabels,
  renderHourlyBarChart,
  renderStatusStackedBarChart,
  wireQueueStatsSortHandler,
} from "./stats";
import { getData, clearData, getLakeTime } from "./history";
import { conversationDetailQuery as ConversationDetailQuery, EmailListElement } from "./types";

// ─── Bootstrap: URL params → sessionStorage ──────────────────────────────────
// Genesys Cloud passes configuration as query string parameters when embedding the app
// as a client-app iframe. getSessionParam reads them on first load and persists them in
// sessionStorage so they survive OAuth redirect round-trips.

const urlParams = new URL(document.location.href).searchParams;
const gc_region = getSessionParam(urlParams, "gc_region") ?? DEFAULT_REGION;
const gc_clientId = getSessionParam(urlParams, "gc_clientId");
const gc_redirectUrl = getSessionParam(urlParams, "gc_redirectUrl");
// gc_conversationId stored for potential iframe context use
getSessionParam(urlParams, "gc_conversationId");

client.setEnvironment(gc_region);

const myClientApp = new ClientApp({ pcEnvironment: gc_region });

// ─── Application state ────────────────────────────────────────────────────────

let user: platformClient.Models.UserMe | null = null;
let selectedConversationId = "";   // conversationId of the email currently open in the preview modal
let selectedParticipantId = "";    // participantId for claim/transfer calls in the preview modal
let queueCounts: Record<string, number> = {};        // { queueName → active email count } from the last stats refresh
let queueNameById: Record<string, string> = {};      // { queueId → queueName } — populated by getQueues()
let loadedWindows = 1;             // number of ACTIVE_EMAIL_LOOKBACK_WINDOWS that have been fetched so far
let tablePage = 1;
let emailsList: EmailListElement[] = [];
let processingStatusOptions: { key: string; title: string }[] = []; // dropdown options from the custom attribute schema
let processingStatusSchemaId: string = "";           // schema ID required for PUT /customattributes; empty = feature disabled

// ─── Spark web components ─────────────────────────────────────────────────────

async function loadSparkComponents() {
  await registerSparkComponents();
  registerSparkChartComponents();
}
loadSparkComponents();

// ─── Entry point ──────────────────────────────────────────────────────────────
// Defer start() until gux-tabs is registered. The component sets up a MutationObserver in its
// connectedCallback; if start() fires before the element upgrades, the observer reference is
// undefined and the tab switching throws "Cannot read properties of undefined (reading 'tabId')".

customElements.whenDefined("gux-tabs").then(() => start());

async function start() {
  try {
    if (!gc_clientId || !gc_redirectUrl) {
      console.error("Client ID or Redirect URL not provided");
      return;
    }
    await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {});
    user = await uapi.getUsersMe({"expand":["organization"]});
    console.log("user", user)
    const orgId = (user as any).organization?.id ?? "";
    (document.getElementById("queue-segment-filter-wrap") as HTMLElement).style.display =
      EMAIL_FILTER_CHECKBOX_ORGS.includes(orgId) ? "flex" : "none";
    (document.getElementById("queue-segment-filter") as HTMLInputElement).checked =
      localStorage.getItem("queueSegmentFilter") === "true";
    getUsers();
    await getQueues();
    getActiveEmails();
    initUTCOffsetDisplay();
    getLakeTime();
    setDatePickerRange(3);
  } catch (err) {
    console.error("start() error:", err);
  }
}

// ─── Active emails tab ────────────────────────────────────────────────────────

async function getActiveEmails() {
  const table = document.getElementById("tbody");
  if (!table) return;
  table.innerHTML = "";
  document.getElementById("loading")!.style.display = "block";

  try {
    const [conversations, todayOffered, hourlyData, customAttributesList] = await Promise.all([
      fetchActiveEmailConversations(),
      getQueueTodayOffered(),
      getEmailsOfferedByHour(),
      getCustomAttributesList(),
    ]);
    // console.log("conversations", conversations)

    if (!conversations) return;
    if (customAttributesList) processingStatusOptions = customAttributesList;

    emailsList = [
      ...extractEmailData(
        getEmailsByStatus(conversations, "acd", "interact"),
        "In Queue",
      ),
      ...extractEmailData(
        getEmailsByStatus(conversations, "agent", "interact", "user"),
        "Interacting",
      ),
      ...extractEmailData(
        getEmailsByStatus(conversations, "agent", "parked", "user"),
        "Parked",
      ),
      ...extractEmailData(
        getEmailsByStatus(conversations, "agent", "alert"),
        "Alerting",
      ),
      ...extractEmailData(
        getEmailsByStatus(conversations, "agent", "hold", "user"),
        "On Hold",
      ),
    ].sort(
      (a, b) =>
        new Date(b.lastMessage!).getTime() - new Date(a.lastMessage!).getTime(),
    );

    populateQueueFilterDropdown(emailsList);

    await populateTableData(emailsList, previewEmail, claimEmail);
    queueCounts = populateQueueStats(emailsList, todayOffered, handleQueueStatClick);
    refreshQueueFilterLabels(queueCounts);
    renderHourlyBarChart(hourlyData);
    renderStatusStackedBarChart(emailsList);

    const { search, status, queues, state } = getActiveFilterValues();
    filterTable(search, status, queues, state);
    tablePage = 1;
    applyPagination(tablePage);
    updateLoadOlderButton();

    // Enrich processingState and targetSla in the background so the table is visible immediately.
    // enrichEmailsInBackground updates cells in-place via data-conversation-id once the API responds.
    enrichEmailsInBackground(emailsList);
  } catch (error) {
    console.error("getActiveEmails error:", error);
  }
}

async function appendOlderEmails() {
  const prevLoadedWindows = loadedWindows;
  loadedWindows++;

  document.getElementById("loading")!.style.display = "block";
  try {
    const conversations = await fetchActiveEmailConversations(prevLoadedWindows);

    const newEmails: EmailListElement[] = [
      ...extractEmailData(getEmailsByStatus(conversations, "acd", "interact"), "In Queue"),
      ...extractEmailData(getEmailsByStatus(conversations, "agent", "interact", "user"), "Interacting"),
      ...extractEmailData(getEmailsByStatus(conversations, "agent", "parked", "user"), "Parked"),
      ...extractEmailData(getEmailsByStatus(conversations, "agent", "alert"), "Alerting"),
      ...extractEmailData(getEmailsByStatus(conversations, "agent", "hold", "user"), "On Hold"),
    ].sort((a, b) => new Date(b.lastMessage!).getTime() - new Date(a.lastMessage!).getTime());

    // console.log("newEmails", newEmails)

    emailsList = [...emailsList, ...newEmails];
    populateQueueFilterDropdown(emailsList);
    await populateTableData(newEmails, previewEmail, claimEmail);

    const { search, status, queues, state } = getActiveFilterValues();
    filterTable(search, status, queues, state);
    tablePage = 1;
    applyPagination(tablePage);
    updateLoadOlderButton();

    enrichEmailsInBackground(newEmails);
  } catch (error) {
    console.error("appendOlderEmails error:", error);
  } finally {
    document.getElementById("loading")!.style.display = "none";
  }
}

function updateLoadOlderButton() {
  const wrapper = document.getElementById("load-older-emails-wrapper");
  if (!wrapper) return;
  const allLoaded = loadedWindows >= ACTIVE_EMAIL_LOOKBACK_WINDOWS.length;
  wrapper.style.display = allLoaded ? "none" : "flex";
}

// Fetches active (not-yet-ended) email conversations across the currently-loaded time windows.
// startWindowIndex lets appendOlderEmails fetch only the newly-added window without re-fetching earlier data.
async function fetchActiveEmailConversations(startWindowIndex = 0) {
  let data: platformClient.Models.AnalyticsConversationQueryResponse = {
    conversations: [],
  };

  let windowIndex = startWindowIndex;
  while (windowIndex < loadedWindows && windowIndex < ACTIVE_EMAIL_LOOKBACK_WINDOWS.length) {
    const window = ACTIVE_EMAIL_LOOKBACK_WINDOWS[windowIndex];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - window.startDaysAgo);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - window.endDaysAgo);

    const queueSegmentFilterEnabled = (document.getElementById("queue-segment-filter") as HTMLInputElement)?.checked;
    const selectedQueueNames: string[] = (() => {
      const raw = (document.getElementById("queue-filter-field") as any)?.value;
      return Array.isArray(raw)
        ? raw.filter(Boolean)
        : typeof raw === "string" && raw
          ? raw.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
    })();
    // Resolve queue names to IDs for the segment filter (only when the checkbox is enabled)
    const selectedQueueIds = queueSegmentFilterEnabled
      ? selectedQueueNames
          .map((name) => Object.entries(queueNameById).find(([, n]) => n === name)?.[0])
          .filter((id): id is string => Boolean(id))
      : [];

    // Always filter to email mediaType. If the segment filter checkbox is enabled and queues are
    // selected, add an OR predicate per queue so only conversations that touched those queues are returned.
    const segmentFilters: ConversationDetailQuery["segmentFilters"] = [
      {
        type: "and",
        predicates: [
          {
            type: "dimension",
            dimension: "mediaType",
            operator: "matches",
            value: "email",
          },
        ],
      },
    ];

    if (selectedQueueIds.length > 0) {
      segmentFilters.push({
        type: "or",
        predicates: selectedQueueIds.map((id) => ({
          type: "dimension",
          dimension: "queueId",
          operator: "matches",
          value: id,
        })),
      });
    }

    const body: ConversationDetailQuery = {
      segmentFilters,
      interval: `${startDate.toISOString()}/${endDate.toISOString()}`,
      conversationFilters: [
        {
          type: "and",
          predicates: [
            {
              type: "dimension",
              dimension: "conversationEnd",
              operator: "notExists",
            },
          ],
        },
      ],
      paging: { pageSize: PAGE_SIZE, pageNumber: 1 },
    };

    try {
      const firstPage = await capi.postAnalyticsConversationsDetailsQuery(body);
      if (!firstPage) break;

      data.conversations = [...data.conversations!, ...(firstPage.conversations ?? [])];

      if (firstPage.totalHits && firstPage.totalHits > PAGE_SIZE) {
        const totalPages = Math.ceil(firstPage.totalHits / PAGE_SIZE);
        for (let page = 2; page <= totalPages; page++) {
          body.paging = { pageSize: PAGE_SIZE, pageNumber: page };
          const nextPage =
            await capi.postAnalyticsConversationsDetailsQuery(body);
          if (nextPage.conversations) {
            data.conversations = [
              ...data.conversations!,
              ...nextPage.conversations,
            ];
          }
        }
      }

      windowIndex++;

      // Auto-expand: if the cumulative email count across all loaded windows is still below
      // AUTO_EXPAND_EMAIL_THRESHOLD and we've consumed all loaded windows, extend by one more
      // window. Once the running total exceeds the threshold we stop, so we never over-fetch.
      if (
        (data.conversations?.length ?? 0) < AUTO_EXPAND_EMAIL_THRESHOLD &&
        windowIndex === loadedWindows &&
        windowIndex < ACTIVE_EMAIL_LOOKBACK_WINDOWS.length
      ) {
        loadedWindows++;
      }
    } catch (error) {
      console.error(`fetchActiveEmailConversations loop error:`, error);
      break;
    }
  }

  return data;
}

// Returns { queueName → nOffered count } for today using the AnalyticsApi aggregate query.
// NOTE: this method is on AnalyticsApi (aapi), NOT on ConversationsApi (capi).
async function getQueueTodayOffered(): Promise<Record<string, number>> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  try {
    const result = await aapi.postAnalyticsConversationsAggregatesQuery({
      interval: `${startOfDay.toISOString()}/${endOfDay.toISOString()}`,
      groupBy: ["queueId"],
      filter: {
        type: "and",
        predicates: [
          { type: "dimension", dimension: "mediaType", operator: "matches", value: "email" },
        ],
      },
      metrics: ["nOffered"],
    });

    const offered: Record<string, number> = {};
    for (const r of result.results ?? []) {
      const queueId = r.group?.queueId;
      if (!queueId) continue;
      const queueName = queueNameById[queueId];
      if (!queueName) continue;
      const count = (r.data ?? []).reduce((sum: number, d: any) =>
        sum + (d.metrics?.find((m: any) => m.metric === "nOffered")?.stats?.count ?? 0), 0);
      offered[queueName] = count;
    }
    return offered;
  } catch (error) {
    console.error("getQueueTodayOffered error:", error);
    return {};
  }
}

async function getEmailsOfferedByHour(): Promise<
  { hour: string; count: number }[]
> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  try {
    const result = await aapi.postAnalyticsConversationsAggregatesQuery({
      interval: `${startOfDay.toISOString()}/${endOfDay.toISOString()}`,
      granularity: "PT1H",
      filter: {
        type: "and",
        predicates: [
          { type: "dimension", dimension: "mediaType", value: "email" },
        ],
      },
      metrics: ["nOffered"],
    });

    const countByHour: Record<number, number> = {};
    for (const r of result.results ?? []) {
      for (const d of r.data ?? []) {
        const intervalStart = d.interval?.split("/")?.[0];
        if (!intervalStart) continue;
        const h = new Date(intervalStart).getHours();
        const count =
          d.metrics?.find((m: any) => m.metric === "nOffered")?.stats?.count ??
          0;
        countByHour[h] = (countByHour[h] || 0) + count;
      }
    }

    return Array.from({ length: now.getHours() + 1 }, (_, h) => ({
      hour: String(h).padStart(2, "0") + ":00",
      count: countByHour[h] ?? 0,
    }));
  } catch (error) {
    console.error("getEmailsOfferedByHour error:", error);
    return [];
  }
}

// ─── Email actions ────────────────────────────────────────────────────────────

async function previewEmail(id: string, participantId: string, status: string) {
  selectedConversationId = id;
  selectedParticipantId = participantId;

  const { html: emailContent, wrapups } = await getConversationThread(id);
  if (!emailContent) return;

  const modalContent = document.getElementById("preview-modal-content")!;
  modalContent.innerHTML = emailContent;
  modalContent.scrollTop = 0;

  // Wrapup / Notes flyout menus
  const formatWrapupDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
  };

  const buildFlyout = (label: string, id: string, items: string[]): string =>
    `<span style="position:relative;display:inline-block">
      <gux-button id="${id}" accent="secondary">${label}</gux-button>
      <gux-popover-list-beta for="${id}" position="top-start" is-open="false">
        <gux-list style="min-width:400px">
          ${items.map((text) => `<gux-list-item title="${text}"><span style="white-space:normal;word-break:break-word;display:block;padding:4px 0">${text}</span></gux-list-item>`).join("")}
        </gux-list>
      </gux-popover-list-beta>
    </span>`;

  const wrapupsWithName = wrapups.filter((w: WrapupEntry) => w.wrapupName);
  const wrapupsWithNotes = wrapups.filter((w: WrapupEntry) => w.notes);

  const wrapupContainer = document.getElementById("wrapup-flyout-container")!;
  const notesContainer = document.getElementById("notes-flyout-container")!;

  wrapupContainer.innerHTML = wrapupsWithName.length > 0
    ? buildFlyout("Wrapups", "wrapup-popover-target", wrapupsWithName.map((w: WrapupEntry) =>
        `${w.wrapupName} by ${w.agentName}${w.endTime ? " at " + formatWrapupDate(w.endTime) : ""}`,
      ))
    : "";

  notesContainer.innerHTML = wrapupsWithNotes.length > 0
    ? buildFlyout("Notes", "notes-popover-target", wrapupsWithNotes.map((w: WrapupEntry) =>
        `${w.notes} by ${w.agentName}${w.endTime ? " at " + formatWrapupDate(w.endTime) : ""}`,
      ))
    : "";

  const claimBtn = document.getElementById("claim-email")!;
  claimBtn.setAttribute("disabled", "false");
  claimBtn.innerHTML = "Claim";

  if (status === "Interacting" || status === "On Hold") {
    claimBtn.setAttribute("disabled", "true");
  } else if (status === "Disconnected") {
    claimBtn.innerHTML = "Reconnect";
  }

  // Processing status dropdown
  const statusWrapper = document.getElementById("processing-status-field-wrapper")!;
  const statusListbox = document.getElementById("processing-status-listbox")!;
  const statusDropdown = document.getElementById("processing-status-dropdown") as any;

  if (processingStatusOptions.length > 0) {
    statusListbox.innerHTML = "";
    for (const { key, title } of processingStatusOptions) {
      const opt = document.createElement("gux-option");
      opt.setAttribute("value", key);
      opt.textContent = title;
      statusListbox.appendChild(opt);
    }
    const currentState = emailsList.find((e) => e.conversationId === id)?.processingState ?? "";
    statusDropdown.value = currentState;
    (statusWrapper as HTMLElement).style.display = "block";
  } else {
    (statusWrapper as HTMLElement).style.display = "none";
  }

  // @ts-expect-error – Spark modal type not in lib
  document.getElementById("preview-modal")!.showModal();
}

async function claimEmail(conversationId: string, participantId: string) {
  if (!user?.id) {
    console.error("User not found");
    return;
  }
  try {
    await capi.postConversationsEmailParticipantReplace(
      conversationId,
      participantId,
      {
        userId: user.id,
      },
    );
    await delay(1000);

    const conversation = await capi.getConversationsEmail(conversationId);
    const newParticipantId = getParticipantIdByUserId(conversation, user.id);
    if (!newParticipantId) {
      console.error("No participant found for user ID", user.id);
      return;
    }
    await capi.patchConversationsEmailParticipant(
      conversationId,
      newParticipantId,
      {
        state: "connected",
      },
    );
    // @ts-ignore
    document.getElementById("preview-modal")!.close();
  } catch (error) {
    console.error("claimEmail error:", error);
  }
}

async function disconnectEmail(conversationId: string) {
  try {
    const conversation = await capi.getConversation(conversationId);
    const customer = conversation.participants.find(
      (p) => p.purpose === "external" || p.purpose === "customer",
    );
    if (!customer?.id) return;

    const attrs: { attributes: Record<string, string> } = { attributes: {} };
    attrs.attributes["Disconnected in app"] =
      `${new Date().toLocaleString()} by ${user?.name ?? "Unknown"}`;
    await capi.patchConversationsEmailParticipantAttributes(
      conversationId,
      customer.id,
      attrs,
    );

    await capi.postConversationDisconnect(conversationId);
  } catch (error) {
    console.error("disconnectEmail error:", error);
  }
}

async function reconnectEmail(conversationId: string) {
  try {
    await capi.postConversationsEmailReconnect(conversationId);
  } catch (error: any) {
    if (error?.code === "email.reconnect.expired" || error?.status === 400) {
      console.warn("Reconnect not available:", error?.message ?? error);
      if (!user?.username?.includes("adventus")) return;

      const emailConversation = await capi.getConversation(conversationId);
      const externalParticipant = emailConversation.participants?.find(
        (p) => p.purpose === "external" || p.purpose === "customer",
      );
      const acdParticipant = emailConversation.participants?.find(
        (p) => p.purpose === "acd",
      );

      const toAddress = externalParticipant?.address;
      const toName = externalParticipant?.name;
      const queueId = acdParticipant?.queueId;

      if (!toAddress || !queueId) {
        console.error(
          "Cannot create new conversation: missing customer address or queue",
        );
        return;
      }

      const messages = await capi.getConversationsEmailMessages(conversationId);
      const subject = messages.entities?.[0]?.subject ?? "(no subject)";
      const { html: threadHtml } = await getConversationThread(conversationId);

      const created = await capi.postConversationsEmails({
        provider: "PureCloud Email",
        queueId,
        toAddress,
        toName,
        subject,
        direction: "OUTBOUND",
      });
      if (!created.id) return;

      const draft = await capi.getConversationsEmailMessagesDraft(created.id);
      draft.htmlBody = `${draft.htmlBody ?? ""}<br><br><br>${threadHtml}`;
      draft.state = "Edited"
      await capi.putConversationsEmailMessagesDraft(created.id, draft);

      // const newConversation = await capi.getConversationsEmail(created.id);
      // if (!newConversation.participants) return;
      // const agentParticipantId = newConversation.participants[0]?.id;
      // if (!agentParticipantId) return;

      // await capi.patchConversationsEmailParticipant(
      //   created.id,
      //   agentParticipantId,
      //   {
      //     state: "PARKED",
      //   },
      // );
      // await capi.patchConversationsEmailParticipantParkingstate(
      //   created.id,
      //   agentParticipantId,
      //   { state: "CONNECTED" },
      // );
    }
  } finally {
    // @ts-ignore
    document.getElementById("preview-modal")!.close();
  }
}

export async function transferToQueue(
  conversationId: string,
  participantId: string,
  selectedQueueId: string,
) {
  try {
    await capi.postConversationsEmailParticipantReplace(
      conversationId,
      participantId,
      { queueId: selectedQueueId },
    );

    const conversation = await capi.getConversation(conversationId);
    const customer = conversation.participants.find(
      (p) => p.purpose === "external" || p.purpose === "customer",
    );
    const queue = await rapi.getRoutingQueue(selectedQueueId);

    if (customer?.id) {
      const attrs: { attributes: Record<string, string> } = { attributes: {} };
      attrs.attributes[`Transferred in app at ${new Date().toLocaleString()}`] =
        `${user?.name ?? "Unknown"} to queue ${queue.name}`;
      await capi.patchConversationsEmailParticipantAttributes(
        conversationId,
        customer.id,
        attrs,
      );
    }
  } catch (error) {
    console.error("transferToQueue error:", error);
  }
}

export async function transferToUser(
  conversationId: string,
  participantId: string,
  selectedUserId: string,
) {
  try {
    const userStatus = await papi.getUserPresencesPurecloud(selectedUserId);
    if (userStatus.presenceDefinition?.systemPresence === "Offline") {
      myClientApp.alerting.showToastPopup("", "User is offline", {
        type: "error",
        id: String(Date.now()),
        timeout: 3,
        showCloseButton: true,
      } as any);
      return;
    }

    await capi.postConversationsEmailParticipantReplace(
      conversationId,
      participantId,
      { userId: selectedUserId, transferType: "Unattended" },
    );

    const conversation = await capi.getConversation(conversationId);
    const customer = conversation.participants.find(
      (p) => p.purpose === "external" || p.purpose === "customer",
    );
    const targetUser = await uapi.getUser(selectedUserId, {});

    if (customer?.id) {
      const attrs: { attributes: Record<string, string> } = { attributes: {} };
      attrs.attributes[`Transferred in app at ${new Date().toLocaleString()}`] =
        `${user?.name ?? "Unknown"} to user ${targetUser.name}`;
      await capi.patchConversationsEmailParticipantAttributes(
        conversationId,
        customer.id,
        attrs,
      );
    }
  } catch (error) {
    console.error("transferToUser error:", error);
  }
}

// async function createCustomAttributes(
//   conversationId: string,
//   recordId: string,
//   schemaId: string,
//   body: any,
//   divisionIds?: string[],
// ) {
//   try {
//     await capi.putConversationCustomattributes(conversationId, {
//       body: {
//         id: recordId,
//         divisions: divisionIds || [],
//         schemaId: schemaId,
//         customAttributes: body,
//       },
//     });
//   } catch (error) {
//     console.log("error updating custom attribues", error);
//   }
// }

function populateStateFilterDropdown() {
  const listbox = document.getElementById("state-filter-value")!;
  const current = (document.getElementById("state-filter-field") as any)?.value ?? "";

  listbox.innerHTML = '<gux-option value="">All</gux-option>';
  for (const { key, title } of processingStatusOptions) {
    const opt = document.createElement("gux-option");
    opt.setAttribute("value", key);
    opt.textContent = title;
    listbox.appendChild(opt);
  }

  if (processingStatusOptions.some((o) => o.key === current)) {
    (document.getElementById("state-filter-field") as any).value = current;
  }
}

// Populates the queue filter multi-select dropdown options.
// When the segment-filter checkbox is ON, shows every known queue (from queueNameById) so the user
// can filter before fetching data. When OFF, shows only queues that actually have active emails.
// Preserves the current selection after repopulation by re-applying the comma-separated value.
function populateQueueFilterDropdown(emails: { queue?: string }[]) {
  const filterList = document.getElementById("queue-filter-value")!;
  const queueDropdown = document.getElementById("queue-filter-field") as any;
  const currentRaw = queueDropdown?.value;
  const current: string[] = Array.isArray(currentRaw)
    ? currentRaw
    : typeof currentRaw === "string" && currentRaw
      ? currentRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const segmentFilterEnabled = (document.getElementById("queue-segment-filter") as HTMLInputElement)?.checked;
  const unique = segmentFilterEnabled
    ? Object.values(queueNameById).sort()
    : [...new Set(emails.map((e) => e.queue ?? "").filter(Boolean))].sort();

  filterList.innerHTML = "";
  for (const name of unique) {
    const opt = document.createElement("gux-option-multi");
    opt.setAttribute("value", name);
    opt.textContent = name;
    filterList.appendChild(opt);
  }

  const preserved = current.filter((v) => unique.includes(v));
  if (preserved.length > 0) {
    queueDropdown.value = preserved.join(",");
  }
}

async function fetchProcessingStates(
  conversationIds: string[],
): Promise<Record<string, { processingStatus: string; targetSla: string }>> {
  const map: Record<string, { processingStatus: string; targetSla: string }> = {};
  const chunkSize = PAGE_SIZE;
  for (let i = 0; i < conversationIds.length; i += chunkSize) {
    const chunk = conversationIds.slice(i, i + chunkSize);
    const result = await getCustomAttributes(chunk);
    for (const entity of (result as any)?.results ?? []) {
      const id: string = entity.conversationId;
      if (id) {
        map[id] = {
          processingStatus: entity.customAttributes?.[EMAIL_STATUS_ATTRIBUTE_NAME] ?? "",
          targetSla: entity.customAttributes?.[EMAIL_TARGET_SLA_ATTRIBUTE_NAME] ?? "",
        };
      }
    }
  }
  // console.log("map", map)
  return map;
}

// After the table is painted, fetch custom attributes (processingState, targetSla) in the background.
// Updates the in-memory emailsList and the corresponding DOM cells without re-rendering the full table.
// Skipped entirely when processingStatusSchemaId is empty (schema not found in the org).
async function enrichEmailsInBackground(emails: EmailListElement[]) {
  if (!processingStatusSchemaId) return;
  try {
    const processingStateMap = await fetchProcessingStates(
      emails.map((e) => e.conversationId!).filter(Boolean),
    );
    for (const email of emails) {
      const attrs = processingStateMap[email.conversationId!];
      email.processingState = attrs?.processingStatus ?? "";
      email.targetSla = attrs?.targetSla ?? "";

      // Find the already-rendered row by its data-conversation-id attribute and update cells in-place
      const row = document.querySelector(
        `#tbody tr[data-conversation-id="${email.conversationId}"]`,
      ) as HTMLElement | null;
      if (!row) continue;

      const stateCell = row.querySelector('[data-column-name="processing-state"]');
      if (stateCell) stateCell.textContent = email.processingState;

      const slaCell = row.querySelector('[data-column-name="remaining-sla"]') as HTMLElement | null;
      if (slaCell) {
        if (email.targetSla) {
          const remainingMs = new Date(email.targetSla).getTime() - Date.now();
          slaCell.textContent = remainingMs < 0
            ? `${formatRemainingTime(remainingMs)} over SLA`
            : formatRemainingTime(remainingMs);
          slaCell.dataset.sortValue = String(remainingMs);
          if (remainingMs < 0) slaCell.style.backgroundColor = "lightcoral";
        } else {
          slaCell.dataset.sortValue = String(Number.MAX_SAFE_INTEGER);
        }
      }
    }
    populateStateFilterDropdown();
  } catch (err) {
    console.error("enrichEmailsInBackground error:", err);
  }
}

async function getCustomAttributes (
  conversationIds:string[]
){
  const body = {
  "pageSize": PAGE_SIZE,
  "pageNumber": 1,
  "queryReservedFields": [
    {
      "type": "EXACT",
      "fields": [
        "conversationId"
      ],
      "values": conversationIds
    }
  ],
  "expand": [
    "attributes"
  ]
}
  try {
    const results = await capi.postConversationsCustomattributesSearch(body)
    // console.log("results", results)
    return results
  } catch (error) {
    console.log("Error getting conversation attributes", error)
  }
}

// Fetches all custom attribute schemas and finds the one that has an _enumProperties map
// on the EMAIL_STATUS_ATTRIBUTE_NAME property. Stores the schema ID for later PUT calls and
// returns a flat { key, title }[] array used to populate the processing state dropdown.
async function  getCustomAttributesList(): Promise<{ key: string; title: string }[] | null> {
  try {
    const result = await capi.getConversationsCustomattributesSchemas();
    if (!result.entities?.length || result.entities?.length==0) return null;

    let enumProps: Record<string, any> = {};
    for (const entity of result.entities as any[]) {
      const prop = entity.jsonSchema?.properties?.[EMAIL_STATUS_ATTRIBUTE_NAME];
      if (prop?._enumProperties) {
        enumProps = prop._enumProperties;
        // Cache the schema ID — required in the body of every PUT /customattributes call
        processingStatusSchemaId = entity.id ?? "";
        break;
      }
    }
    if (!Object.keys(enumProps).length) return null;
    const list = Object.entries(enumProps).map(([key, val]: [string, any]) => ({
      key,
      title: val.title ?? key,
    }));
    console.log("Statuses list", list)
    return list
  } catch (error) {
    console.log("error getting custom attributes list", error);
    return null;
  }
}

// Updates a single custom attribute (EMAIL_STATUS_ATTRIBUTE_NAME) while preserving all other
// existing custom attributes. The PUT endpoint replaces the entire customAttributes object,
// so we fetch the current values first and merge the new status into them.
async function updateProcessingStatus(conversationId: string, status: string) {
  try {
    const current = await capi.getConversationCustomattributes(conversationId) as any;
    console.log("current",current)
    const existing: Record<string, any> = current?.results[0].customAttributes ?? {};
    console.log("existing", existing)
    const updated: Record<string, any> = { ...existing };
    if (status) updated[EMAIL_STATUS_ATTRIBUTE_NAME] = status;
    // else delete updated[EMAIL_STATUS_ATTRIBUTE_NAME];
    console.log("updated",{
        id: conversationId,
        schemaId: processingStatusSchemaId,
        divisions: current?.divisions ?? [],
        customAttributes: updated,
      },)

    await (capi as any).putConversationCustomattributes(conversationId, {
      body: {
        id: conversationId,
        schemaId: processingStatusSchemaId,
        divisions: current?.divisions ?? [],
        customAttributes: updated,
      },
    });
  } catch (error) {
    console.error("Error updating processing status", error);
  }
}

// ─── Data loading helpers ─────────────────────────────────────────────────────

// Loads all active users and populates the "Transfer to user" dropdown.
// Results are cached in sessionStorage for 1 hour to avoid repeat API calls on each refresh.
async function getUsers() {
  const CACHE_KEY = "genesys_users_cache";
  const HOUR_MS = 60 * 60 * 1000;
  const list = document.getElementById("listUsers")!;

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, entities } = JSON.parse(cached) as { timestamp: number; entities: { id: string; name: string }[] };
      if (Date.now() - timestamp < HOUR_MS) {
        for (const u of entities) {
          const item = document.createElement("gux-option");
          item.innerText = u.name;
          item.setAttribute("value", u.id);
          list.appendChild(item);
        }
        return;
      }
    }

    const allEntities: { id: string; name: string }[] = [];
    let pageNumber = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const users = await uapi.getUsers({ pageSize: USERS_PAGE_SIZE, pageNumber, state: "active" });
      if (!users?.entities) break;

      for (const u of users.entities) {
        allEntities.push({ id: u.id!, name: u.name! });
        const item = document.createElement("gux-option");
        item.innerText = u.name!;
        item.setAttribute("value", u.id!);
        list.appendChild(item);
      }

      hasNextPage = !!users.nextUri;
      pageNumber++;
    }

    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), entities: allEntities }));
  } catch (error) {
    console.error("getUsers error:", error);
  }
}

// Loads all routing queues, populates the "Transfer to queue" dropdown, and builds the
// queueNameById lookup map used for queue filter labels and segment filter resolution.
// Results are cached in sessionStorage for 1 hour.
async function getQueues() {
  const CACHE_KEY = "genesys_queues_cache";
  const HOUR_MS = 60 * 60 * 1000;

  try {
    const list = document.getElementById("listQueues")!;
    // Clear first to prevent duplicate options if called again (e.g. on refresh)
    list.innerHTML = "";

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, entities } = JSON.parse(cached) as { timestamp: number; entities: { id: string; name: string }[] };
      if (Date.now() - timestamp < HOUR_MS) {
        for (const q of entities) {
          queueNameById[q.id] = q.name;
          const item = document.createElement("gux-option");
          item.innerText = q.name;
          item.setAttribute("value", q.id);
          list.appendChild(item);
        }
        return;
      }
    }

    const entitiesToCache: { id: string; name: string }[] = [];
    let pageNumber = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const queues = await rapi.getRoutingQueues({ pageSize: QUEUES_PAGE_SIZE, pageNumber });
      if (!queues?.entities) break;

      for (const queue of queues.entities) {
        queueNameById[queue.id!] = queue.name!;
        entitiesToCache.push({ id: queue.id!, name: queue.name! });
        const item = document.createElement("gux-option");
        item.innerText = queue.name!;
        item.setAttribute("value", queue.id!);
        list.appendChild(item);
      }

      hasNextPage = !!queues.nextUri;
      pageNumber++;
    }

    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), entities: entitiesToCache }));
  } catch (error) {
    console.error("getQueues error:", error);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getParticipantIdByUserId(
  conversation: any,
  userId: string,
): string | null {
  for (const participant of conversation.participants ?? []) {
    if ((participant as any).user?.id === userId) return participant.id!;
  }
  return null;
}

function initUTCOffsetDisplay() {
  const el = document.getElementById("timeZone") as HTMLInputElement | null;
  if (el) el.value = getUTCOffset();
}

function setDatePickerRange(months: number) {
  const picker = document.getElementById("datepicker") as HTMLInputElement;
  if (picker) picker.value = formatDateRange(months);
}

// Clicking a queue stats row closes the panel and filters the email table to that queue.
// guxForceUpdate() notifies the gux-dropdown-multi that its value changed programmatically
// (the component does not watch the value property for external mutations by default).
function handleQueueStatClick(queueName: string) {
  document.getElementById("queue-stats-panel")!.style.display = "none";

  const queueDropdown = document.getElementById("queue-filter-field") as any;
  queueDropdown.value = queueName;
  queueDropdown.guxForceUpdate?.();

  const { search, status, state } = getActiveFilterValues();
  filterTable(search, status, [queueName], state);
  tablePage = 1;
  applyPagination(tablePage);
  refreshQueueFilterLabels(queueCounts);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Search field: trigger on Enter key
document.getElementById("search-value")!.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const { search, status, queues, state } = getActiveFilterValues();
  filterTable(search, status, queues, state);
  tablePage = 1;
  applyPagination(tablePage);
  const searchInput = document.querySelector(
    "[name=search-field]",
  ) as HTMLInputElement;
  searchInput.value = "";
  (document.getElementById("search-field") as any).guxForceUpdate?.();
});

// Status filter dropdown
document.getElementById("status-value")!.addEventListener("change", () => {
  const { search, status, queues, state } = getActiveFilterValues();
  filterTable(search, status, queues, state);
  tablePage = 1;
  applyPagination(tablePage);
});

// Queue filter dropdown
document
  .getElementById("queue-filter-field")!
  .addEventListener("change", () => {
    const { search, status, queues, state } = getActiveFilterValues();
    filterTable(search, status, queues, state);
    tablePage = 1;
    applyPagination(tablePage);
    refreshQueueFilterLabels(queueCounts);
  });

// State filter dropdown
document
  .getElementById("state-filter-value")!
  .addEventListener("change", function () {
    const { search, status, queues } = getActiveFilterValues();
    filterTable(search, status, queues, (this as HTMLSelectElement).value);
    tablePage = 1;
    applyPagination(tablePage);
  });

// Toolbar buttons
document.getElementById("refresh")!.addEventListener("click", () => {
  loadedWindows = 1;
  start();
});

document.getElementById("queue-segment-filter")!.addEventListener("change", (e) => {
  localStorage.setItem("queueSegmentFilter", String((e.target as HTMLInputElement).checked));
  populateQueueFilterDropdown(emailsList);
  loadedWindows = 1;
  start();
});

document.getElementById("load-older-emails")!.addEventListener("click", () => {
  if (loadedWindows < ACTIVE_EMAIL_LOOKBACK_WINDOWS.length) {
    appendOlderEmails();
  }
});

document.getElementById("pagination-first")!.addEventListener("click", () => {
  tablePage = applyPagination(1);
});

document.getElementById("pagination-prev")!.addEventListener("click", () => {
  tablePage = applyPagination(tablePage - 1);
});

document.getElementById("pagination-next")!.addEventListener("click", () => {
  tablePage = applyPagination(tablePage + 1);
});

document.getElementById("pagination-last")!.addEventListener("click", () => {
  tablePage = applyPagination(Infinity);
});

document.getElementById("pagination-page-input")!.addEventListener("change", (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(val)) tablePage = applyPagination(val);
});

document.getElementById("queue-stats-toggle")!.addEventListener("click", () => {
  const panel = document.getElementById("queue-stats-panel")!;
  panel.style.display = panel.style.display === "none" ? "flex" : "none";
});

// Transfer to queue
document
  .getElementById("transfer-queue")!
  .addEventListener("click", async () => {
    const selectedQueueId = (
      document.getElementById("listQueues") as HTMLSelectElement
    ).value;
    const rows = getSelectedTransferableRows();
    for (const { rowId, participantId } of rows) {
      await transferToQueue(rowId, participantId, selectedQueueId);
    }
    if (rows.length > 0) {
      await delay(2000);
      getActiveEmails();
    }
  });

// Transfer to user
document
  .getElementById("transfer-user")!
  .addEventListener("click", async () => {
    const selectedUserId = (
      document.getElementById("listUsers") as HTMLSelectElement
    ).value;
    const rows = getSelectedTransferableRows();
    for (const { rowId, participantId } of rows) {
      await transferToUser(rowId, participantId, selectedUserId);
    }
    if (rows.length > 0) {
      await delay(2000);
      getActiveEmails();
    }
  });

// Bulk disconnect (opens confirmation modal)
document.getElementById("delete-emails")!.addEventListener("click", () => {
  const count = getSelectedRowIds().length;
  document.getElementById("delete-modal-message")!.textContent =
    `Are you sure to disconnect ${count} selected email${count !== 1 ? "s" : ""}?`;
  // @ts-ignore
  document.getElementById("delete-modal")!.showModal();
});

// Confirm disconnect
document
  .getElementById("delete-email-modal-button")!
  .addEventListener("click", async () => {
    const btn = document.getElementById("delete-email-modal-button")!;
    const msg = document.getElementById("delete-modal-message")!;
    btn.setAttribute("disabled", "true");
    msg.textContent = "Working on it...";

    for (const rowId of getSelectedRowIds()) {
      await disconnectEmail(rowId);
    }
    await delay(1500);
    getActiveEmails();
    // @ts-ignore
    document.getElementById("delete-modal")!.close();

    btn.removeAttribute("disabled");
  });

// Preview modal: claim/reconnect action
document.getElementById("claim-email")!.addEventListener("click", (e) => {
  const label = (e.target as HTMLElement).innerText;
  if (label === "Claim") {
    claimEmail(selectedConversationId, selectedParticipantId);
  } else if (label === "Reconnect") {
    reconnectEmail(selectedConversationId);
  }
});

// Preview modal: processing status dropdown
document.getElementById("processing-status-dropdown")!.addEventListener("change", (e) => {
  const value = (e.target as any).value;
  if (selectedConversationId && value !== undefined) {
    updateProcessingStatus(selectedConversationId, value);
    const email = emailsList.find((em) => em.conversationId === selectedConversationId);
    if (email) email.processingState = value;
  }
});

// Preview modal: show in Genesys
document.getElementById("show-in-genesys")!.addEventListener("click", () => {
  if (selectedConversationId) {
    myClientApp.conversations.showInteractionDetails(selectedConversationId);
  }
});

// Double-click a table row to open preview
document.getElementById("tbody")!.addEventListener("dblclick", (e) => {
  const row = (e.target as HTMLElement).closest("tr");
  if (!row) return;

  const participantIndex = getColumnIndex("participant");
  const statusIndex = getColumnIndex("status");
  if (participantIndex === -1 || statusIndex === -1) return;

  const cells = row.querySelectorAll("td");
  const rowId = row.getAttribute("data-row-id");
  const participantId = cells[participantIndex]?.textContent;
  const status = cells[statusIndex]?.textContent;
  if (!participantId || !rowId) return;

  previewEmail(rowId, participantId, status!);
});

// Synchronises the enabled/disabled state of action buttons based on row selection and
// whether a target queue/user has been chosen. The Transfer buttons require both: at least
// one row selected AND a target chosen, so both conditions are checked together.
function syncActionButtons() {
  const hasSelection = getSelectedRowIds().length > 0;
  const queueDropdown = document.getElementById("dropdownQueue") as any;
  const userDropdown = document.getElementById("dropdownUser") as any;

  (document.getElementById("delete-emails") as any).disabled = !hasSelection;

  queueDropdown.disabled = !hasSelection;
  (document.getElementById("transfer-queue") as any).disabled =
    !hasSelection || !queueDropdown.value;

  userDropdown.disabled = !hasSelection;
  (document.getElementById("transfer-user") as any).disabled =
    !hasSelection || !userDropdown.value;
}

function syncDisconnectButton() {
  syncActionButtons();
}

// Select-all intercept: only select visible rows
document
  .querySelector('#sortable-table table[slot="data"]')!
  .addEventListener("internalallrowselectchange", (event: Event) => {
    event.stopPropagation();
    const selectAll = (event as CustomEvent).detail as boolean;

    document.querySelectorAll<HTMLElement>("#tbody tr").forEach((tr) => {
      const rowSelect = tr.querySelector("gux-row-select") as any;
      if (!rowSelect || rowSelect.disabled) return;
      if (tr.style.display === "none") return;

      rowSelect.selected = selectAll;
      if (selectAll) {
        tr.setAttribute("data-selected-row", "");
      } else {
        tr.removeAttribute("data-selected-row");
      }
    });
    syncDisconnectButton();
  });

// Individual row selection: sync Disconnect button
document.getElementById("tbody")!.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("gux-row-select")) setTimeout(syncDisconnectButton, 0);
});

// Transfer dropdown value changes: re-evaluate transfer button state
document.getElementById("dropdownQueue")!.addEventListener("change", syncActionButtons);
document.getElementById("dropdownUser")!.addEventListener("change", syncActionButtons);

// History tab buttons
document
  .getElementById("months12")!
  .addEventListener("click", () => setDatePickerRange(12));
document
  .getElementById("months24")!
  .addEventListener("click", () => setDatePickerRange(24));

document
  .getElementById("getData")!
  .addEventListener("click", () => getData(myClientApp, previewEmail));
document.getElementById("getDisconnected")!.addEventListener("click", () => {
  getData(myClientApp, previewEmail, (row) => row[row.length - 1] === true);
});
document
  .getElementById("clearData")!
  .addEventListener("click", () => clearData());

// ─── Column visibility ────────────────────────────────────────────────────────

// Column visibility is persisted in localStorage. On load, a <style> tag is injected with
// display:none !important rules for hidden columns. The !important is required because the
// gux-table component applies its own display styles via Shadow DOM slot distribution.
const COL_VISIBILITY_KEY = "col_visibility";

const TOGGLEABLE_COLUMNS = [
  { name: "start-date", label: "First message" },
  { name: "endDate", label: "Last message" },
  { name: "processingTime", label: "Processing time" },
  { name: "from", label: "From" },
  { name: "to", label: "To" },
  { name: "subject", label: "Subject" },
  { name: "status", label: "Status" },
  { name: "last-agent", label: "Last agent" },
  { name: "first-queue", label: "First queue", defaultVisible: false },
  { name: "queue", label: "Queue" },
  { name: "external-tag", label: "External Tag", defaultVisible: false },
  { name: "processing-state", label: "Processing State", defaultVisible: false },
  { name: "time-in-status", label: "Time in Status", defaultVisible: false },
  { name: "remaining-sla", label: "Remaining SLA", defaultVisible: false },
  { name: "total-park-duration", label: "Total Park Duration", defaultVisible: false },
];

function getStoredColVisibility(): Record<string, boolean> {
  const stored = localStorage.getItem(COL_VISIBILITY_KEY);
  const defaults = Object.fromEntries(
    TOGGLEABLE_COLUMNS.map((c) => [c.name, c.defaultVisible ?? true]),
  );
  if (!stored) return defaults;
  try {
    return { ...defaults, ...JSON.parse(stored) };
  } catch {
    return defaults;
  }
}

function applyColumnVisibility(visibility: Record<string, boolean>) {
  let styleEl = document.getElementById(
    "col-visibility-style",
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "col-visibility-style";
    document.head.appendChild(styleEl);
  }
  const rules = Object.entries(visibility)
    .map(
      ([col, visible]) =>
        `th[data-column-name="${col}"], td[data-column-name="${col}"] { display: ${visible ? "table-cell" : "none"} !important; }`,
    )
    .join("\n");
  styleEl.textContent = rules;

  const stateFilterWrapper = document.getElementById("state-filter-wrapper");
  if (stateFilterWrapper) {
    stateFilterWrapper.style.display =
      visibility["processing-state"] ? "block" : "none";
  }
}

applyColumnVisibility(getStoredColVisibility());

document
  .getElementById("set-column-visibility")!
  .addEventListener("click", () => {
    const visibility = getStoredColVisibility();
    const container = document.getElementById("col-visibility-checkboxes")!;
    container.innerHTML = "";

    for (const col of TOGGLEABLE_COLUMNS) {
      const fieldEl = document.createElement("gux-form-field-checkbox");
      const inputEl = document.createElement("input");
      inputEl.setAttribute("slot", "input");
      inputEl.type = "checkbox";
      inputEl.id = `col-vis-${col.name}`;
      inputEl.checked = visibility[col.name] ?? true;
      const labelEl = document.createElement("label");
      labelEl.setAttribute("slot", "label");
      labelEl.htmlFor = inputEl.id;
      labelEl.textContent = col.label;
      fieldEl.appendChild(inputEl);
      fieldEl.appendChild(labelEl);
      container.appendChild(fieldEl);
    }

    // @ts-ignore
    document.getElementById("col-visibility-modal")!.showModal();
  });

document
  .getElementById("col-visibility-save")!
  .addEventListener("click", () => {
    const visibility: Record<string, boolean> = {};
    for (const col of TOGGLEABLE_COLUMNS) {
      const checkbox = document.getElementById(
        `col-vis-${col.name}`,
      ) as HTMLInputElement | null;
      visibility[col.name] = checkbox?.checked ?? true;
    }
    localStorage.setItem(COL_VISIBILITY_KEY, JSON.stringify(visibility));
    applyColumnVisibility(visibility);
    // @ts-ignore
    document.getElementById("col-visibility-modal")!.close();
  });

// SLA threshold modal
document.getElementById("set-sla-threshold")!.addEventListener("click", () => {
  const stored = localStorage.getItem(SLA_THRESHOLD_KEY);
  const days = stored ? parseInt(stored, 10) : 7;
  (document.getElementById("sla-days-input") as HTMLInputElement).value =
    String(days);
  // @ts-ignore
  document.getElementById("sla-modal")!.showModal();
});

document.getElementById("sla-save-button")!.addEventListener("click", () => {
  const input = document.getElementById("sla-days-input") as HTMLInputElement;
  const days = parseInt(input.value, 10);
  // @ts-ignore
  document.getElementById("sla-modal")!.close();
  if (!isNaN(days) && days > 0) {
    localStorage.setItem(SLA_THRESHOLD_KEY, String(days));
    getActiveEmails();
  }
});

// Active email table sort handler (wired in index.html previously — now in TS)
wireSortableTableHandler();
wireQueueStatsSortHandler();

function wireSortableTableHandler() {
  function parseBritishDateTime(text: string): Date {
    const [datePart, timePart] = text.split(",");
    const [day, month, year] = datePart.trim().split("/").map(Number);
    const [hours, minutes] = timePart.trim().split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }

  const table = document.querySelector("#sortable-table");
  if (!table) return;

  table.addEventListener("guxsortchanged", (event: Event) => {
    const { columnName, sortDirection } = (event as CustomEvent).detail;

    table
      .querySelectorAll("thead tr th")
      .forEach((th) => th.removeAttribute("aria-sort"));

    const col = table.querySelector(
      `thead tr th[data-column-name='${columnName}']`,
    );
    if (col) col.setAttribute("aria-sort", sortDirection);

    const tableBody = table.querySelector("tbody")!;

    if (columnName === "time-in-status" || columnName === "remaining-sla" || columnName === "total-park-duration") {
      const colIdx = getColumnIndex(columnName);
      const sorted = [...tableBody.children].sort((a, b) => {
        const aVal = Number((a.querySelectorAll("td")[colIdx] as HTMLElement)?.dataset.sortValue ?? Number.MAX_SAFE_INTEGER);
        const bVal = Number((b.querySelectorAll("td")[colIdx] as HTMLElement)?.dataset.sortValue ?? Number.MAX_SAFE_INTEGER);
        return sortDirection === "ascending" ? aVal - bVal : bVal - aVal;
      });
      sorted.forEach((node) => tableBody.appendChild(node));
      return;
    }

    let columnIndex: number;
    switch (columnName) {
      case "start-date":
        columnIndex = 1;
        break;
      case "endDate":
        columnIndex = 2;
        break;
      default:
        columnIndex = 1;
    }

    const sorted = [...tableBody.children].sort((a, b) => {
      const aDate = parseBritishDateTime(
        a.querySelectorAll("td")[columnIndex].textContent!,
      );
      const bDate = parseBritishDateTime(
        b.querySelectorAll("td")[columnIndex].textContent!,
      );
      return sortDirection === "ascending"
        ? aDate.getTime() - bDate.getTime()
        : bDate.getTime() - aDate.getTime();
    });

    sorted.forEach((node) => tableBody.appendChild(node));
  });
}
