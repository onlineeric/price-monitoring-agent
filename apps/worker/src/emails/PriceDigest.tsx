import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Link,
  Img,
  Hr,
  Preview,
  Row,
  Column,
} from "@react-email/components";
import * as React from "react";

/**
 * Product data for digest email
 */
export interface ProductDigestItem {
  name: string;
  url: string;
  imageUrl?: string | null;
  currentPrice: number | null; // In cents
  currency: string | null;
  lastChecked: Date | null;
  lastFailed: Date | null;
  // Trends (percentage change)
  vsLastCheck: number | null; // e.g., -5.2 means 5.2% decrease
  vs7dAvg: number | null;
  vs30dAvg: number | null;
  vs90dAvg: number | null;
  vs180dAvg: number | null;
}

interface PriceDigestProps {
  products: ProductDigestItem[];
  generatedAt: Date;
}

/**
 * Format price from cents to currency string
 */
function formatPrice(cents: number | null, currency: string | null): string {
  if (cents === null || currency === null) return "N/A";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Format trend percentage
 */
function formatTrend(percentage: number | null): string {
  if (percentage === null) return "—";
  const sign = percentage > 0 ? "+" : "";
  return `${sign}${percentage.toFixed(1)}%`;
}

/**
 * Get trend icon based on percentage
 */
function getTrendIcon(percentage: number | null): string {
  if (percentage === null) return "";
  if (percentage > 0) return " ↑";
  if (percentage < 0) return " ↓";
  return " →";
}

/**
 * Get trend color based on percentage (green for down/savings, red for up)
 */
function getTrendColor(percentage: number | null): string {
  if (percentage === null) return "#666666";
  if (percentage > 0) return "#dc2626"; // Red - price increased
  if (percentage < 0) return "#16a34a"; // Green - price decreased
  return "#666666"; // Gray - no change
}

/**
 * Format date/time
 */
function formatDateTime(date: Date | null): string {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/**
 * Styles
 */
const styles = {
  body: {
    backgroundColor: "#f6f9fc",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
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
  productCell: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
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

/**
 * Price Digest Email Template
 */
export default function PriceDigest({
  products,
  generatedAt,
}: PriceDigestProps) {
  const previewText = `Price Monitor Report - ${formatDateTime(generatedAt)}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Heading style={styles.title}>Price Monitor Report</Heading>
            <Text style={styles.subtitle}>
              Generated: {formatDateTime(generatedAt)}
            </Text>
          </Section>

          {/* Products Table */}
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
                {products.map((product, index) => {
                  const isFailed =
                    product.lastFailed &&
                    (!product.lastChecked ||
                      new Date(product.lastFailed) >
                        new Date(product.lastChecked));

                  return (
                    <tr key={index}>
                      {/* Product */}
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
                                <span style={styles.failedBadge}>
                                  Failed since {formatDateTime(product.lastFailed)}
                                </span>
                              </div>
                            )}
                          </Column>
                        </Row>
                      </td>

                      {/* Current Price */}
                      <td style={{ ...styles.td, ...styles.price }}>
                        {formatPrice(product.currentPrice, product.currency)}
                      </td>

                      {/* Last Checked */}
                      <td style={styles.td}>
                        {formatDateTime(product.lastChecked)}
                      </td>

                      {/* Trend columns */}
                      <td
                        style={{
                          ...styles.td,
                          color: getTrendColor(product.vsLastCheck),
                        }}
                      >
                        {formatTrend(product.vsLastCheck)}
                        {getTrendIcon(product.vsLastCheck)}
                      </td>
                      <td
                        style={{
                          ...styles.td,
                          color: getTrendColor(product.vs7dAvg),
                        }}
                      >
                        {formatTrend(product.vs7dAvg)}
                        {getTrendIcon(product.vs7dAvg)}
                      </td>
                      <td
                        style={{
                          ...styles.td,
                          color: getTrendColor(product.vs30dAvg),
                        }}
                      >
                        {formatTrend(product.vs30dAvg)}
                        {getTrendIcon(product.vs30dAvg)}
                      </td>
                      <td
                        style={{
                          ...styles.td,
                          color: getTrendColor(product.vs90dAvg),
                        }}
                      >
                        {formatTrend(product.vs90dAvg)}
                        {getTrendIcon(product.vs90dAvg)}
                      </td>
                      <td
                        style={{
                          ...styles.td,
                          color: getTrendColor(product.vs180dAvg),
                        }}
                      >
                        {formatTrend(product.vs180dAvg)}
                        {getTrendIcon(product.vs180dAvg)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {products.length === 0 && (
              <Text style={{ textAlign: "center", color: "#666666" }}>
                No products are being monitored.
              </Text>
            )}
          </Section>

          <Hr style={{ borderColor: "#e6ebf1", margin: "0" }} />

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              This report was generated by Price Monitor AI Agent.
            </Text>
            <Text style={styles.footerText}>
              Tracking {products.length} product
              {products.length !== 1 ? "s" : ""}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Preview props for React Email dev server
PriceDigest.PreviewProps = {
  generatedAt: new Date(),
  products: [
    {
      name: "Monster Ultra Energy Drink - Peachy Keen",
      url: "https://www.woolworths.co.nz/shop/productdetails?stockcode=320675",
      imageUrl: null,
      currentPrice: 399,
      currency: "NZD",
      lastChecked: new Date(),
      lastFailed: null,
      vsLastCheck: -2.5,
      vs7dAvg: -5.2,
      vs30dAvg: -8.1,
      vs90dAvg: -12.3,
      vs180dAvg: -15.0,
    },
    {
      name: "IsoWhey Plant Based Meal Replacement Shake Vanilla 550g",
      url: "https://www.chemistwarehouse.co.nz/buy/106004",
      imageUrl: null,
      currentPrice: 4999,
      currency: "NZD",
      lastChecked: new Date(Date.now() - 3600000), // 1 hour ago
      lastFailed: null,
      vsLastCheck: 0,
      vs7dAvg: 3.2,
      vs30dAvg: null,
      vs90dAvg: null,
      vs180dAvg: null,
    },
    {
      name: "Line 6 Helix - Next Generation Amp Modelling Multi-FX",
      url: "https://www.rockshop.co.nz/line-6-helix",
      imageUrl: null,
      currentPrice: 289900,
      currency: "NZD",
      lastChecked: new Date(Date.now() - 86400000), // 1 day ago
      lastFailed: new Date(), // Failed recently
      vsLastCheck: null,
      vs7dAvg: -1.5,
      vs30dAvg: -3.0,
      vs90dAvg: -5.5,
      vs180dAvg: -10.2,
    },
  ],
} as PriceDigestProps;
