import './globals.css';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </body>
    </html>
  );
}
