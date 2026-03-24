import { EmailListElement } from "./types";
import { getSlaThresholdMs, TABLE_PAGE_SIZE } from "./config";
import { convertToDuration, formatShortDateTime, formatRemainingTime, getColumnIndex } from "./utils";

type PreviewFn = (id: string, participantId: string, status: string) => void;
type ClaimFn = (id: string, participantId: string) => void;

const TRANSFERABLE_STATUSES = new Set(["in queue", "interacting", "on hold", "parked"]);

export function addRow(
  id: string,
  firstMessage: string,
  lastMessage: string,
  from: string,
  to: string,
  subject: string,
  status: string,
  firstQueue: string,
  queue: string,
  lastAgent: string,
  externalTag: string,
  processingState: string,
  targetSla: string,
  parkedSince: string,
  finishedParkDuration: number,
  hasNotes: boolean,
  onPreview: PreviewFn,
  onClaim: ClaimFn,
  participantId?: string,
) {
  const table = document.getElementById("tbody");
  if (!table) return;

  const row = document.createElement("tr");
  row.id = id;
  row.setAttribute("data-row-id", id);

  const isSelectable = ["In Queue", "Alerting", "Parked", "Interacting", "On Hold"].includes(status);
  const isClaimDisabled = status === "Interacting" || status === "On Hold";

  // Row select cell
  const selectCell = document.createElement("td");
  selectCell.innerHTML = isSelectable
    ? "<gux-row-select></gux-row-select>"
    : "<gux-row-select disabled></gux-row-select>";

  // Date cells
  const firstMessageCell = document.createElement("td");
  firstMessageCell.dataset.columnName = "start-date";
  firstMessageCell.innerHTML = formatShortDateTime(firstMessage);

  const lastMessageCell = document.createElement("td");
  lastMessageCell.dataset.columnName = "endDate";
  lastMessageCell.innerHTML = formatShortDateTime(lastMessage);

  // Processing time cell
  const processingMs = Date.now() - new Date(lastMessage).getTime();
  const processingTimeCell = document.createElement("td");
  processingTimeCell.dataset.columnName = "processingTime";
  // @ts-ignore – Intl.DurationFormat is not yet in TS lib types
  processingTimeCell.innerHTML = new Intl.DurationFormat("en", {
    style: "narrow",
    fields: ["day", "hour", "minute"],
  }).format(convertToDuration(processingMs));
  if (processingMs > getSlaThresholdMs()) {
    processingTimeCell.style.backgroundColor = "lightcoral";
  }

  // Text cells
  const fromCell = document.createElement("td");
  fromCell.dataset.columnName = "from";
  fromCell.innerHTML = `<gux-truncate>${from}</gux-truncate>`;

  const toCell = document.createElement("td");
  toCell.dataset.columnName = "to";
  toCell.innerHTML = `<gux-truncate>${to}</gux-truncate>`;

  const subjectCell = document.createElement("td");
  subjectCell.dataset.columnName = "subject";
  subjectCell.style.maxWidth = "500px";
  subjectCell.style.wordBreak = "break-word";
  subjectCell.innerHTML = `<gux-truncate>${subject}</gux-truncate>`;

  const statusAccent: Record<string, string> = {
    "Interacting": "success",
    "In Queue": "info",
    "Parked": "warning",
    "Alerting": "warning",
  };
  const statusCell = document.createElement("td");
  statusCell.dataset.columnName = "status";
  const statusBadge = status === "On Hold"
    ? `<gux-badge accent="inherit" class="status-on-hold">${status}</gux-badge>`
    : `<gux-badge accent="${statusAccent[status] ?? "default"}">${status}</gux-badge>`;
  statusCell.innerHTML = statusBadge;

  const lastAgentCell = document.createElement("td");
  lastAgentCell.dataset.columnName = "last-agent";
  if (hasNotes) {
    const indicator = document.createElement("gux-status-indicator-beta");
    indicator.setAttribute("accent", "info");
    indicator.textContent = lastAgent;
    const tooltipSlot = document.createElement("span");
    tooltipSlot.setAttribute("slot", "tooltip-text");
    tooltipSlot.textContent = "There are notes left for this conversation";
    indicator.appendChild(tooltipSlot);
    lastAgentCell.appendChild(indicator);
  } else {
    lastAgentCell.textContent = lastAgent;
  }
  const firstQueueCell = document.createElement("td");
  firstQueueCell.dataset.columnName = "first-queue";
  firstQueueCell.innerHTML = `<gux-truncate>${firstQueue}</gux-truncate>`;

  const queueCell = document.createElement("td");
  queueCell.dataset.columnName = "queue";
  queueCell.innerHTML = `<gux-truncate>${queue}</gux-truncate>`;

  const externalTagCell = document.createElement("td");
  externalTagCell.dataset.columnName = "external-tag";
  externalTagCell.innerHTML = `<gux-truncate>${externalTag}</gux-truncate>`;

  const processingStateCell = document.createElement("td");
  processingStateCell.dataset.columnName = "processing-state";
  processingStateCell.innerHTML = `<gux-truncate>${processingState}</gux-truncate>`;

  const remainingSlaCell = document.createElement("td");
  remainingSlaCell.dataset.columnName = "remaining-sla";
  if (targetSla) {
    const remainingMs = new Date(targetSla).getTime() - Date.now();
    remainingSlaCell.textContent = remainingMs < 0
      ? `${formatRemainingTime(remainingMs)} over SLA`
      : formatRemainingTime(remainingMs);
    remainingSlaCell.dataset.sortValue = String(remainingMs);
    if (remainingMs < 0) {
      remainingSlaCell.style.backgroundColor = "lightcoral";
    }
  } else {
    remainingSlaCell.dataset.sortValue = String(Number.MAX_SAFE_INTEGER);
  }

  const parkedDurationCell = document.createElement("td");
  parkedDurationCell.dataset.columnName = "parked-duration";
  if (parkedSince) {
    const parkedMs = Date.now() - new Date(parkedSince).getTime();
    parkedDurationCell.textContent = formatRemainingTime(parkedMs);
    parkedDurationCell.dataset.sortValue = String(parkedMs);
  } else {
    parkedDurationCell.dataset.sortValue = "0";
  }

  const totalParkDurationCell = document.createElement("td");
  totalParkDurationCell.dataset.columnName = "total-park-duration";
  const currentParkMs = parkedSince ? Date.now() - new Date(parkedSince).getTime() : 0;
  const totalParkMs = currentParkMs + finishedParkDuration;
  if (totalParkMs > 0) {
    totalParkDurationCell.textContent = formatRemainingTime(totalParkMs);
    totalParkDurationCell.dataset.sortValue = String(totalParkMs);
  } else {
    totalParkDurationCell.dataset.sortValue = "0";
  }

  // Hidden participant id cell (read by transfer handlers)
  const participantCell = document.createElement("td");
  participantCell.dataset.columnName = "participant";
  participantCell.textContent = participantId ?? "";

  // Action cell with view + claim buttons
  const actionCell = document.createElement("td");
  const buttonGroup = document.createElement("div");
  buttonGroup.classList.add("button-container");

  const viewButton = document.createElement("gux-button");
  viewButton.setAttribute("accent", "primary");
  viewButton.onclick = () => onPreview(id, participantId!, status);
  const viewIcon = document.createElement("gux-icon");
  viewIcon.setAttribute("icon-name", "fa/eye-regular");
  viewIcon.setAttribute("screenreader-text", "View");
  viewButton.appendChild(viewIcon);
  buttonGroup.appendChild(viewButton);

  const claimButton = document.createElement("gux-button");
  claimButton.setAttribute("accent", "tertiary");
  if (isClaimDisabled) claimButton.setAttribute("disabled", "true");
  claimButton.onclick = () => onClaim(id, participantId!);
  const claimIcon = document.createElement("gux-icon");
  claimIcon.setAttribute("icon-name", "arrow-down");
  claimIcon.setAttribute("screenreader-text", "Claim");
  claimButton.appendChild(claimIcon);
  buttonGroup.appendChild(claimButton);

  actionCell.appendChild(buttonGroup);

  // Assemble row
  row.append(
    selectCell,
    firstMessageCell,
    lastMessageCell,
    processingTimeCell,
    fromCell,
    toCell,
    subjectCell,
    statusCell,
    lastAgentCell,
    firstQueueCell,
    queueCell,
    externalTagCell,
    processingStateCell,
    remainingSlaCell,
    parkedDurationCell,
    totalParkDurationCell,
    participantCell,
    actionCell,
  );

  table.appendChild(row);
}

