import platformClient from "purecloud-platform-client-v2";
import {
  registerSparkComponents,
  registerSparkChartComponents,
} from "genesys-spark";
import ClientApp from "purecloud-client-app-sdk";

import { client, capi, uapi, rapi, papi } from "./api";
import {
  DEFAULT_REGION,
  PAGE_SIZE,
  USERS_PAGE_SIZE,
  QUEUES_PAGE_SIZE,
  EMAIL_QUEUE_FILTER_KEYWORDS,
  ACTIVE_EMAIL_LOOKBACK_WINDOWS,
  SLA_THRESHOLD_KEY,
} from "./config";
import {
  delay,
  getSessionParam,
  getUTCOffset,
  formatDateRange,
  getColumnIndex,
} from "./utils";
import {
  extractEmailData,
  getEmailsByStatus,
  getConversationThread,
} from "./email-processing";
import {
  populateTableData,
  filterTable,
  getSelectedTransferableRows,
  getSelectedRowIds,
  getActiveFilterValues,
} from "./table";
import {
  populateQueueStats,
  refreshQueueFilterLabels,
  renderHourlyBarChart,
  wireQueueStatsSortHandler,
} from "./stats";
import { getData, clearData, getLakeTime } from "./history";
import { conversationDetailQuery as ConversationDetailQuery } from "./types";

// ─── Bootstrap: URL params → sessionStorage ──────────────────────────────────

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
let selectedConversationId = "";
let selectedParticipantId = "";
let queueCounts: Record<string, number> = {};
let queueNameById: Record<string, string> = {};

// ─── Spark web components ─────────────────────────────────────────────────────

async function loadSparkComponents() {
  await registerSparkComponents();
  registerSparkChartComponents();
}
loadSparkComponents();

// ─── Entry point ──────────────────────────────────────────────────────────────

start();

async function start() {
  try {
    if (!gc_clientId || !gc_redirectUrl) {
      console.error("Client ID or Redirect URL not provided");
      return;
    }
    await client.loginImplicitGrant(gc_clientId, gc_redirectUrl, {});
    user = await uapi.getUsersMe({});
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
    const [conversations, todayOffered, hourlyData] = await Promise.all([
      fetchActiveEmailConversations(),
      getQueueTodayOffered(),
      getEmailsOfferedByHour(),
    ]);

    if (!conversations) return;

    const emailsList = [
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

    const processingStateMap = await fetchProcessingStates(
      emailsList.map((e) => e.conversationId!).filter(Boolean),
    );
    for (const email of emailsList) {
      const attrs = processingStateMap[email.conversationId!];
      email.processingState = attrs?.processingStatus ?? "";
      email.targetSla = attrs?.targetSla ?? "";
    }
    populateStateFilterDropdown(emailsList);

    document.getElementById("loading")!.style.display = "none";

    populateTableData(emailsList, previewEmail, claimEmail);
    queueCounts = populateQueueStats(
      emailsList,
      todayOffered,
      handleQueueStatClick,
    );
    refreshQueueFilterLabels(queueCounts);
    renderHourlyBarChart(hourlyData);

    const { search, status, queue, state } = getActiveFilterValues();
    filterTable(search, status, queue, state);
  } catch (error) {
    console.error("getActiveEmails error:", error);
  }
}

async function fetchActiveEmailConversations() {
  let data: platformClient.Models.AnalyticsConversationQueryResponse = {
    conversations: [],
  };

  for (const window of ACTIVE_EMAIL_LOOKBACK_WINDOWS) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - window.startDaysAgo);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - window.endDaysAgo);

    const body: ConversationDetailQuery = {
      segmentFilters: [
        {
          type: "or",
          predicates: [
            {
              type: "dimension",
              dimension: "mediaType",
              operator: "matches",
              value: "email",
            },
          ],
        },
      ],
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
      if (!firstPage.conversations) break;

      data.conversations = [...data.conversations!, ...firstPage.conversations];

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
    } catch (error) {
      console.error(`fetchActiveEmailConversations loop error:`, error);
    }
  }

  return data;
}

