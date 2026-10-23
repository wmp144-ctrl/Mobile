import { forwardRef, type CSSProperties } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { ChartInstance } from '@/lib/echarts';
import { formatJalaliDate, formatJalaliDateTime, formatJalaliLong } from '@/lib/jalali';
import { formatNumber } from '@/lib/format';
import type { ReportRunResult } from '@/lib/types';

const COLORS = {
  brand: '#2538ac',
  brandSoft: '#eef3ff',
  ink: '#131a29',
  inkSoft: '#66718f',
  border: '#d9dde9',
  surface: '#f6f7fb',
  white: '#ffffff',
  success: '#047857',
};

const PAGE: CSSProperties = {
  width: 794,
  height: 1123,
  padding: '34px 38px 46px',
  boxSizing: 'border-box',
  background: COLORS.white,
  color: COLORS.ink,
  fontFamily: 'Vazirmatn, Tahoma, sans-serif',
  position: 'relative',
  overflow: 'hidden',
  direction: 'rtl',
};

const HEADER_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
};

const MUTED: CSSProperties = { color: COLORS.inkSoft, fontSize: 11, lineHeight: 1.9 };

const TH: CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  background: COLORS.surface,
  padding: '5px 6px',
  fontSize: 9,
  fontWeight: 700,
  textAlign: 'right',
};

const TD: CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  padding: '5px 6px',
  fontSize: 9,
  textAlign: 'right',
  verticalAlign: 'middle',
};