export function populateTableData(
  emailList: EmailListElement[],
  onPreview: PreviewFn,
  onClaim: ClaimFn,
) {
  const table = document.getElementById("tbody");
  if (!table) return;

  for (const email of emailList) {
    addRow(
      email.conversationId!,
      email.firstMessage!,
      email.lastMessage!,
      email.from!,
      email.to!,
      email.subject!,
      email.status!,
      email.firstQueue!,
      email.queue!,
      email.lastAgent!,
      email.externalTag!,
      email.processingState!,
      email.targetSla!,
      email.parkedSince ?? "",
      email.finishedParkDuration ?? 0,
      email.hasNotes ?? false,
      onPreview,
      onClaim,
      email.lastACDparticipant!,
    );
  }

  document.getElementById("loading")!.style.display = "none";
}

export function filterTable(
  searchValue: string,
  status: string,
  queue: string = "",
  state: string = "",
) {
  const rows = document.querySelectorAll("#tbody tr");
  const statusColumnIndex = getColumnIndex("status");
  const queueColumnIndex = getColumnIndex("queue");
  const stateColumnIndex = getColumnIndex("processing-state");

  if (statusColumnIndex === -1) {
    console.error("Status column not found");
    return;
  }

  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    let match = Array.from(cells).some((cell) =>
      cell.textContent?.toLowerCase().includes(searchValue.toLowerCase()),
    );

    if (
      status &&
      cells[statusColumnIndex]?.textContent?.toLowerCase() !==
        status.toLowerCase()
    ) {
      match = false;
    }

    if (queue && queueColumnIndex !== -1) {
      if (
        cells[queueColumnIndex]?.textContent?.toLowerCase() !==
        queue.toLowerCase()
      ) {
        match = false;
      }
    }

    if (state && stateColumnIndex !== -1) {
      if (
        cells[stateColumnIndex]?.textContent?.toLowerCase() !==
        state.toLowerCase()
      ) {
        match = false;
      }
    }

    (row as HTMLElement).dataset.filterMatch = match ? "true" : "false";
  });

  updateFilterInfo(searchValue, status, queue, state);
}

