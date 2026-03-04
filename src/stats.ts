import { EmailListElement } from "./types";
import { convertToDuration } from "./utils";

export function populateQueueStats(
  emailList: EmailListElement[],
  todayOffered: Record<string, number>,
  onQueueClick: (queueName: string) => void,
): Record<string, number> {
  const tbody = document.getElementById("queue-stats-tbody");
  if (!tbody) return {};

  tbody.innerHTML = "";

  const counts: Record<string, number> = {};
  const oldestMessage: Record<string, number> = {};
  const totalWait: Record<string, number> = {};

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

export function refreshQueueFilterLabels(queueCounts: Record<string, number>) {
  const filterList = document.getElementById("queue-filter-value");
  if (!filterList) return;

  const selectedValue = (filterList as HTMLSelectElement).value;
  filterList.querySelectorAll("gux-option").forEach((option) => {
    const queueName = option.getAttribute("value")!;
    if (!queueName) return;
    const count = queueCounts[queueName] || 0;
    const isSelected = queueName === selectedValue;
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

  if (customElements.get("gux-chart-donut-beta")) {
    apply();
  } else {
    customElements.whenDefined("gux-chart-donut-beta").then(apply);
  }
}

export function renderHourlyBarChart(data: { hour: string; count: number }[]) {
  const container = document.getElementById("queue-hourly-chart");
  if (!container) return;

  const W = 420;
  const H = 230;
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
