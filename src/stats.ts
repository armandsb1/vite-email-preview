import { EmailListElement } from "./types";
import { convertToDuration } from "./utils";

// Builds the queue statistics table and pie chart. Returns the counts map so the caller
// (main.ts) can cache it for refreshQueueFilterLabels without recomputing.
export function populateQueueStats(
  emailList: EmailListElement[],
  todayOffered: Record<string, number>,
  onQueueClick: (queueName: string) => void,
): Record<string, number> {
  const tbody = document.getElementById("queue-stats-tbody");
  if (!tbody) return {};

  tbody.innerHTML = "";

  const counts: Record<string, number> = {};
  const oldestMessage: Record<string, number> = {};  // earliest lastMessage timestamp per queue
  const totalWait: Record<string, number> = {};       // sum of (now - lastMessage) per queue, for average wait

  for (const email of emailList) {
    const queueName = email.queue || "Unknown";
    if (queueName === "Unknown") continue;
    counts[queueName] = (counts[queueName] || 0) + 1;
    const msgTime = email.lastMessage
      ? new Date(email.lastMessage).getTime()
      : Date.now();
    if (oldestMessage[queueName] === undefined || msgTime < oldestMessage[queueName]) {
      oldestMessage[queueName] = msgTime;
    }
    totalWait[queueName] = (totalWait[queueName] || 0) + (Date.now() - msgTime);
  }

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);

  // Pie chart: top 5 queues + "Others"
  const top5 = sorted.slice(0, 5);
  const othersTotal = sorted.slice(5).reduce((sum, [, c]) => sum + c, 0);
  const pieData: [string, number][] = [...top5];
  if (othersTotal > 0) pieData.push(["Others", othersTotal]);
  renderQueuePieChart(pieData);

  // @ts-ignore – Intl.DurationFormat is not yet in TS lib types
  const durationFormat = new Intl.DurationFormat("en", {
    style: "narrow",
    fields: ["day", "hour", "minute"],
  });

  for (const [name, count] of sorted) {
    const waitMs = Date.now() - oldestMessage[name];
    const avgWaitMs = Math.round(totalWait[name] / count);
    const waitFormatted = durationFormat.format(convertToDuration(waitMs));
    const avgWaitFormatted = durationFormat.format(convertToDuration(avgWaitMs));
    const todayCount = todayOffered[name] ?? 0;

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.dataset.queue = name;
    tr.dataset.waitMs = String(waitMs);
    tr.dataset.avgMs = String(avgWaitMs);
    tr.dataset.today = String(todayCount);
    tr.innerHTML = `<td>${name}</td><td style="text-align:right">${count}</td><td>${waitFormatted}</td><td>${avgWaitFormatted}</td><td style="text-align:right">${todayCount}</td>`;
    tr.addEventListener("click", () => onQueueClick(name));
    tbody.appendChild(tr);
  }

  return counts;
}

// Updates each queue filter option to show the active email count next to the queue name.
// The count is only appended for un-selected options; selected ones show the bare name to
// keep the dropdown chips compact and avoid double-rendering the number.
export function refreshQueueFilterLabels(queueCounts: Record<string, number>) {
  const filterList = document.getElementById("queue-filter-value");
  if (!filterList) return;

  const selectedValues: string[] = (() => {
    const raw = (document.getElementById("queue-filter-field") as any)?.value;
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  })();
  filterList.querySelectorAll("gux-option-multi").forEach((option) => {
    const queueName = option.getAttribute("value")!;
    if (!queueName) return;
    const count = queueCounts[queueName] || 0;
    const isSelected = selectedValues.includes(queueName);
    (option as HTMLElement).innerHTML =
      !isSelected && count > 0
        ? `<span style="display:flex;justify-content:space-between;width:100%"><span>${queueName}</span><span>${count}</span></span>`
        : queueName;
  });
}

export function renderQueuePieChart(data: [string, number][]) {
  const chart = document.getElementById("queue-stats-chart") as any;
  if (!chart) return;

  const chartData = {
    values: data.map(([category, value]) => ({ category, value })),
  };

  const apply = () => {
    chart.showTooltip = true;
    chart.tooltipOptions = {
      formatTooltip: (datum: any, sanitize: (v: unknown) => string) =>
        `<table><tr><td class="key">Queue</td><td class="value">${sanitize(datum.category)}</td></tr><tr><td class="key">Emails</td><td class="value">${sanitize(String(datum.value))}</td></tr></table>`,
    };
    chart.chartData = chartData;
  };

  // The chart component may not be upgraded yet when this runs; defer via whenDefined if needed
  if (customElements.get("gux-chart-donut-beta")) {
    apply();
  } else {
    customElements.whenDefined("gux-chart-donut-beta").then(apply);
  }
}