async function getQueueTodayOffered(): Promise<Record<string, number>> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  try {
    const result = await capi.postAnalyticsConversationsAggregatesQuery({
      interval: `${startOfDay.toISOString()}/${endOfDay.toISOString()}`,
      groupBy: ["queueId"],
      filter: {
        type: "and",
        predicates: [
          { type: "dimension", dimension: "mediaType", value: "email" },
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
      const count =
        r.data?.[0]?.metrics?.find((m: any) => m.metric === "nOffered")?.stats
          ?.count ?? 0;
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
    const result = await capi.postAnalyticsConversationsAggregatesQuery({
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

  const emailContent = await getConversationThread(id);
  if (!emailContent) return;

  document.getElementById("preview-modal-content")!.innerHTML = emailContent;

  const claimBtn = document.getElementById("claim-email")!;
  claimBtn.setAttribute("disabled", "false");
  claimBtn.innerHTML = "Claim";

  if (status === "Interacting" || status === "On Hold") {
    claimBtn.setAttribute("disabled", "true");
  } else if (status === "Disconnected") {
    claimBtn.innerHTML = "Reconnect";
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
      const threadHtml = await getConversationThread(conversationId);

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
      await capi.putConversationsEmailMessagesDraft(created.id, draft);

      const newConversation = await capi.getConversationsEmail(created.id);
      if (!newConversation.participants) return;
      const agentParticipantId = newConversation.participants[0]?.id;
      if (!agentParticipantId) return;

      await capi.patchConversationsEmailParticipant(
        created.id,
        agentParticipantId,
        {
          state: "PARKED",
        },
      );
      await capi.patchConversationsEmailParticipantParkingstate(
        created.id,
        agentParticipantId,
        { state: "CONNECTED" },
      );
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

function populateStateFilterDropdown(emailsList: { processingState?: string }[]) {
  const listbox = document.getElementById("state-filter-value")!;
  const current = (listbox as any).value ?? "";
  const unique = [...new Set(
    emailsList.map((e) => e.processingState ?? "").filter(Boolean),
  )].sort();

  listbox.innerHTML = '<gux-option value="">All</gux-option>';
  for (const s of unique) {
    const opt = document.createElement("gux-option");
    opt.setAttribute("value", s);
    opt.textContent = s;
    listbox.appendChild(opt);
  }

  if (unique.includes(current)) {
    (document.getElementById("state-filter-field") as any).value = current;
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
          processingStatus: entity.customAttributes?.processingStatus ?? "",
          targetSla: entity.customAttributes?.targetSla ?? "",
        };
      }
    }
  }
  return map;
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

// ─── Data loading helpers ─────────────────────────────────────────────────────

async function getUsers() {
  const list = document.getElementById("listUsers")!;
  let pageNumber = 1;
  let hasNextPage = true;

  try {
    while (hasNextPage) {
      const users = await uapi.getUsers({
        pageSize: USERS_PAGE_SIZE,
        pageNumber,
        state: "active",
      });
      if (!users?.entities) break;

      for (const u of users.entities) {
        const item = document.createElement("gux-option");
        item.innerText = u.name!;
        item.setAttribute("value", u.id!);
        list.appendChild(item);
      }

      hasNextPage = !!users.nextUri;
      pageNumber++;
    }
  } catch (error) {
    console.error("getUsers error:", error);
  }
}

async function getQueues() {
  try {
    const queues = await rapi.getRoutingQueues({ pageSize: QUEUES_PAGE_SIZE });
    if (!queues?.entities) return;

    const list = document.getElementById("listQueues")!;
    const filterList = document.getElementById("queue-filter-value")!;

    list.innerHTML = "";
    filterList.innerHTML = "";

    for (const queue of queues.entities) {
      queueNameById[queue.id!] = queue.name!;

      const item = document.createElement("gux-option");
      item.innerText = queue.name!;
      item.setAttribute("value", queue.id!);
      list.appendChild(item);

      const isEmailQueue = EMAIL_QUEUE_FILTER_KEYWORDS.some((kw) =>
        queue.name!.toLowerCase().includes(kw),
      );
      if (isEmailQueue) {
        const filterItem = document.createElement("gux-option");
        filterItem.innerText = queue.name!;
        filterItem.setAttribute("value", queue.name!);
        filterList.appendChild(filterItem);
      }
    }
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

function handleQueueStatClick(queueName: string) {
  document.getElementById("queue-stats-panel")!.style.display = "none";

  const queueDropdown = document.getElementById("queue-filter-field") as any;
  queueDropdown.value = queueName;
  queueDropdown.guxForceUpdate?.();

  const { search, status, state } = getActiveFilterValues();
  filterTable(search, status, queueName, state);
  refreshQueueFilterLabels(queueCounts);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Search field: trigger on Enter key
document.getElementById("search-value")!.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const { search, status, queue, state } = getActiveFilterValues();
  filterTable(search, status, queue, state);
  const searchInput = document.querySelector(
    "[name=search-field]",
  ) as HTMLInputElement;
  searchInput.value = "";
  (document.getElementById("search-field") as any).guxForceUpdate?.();
});

// Status filter dropdown
document.getElementById("status-value")!.addEventListener("change", () => {
  const { search, status, queue, state } = getActiveFilterValues();
  filterTable(search, status, queue, state);
});

// Queue filter dropdown
document
  .getElementById("queue-filter-value")!
  .addEventListener("change", function () {
    const { search, status, state } = getActiveFilterValues();
    filterTable(search, status, (this as HTMLSelectElement).value, state);
    refreshQueueFilterLabels(queueCounts);
  });

// State filter dropdown
document
  .getElementById("state-filter-value")!
  .addEventListener("change", function () {
    const { search, status, queue } = getActiveFilterValues();
    filterTable(search, status, queue, (this as HTMLSelectElement).value);
  });

// Toolbar buttons
document.getElementById("refresh")!.addEventListener("click", () => start());

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
  });

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
  { name: "remaining-sla", label: "Remaining SLA", defaultVisible: false },
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

    if (columnName === "remaining-sla") {
      const colIdx = getColumnIndex("remaining-sla");
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
