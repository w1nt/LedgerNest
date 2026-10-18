import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/LanguageContext";
import type { Bill } from "../../types/billing";
import { money } from "../../lib/billing";
import { trendBuckets } from "../../lib/trends";
import Panel from "./Panel";
import Dropdown from "./Dropdown";
import DataTooltip from "./DataTooltip";
import Icon from "./Icon";

type Part = "total" | "paid" | "remaining";
interface Inspection {
  key: string;
  scope: string;
  part: Part;
  anchor: SVGGElement;
  source: "pointer" | "keyboard" | "touch";
}

/** 图表从 Bill 聚合，作废排除、已付按确认净额分配；不改变真实结算数据。 */
export default function BillingChart({
  bills,
  month,
  available = true,
}: {
  bills: Bill[];
  month: string;
  available?: boolean;
}) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [range, setRange] = useState<"3" | "6">("6");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const lastPointer = useRef("");
  const descriptionId = useId(),
    tooltipId = useId();
  const scope = `${month}:${range}`;
  const buckets = useMemo(
    () => trendBuckets(bills, month, Number(range)),
    [bills, month, range],
  );
  // 不在 effect 中重置状态：切换月份/范围或数据不可用时立即停止显示旧提示。
  const active = available && inspection?.scope === scope ? inspection : null;
  const selected = active
    ? buckets.find((bucket) => bucket.key === active.key)
    : undefined;
  const max = Math.max(10000, ...buckets.map((bucket) => bucket.total));
  const ceiling = Math.ceil(max / 10000) * 10000;
  const step = 500 / buckets.length,
    barWidth = 35;
  const monthLabel = (date: Date) =>
    new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
      date,
    );
  function inspect(
    key: string,
    anchor: SVGGElement,
    part: Part,
    source: Inspection["source"],
  ) {
    setInspection((previous) =>
      previous?.scope === scope &&
      previous.key === key &&
      previous.part === part &&
      previous.source === source
        ? previous
        : { key, scope, anchor, part, source },
    );
  }
  useEffect(() => {
    if (!active) return;
    const close = () => setInspection(null);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !active.anchor.contains(event.target))
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointermove", outside, true);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointermove", outside, true);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [active]);
  const viewBills = (key: string) =>
    navigate(`/home/bills?month=${encodeURIComponent(key)}`);
  return (
    <Panel
      title={t("chart.title")}
      className="chart-panel"
      actions={
        <Dropdown
          label={t("chart.rangeAria")}
          value={range}
          disabled={!available}
          options={[
            { value: "6", label: t("chart.sixMonths") },
            { value: "3", label: t("chart.threeMonths") },
          ]}
          onChange={(value) => {
            setInspection(null);
            setRange(value);
          }}
        />
      }
    >
      <div className="chart-legend">
        <span>
          <i className="legend-dot paid-dot" />
          {t("status.paid")}
        </span>
        <span>
          <i className="legend-dot remaining-dot" />
          {t("chart.outstanding")}
        </span>
        <small>USD</small>
      </div>
      {!available ? (
        <p className="chart-unavailable muted">{t("chart.waiting")}</p>
      ) : (
        <div className="chart-canvas">
          <svg
            viewBox="0 0 600 240"
            className="billing-chart"
            role="group"
            aria-label={t("chart.accessibleTitle", { count: range })}
            aria-describedby={descriptionId}
          >
            <desc id={descriptionId}>
              {buckets
                .map((bucket) =>
                  t("chart.bucket", {
                    month: monthLabel(bucket.date),
                    total: money(bucket.total),
                    paid: money(bucket.paid),
                  }),
                )
                .join("; ")}
            </desc>
            {[0, 1, 2, 3].map((index) => (
              <g key={index} aria-hidden="true">
                <text x="0" y={25 + index * 58} className="chart-label">
                  {new Intl.NumberFormat(locale).format(
                    Math.round((ceiling / 100) * (1 - index / 3)),
                  )}
                </text>
                <line
                  x1="55"
                  x2="595"
                  y1={21 + index * 58}
                  y2={21 + index * 58}
                  className="chart-grid"
                />
              </g>
            ))}
            {buckets.map((bucket, index) => {
              const x = 75 + index * step + (step - barWidth) / 2;
              const height = (bucket.total / ceiling) * 174,
                paidHeight = (bucket.paid / ceiling) * 174;
              return (
                <g
                  key={bucket.key}
                  className="chart-bar"
                  data-month={bucket.key}
                  data-active={active?.key === bucket.key}
                  role="button"
                  tabIndex={0}
                  aria-label={t("chart.monthAction", {
                    month: monthLabel(bucket.date),
                    total: money(bucket.total),
                    paid: money(bucket.paid),
                    remaining: money(bucket.remaining),
                  })}
                  aria-describedby={
                    active?.key === bucket.key ? tooltipId : undefined
                  }
                  onPointerDown={(event) => {
                    lastPointer.current = event.pointerType;
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType === "touch") return;
                    const part = (event.target as Element)
                      .closest("[data-part]")
                      ?.getAttribute("data-part") as Part | null;
                    inspect(
                      bucket.key,
                      event.currentTarget,
                      part || "total",
                      "pointer",
                    );
                  }}
                  onPointerLeave={() => setInspection(null)}
                  onBlur={() => setInspection(null)}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(":focus-visible"))
                      inspect(
                        bucket.key,
                        event.currentTarget,
                        "total",
                        "keyboard",
                      );
                  }}
                  onClick={(event) => {
                    if (lastPointer.current === "touch")
                      inspect(
                        bucket.key,
                        event.currentTarget,
                        "total",
                        "touch",
                      );
                    else viewBills(bucket.key);
                  }}
                  onKeyDown={(event) => {
                    if (["Enter", " "].includes(event.key)) {
                      event.preventDefault();
                      viewBills(bucket.key);
                    } else if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? buckets.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  buckets.length - 1,
                                  index + (event.key === "ArrowLeft" ? -1 : 1),
                                ),
                              );
                      const bars =
                        event.currentTarget.ownerSVGElement?.querySelectorAll<SVGGElement>(
                          ".chart-bar",
                        );
                      bars?.[next]?.focus();
                    }
                  }}
                >
                  {/* 整个月份区域都能命中，零金额月份和很薄的柱段也可查看；不依赖原生 title 的延迟提示。 */}
                  <rect
                    x={75 + index * step}
                    y="20"
                    width={step}
                    height="215"
                    className="chart-hit-area"
                    data-part="total"
                  />
                  <rect
                    x={x}
                    y={195 - height}
                    width={barWidth}
                    height={height}
                    rx="5"
                    className="chart-total"
                    data-part="remaining"
                  />
                  <rect
                    x={x}
                    y={195 - paidHeight}
                    width={barWidth}
                    height={paidHeight}
                    rx="5"
                    className="chart-paid"
                    data-part="paid"
                  />
                  <text
                    x={x + barWidth / 2}
                    y="228"
                    textAnchor="middle"
                    className="chart-label"
                  >
                    {new Intl.DateTimeFormat(locale, { month: "short" }).format(
                      bucket.date,
                    )}
                  </text>
                </g>
              );
            })}
          </svg>
          {active && selected && (
            <DataTooltip id={tooltipId} anchor={active.anchor}>
              <strong>{monthLabel(selected.date)}</strong>
              <dl>
                <div data-highlighted={active.part === "total"}>
                  <dt>{t("chart.total")}</dt>
                  <dd>{money(selected.total)}</dd>
                </div>
                <div data-highlighted={active.part === "paid"}>
                  <dt>
                    <i className="legend-dot paid-dot" />
                    {t("status.paid")}
                  </dt>
                  <dd>{money(selected.paid)}</dd>
                </div>
                <div data-highlighted={active.part === "remaining"}>
                  <dt>
                    <i className="legend-dot remaining-dot" />
                    {t("chart.outstanding")}
                  </dt>
                  <dd>{money(selected.remaining)}</dd>
                </div>
                <div>
                  <dt>{t("chart.billCount")}</dt>
                  <dd>
                    {new Intl.NumberFormat(locale).format(selected.count)}
                  </dd>
                </div>
              </dl>
              <span className="data-tooltip-hint">
                {t(
                  active.source === "touch"
                    ? "chart.touchHint"
                    : "chart.viewBills",
                )}
                <Icon name="arrow" />
              </span>
            </DataTooltip>
          )}
        </div>
      )}
    </Panel>
  );
}
