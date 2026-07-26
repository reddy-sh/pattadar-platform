// Minimal boot-only layout for B1. The kit's real layout (theme/auth/i18n
// providers) is preserved at ../../_reference/app/layout.js and gets wired
// back in from B2 onward.
// import ThemeProvider from 'src/theme';

export const metadata = {
  title: 'Pattadar web-next scaffold',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
