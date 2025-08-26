import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10 },
  h1: { fontSize: 16, marginBottom: 8 },
  h2: { fontSize: 12, marginVertical: 6 },
  grid: { display: 'flex', flexDirection: 'row', gap: 12 },
  cell: { flexGrow: 1, border: '1pt solid #ddd', padding: 8 }
});

// Explicit types for state metric keys
type StateKey =
  | 'dist_nsw'
  | 'dist_qld'
  | 'dist_sant'
  | 'dist_victas'
  | 'dist_wa'
  | 'dist_total';

type OrgValues = Partial<Record<StateKey, number>>;
type ValuesByOrg = Record<string, OrgValues>;

type OrgRow = { org: string } & OrgValues;

export default function ReportDocument({
  periodCode,
  valuesByOrg
}: {
  periodCode: string;
  valuesByOrg: ValuesByOrg;
}) {
  // Cast the spread result so TS knows the available keys
  const totals: OrgRow[] = Object.entries(valuesByOrg).map(([org, vals]) => {
    return { org, ...(vals as OrgValues) } as OrgRow;
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>VMA Mail Distribution Report — {periodCode}</Text>
        <Text style={styles.h2}>State Breakdown by Organisation</Text>

        {totals.map((row, i) => (
          <View style={styles.grid} key={i}>
            <View style={styles.cell}>
              <Text>{row.org}</Text>
            </View>
            <View style={styles.cell}>
              <Text>NSW: {row.dist_nsw ?? 0}</Text>
            </View>
            <View style={styles.cell}>
              <Text>QLD: {row.dist_qld ?? 0}</Text>
            </View>
            <View style={styles.cell}>
              <Text>SA/NT: {row.dist_sant ?? 0}</Text>
            </View>
            <View style={styles.cell}>
              <Text>VIC/TAS: {row.dist_victas ?? 0}</Text>
            </View>
            <View style={styles.cell}>
              <Text>WA: {row.dist_wa ?? 0}</Text>
            </View>
            <View style={styles.cell}>
              <Text>Total: {row.dist_total ?? 0}</Text>
            </View>
          </View>
        ))}
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h2}>Year-on-Year / Trailing-12 Summary</Text>
        <Text>Placeholder for charts/tables; wire up once historical periods are loaded.</Text>
      </Page>
    </Document>
  );
}