interface ReportPdfDocumentProps {
  report: ReportRunResult;
  title: string;
  filterSummary: { label: string; value: string }[];
  chartImages: Record<string, string>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function BrandMark({ size = 54 }: { size?: number }) {
  return (
    <div
      role="img"
      aria-label="نشان سامانه مدیریت تعمیرگاه"
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        background: `linear-gradient(135deg, ${COLORS.brand}, #4364ef)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.58}
        height={size * 0.58}
        viewBox="0 0 24 24"
        fill="none"
        stroke={COLORS.white}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.8 17.2a2 2 0 1 0 2.8 2.8l5.5-5.5a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-2.8z" />
      </svg>
    </div>
  );
}

function PageFooter({ workshopName, page, total }: { workshopName: string; page: number; total: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 18,
        left: 38,
        right: 38,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `1px solid ${COLORS.border}`,
        paddingTop: 8,
        ...MUTED,
        fontSize: 9,
      }}
    >
      <span>{workshopName || 'تعمیرگاه'} — گزارش تحلیلی</span>
      <span>
        صفحه {formatNumber(page)} از {formatNumber(total)}
      </span>
    </div>
  );
}

function MiniChartTable({ chart }: { chart: ReportRunResult['charts'][number] }) {
  const categories = chart.categories.slice(0, 5);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
      <thead>
        <tr>
          <th style={TH}>دسته</th>
          {chart.series.map((series) => (
            <th key={series.name} style={TH}>
              {series.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((category, index) => (
          <tr key={`${category}-${index}`}>
            <td style={TD}>{category}</td>
            {chart.series.map((series) => (
              <td key={series.name} style={{ ...TD, textAlign: 'center' }}>
                {formatNumber(series.data[index] ?? 0)}
              </td>
            ))}
          </tr>
        ))}
        {chart.categories.length > 5 ? (
          <tr>
            <td style={{ ...TD, ...MUTED }}>… {formatNumber(chart.categories.length - 5)} دسته دیگر</td>
            {chart.series.map((series) => (
              <td key={series.name} style={{ ...TD, textAlign: 'center', ...MUTED }}>
                {formatNumber(series.data.slice(5).reduce((sum, value) => sum + value, 0))}
              </td>
            ))}
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export const ReportPdfDocument = forwardRef<HTMLDivElement, ReportPdfDocumentProps>(
  function ReportPdfDocument({ report, title, filterSummary, chartImages }, ref) {
    const chartPages = chunk(report.charts, 2);
    const tablePages = chunk(report.table.rows, 16);
    const totalPages = 1 + chartPages.length + tablePages.length;
    const workshop = report.workshop.name || 'تعمیرگاه';
    const generated = report.generatedAt;

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className="pdf-report-root"
        style={{
          position: 'fixed',
          top: 0,
          left: -12000,
          width: 794,
          zIndex: -1,
          pointerEvents: 'none',
          background: COLORS.white,
        }}
      >
        <section data-pdf-page style={PAGE}>
          <div style={{ height: 5, background: COLORS.brand, margin: '-34px -38px 24px' }} />
          <div style={HEADER_ROW}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandMark />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{workshop}</div>
                <div style={{ ...MUTED, fontSize: 10 }}>
                  {report.workshop.phone ? `تلفن: ${report.workshop.phone}` : 'سامانه مدیریت تعمیرگاه'}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'left', ...MUTED }}>
              <div>تاریخ تولید گزارش</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
                {formatJalaliLong(generated)}
              </div>
              <div dir="ltr" style={{ fontSize: 10 }}>
                {formatJalaliDateTime(generated)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 34, borderTop: `2px solid ${COLORS.brand}`, paddingTop: 22 }}>
            <div style={{ fontSize: 11, color: COLORS.brand, fontWeight: 700 }}>گزارش رسمی عملکرد تعمیرگاه</div>
            <h1 style={{ margin: '8px 0 6px', fontSize: 27, fontWeight: 800, lineHeight: 1.5 }}>{title}</h1>
            <p style={{ ...MUTED, margin: 0 }}>
              این گزارش بر اساس داده‌های ثبت‌شده در سامانه و با اعمال فیلترهای زیر تهیه شده است.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <SummaryBox label="نمودارهای گزارش" value={formatNumber(report.charts.length)} />
            <SummaryBox label="ردیف‌های جدول" value={formatNumber(report.table.rows.length)} />
            <SummaryBox
              label="کل داده‌های نمودارها"
              value={formatNumber(report.charts.reduce((sum, chart) => sum + chart.total, 0))}
            />
          </div>

          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 14, margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${COLORS.border}` }}>
              بازه زمانی و فیلترهای اعمال‌شده
            </h2>
            {filterSummary.length === 0 ? (
              <div style={{ ...MUTED, background: COLORS.surface, padding: 12, borderRadius: 8 }}>
                بدون فیلتر — همه تجهیزات ثبت‌شده در سامانه
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {filterSummary.map((item) => (
                    <tr key={`${item.label}-${item.value}`}>
                      <td style={{ ...TD, width: 150, background: COLORS.surface, fontWeight: 700 }}>
                        {item.label}
                      </td>
                      <td style={TD}>{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 14, margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${COLORS.border}` }}>
              نمودارهای این گزارش
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {report.charts.map((chart, index) => (
                <div
                  key={chart.id}
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    background: COLORS.surface,
                  }}
                >
                  <div style={{ fontSize: 10, ...MUTED }}>
                    نمودار {formatNumber(index + 1)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{chart.title}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.brand, marginTop: 3 }}>
                    {formatNumber(chart.total)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 74, left: 38, right: 38, ...MUTED, fontSize: 9 }}>
            تاریخ شمسی گزارش: {formatJalaliDate(generated)} — این گزارش به‌صورت خودکار از داده‌های واقعی پایگاه
            داده تولید شده است.
          </div>
          <PageFooter workshopName={workshop} page={1} total={totalPages} />
        </section>

        {chartPages.map((charts, pageIndex) => (
          <section key={`charts-${pageIndex}`} data-pdf-page style={PAGE}>
            <div style={HEADER_ROW}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BrandMark size={36} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
                  <div style={{ ...MUTED, fontSize: 9 }}>{workshop} — نمودارها</div>
                </div>
              </div>
              <div style={{ ...MUTED, fontSize: 9 }}>{formatJalaliDate(generated)}</div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {charts.map((chart) => (
                <div
                  key={chart.id}
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 10,
                    padding: 12,
                    background: COLORS.white,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{chart.title}</div>
                    <div
                      style={{
                        fontSize: 10,
                        color: COLORS.brand,
                        background: COLORS.brandSoft,
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontWeight: 700,
                      }}
                    >
                      مجموع: {formatNumber(chart.total)}
                    </div>
                  </div>
                  {chartImages[chart.id] ? (
                    <img
                      src={chartImages[chart.id]}
                      alt={chart.title}
                      style={{ width: '100%', height: 300, objectFit: 'contain', marginTop: 4 }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 300,
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: COLORS.surface,
                        borderRadius: 8,
                        ...MUTED,
                      }}
                    >
                      تصویر نمودار در دسترس نیست
                    </div>
                  )}
                  <MiniChartTable chart={chart} />
                </div>
              ))}
            </div>
            <PageFooter
              workshopName={workshop}
              page={2 + pageIndex}
              total={totalPages}
            />
          </section>
        ))}

        {tablePages.map((rows, pageIndex) => (
          <section key={`table-${pageIndex}`} data-pdf-page style={PAGE}>
            <div style={HEADER_ROW}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BrandMark size={36} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>جدول داده‌های گزارش</div>
                  <div style={{ ...MUTED, fontSize: 9 }}>{workshop}</div>
                </div>
              </div>
              <div style={{ ...MUTED, fontSize: 9 }}>
                {formatJalaliDate(generated)} — بخش {formatNumber(pageIndex + 1)}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 26 }}>#</th>
                  {report.table.columns.map((column) => (
                    <th key={column.key} style={TH}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`${pageIndex}-${rowIndex}`}>
                    <td style={{ ...TD, textAlign: 'center' }}>{formatNumber(pageIndex * 16 + rowIndex + 1)}</td>
                    {report.table.columns.map((column) => {
                      const value = row[column.key];
                      const display =
                        column.type === 'date' && typeof value === 'string'
                          ? formatJalaliDate(value)
                          : column.type === 'number' && typeof value === 'number'
                            ? formatNumber(value)
                            : (value ?? '—');
                      return (
                        <td key={column.key} style={TD}>
                          {String(display)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...MUTED, marginTop: 12, fontSize: 9 }}>
              مجموع ردیف‌های جدول: {formatNumber(report.table.rows.length)}
            </div>
            <PageFooter
              workshopName={workshop}
              page={2 + chartPages.length + pageIndex}
              total={totalPages}
            />
          </section>
        ))}
      </div>
    );
  },
);

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '10px 12px',
        background: COLORS.surface,
      }}
    >
      <div style={{ ...MUTED, fontSize: 9 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.ink }}>{value}</div>
    </div>
  );
}

export async function exportElementPagesToPdf(element: HTMLElement, fileName: string): Promise<void> {
  await document.fonts?.ready;
  const pages = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  if (pages.length === 0) {
    throw new Error('صفحه‌ای برای تولید PDF پیدا نشد.');
  }
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (const [index, page] of pages.entries()) {
    const canvas = await html2canvas(page, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      width: 794,
      height: 1123,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
    });
    const image = canvas.toDataURL('image/jpeg', 0.92);
    if (index > 0) pdf.addPage();
    pdf.addImage(image, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }
  pdf.save(fileName);
}

export function downloadChartPng(instance: ChartInstance, fileName: string): void {
  const dataUrl = instance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#ffffff',
  });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function printReport(element: HTMLElement): void {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) {
    throw new Error('مرورگر اجازه بازکردن پنجره چاپ را نداد. امکان بازکردن پنجره جدید را فعال کنید.');
  }
  win.document.open();
  win.document.write(`<!doctype html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>چاپ گزارش تحلیلی</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; font-family: Vazirmatn, Tahoma, sans-serif; }
    [data-pdf-page] { width: 794px; height: 1123px; margin: 0 auto; page-break-after: always; overflow: hidden; }
    [data-pdf-page]:last-child { page-break-after: auto; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>${element.innerHTML}</body>
</html>`);
  win.document.close();

  const finish = () => {
    win.focus();
    win.print();
  };
  const images = Array.from(win.document.images);
  Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  )
    .then(() => setTimeout(finish, 250))
    .catch(() => setTimeout(finish, 250));
}
