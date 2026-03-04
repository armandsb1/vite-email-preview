import ClientApp from "purecloud-client-app-sdk";
import { capi, uapi } from "./api";
import { getUTCOffset } from "./utils";

function getInputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value;
}

function notification(myClientApp: ClientApp, type: string, message: string) {
  if (window.location !== window.parent.location) {
    myClientApp.alerting.showToastPopup(type, message);
    return;
  }
  window.alert(message);
}

// ─── Job creation ───────────────────────────────────────────────────────────

function buildIntervalString(): string {
  const datepicker = getInputValue("datepicker");
  const [from, to] = datepicker.split("/");
  const tz = getUTCOffset();
  return `${from}T00:00:00${tz}/${to}T23:59:59${tz}`;
}

async function createJobAni() {
  return capi.postAnalyticsConversationsDetailsJobs({
    interval: buildIntervalString(),
    segmentFilters: [
      {
        type: "and",
        predicates: [{ dimension: "ani", value: getInputValue("input") }],
      },
    ],
    orderBy: "conversationStart",
     "order": "desc"
  });
}

async function createJobExternalTag() {
  return capi.postAnalyticsConversationsDetailsJobs({
    interval: buildIntervalString(),
    conversationFilters: [
      {
        type: "and",
        predicates: [
          { dimension: "externalTag", value: getInputValue("input") },
        ],
      },
    ],
    orderBy: "conversationStart",
  });
}

async function createJobEmail() {
  const query: any = {
    interval: buildIntervalString(),
    segmentFilters: [
      {
        type: "and",
        predicates: [{ dimension: "mediaType", value: "email" }],
      },
    ],
    orderBy: "conversationStart",
  };

  const searchString = getInputValue("input");
  if (searchString) {
    query.segmentFilters[0].clauses = [
      {
        type: "or",
        predicates: [
          { type: "dimension", dimension: "addressFrom", value: searchString },
          { type: "dimension", dimension: "addressTo", value: searchString },
        ],
      },
    ];
  }

  return capi.postAnalyticsConversationsDetailsJobs(query);
}

async function pollJobUntilFulfilled(jobId: string) {
  let status = await capi.getAnalyticsConversationsDetailsJob(jobId);
  while (status.state !== "FULFILLED" && status.state !== "FAILED") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    status = await capi.getAnalyticsConversationsDetailsJob(jobId);
  }
  if (status.state === "FAILED") {
    throw new Error("Analytics job failed.");
  }
}

async function collectAllJobResults(jobId: string) {
  let result = await capi.getAnalyticsConversationsDetailsJobResults(jobId);
  if (!result.cursor) return result;

  const allConversations = [...(result.conversations ?? [])];
  while (result.cursor) {
    const next = await capi.getAnalyticsConversationsDetailsJobResults(jobId, {
      cursor: result.cursor,
    });
    allConversations.push(...(next.conversations ?? []));
    result.cursor = next.cursor;
  }

  return { ...result, conversations: allConversations };
}

async function runAnalyticsJob() {
  const type = getInputValue("type");
  let job: any;

  if (type === "ani") job = await createJobAni();
  else if (type === "email") job = await createJobEmail();
  else if (type === "externalTag") job = await createJobExternalTag();
  else throw new Error(`Unknown search type: ${type}`);

  await pollJobUntilFulfilled(job.jobId);
  return collectAllJobResults(job.jobId);
}

// ─── Table building ──────────────────────────────────────────────────────────