export function updateFilterInfo(
  searchValue: string,
  status: string,
  queue: string,
  state: string = "",
) {
  const bar = document.getElementById("filter-info-bar");
  if (!bar) return;

  const allRows = document.querySelectorAll("#tbody tr");
  const total = allRows.length;
  const visible = Array.from(allRows).filter(
    (r) => (r as HTMLElement).dataset.filterMatch !== "false",
  ).length;

  bar.style.display = "block";

  if (!searchValue && !status && !queue && !state) {
    bar.textContent = `Showing ${total} emails`;
    return;
  }

  const parts: string[] = [];
  if (searchValue) parts.push(`Search: "${searchValue}"`);
  if (status) parts.push(`Status: ${status}`);
  if (queue) parts.push(`Queue: ${queue}`);
  if (state) parts.push(`State: ${state}`);

  bar.textContent = `${parts.join(" · ")} · Showing ${visible} of ${total} emails`;
}

/** Returns the selected rows that are eligible for transfer (active statuses). */
export function getSelectedTransferableRows(): {
  rowId: string;
  participantId: string;
}[] {
  const participantColumnIndex = getColumnIndex("participant");
  const statusColumnIndex = getColumnIndex("status");

  if (participantColumnIndex === -1 || statusColumnIndex === -1) {
    console.error("Participant or status column not found");
    return [];
  }

  const rows = document.getElementById("tbody")!.children;
  const result: { rowId: string; participantId: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.hasAttribute("data-selected-row")) continue;

    const cells = row.querySelectorAll("td");
    const rowStatus = cells[statusColumnIndex]?.textContent?.toLowerCase() ?? "";
    if (!TRANSFERABLE_STATUSES.has(rowStatus)) continue;

    const participantId = cells[participantColumnIndex]?.textContent;
    if (!participantId) continue;

    result.push({ rowId: row.id, participantId });
  }

  return result;
}

/** Returns row ids for all selected rows (used for bulk disconnect). */
export function getSelectedRowIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("#tbody tr[data-selected-row]"),
  ).map((row) => row.id);
}

export function getActiveFilterValues(): {
  search: string;
  status: string;
  queue: string;
  state: string;
} {
  return {
    search: (document.querySelector("[name=search-field]") as HTMLInputElement)
      .value,
    status: (
      document.querySelector("[name=status-field]") as HTMLSelectElement
    ).value,
    queue: (
      document.querySelector("[name=queue-filter-field]") as HTMLSelectElement
    ).value,
    state: (
      document.querySelector("[name=state-filter-field]") as HTMLSelectElement | null
    )?.value ?? "",
  };
}

export function applyPagination(page: number): number {
  const allRows = Array.from(document.querySelectorAll<HTMLElement>("#tbody tr"));
  const matchedRows = allRows.filter(r => r.dataset.filterMatch !== "false");
  const totalPages = Math.max(1, Math.ceil(matchedRows.length / TABLE_PAGE_SIZE));
  const clampedPage = Math.max(1, Math.min(page, totalPages));
  const start = (clampedPage - 1) * TABLE_PAGE_SIZE;
  const end = start + TABLE_PAGE_SIZE;

  allRows.forEach(row => {
    if (row.dataset.filterMatch === "false") {
      row.style.display = "none";
    } else {
      const idx = matchedRows.indexOf(row);
      row.style.display = idx >= start && idx < end ? "table-row" : "none";
    }
  });

  const paginationEl = document.getElementById("pagination-controls");
  const pageInfo = document.getElementById("pagination-info");
  const firstBtn = document.getElementById("pagination-first");
  const prevBtn = document.getElementById("pagination-prev");
  const nextBtn = document.getElementById("pagination-next");
  const lastBtn = document.getElementById("pagination-last");

  if (paginationEl) paginationEl.style.display = totalPages > 1 ? "flex" : "none";
  if (pageInfo) pageInfo.textContent = `Page ${clampedPage} of ${totalPages}`;

  const atFirst = clampedPage <= 1;
  const atLast = clampedPage >= totalPages;

  if (firstBtn) atFirst ? firstBtn.setAttribute("disabled", "true") : firstBtn.removeAttribute("disabled");
  if (prevBtn) atFirst ? prevBtn.setAttribute("disabled", "true") : prevBtn.removeAttribute("disabled");
  if (nextBtn) atLast ? nextBtn.setAttribute("disabled", "true") : nextBtn.removeAttribute("disabled");
  if (lastBtn) atLast ? lastBtn.setAttribute("disabled", "true") : lastBtn.removeAttribute("disabled");

  return clampedPage;
}