export function renderHourlyBarChart(data: { hour: string; count: number }[]) {
  const container = document.getElementById("queue-hourly-chart");
  if (!container) return;

  const W = 483;
  const H = 265;
  const margin = { top: 16, right: 16, bottom: 52, left: 40 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;

  const maxRaw = Math.max(...data.map((d) => d.count), 1);
  const niceMax = maxRaw <= 5 ? 5 : Math.ceil(maxRaw / 5) * 5;
  const yTicks = 4;
  const barWidth = data.length > 0 ? plotW / data.length : plotW;
  const barPad = Math.max(barWidth * 0.15, 2);

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.style.display = "block";

  const g = document.createElementNS(ns, "g");
  g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
  svg.appendChild(g);

  // Chart title
  const titleEl = document.createElementNS(ns, "text");
  titleEl.setAttribute("x", String(margin.left + plotW / 2));
  titleEl.setAttribute("y", "12");
  titleEl.setAttribute("text-anchor", "middle");
  titleEl.setAttribute("font-size", "15");
  titleEl.setAttribute("font-weight", "600");
  titleEl.setAttribute("fill", "#555");
  titleEl.textContent = "Offered today by hour";
  svg.appendChild(titleEl);

  // Y gridlines + labels
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((niceMax / yTicks) * i);
    const y = plotH - (val / niceMax) * plotH;

    const gridLine = document.createElementNS(ns, "line");
    gridLine.setAttribute("x1", "0");
    gridLine.setAttribute("y1", String(y));
    gridLine.setAttribute("x2", String(plotW));
    gridLine.setAttribute("y2", String(y));
    gridLine.setAttribute("stroke", "#e0e0e0");
    gridLine.setAttribute("stroke-width", "1");
    g.appendChild(gridLine);

    const yLabel = document.createElementNS(ns, "text");
    yLabel.setAttribute("x", "-6");
    yLabel.setAttribute("y", String(y));
    yLabel.setAttribute("text-anchor", "end");
    yLabel.setAttribute("dominant-baseline", "middle");
    yLabel.setAttribute("font-size", "11");
    yLabel.setAttribute("fill", "#888");
    yLabel.textContent = String(val);
    g.appendChild(yLabel);
  }

  // Bars + X labels
  data.forEach((d, i) => {
    const x = i * barWidth;
    const barH = Math.max((d.count / niceMax) * plotH, d.count > 0 ? 1 : 0);
    const y = plotH - barH;

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(x + barPad));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(Math.max(barWidth - barPad * 2, 1)));
    rect.setAttribute("height", String(barH));
    rect.setAttribute("fill", "#1F6BDE");
    rect.setAttribute("rx", "2");
    g.appendChild(rect);

    const cx = x + barWidth / 2;
    const labelY = plotH + 8;
    const xLabel = document.createElementNS(ns, "text");
    xLabel.setAttribute("x", String(cx));
    xLabel.setAttribute("y", String(labelY));
    xLabel.setAttribute("text-anchor", "end");
    xLabel.setAttribute("transform", `rotate(-45, ${cx}, ${labelY})`);
    xLabel.setAttribute("font-size", "10");
    xLabel.setAttribute("fill", "#888");
    xLabel.textContent = d.hour;
    g.appendChild(xLabel);
  });

  // Axes
  const yAxis = document.createElementNS(ns, "line");
  yAxis.setAttribute("x1", "0");
  yAxis.setAttribute("y1", "0");
  yAxis.setAttribute("x2", "0");
  yAxis.setAttribute("y2", String(plotH));
  yAxis.setAttribute("stroke", "#bbb");
  yAxis.setAttribute("stroke-width", "1");
  g.appendChild(yAxis);

  const xAxis = document.createElementNS(ns, "line");
  xAxis.setAttribute("x1", "0");
  xAxis.setAttribute("y1", String(plotH));
  xAxis.setAttribute("x2", String(plotW));
  xAxis.setAttribute("y2", String(plotH));
  xAxis.setAttribute("stroke", "#bbb");
  xAxis.setAttribute("stroke-width", "1");
  g.appendChild(xAxis);

  // Y axis title
  const yTitle = document.createElementNS(ns, "text");
  yTitle.setAttribute("x", String(-plotH / 2));
  yTitle.setAttribute("y", "-30");
  yTitle.setAttribute("text-anchor", "middle");
  yTitle.setAttribute("transform", "rotate(-90)");
  yTitle.setAttribute("font-size", "11");
  yTitle.setAttribute("fill", "#888");
  yTitle.textContent = "Offered";
  g.appendChild(yTitle);

  container.innerHTML = "";
  container.appendChild(svg);
}