export async function buildTableRows(
  rows: any[],
  onPreviewEmail: (
    conversationId: string,
    participantId: string,
    status: string,
  ) => void,
  myClientApp: ClientApp,
) {
  for (const row of rows) {
    let tableBody = document.getElementById("tableBody");

    if (!tableBody) {
      // First row = column headers
      const top = document.getElementById("tableLocation") as HTMLElement;
      const guxTable = document.createElement("gux-table");
      const table = document.createElement("table");
      const header = document.createElement("thead");
      const headerRow = document.createElement("tr");
      const tbody = document.createElement("tbody");

      headerRow.setAttribute("data-row-id", "head");
      tbody.setAttribute("id", "tableBody");
      table.setAttribute("slot", "data");
      guxTable.setAttribute("resizable-columns", "");

      for (const item of row) {
        if (item === "Disconnected in App") continue;
        const th = document.createElement("th");
        th.setAttribute("data-column-name", item);
        th.style.textWrap = "auto";
        if (item === "Subject") {
          th.style.maxWidth = "200px";
          th.style.overflow = "hidden";
          th.style.textOverflow = "ellipsis";
        }
        th.innerHTML = item;
        th.title = item;
        headerRow.appendChild(th);
      }

      header.appendChild(headerRow);
      table.appendChild(header);
      table.appendChild(tbody);
      guxTable.appendChild(table);
      top.appendChild(guxTable);
      continue;
    }

    // Data row
    const tr = document.createElement("tr");
    let columnIndex = 0;

    for (const item of row) {
      const columnName = rows[0][columnIndex];
      columnIndex++;
      if (columnName === "Disconnected in App") continue;

      const td = document.createElement("td");
      if (columnName === "Subject") {
        td.style.maxWidth = "200px";
        td.style.overflow = "hidden";
        td.style.textOverflow = "ellipsis";
        td.style.whiteSpace = "nowrap";
        td.title = item;
      }

      if (item === "OpenBtn") {
        const btn = document.createElement("gux-button");
        btn.setAttribute("accent", "secondary");
        btn.setAttribute("size", "small");
        btn.innerText = "Open in Genesys";
        btn.onclick = function () {
          const conversationId =
            (this as HTMLElement).parentNode!.parentNode!.firstChild!
              .textContent!;
          myClientApp.conversations.showInteractionDetails(conversationId);
        };
        td.appendChild(btn);
      } else if (item === "PreviewBtn") {
        const btn = document.createElement("gux-button");
        btn.setAttribute("accent", "secondary");
        btn.setAttribute("size", "small");
        btn.innerText = "Preview";
        if (row[1] === "voice") btn.setAttribute("disabled", "true");
        btn.onclick = function () {
          const conversationId =
            (this as HTMLElement).parentNode!.parentNode!.firstChild!
              .textContent!;
          onPreviewEmail(conversationId, "N/A", "Disconnected");
        };
        td.appendChild(btn);
      } else {
        td.innerHTML = item;
      }

      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }
}

// ─── Main getData entry point ────────────────────────────────────────────────

export async function getData(
  myClientApp: ClientApp,
  onPreviewEmail: (
    conversationId: string,
    participantId: string,
    status: string,
  ) => void,
  rowFilter?: (row: any[]) => boolean,
) {
  let csvRows: any[] = [];
  document.getElementById("tableLocation")!.innerHTML = "";

  if (
    !rowFilter &&
    getInputValue("input") === ""
  ) {
    notification(myClientApp, "Info", "Please specify search criteria.");
    return;
  }

  document.getElementById("loading")!.style.display = "block";

  try {
    const conversations: any = await runAnalyticsJob();
    document.getElementById("tCount")!.innerText =
      `Total Count: ${conversations.conversations.length}`;

    if (conversations.conversations.length === 0) {
      notification(myClientApp, "Info", "No conversations found for the given criteria.");
      document.getElementById("loading")!.style.display = "none";
      return;
    }

    // Sort most recent first
    conversations.conversations.sort(
      (a: any, b: any) =>
        new Date(b.conversationStart).getTime() -
        new Date(a.conversationStart).getTime(),
    );

    // Bulk-fetch agent names to resolve missing participantName values
    const userIds: string[] = conversations.conversations
      .map((conv: any) =>
        conv.participants.find((p: any) => p.purpose === "agent")?.userId,
      )
      .filter((id: string | undefined): id is string => id !== undefined);

    const uniqueUserIds = [...new Set(userIds)];
    const allUserEntities: any[] = [];
    for (let i = 0; i < uniqueUserIds.length; i += 100) {
      const batch = uniqueUserIds.slice(i, i + 100);
      const result = await uapi.getUsers({ pageSize: 100, id: batch });
      if (result?.entities) allUserEntities.push(...result.entities);
    }
    const userById = new Map(allUserEntities.map((u) => [u.id, u.name]));

    // Build csvRows array (header + data rows)
    csvRows.push([
      "ConversationId",
      "Media Type",
      "First queue",
      "Subject",
      "First Agent",
      "Start Date",
      "Open",
      "Preview",
      "Disconnected in App",
    ]);

    for (const conv of conversations.conversations) {
      let agentName =
        conv.participants.find((p: any) => p.purpose === "agent")
          ?.participantName ?? "N/A";
      if (agentName === "N/A") {
        const userId = conv.participants.find(
          (p: any) => p.purpose === "agent",
        )?.userId;
        agentName = userById.get(userId) ?? "N/A";
      }

      const firstCustomer = conv.participants.find(
        (p: any) => p.purpose === "customer" || p.purpose === "external",
      );
      const disconnectedInApp = firstCustomer?.attributes
        ? Object.keys(firstCustomer.attributes).some((key: string) =>
            key.toLowerCase().startsWith("disconnected"),
          )
        : false;

      csvRows.push([
        conv.conversationId,
        conv.participants[0].sessions[0].mediaType,
        conv.participants.find((p: any) => p.purpose === "acd")
          ?.participantName ?? "N/A",
        firstCustomer?.sessions?.[0]?.segments?.[0]?.subject ?? "N/A",
        agentName,
        new Date(conv.conversationStart).toLocaleString().replace(",", " "),
        "OpenBtn",
        "PreviewBtn",
        disconnectedInApp,
      ]);
    }

    const rowsToDisplay = rowFilter
      ? [csvRows[0], ...csvRows.slice(1).filter(rowFilter)]
      : csvRows;

    await buildTableRows(rowsToDisplay, onPreviewEmail, myClientApp);
    document.getElementById("loading")!.style.display = "none";
  } catch (err) {
    console.error("getData error:", err);
    notification(myClientApp, "Error", `Error: ${err}`);
  }
}

export function clearData() {
  const tableLocation = document.getElementById("tableLocation");
  if (tableLocation) tableLocation.innerHTML = "";

  const download = document.getElementById("download");
  if (download) download.style.display = "none";

  document.getElementById("tCount")!.innerText = "Total Count: 0";
}

export async function getLakeTime() {
  const lake = await capi.getAnalyticsConversationsDetailsJobsAvailability();
  (document.getElementById("lakeTime") as HTMLInputElement).innerText =
    `Data available from: ${new Date(lake.dataAvailabilityDate as string).toLocaleString()}`;
}
