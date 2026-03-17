import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import type { ReportSnapshotItem } from "./report-snapshot";

export interface PriceDigestEmailProps {
  products: ReportSnapshotItem[];
  generatedAt: Date;
}

export function buildPriceReportSubject(generatedAt: Date): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(generatedAt);

  return `Price Monitor Report - ${formatted}`;
}

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents === null || currency === null) return "N/A";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatTrend(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function getTrendIcon(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return " ↑";
  if (value < 0) return " ↓";
  return " →";
}

function getTrendColor(value: number | null): string {
  if (value === null) return "#666666";
  if (value > 0) return "#dc2626";
  if (value < 0) return "#16a34a";
  return "#666666";
}

function formatDateTime(date: Date | null): string {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

const styles = {
  body: {
    backgroundColor: "#f6f9fc",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    padding: "20px 0 48px",
    marginBottom: "64px",
    maxWidth: "900px",
  },
  header: {
    padding: "20px 48px",
    borderBottom: "1px solid #e6ebf1",
  },
  title: {
    fontSize: "24px",
    fontWeight: "bold" as const,
    color: "#1a1a1a",
    margin: "0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666666",
    margin: "8px 0 0 0",
  },
  section: {
    padding: "24px 48px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  tableHeader: {
    backgroundColor: "#f8fafc",
    borderBottom: "2px solid #e6ebf1",
  },
  th: {
    padding: "12px 8px",
    textAlign: "left" as const,
    fontSize: "12px",
    fontWeight: "600" as const,
    color: "#64748b",
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "16px 8px",
    borderBottom: "1px solid #e6ebf1",
    fontSize: "14px",
    verticalAlign: "middle" as const,
  },
  productImage: {
    width: "48px",
    height: "48px",
    objectFit: "cover" as const,
    borderRadius: "4px",
    backgroundColor: "#f1f5f9",
  },
  productName: {
    color: "#1a1a1a",
    textDecoration: "none",
    fontWeight: "500" as const,
  },
  price: {
    fontWeight: "600" as const,
    color: "#1a1a1a",
  },
  failedBadge: {
    display: "inline-block",
    padding: "2px 8px",
    backgroundColor: "#fef2f2",
    color: "#dc2626",
    borderRadius: "4px",
    fontSize: "12px",
  },
  footer: {
    padding: "24px 48px",
    borderTop: "1px solid #e6ebf1",
  },
  footerText: {
    fontSize: "12px",
    color: "#8898aa",
    margin: "0",
  },
};

export function PriceDigestEmail({ products, generatedAt }: PriceDigestEmailProps) {
  const previewText = buildPriceReportSubject(generatedAt);

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.title}>Price Monitor Report</Heading>
            <Text style={styles.subtitle}>Generated: {formatDateTime(generatedAt)}</Text>
          </Section>

          <Section style={styles.section}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Price</th>
                  <th style={styles.th}>Last Check</th>
                  <th style={styles.th}>vs Last</th>
                  <th style={styles.th}>vs 7d</th>
                  <th style={styles.th}>vs 30d</th>
                  <th style={styles.th}>vs 90d</th>
                  <th style={styles.th}>vs 180d</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const isFailed =
                    product.lastFailed &&
                    (!product.lastChecked || new Date(product.lastFailed) > new Date(product.lastChecked));

                  return (
                    <tr key={product.productId}>
                      <td style={styles.td}>
                        <Row>
                          <Column style={{ width: "60px" }}>
                            {product.imageUrl ? (
                              <Img
                                src={product.imageUrl}
                                alt={product.name}
                                width={48}
                                height={48}
                                style={styles.productImage}
                              />
                            ) : (
                              <div style={styles.productImage} />
                            )}
                          </Column>
                          <Column>
                            <Link href={product.url} style={styles.productName}>
                              {product.name}
                            </Link>
                            {isFailed && (
                              <div style={{ marginTop: "4px" }}>
                                <span style={styles.failedBadge}>Failed since {formatDateTime(product.lastFailed)}</span>
                              </div>
                            )}
                          </Column>
                        </Row>
                      </td>
                      <td style={{ ...styles.td, ...styles.price }}>
                        {formatPrice(product.currentPrice, product.currency)}
                      </td>
                      <td style={styles.td}>{formatDateTime(product.lastChecked)}</td>
                      <td style={{ ...styles.td, color: getTrendColor(product.vsLastCheck) }}>
                        {formatTrend(product.vsLastCheck)}
                        {getTrendIcon(product.vsLastCheck)}
                      </td>
                      <td style={{ ...styles.td, color: getTrendColor(product.vs7dAvg) }}>
                        {formatTrend(product.vs7dAvg)}
                        {getTrendIcon(product.vs7dAvg)}
                      </td>
                      <td style={{ ...styles.td, color: getTrendColor(product.vs30dAvg) }}>
                        {formatTrend(product.vs30dAvg)}
                        {getTrendIcon(product.vs30dAvg)}
                      </td>
                      <td style={{ ...styles.td, color: getTrendColor(product.vs90dAvg) }}>
                        {formatTrend(product.vs90dAvg)}
                        {getTrendIcon(product.vs90dAvg)}
                      </td>
                      <td style={{ ...styles.td, color: getTrendColor(product.vs180dAvg) }}>
                        {formatTrend(product.vs180dAvg)}
                        {getTrendIcon(product.vs180dAvg)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {products.length === 0 && (
              <Text style={{ textAlign: "center", color: "#666666" }}>No active products are being monitored.</Text>
            )}
          </Section>

          <Hr style={{ borderColor: "#e6ebf1", margin: "0" }} />

          <Section style={styles.footer}>
            <Text style={styles.footerText}>This report was generated by Price Monitor AI Agent.</Text>
            <Text style={styles.footerText}>
              Tracking {products.length} product{products.length === 1 ? "" : "s"}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
