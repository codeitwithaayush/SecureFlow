import './globals.css';
export const metadata = { title: 'SecureFlow' };
export default function Root({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap" /></head>
    <body className="bg-paper text-ink dark:bg-slate-950 dark:text-slate-100">{children}</body></html>);
}
