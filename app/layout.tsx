import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZahraaFit Follow-up Portal",
  description: "بوابة متابعة أسبوعية بين المدربة والعميلة"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