const STATUS_COLORS: Record<string, string> = {
  "In Queue":    "#1F6BDE",
  "Interacting": "#37a56a",
  "Parked":      "#E5A000",
  "Alerting":    "#F26022",
  "On Hold":     "#8fa8d8",
};
const STATUS_ORDER = ["In Queue", "Interacting", "Parked", "Alerting", "On Hold"];

export function renderStatusStackedBarChart(emailList: EmailListElement[]) {
  const container = document.getElementById("queue-status-chart");
  if (!container) return;

  // Build data: { queueName -> { status -> count } }
  const data: Record<string, Record<string, number>> = {};
  for (const email of emailList) {
    const q = email.queue || "Unknown";
    if (q === "Unknown") continue;
    if (!data[q]) data[q] = {};
    const s = email.status || "Unknown";
    data[q][s] = (data[q][s] || 0) + 1;
  }

  const queues = Object.entries(data)
    .map(([name, counts]) => ({ name, total: Object.values(counts).reduce((a, b) => a + b, 0), counts }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (queues.length === 0) { container.innerHTML = ""; return; }

  const W = 500;
  const H = 290;
  const LEGEND_H = 24;
  const margin = { top: 16, right: 16, bottom: 80, left: 36 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  const barPadRatio = 0.25;
  const barW = plotW / queues.length;
  const barInner = barW * (1 - barPadRatio);
  const barOffset = barW * barPadRatio / 2;

  const maxTotal = Math.max(...queues.map(q => q.total), 1);
  const niceMax = maxTotal <= 5 ? 5 : Math.ceil(maxTotal / 5) * 5;
  const yTicks = 4;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.style.display = "block";

  const g = document.createElementNS(ns, "g");
  g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
  svg.appendChild(g);

  // Chart title
  const titleEl = document.createElementNS(ns, "text");
  titleEl.setAttribute("x", String(margin.left + plotW / 2));
  titleEl.setAttribute("y", "12");
  titleEl.setAttribute("text-anchor", "middle");
  titleEl.setAttribute("font-size", "15");
  titleEl.setAttribute("font-weight", "600");
  titleEl.setAttribute("fill", "#555");
  titleEl.textContent = "Top 5 queues status breakdown";
  svg.appendChild(titleEl);

  // Y gridlines + labels
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((niceMax / yTicks) * i);
    const y = plotH - (val / niceMax) * plotH;
    const gridLine = document.createElementNS(ns, "line");
    gridLine.setAttribute("x1", "0"); gridLine.setAttribute("y1", String(y));
    gridLine.setAttribute("x2", String(plotW)); gridLine.setAttribute("y2", String(y));
    gridLine.setAttribute("stroke", "#e0e0e0"); gridLine.setAttribute("stroke-width", "1");
    g.appendChild(gridLine);
    const yLabel = document.createElementNS(ns, "text");
    yLabel.setAttribute("x", "-6"); yLabel.setAttribute("y", String(y));
    yLabel.setAttribute("text-anchor", "end"); yLabel.setAttribute("dominant-baseline", "middle");
    yLabel.setAttribute("font-size", "11"); yLabel.setAttribute("fill", "#888");
    yLabel.textContent = String(val);
    g.appendChild(yLabel);
  }

  // Stacked bars
  queues.forEach(({ name, counts }, i) => {
    const x = i * barW + barOffset;
    let yOffset = plotH;
    for (const status of STATUS_ORDER) {
      const count = counts[status] || 0;
      if (count === 0) continue;
      const segH = (count / niceMax) * plotH;
      yOffset -= segH;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(yOffset));
      rect.setAttribute("width", String(barInner));
      rect.setAttribute("height", String(segH));
      rect.setAttribute("fill", STATUS_COLORS[status] || "#aaa");
      rect.setAttribute("rx", "2");
      const title = document.createElementNS(ns, "title");
      title.textContent = `${name} — ${status}: ${count}`;
      rect.appendChild(title);
      g.appendChild(rect);
    }
    // X label
    const cx = x + barInner / 2;
    const labelY = plotH + 8;
    const xLabel = document.createElementNS(ns, "text");
    xLabel.setAttribute("x", String(cx)); xLabel.setAttribute("y", String(labelY));
    xLabel.setAttribute("text-anchor", "end");
    xLabel.setAttribute("transform", `rotate(-35, ${cx}, ${labelY})`);
    xLabel.setAttribute("font-size", "10"); xLabel.setAttribute("fill", "#888");
    xLabel.textContent = name.length > 18 ? name.slice(0, 17) + "…" : name;
    g.appendChild(xLabel);
  });

  // Axes
  const yAxis = document.createElementNS(ns, "line");
  yAxis.setAttribute("x1", "0"); yAxis.setAttribute("y1", "0");
  yAxis.setAttribute("x2", "0"); yAxis.setAttribute("y2", String(plotH));
  yAxis.setAttribute("stroke", "#bbb"); yAxis.setAttribute("stroke-width", "1");
  g.appendChild(yAxis);
  const xAxis = document.createElementNS(ns, "line");
  xAxis.setAttribute("x1", "0"); xAxis.setAttribute("y1", String(plotH));
  xAxis.setAttribute("x2", String(plotW)); xAxis.setAttribute("y2", String(plotH));
  xAxis.setAttribute("stroke", "#bbb"); xAxis.setAttribute("stroke-width", "1");
  g.appendChild(xAxis);

  // Legend — placed in the reserved strip at the very bottom of the SVG
  const legendY = H - LEGEND_H + 4;
  const legendItemW = W / STATUS_ORDER.length;
  STATUS_ORDER.forEach((status, i) => {
    const lx = i * legendItemW + 4;
    const swatch = document.createElementNS(ns, "rect");
    swatch.setAttribute("x", String(lx)); swatch.setAttribute("y", String(legendY));
    swatch.setAttribute("width", "10"); swatch.setAttribute("height", "10");
    swatch.setAttribute("fill", STATUS_COLORS[status]); swatch.setAttribute("rx", "2");
    svg.appendChild(swatch);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(lx + 13)); label.setAttribute("y", String(legendY + 9));
    label.setAttribute("font-size", "10"); label.setAttribute("fill", "#555");
    label.textContent = status;
    svg.appendChild(label);
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

export function wireQueueStatsSortHandler() {
  document
    .getElementById("queue-stats-table")!
    .addEventListener("guxsortchanged", (event: Event) => {
      const { columnName, sortDirection } = (event as CustomEvent).detail;

      document
        .querySelectorAll("#queue-stats-table thead th")
        .forEach((th) => th.removeAttribute("aria-sort"));

      const sortedTh = document.querySelector(
        `#queue-stats-table thead th[data-column-name="${columnName}"]`,
      );
      if (sortedTh) sortedTh.setAttribute("aria-sort", sortDirection);

      const tbody = document.getElementById("queue-stats-tbody")!;
      const rows = [...tbody.children] as HTMLElement[];

      rows.sort((a, b) => {
        const cells = (row: HTMLElement) => row.querySelectorAll("td");
        let aVal: string | number;
        let bVal: string | number;

        switch (columnName) {
          case "queue-name":
            aVal = cells(a)[0].textContent!.toLowerCase();
            bVal = cells(b)[0].textContent!.toLowerCase();
            break;
          case "queue-count":
            aVal = parseInt(cells(a)[1].textContent!, 10);
            bVal = parseInt(cells(b)[1].textContent!, 10);
            break;
          case "queue-longest-wait":
            aVal = parseInt(a.dataset.waitMs || "0", 10);
            bVal = parseInt(b.dataset.waitMs || "0", 10);
            break;
          case "queue-avg-wait":
            aVal = parseInt(a.dataset.avgMs || "0", 10);
            bVal = parseInt(b.dataset.avgMs || "0", 10);
            break;
          case "queue-today":
            aVal = parseInt(a.dataset.today || "0", 10);
            bVal = parseInt(b.dataset.today || "0", 10);
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === "ascending" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "ascending" ? 1 : -1;
        return 0;
      });

      rows.forEach((row) => tbody.appendChild(row));
    });
}
