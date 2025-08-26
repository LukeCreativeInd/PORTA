import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10 },
  h1: { fontSize: 16, marginBottom: 8 },
  h2: { fontSize: 12, marginVertical: 6 },
  grid: { display: 'flex', flexDirection: 'row', gap: 12 },
  cell: { flexGrow: 1, border: '1pt solid #ddd', padding: 8 }
});

export default function ReportDocument({ periodCode, valuesByOrg }:{ periodCode: string, valuesByOrg: Record<string, Record<string, number>> }) {
  const totals = Object.entries(valuesByOrg).map(([org, vals]) => ({ org, ...vals }));
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>VMA Mail Distribution Report — {periodCode}</Text>
        <Text style={styles.h2}>State Breakdown by Organisation</Text>
        {totals.map((row,i)=> (
          <View style={styles.grid} key={i}>
            <View style={styles.cell}><Text>{row.org}</Text></View>
            <View style={styles.cell}><Text>NSW: {row['dist_nsw']||0}</Text></View>
            <View style={styles.cell}><Text>QLD: {row['dist_qld']||0}</Text></View>
            <View style={styles.cell}><Text>SA/NT: {row['dist_sant']||0}</Text></View>
            <View style={styles.cell}><Text>VIC/TAS: {row['dist_victas']||0}</Text></View>
            <View style={styles.cell}><Text>WA: {row['dist_wa']||0}</Text></View>
            <View style={styles.cell}><Text>Total: {row['dist_total']||0}</Text></View>
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
