import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./appearance.css";
import { AppearanceProvider } from "@/components/appearance-provider";
import { appearanceScript } from "@/lib/appearance";
export const metadata: Metadata = {
  title: "Clinic Assistant | Conversational Voice Agent",
  description:
    "An interactive voice and conversational AI project by Yash Jobalia. Try natural conversation, scheduling tools, multilingual speech, and live diagnostics.",
  applicationName: "Clinic Assistant",
  appleWebApp: {
    capable: true,
    title: "Clinic Assistant",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#183c30",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body>
        <AppearanceProvider>{children}</AppearanceProvider>
      </body>
    </html>
  );
}
